import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { Api, EmployeeUser } from '../api';
import { acceptEmployeeLink, type EmployeeSession } from '../session';
import { parseLinkQr } from '../link';
import { Action, Card, colors, ErrorText, Field, Notice, Page, radius, ScreenHeading, styles } from '../ui';

export function AuthScreen({ api, onAuthenticated }: { api: Api; onAuthenticated: (session: EmployeeSession) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [claim, setClaim] = useState<{ linkId: number; claimSecret: string; verificationCode: string; organizationName: string; expiresAt: string } | null>(null);
  const scanStarted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!claim) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let nextDelay = 2500;
      try {
        const result = await api.post<{ status?: string; accessToken?: string; refreshToken?: string; user?: EmployeeUser }>('/mobile/link/status', { linkId: claim.linkId, claimSecret: claim.claimSecret });
        if (!active) return;
        if (result.accessToken && result.refreshToken && result.user) {
          onAuthenticated(await acceptEmployeeLink({ accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user }, api, SecureStore));
          return;
        }
        setError('');
      } catch (err) {
        if (!active) return;
        if ((err as { status?: number }).status === 409 || Date.parse(claim.expiresAt) <= Date.now()) { setClaim(null); setError('This link is no longer available. Start again from your portal.'); return; }
        if ((err as { status?: number }).status === 429) nextDelay = 10000;
        setError(err instanceof Error ? err.message : 'Could not check the link.');
      }
      if (active) timer = setTimeout(poll, nextDelay);
    };
    timer = setTimeout(poll, 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [api, claim, onAuthenticated]);

  const openScanner = async () => {
    setError('');
    const granted = permission?.granted ? permission : await requestPermission();
    if (!granted.granted) { setError('Allow camera access to scan the QR code, or enable it in phone settings.'); return; }
    scanStarted.current = false; setScanning(true);
  };
  const scan = async (value: string) => {
    if (scanStarted.current) return;
    scanStarted.current = true; setScanning(false); setBusy(true); setError('');
    try {
      const challenge = parseLinkQr(value);
      if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('QR linking is available in the Android and iOS app.');
      const bytes = await Crypto.getRandomBytesAsync(32);
      const claimSecret = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const result = await api.post<{ linkId: number; verificationCode: string; organizationName: string; expiresAt: string }>('/mobile/link/claim', { challenge, claimSecret, platform: Platform.OS, deviceName: Platform.OS === 'ios' ? 'iPhone' : 'Android phone' });
      setClaim({ ...result, claimSecret });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not link this phone.'); }
    finally { setBusy(false); scanStarted.current = false; }
  };

  const step = claim ? 3 : scanning ? 2 : 1;
  return <Page>
    <View style={local.brandRow}><View style={local.brandMark}><Text style={local.brandMarkText}>U</Text></View><View><Text style={local.brand}>UCB-HRMS</Text><Text style={styles.muted}>Secure employee access</Text></View></View>
    <View style={local.steps} accessibilityLabel={`Device linking step ${step} of 3`}>{['Portal', 'Scan', 'Approve'].map((label, index) => <View key={label} style={local.step}><View style={[local.stepDot, step >= index + 1 && local.stepDotActive]}><Text style={[local.stepNumber, step >= index + 1 && local.stepNumberActive]}>{index + 1}</Text></View><Text style={[local.stepLabel, step >= index + 1 && local.stepLabelActive]}>{label}</Text></View>)}</View>
    {!scanning && !claim && <View style={local.illustration}><Image source={require('../../assets/link-illustration.png')} resizeMode="contain" style={local.art} accessibilityLabel="Phone linking securely to your bank" /></View>}
    <ScreenHeading eyebrow="Device linking" title={claim ? 'Approve this phone' : scanning ? 'Scan your portal QR' : 'Link your employee app'} description={claim ? 'Match the code below in your self-service portal. This keeps your account protected.' : scanning ? 'Hold the portal QR code inside the frame. Scanning happens automatically.' : 'Create a QR code from My Account → Linked devices in your bank’s web self-service portal.'} />
    <Card>
      <ErrorText message={error} />
      {claim ? <><Text style={styles.eyebrow}>{claim.organizationName}</Text><View style={local.codePanel}><Text style={local.codeLabel}>Verification code</Text><Text selectable style={local.code}>{claim.verificationCode}</Text></View><Notice message="Waiting for approval in your portal. Keep this screen open." /><Text style={styles.muted}>The code expires automatically. If it does, create a new QR from the portal.</Text><Action title="Cancel and start again" secondary onPress={() => { setClaim(null); setError(''); }} /></> : <>
        {scanning ? <><View style={local.cameraFrame}><CameraView style={local.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => scan(data)} /><View pointerEvents="none" style={local.scanGuide} /></View><Action title="Cancel scanning" secondary onPress={() => setScanning(false)} /></> : <><View style={local.instruction}><Text style={local.instructionNumber}>1</Text><Text style={styles.body}>Open your portal on a computer.</Text></View><View style={local.instruction}><Text style={local.instructionNumber}>2</Text><Text style={styles.body}>Choose My Account → Linked devices.</Text></View><View style={local.instruction}><Text style={local.instructionNumber}>3</Text><Text style={styles.body}>Create a QR, then scan it here.</Text></View><Action title="Scan portal QR code" busy={busy} onPress={openScanner} /></>}
        {permission && !permission.granted && !permission.canAskAgain && <Action title="Open camera settings" secondary onPress={() => Linking.openSettings()} />}
      </>}
    </Card>
  </Page>;
}

const local = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontSize: 20, fontWeight: '900' },
  brand: { color: colors.ink, fontSize: 15, fontWeight: '900', letterSpacing: 0.8 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  step: { flex: 1, alignItems: 'center', gap: 5 },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e4eaee', alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: colors.blue },
  stepNumber: { color: colors.muted, fontWeight: '800' },
  stepNumberActive: { color: colors.white },
  stepLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  stepLabelActive: { color: colors.blue },
  illustration: { backgroundColor: colors.pale, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', minHeight: 190, overflow: 'hidden' },
  art: { width: '100%', height: 190 },
  instruction: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  instructionNumber: { width: 28, height: 28, borderRadius: 14, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.pale, color: colors.blue, fontWeight: '900' },
  cameraFrame: { height: 330, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.ink },
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
      setCurrent(''); setNext(''); setConfirm(''); setNotice('Password changed. Link this phone again from your portal.');
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
