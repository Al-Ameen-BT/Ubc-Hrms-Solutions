import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { createApi, type Api } from './src/api';
import { clearEmployeeSession, refreshEmployeeSession, restoreEmployeeSession, revokeEmployeeSession, type EmployeeSession } from './src/session';
import { AuthScreen } from './src/screens/Auth';
import { Home } from './src/screens/Home';
import { Services } from './src/screens/Services';
import { Action, colors, ErrorText, Loading, Page, styles } from './src/ui';

const sections = ['Home', 'Payslips', 'Leave', 'Time', 'More'] as const;
type Section = typeof sections[number] | 'Policies' | 'Calendar' | 'Workplace' | 'Claims' | 'Profile';

function EmployeeApp() {
  const [session, setSession] = useState<EmployeeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [section, setSection] = useState<Section>('Home');
  const refreshInFlight = React.useRef<Promise<string> | null>(null);
  const expire = useCallback(() => { setSession(null); clearEmployeeSession(SecureStore).catch(() => {}); }, []);
  const configured = useMemo(() => {
    try {
      let instance: Api;
      instance = createApi(process.env.EXPO_PUBLIC_API_BASE_URL || '', fetch, expire, async stale => {
        if (!refreshInFlight.current) refreshInFlight.current = refreshEmployeeSession(instance, SecureStore, stale).then(result => {
          setSession(current => current ? { ...current, token: result.accessToken, user: result.user || current.user } : current);
          return result.accessToken;
        }).finally(() => { refreshInFlight.current = null; });
        return refreshInFlight.current;
      });
      return { api: instance, error: '' };
    }
    catch (error) { return { api: null, error: error instanceof Error ? error.message : 'API configuration is invalid.' }; }
  }, [expire]);
  const api = configured.api;

  useEffect(() => {
    if (!api) { setLoading(false); return; }
    setLoading(true); setRestoreError('');
    restoreEmployeeSession(api, SecureStore).then(restored => setSession(restored)).catch(error => setRestoreError(error.message)).finally(() => setLoading(false));
  }, [api, restoreAttempt]);

  const signOut = async () => {
    if (!api) return;
    try {
      await revokeEmployeeSession(api, SecureStore);
      setSession(null); setSection('Home'); setRestoreError('');
    } catch (error) { Alert.alert('Could not sign out', error instanceof Error ? `${error.message} Try again when connected.` : 'Try again when connected.'); }
  };

  if (configured.error || !api) return <Page><Text style={styles.title}>App setup needed</Text><ErrorText message={configured.error} /><Text style={styles.body}>Set EXPO_PUBLIC_API_BASE_URL to your HRMS HTTPS origin and restart the app.</Text></Page>;
  if (loading) return <View style={local.loading} accessibilityRole="progressbar" accessibilityLabel="Opening employee app">
    <Image source={require('./assets/splash-icon.png')} style={local.loadingMark} resizeMode="contain" />
    <Text style={local.loadingTitle}>Your workplace, ready when you are.</Text>
    <Text style={styles.muted}>Opening your secure employee space…</Text>
    <Loading />
  </View>;
  if (restoreError) return <Page><Text style={styles.title}>Connection needed</Text><ErrorText message={restoreError} /><Action title="Retry connection" onPress={() => setRestoreAttempt(value => value + 1)} /><Action title="Sign in with another account" secondary onPress={signOut} /></Page>;
  if (!session) return <AuthScreen api={api} onAuthenticated={setSession} />;
  if (session.user.mustChangePassword) return <Page><Text style={styles.title}>Complete account setup</Text><Text style={styles.body}>Change your temporary password in the web self-service portal, then link this phone again.</Text><Action title="Sign out" onPress={signOut} /></Page>;

  return <View style={{ flex: 1, backgroundColor: colors.paper }}>
    <View style={local.header}>{session.user.organization?.logoUrl && <Image source={{ uri: `${api.root}${session.user.organization.logoUrl}` }} resizeMode="contain" style={local.logo} accessibilityLabel={`${session.user.organization.name} logo`} />}<View><Text style={local.bank}>{session.user.organization?.name || session.user.organizationName || 'Your bank'}</Text><Text style={local.name}>{session.context.employee?.name || session.user.name}</Text></View></View>
    <View style={{ flex: 1 }}>
      {section === 'Home' ? <Home api={api} session={session} navigate={setSection} /> : <Services key={section} section={section} api={api} session={session} navigate={setSection} signOut={signOut} />}
    </View>
    <View style={local.tabs} accessibilityRole="tablist">
      {sections.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: section === item || (item === 'More' && !sections.includes(section as typeof sections[number])) }} onPress={() => setSection(item)} style={local.tab}><Text style={[local.tabText, (section === item || (item === 'More' && !sections.includes(section as typeof sections[number]))) && local.active]}>{item}</Text></Pressable>)}
    </View>
  </View>;
}

const local = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16, backgroundColor: colors.paper },
  loadingMark: { width: 112, height: 112, marginBottom: 8 },
  loadingTitle: { color: colors.ink, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  header: { backgroundColor: colors.ink, paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, backgroundColor: colors.white, borderRadius: 8 },
  bank: { color: '#c7dded', fontSize: 13, fontWeight: '600' },
  name: { color: colors.white, fontSize: 19, fontWeight: '700', marginTop: 3 },
  tabs: { flexDirection: 'row', width: '100%', maxWidth: 600, alignSelf: 'center', backgroundColor: colors.white, borderTopColor: colors.line, borderTopWidth: 1 },
  tab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  active: { color: colors.blue },
});

export default function App() { return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}><StatusBar style="dark" /><EmployeeApp /></SafeAreaView></SafeAreaProvider>; }
