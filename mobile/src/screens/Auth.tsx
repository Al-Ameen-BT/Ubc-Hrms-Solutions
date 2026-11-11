import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { Api, EmployeeUser } from '../api';
import { acceptEmployeeLink, type EmployeeSession } from '../session';
import { parseLinkQr } from '../link';
import { Action, Card, colors, ErrorText, Field, Page, styles } from '../ui';

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
        if ((err as { status?: number }).status === 409) { setClaim(null); setError('This link is no longer available. Start again from your portal.'); return; }
        setError(err instanceof Error ? err.message : 'Could not check the link.');
      }
      if (active) timer = setTimeout(poll, 2500);
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

  return <Page>
    {!scanning && !claim && <View style={local.illustration}><Image source={require('../../assets/link-illustration.png')} resizeMode="contain" style={local.art} accessibilityLabel="Phone linking securely to your bank" /></View>}
    <Text style={styles.title}>Link your employee app</Text>
    <Text style={styles.subtitle}>Sign in to your bank’s self-service portal on a computer. Open My Account → Linked devices and create a QR code.</Text>
    <Card>
      <ErrorText message={error} />
      {claim ? <><Text style={styles.cardTitle}>{claim.organizationName}</Text><Text style={styles.body}>Code on this phone: <Text style={{ fontWeight: '700', fontSize: 24 }}>{claim.verificationCode}</Text></Text><Text style={styles.muted}>Enter this code in your portal to approve this phone. Waiting for approval…</Text><Action title="Start again" secondary onPress={() => { setClaim(null); setError(''); }} /></> : <>
        {scanning ? <><CameraView style={{ width: '100%', height: 320 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => scan(data)} /><Action title="Cancel scanning" secondary onPress={() => setScanning(false)} /></> : <Action title={busy ? 'Checking QR…' : 'Scan portal QR code'} disabled={busy} onPress={openScanner} />}
        {permission && !permission.granted && !permission.canAskAgain && <Action title="Open camera settings" secondary onPress={() => Linking.openSettings()} />}
      </>}
    </Card>
  </Page>;
}

const local = StyleSheet.create({
  illustration: { backgroundColor: colors.pale, borderRadius: 16, alignItems: 'center', justifyContent: 'center', minHeight: 210, overflow: 'hidden' },
  art: { width: '100%', height: 210 },
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
    <ErrorText message={error} />{notice && <Text style={styles.body}>{notice}</Text>}
    <Action title={busy ? 'Saving…' : 'Change password'} onPress={submit} disabled={busy} />
    {session.user.mustChangePassword && <Action title="Sign out" onPress={onSignOut} secondary />}
  </Card>;
}
