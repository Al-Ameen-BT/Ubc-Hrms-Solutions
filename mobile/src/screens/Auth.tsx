import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { Api, EmployeeUser } from '../api';
import { acceptEmployeeLink, type EmployeeSession } from '../session';
import { parseLinkQr } from '../link';
import {
  Action,
  Card,
  colors,
  ErrorText,
  Field,
  Notice,
  Page,
  radius,
  ScreenHeading,
  styles,
} from '../ui';

import { PrivacyOnboardingScreen, type PublicDpdpDoc } from './PrivacyOnboarding';

type PreviewData = {
  organizationName: string;
  requiredDocumentIds: number[];
  employeeNotice: PublicDpdpDoc | null;
};

export function AuthScreen({ api, relinkNotice, onAuthenticated }: { api: Api; relinkNotice?: string; onAuthenticated: (session: EmployeeSession) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [platformAcceptedDocIds, setPlatformAcceptedDocIds] = useState<number[] | null>(null);
  const [preview, setPreview] = useState<{ challenge?: string; data: PreviewData } | null>(null);
  const [noticeAgreed, setNoticeAgreed] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [claim, setClaim] = useState<{ linkId: number; claimSecret: string; verificationCode: string; organizationName: string; expiresAt: string } | null>(null);
  const scanStarted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Authentication Mode: Direct Sign-In (default) or QR Code Pairing
  const [authMethod, setAuthMethod] = useState<'direct' | 'qr'>('direct');

  // Direct Sign-In form states
  const [bankCode, setBankCode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // Poll for QR approval status
  useEffect(() => {
    if (!claim) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let nextDelay = 2500;
      try {
        const result = await api.post<{ status?: string; accessToken?: string; refreshToken?: string; user?: EmployeeUser }>('/mobile/link/status', {
          linkId: claim.linkId,
          claimSecret: claim.claimSecret,
        });
        if (!active) return;
        if (result.accessToken && result.refreshToken && result.user) {
          onAuthenticated(await acceptEmployeeLink({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user }, api, SecureStore));
          return;
        }
        setError('');
      } catch (err) {
        if (!active) return;
        if ((err as { status?: number }).status === 409 || Date.parse(claim.expiresAt) <= Date.now()) {
          setClaim(null);
          setError('This link is no longer available. Start again from your portal.');
          return;
        }
        if ((err as { status?: number }).status === 429) nextDelay = 10000;
        setError(err instanceof Error ? err.message : 'Could not check the link.');
      }
      if (active) timer = setTimeout(poll, nextDelay);
    };
    timer = setTimeout(poll, 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, claim, onAuthenticated]);

  if (!platformAcceptedDocIds) {
    return <PrivacyOnboardingScreen api={api} onAccepted={docIds => setPlatformAcceptedDocIds(docIds)} />;
  }

  // Handle in-app direct sign-in
  const handleDirectLogin = async () => {
    setError('');
    if (!bankCode.trim()) return setError('Enter your bank / organisation code.');
    if (!identifier.trim()) return setError('Enter your Employee ID or email address.');
    if (!password) return setError('Enter your password.');
    if (mfaRequired && !mfaCode.trim()) return setError('Enter the 6-digit authentication code.');

    setBusy(true);
    try {
      const response = await api.post<{
        accessToken?: string;
        refreshToken?: string;
        user?: EmployeeUser;
        mfaRequired?: boolean;
        mfaToken?: string;
        dpdpNoticeRequired?: boolean;
        organizationName?: string;
        requiredDocumentIds?: number[];
        employeeNotice?: PublicDpdpDoc | null;
      }>('/mobile/auth/direct-login', {
        orgCode: bankCode.trim().toUpperCase(),
        identifier: identifier.trim(),
        password,
        mfaToken: mfaRequired ? mfaToken : undefined,
        mfaCode: mfaRequired ? mfaCode.trim() : undefined,
        deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android phone',
        platform: Platform.OS,
        acceptedDocumentIds: platformAcceptedDocIds,
      });

      if (response.mfaRequired && response.mfaToken) {
        setMfaRequired(true);
        setMfaToken(response.mfaToken);
        setBusy(false);
        return;
      }

      if (response.dpdpNoticeRequired && response.employeeNotice) {
        setPreview({
          data: {
            organizationName: response.organizationName || 'Your Bank',
            requiredDocumentIds: response.requiredDocumentIds || [],
            employeeNotice: response.employeeNotice,
          },
        });
        setNoticeAgreed(false);
        setBusy(false);
        return;
      }

      if (response.accessToken && response.refreshToken && response.user) {
        const session = await acceptEmployeeLink(
          { accessToken: response.accessToken, refreshToken: response.refreshToken, user: response.user },
          api,
          SecureStore
        );
        onAuthenticated(session);
      } else {
        throw new Error('Sign-in failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const openScanner = async () => {
    setError('');
    const granted = permission?.granted ? permission : await requestPermission();
    if (!granted.granted) {
      setError('Allow camera access to scan the QR code, or enable it in phone settings.');
      return;
    }
    scanStarted.current = false;
    setScanning(true);
  };

  const scan = async (value: string) => {
    if (scanStarted.current) return;
    scanStarted.current = true;
    setScanning(false);
    setBusy(true);
    setError('');
    try {
      const challenge = parseLinkQr(value);
      if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
        throw new Error('QR linking is available in the Android and iOS app.');
      }

      const previewRes = await api.post<PreviewData>('/mobile/link/preview', { challenge });
      if (previewRes?.employeeNotice) {
        setPreview({ challenge, data: previewRes });
        setNoticeAgreed(false);
      } else {
        await completeClaim(challenge, previewRes?.requiredDocumentIds || platformAcceptedDocIds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link this phone.');
    } finally {
      setBusy(false);
      scanStarted.current = false;
    }
  };

  const completeClaim = async (challenge: string, docIdsToSubmit: number[]) => {
    setBusy(true);
    setError('');
    try {
      const bytes = await Crypto.getRandomBytesAsync(32);
      const claimSecret = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const result = await api.post<{ linkId: number; verificationCode: string; organizationName: string; expiresAt: string }>('/mobile/link/claim', {
        challenge,
        claimSecret,
        platform: Platform.OS,
        deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android phone',
        acceptedDocumentIds: docIdsToSubmit,
      });
      setClaim({ ...result, claimSecret });
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete linking.');
    } finally {
      setBusy(false);
    }
  };

  if (preview) {
    const notice = preview.data.employeeNotice;
    const allDocIds = Array.from(new Set([
      ...platformAcceptedDocIds,
      ...(preview.data.requiredDocumentIds || []),
      ...(notice ? [notice.id] : []),
    ]));

    return (
      <Page>
        <ScreenHeading
          eyebrow="Organisation Notice"
          title={preview.data.organizationName}
          description="Your organisation requires you to review and acknowledge the employee privacy notice."
        />
        <ErrorText message={error} />
        {notice && (
          <Card title={`${notice.title} (v${notice.version})`}>
            <Text style={styles.muted}>Effective from: {notice.effectiveAt}</Text>
            <ScrollView style={local.noticeBodyBox} nestedScrollEnabled>
              <Text style={styles.body}>{notice.body}</Text>
            </ScrollView>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="I have read and agree to the Employee Privacy Notice"
              accessibilityState={{ checked: noticeAgreed }}
              onPress={() => setNoticeAgreed(!noticeAgreed)}
              style={[{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, padding: 12, backgroundColor: colors.white }, noticeAgreed && { borderColor: colors.blue, backgroundColor: colors.pale }]}
            >
              <Text style={[{ width: 26, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, textAlign: 'center', textAlignVertical: 'center', lineHeight: 24, color: colors.blue, fontWeight: '900', backgroundColor: colors.white }, noticeAgreed && { borderColor: colors.blue }]}>
                {noticeAgreed ? '✓' : ''}
              </Text>
              <Text style={[styles.body, { flex: 1, fontWeight: noticeAgreed ? '700' : '400' }]}>
                I have read and acknowledge the bank employee privacy notice.
              </Text>
            </Pressable>
          </Card>
        )}
        <Action
          title="Accept and complete sign-in"
          disabled={notice ? !noticeAgreed : false}
          busy={busy}
          onPress={() => {
            if (preview.challenge) {
              completeClaim(preview.challenge, allDocIds);
            } else {
              setPlatformAcceptedDocIds(allDocIds);
              setPreview(null);
              handleDirectLogin();
            }
          }}
        />
        <Action
          title="Cancel"
          secondary
          onPress={() => { setPreview(null); setError(''); }}
        />
      </Page>
    );
  }

  const step = claim ? 3 : scanning ? 2 : 1;

  return (
    <Page>
      {/* Brand Header with Crisp Master Logo */}
      <View style={local.brandRow}>
        <Image
          source={require('../../assets/icon.png')}
          defaultSource={require('../../assets/banihal-round.png')}
          style={local.brandLogo}
          resizeMode="contain"
          accessibilityLabel="UCB-HRMS"
        />
        <View style={{ flex: 1 }}>
          <Text style={local.brand}>UCB-HRMS</Text>
          <Text style={local.brandSub}>Urban Co-operative Banking Solutions</Text>
        </View>
      </View>

      {/* Auth Mode Switcher */}
      <View style={local.tabSwitchWrap}>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Direct Sign In"
          accessibilityState={{ selected: authMethod === 'direct' }}
          onPress={() => { setAuthMethod('direct'); setError(''); }}
          style={[local.tabSwitchBtn, authMethod === 'direct' && local.tabSwitchBtnActive]}
        >
          <Text style={[local.tabSwitchText, authMethod === 'direct' && local.tabSwitchTextActive]}>
            Direct Sign-In
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Scan Portal QR"
          accessibilityState={{ selected: authMethod === 'qr' }}
          onPress={() => { setAuthMethod('qr'); setError(''); }}
          style={[local.tabSwitchBtn, authMethod === 'qr' && local.tabSwitchBtnActive]}
        >
          <Text style={[local.tabSwitchText, authMethod === 'qr' && local.tabSwitchTextActive]}>
            Scan Portal QR
          </Text>
        </Pressable>
      </View>

      <Notice message={relinkNotice} />

      {authMethod === 'direct' ? (
        /* Direct In-App Authentication Form */
        <>
          <ScreenHeading
            eyebrow="Mobile Employee Sign-In"
            title={mfaRequired ? 'Two-Factor Verification' : 'Sign in to your workplace'}
            description={
              mfaRequired
                ? 'Enter the 6-digit verification code from your authenticator application to proceed.'
                : 'Enter your bank code and employee account credentials to access your mobile portal directly.'
            }
          />

          <Card title={mfaRequired ? 'Security Verification' : 'Employee Credentials'}>
            <ErrorText message={error} />

            {!mfaRequired ? (
              <>
                <Field
                  label="Bank / Organisation Code"
                  value={bankCode}
                  onChangeText={v => setBankCode(v.toUpperCase())}
                  placeholder="e.g. KRD, UCB01"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Field
                  label="Employee ID or Email Address"
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="EMP-1042 or employee@bank.coop"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Your secure password"
                />
                <Action
                  title="Sign In"
                  busy={busy}
                  onPress={handleDirectLogin}
                />
              </>
            ) : (
              <>
                <Notice tone="info" message="MFA verification is enabled on your bank account." />
                <Field
                  label="6-Digit Authenticator Code"
                  value={mfaCode}
                  onChangeText={setMfaCode}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Action
                  title="Verify and Open HRMS"
                  busy={busy}
                  onPress={handleDirectLogin}
                />
                <Action
                  title="Back to login"
                  secondary
                  onPress={() => { setMfaRequired(false); setMfaCode(''); setError(''); }}
                />
              </>
            )}
          </Card>
        </>
      ) : (
        /* Scan Web Portal QR Flow */
        <>
          <View style={local.steps} accessibilityLabel={`Device linking step ${step} of 3`}>
            {['Portal', 'Scan', 'Approve'].map((label, index) => (
              <View key={label} style={local.step}>
                <View style={[local.stepDot, step >= index + 1 && local.stepDotActive]}>
                  <Text style={[local.stepNumber, step >= index + 1 && local.stepNumberActive]}>{index + 1}</Text>
                </View>
                <Text style={[local.stepLabel, step >= index + 1 && local.stepLabelActive]}>{label}</Text>
              </View>
            ))}
          </View>

          {!scanning && !claim && (
            <View style={local.illustration}>
              <Image source={require('../../assets/link-illustration.png')} resizeMode="contain" style={local.art} accessibilityLabel="Phone linking securely to your bank" />
            </View>
          )}

          <ScreenHeading
            eyebrow="Device linking"
            title={claim ? 'Approve this phone' : scanning ? 'Scan your portal QR' : 'Link your employee app'}
            description={
              claim
                ? 'Match the code below in your self-service portal. This keeps your account protected.'
                : scanning
                ? 'Hold the portal QR code inside the frame. Scanning happens automatically.'
                : 'Create a QR code from My Account → Linked devices in your bank’s web self-service portal.'
            }
          />

          <Card>
            <ErrorText message={error} />
            {claim ? (
              <>
                <Text style={styles.eyebrow}>{claim.organizationName}</Text>
                <View style={local.codePanel}>
                  <Text style={local.codeLabel}>Verification code</Text>
                  <Text selectable style={local.code}>{claim.verificationCode}</Text>
                </View>
                <Notice message="Waiting for approval in your portal. Keep this screen open." />
                <Text style={styles.muted}>The code expires automatically. If it does, create a new QR from the portal.</Text>
                <Action title="Cancel and start again" secondary onPress={() => { setClaim(null); setError(''); }} />
              </>
            ) : (
              <>
                {scanning ? (
                  <>
                    <View style={local.cameraFrame}>
                      <CameraView
                        style={local.camera}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={({ data }) => scan(data)}
                      />
                      <View pointerEvents="none" style={local.scanGuide} />
                    </View>
                    <Action title="Cancel scanning" secondary onPress={() => setScanning(false)} />
                  </>
                ) : (
                  <>
                    <View style={local.instruction}>
                      <Text style={local.instructionNumber}>1</Text>
                      <Text style={styles.body}>Open your portal on a computer.</Text>
                    </View>
                    <View style={local.instruction}>
                      <Text style={local.instructionNumber}>2</Text>
                      <Text style={styles.body}>Choose My Account → Linked devices.</Text>
                    </View>
                    <View style={local.instruction}>
                      <Text style={local.instructionNumber}>3</Text>
                      <Text style={styles.body}>Create a QR, then scan it here.</Text>
                    </View>
                    <Action title="Scan portal QR code" busy={busy} onPress={openScanner} />
                  </>
                )}
                {permission && !permission.granted && !permission.canAskAgain && (
                  <Action title="Open camera settings" secondary onPress={() => Linking.openSettings()} />
                )}
              </>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}

const local = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  brandLogo: { width: 46, height: 46, borderRadius: 12 },
  brand: { color: colors.ink, fontSize: 16, fontWeight: '900', letterSpacing: 0.6 },
  brandSub: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  tabSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: '#e7eef3',
    borderRadius: radius.sm,
    padding: 4,
    gap: 4,
  },
  tabSwitchBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm - 2,
  },
  tabSwitchBtnActive: {
    backgroundColor: colors.white,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabSwitchText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  tabSwitchTextActive: {
    color: colors.blue,
    fontWeight: '900',
  },
  steps: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  step: { flex: 1, alignItems: 'center', gap: 5 },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e4eaee', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: colors.blue },
  stepNumber: { color: colors.muted, fontWeight: '800' },
  stepNumberActive: { color: colors.white },
  stepLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  stepLabelActive: { color: colors.blue },
  illustration: { backgroundColor: colors.pale, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', minHeight: 180, overflow: 'hidden' },
  art: { width: '100%', height: 180 },
  instruction: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  instructionNumber: { width: 28, height: 28, borderRadius: 14, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.pale, color: colors.blue, fontWeight: '900' },
  noticeBodyBox: { maxHeight: 150, backgroundColor: colors.pale, borderRadius: radius.sm, padding: 12, marginVertical: 6 },
  cameraFrame: { height: 320, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.ink },
  camera: { width: '100%', height: '100%' },
  scanGuide: { position: 'absolute', left: 36, right: 36, top: 50, bottom: 50, borderRadius: 18, borderWidth: 3, borderColor: colors.white },
  codePanel: { alignItems: 'center', paddingVertical: 20, borderRadius: radius.md, backgroundColor: colors.pale, borderWidth: 1, borderColor: '#c7dce7' },
  codeLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  code: { color: colors.ink, fontSize: 34, lineHeight: 44, fontWeight: '900', letterSpacing: 5, marginTop: 4 },
});

export function PasswordForm({ api, session, onSignOut }: { api: Api; session: EmployeeSession; onSignOut: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const submit = async () => {
    setError(''); setNotice('');
    if (next.length < 8) return setError('New password must have at least 8 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next }, session.token);
      setCurrent(''); setNext(''); setConfirm(''); setNotice('Password changed. Please sign in again.');
      onSignOut();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not change password.'); }
    finally { setBusy(false); }
  };
  return <Card title={session.user.mustChangePassword ? 'Choose a new password' : 'Change password'}>
    {session.user.mustChangePassword && <Text style={styles.muted}>Your temporary password must be changed before using self-service.</Text>}
    <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
    <Field label="New password" value={next} onChangeText={setNext} secureTextEntry />
    <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry />
    <ErrorText message={error} /><Notice message={notice} tone="success" />
    <Action title="Change password" onPress={submit} busy={busy} />
    {session.user.mustChangePassword && <Action title="Sign out" onPress={onSignOut} secondary />}
  </Card>;
}
