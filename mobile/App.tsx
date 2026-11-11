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
import { isPrimarySectionSelected, navigationItems } from './src/presentation';
import { Action, colors, ErrorText, Loading, Page, radius, ScreenHeading, styles } from './src/ui';

type Section = typeof navigationItems[number]['section'] | 'Policies' | 'Calendar' | 'Workplace' | 'Claims' | 'Profile';

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
    } catch (error) { return { api: null, error: error instanceof Error ? error.message : 'API configuration is invalid.' }; }
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

  if (configured.error || !api) return <Page><ScreenHeading eyebrow="Configuration" title="App setup needed" description="UCB-HRMS needs the secure HRMS server address before it can open." /><ErrorText message={configured.error} /><Text style={styles.body}>Set EXPO_PUBLIC_API_BASE_URL to your HRMS HTTPS origin and restart the app.</Text></Page>;
  if (loading) return <View style={local.loading} accessibilityRole="progressbar" accessibilityLabel="Opening UCB-HRMS">
    <View style={local.loadingLogoWrap}><Image source={{ uri: `${api.root}/assets/platform/favicon` }} defaultSource={require('./assets/splash-icon.png')} style={local.loadingMark} resizeMode="contain" /></View>
    <Text style={local.loadingBrand}>UCB-HRMS</Text>
    <Text style={local.loadingTitle}>Your workplace, ready when you are.</Text>
    <Text style={[styles.muted, { textAlign: 'center' }]}>Restoring your secure employee session…</Text>
    <View style={{ width: '70%', marginTop: 5 }}><Loading rows={2} /></View>
  </View>;
  if (restoreError) return <Page><ScreenHeading eyebrow="Connection" title="We could not open your account" description="Your linked session is still safe. Reconnect and try again." /><ErrorText message={restoreError} /><Action title="Retry connection" onPress={() => setRestoreAttempt(value => value + 1)} /><Action title="Use another linked account" secondary onPress={signOut} /></Page>;
  if (!session) return <AuthScreen api={api} onAuthenticated={setSession} />;
  if (session.user.mustChangePassword) return <Page><ScreenHeading eyebrow="Account security" title="Complete account setup" description="Change your temporary password in the web self-service portal, then link this phone again." /><Action title="Sign out" onPress={signOut} /></Page>;

  const organization = session.user.organization?.name || session.user.organizationName || 'Your bank';
  const employee = session.context.employee?.name || session.user.name;
  return <View style={local.shell}>
    <View style={local.header}>
      {session.user.organization?.logoUrl
        ? <Image source={{ uri: `${api.root}${session.user.organization.logoUrl}` }} resizeMode="contain" style={local.logo} accessibilityLabel={`${organization} logo`} />
        : <View style={local.logoFallback}><Text style={local.logoFallbackText}>U</Text></View>}
      <View style={local.identity}><Text style={local.bank} numberOfLines={1}>{organization}</Text><Text style={local.name} numberOfLines={1}>{employee}</Text></View>
      <View style={local.securePill}><Text style={local.secureText}>SECURE</Text></View>
    </View>
    <View style={{ flex: 1 }}>
      {section === 'Home' ? <Home api={api} session={session} navigate={setSection} /> : <Services key={section} section={section} api={api} session={session} navigate={setSection} signOut={signOut} />}
    </View>
    <View style={local.tabs} accessibilityRole="tablist">
      {navigationItems.map(item => {
        const selected = isPrimarySectionSelected(section, item.section);
        return <Pressable key={item.section} accessibilityRole="tab" accessibilityLabel={item.accessibilityLabel} accessibilityState={{ selected }} onPress={() => setSection(item.section)} style={({ pressed }) => [local.tab, pressed && local.tabPressed]}>
          <View style={[local.glyphWrap, selected && local.glyphWrapActive]}><Text style={[local.glyph, selected && local.glyphActive]}>{item.glyph}</Text></View>
          <Text maxFontSizeMultiplier={1.25} style={[local.tabText, selected && local.tabTextActive]}>{item.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const local = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.paper },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: colors.paper },
  loadingLogoWrap: { width: 112, height: 112, padding: 14, borderRadius: 30, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 18, elevation: 4 },
  loadingMark: { width: '100%', height: '100%' },
  loadingBrand: { color: colors.blue, fontSize: 13, fontWeight: '900', letterSpacing: 1.8, marginTop: 5 },
  loadingTitle: { color: colors.ink, fontSize: 22, lineHeight: 29, fontWeight: '800', textAlign: 'center' },
  header: { backgroundColor: colors.ink, minHeight: 74, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 48, height: 48, backgroundColor: colors.white, borderRadius: 13 },
  logoFallback: { width: 48, height: 48, borderRadius: 13, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  logoFallbackText: { color: colors.white, fontSize: 21, fontWeight: '900' },
  identity: { flex: 1, minWidth: 0 },
  bank: { color: '#bcd6e9', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  name: { color: colors.white, fontSize: 18, lineHeight: 23, fontWeight: '800', marginTop: 2 },
  securePill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.10)' },
  secureText: { color: '#bcd6e9', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  tabs: { flexDirection: 'row', width: '100%', backgroundColor: colors.white, borderTopColor: colors.line, borderTopWidth: 1, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 7, shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  tab: { flex: 1, minHeight: 59, minWidth: 48, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 14 },
  tabPressed: { backgroundColor: '#edf4f8', transform: [{ scale: 0.97 }] },
  glyphWrap: { minWidth: 38, height: 29, paddingHorizontal: 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  glyphWrapActive: { backgroundColor: colors.pale },
  glyph: { color: colors.muted, fontSize: 20, lineHeight: 23, fontWeight: '800' },
  glyphActive: { color: colors.blue },
  tabText: { color: colors.muted, fontSize: 10, lineHeight: 13, fontWeight: '700' },
  tabTextActive: { color: colors.blue, fontWeight: '900' },
});

export default function App() { return <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}><StatusBar style="dark" /><EmployeeApp /></SafeAreaView></SafeAreaProvider>; }
