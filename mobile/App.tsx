import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { createApi, type Api } from './src/api';
import { clearEmployeeSession, refreshEmployeeSession, relinkMessageFor, restoreEmployeeSession, revokeEmployeeSession, type EmployeeSession } from './src/session';
import { isAppLockConfigured, promptAppUnlock } from './src/appLock';
import { AuthScreen } from './src/screens/Auth';
import { Home } from './src/screens/Home';
import { Services } from './src/screens/Services';
import { isPrimarySectionSelected, navigationItems, type PrimarySection } from './src/presentation';
import { Action, colors, ErrorText, HomeIcon, LeaveIcon, Loading, MoreIcon, Page, PayIcon, radius, ScreenHeading, styles, TimeIcon } from './src/ui';

type Section = typeof navigationItems[number]['section'] | 'Policies' | 'Calendar' | 'Workplace' | 'Claims' | 'Profile';

function TabIcon({ section, selected }: { section: PrimarySection; selected: boolean }) {
  const iconColor = selected ? colors.blue : colors.muted;
  switch (section) {
    case 'Home': return <HomeIcon color={iconColor} size={21} />;
    case 'Payslips': return <PayIcon color={iconColor} size={21} />;
    case 'Leave': return <LeaveIcon color={iconColor} size={21} />;
    case 'Time': return <TimeIcon color={iconColor} size={21} />;
    case 'More': return <MoreIcon color={iconColor} size={21} />;
    default: return null;
  }
}

function EmployeeApp() {
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<EmployeeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [relinkNotice, setRelinkNotice] = useState('');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [section, setSection] = useState<Section>('Home');
  const refreshInFlight = React.useRef<Promise<string> | null>(null);
  const expire = useCallback(async (code?: string) => {
    try { await clearEmployeeSession(SecureStore); }
    finally { setSession(null); setIsLocked(false); setSection('Home'); setRelinkNotice(relinkMessageFor(code)); }
  }, []);
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
    restoreEmployeeSession(api, SecureStore, setRelinkNotice).then(async restored => {
      setSession(restored);
      if (restored) {
        const lockConfigured = await isAppLockConfigured();
        if (lockConfigured) setIsLocked(true);
      }
    }).catch(error => setRestoreError(error.message)).finally(() => setLoading(false));
  }, [api, restoreAttempt]);

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async nextState => {
      if (appState.current && /inactive|background/.test(appState.current) && nextState === 'active') {
        if (session) {
          const lockConfigured = await isAppLockConfigured();
          if (lockConfigured) setIsLocked(true);
        }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [session]);

  const signOut = async () => {
    if (!api) return;
    try {
      await revokeEmployeeSession(api, SecureStore);
      setSession(null); setIsLocked(false); setSection('Home'); setRestoreError(''); setRelinkNotice('');
    } catch (error) { Alert.alert('Could not sign out', error instanceof Error ? `${error.message} Try again when connected.` : 'Try again when connected.'); }
  };

  if (configured.error || !api) {
    return (
      <View style={[local.shell, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Page>
          <ScreenHeading eyebrow="Configuration" title="App setup needed" description="UCB-HRMS needs the secure HRMS server address before it can open." />
          <ErrorText message={configured.error} />
          <Text style={styles.body}>Set EXPO_PUBLIC_API_BASE_URL to your HRMS HTTPS origin and restart the app.</Text>
        </Page>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[local.loading, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]} accessibilityRole="progressbar" accessibilityLabel="Opening UCB-HRMS">
        <View style={local.loadingLogoWrap}>
          <Image source={require('./assets/icon.png')} style={local.loadingMark} resizeMode="contain" />
        </View>
        <Text style={local.loadingBrand}>UCB-HRMS</Text>
        <Text style={local.loadingTitle}>Cooperative Banking Solutions</Text>
        <Text style={[styles.muted, { textAlign: 'center' }]}>Restoring your secure banking session…</Text>
        <View style={{ width: '70%', marginTop: 8 }}><Loading rows={2} /></View>
      </View>
    );
  }

  if (restoreError) {
    return (
      <View style={[local.shell, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Page>
          <ScreenHeading eyebrow="Connection" title="We could not open your account" description="Your linked session is still safe. Reconnect and try again." />
          <ErrorText message={restoreError} />
          <Action title="Retry connection" onPress={() => setRestoreAttempt(value => value + 1)} />
          <Action title="Use another linked account" secondary onPress={signOut} />
        </Page>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[local.shell, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <AuthScreen
          api={api}
          relinkNotice={relinkNotice}
          onAuthenticated={async restored => {
            setRelinkNotice('');
            setSession(restored);
            const lockConfigured = await isAppLockConfigured();
            if (lockConfigured) setIsLocked(true);
          }}
        />
      </View>
    );
  }

  if (isLocked) {
    return (
      <LockScreen
        session={session}
        onUnlock={() => setIsLocked(false)}
        onSignOut={signOut}
      />
    );
  }

  if (session.user.mustChangePassword) {
    return (
      <View style={[local.shell, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Page>
          <ScreenHeading eyebrow="Account security" title="Complete account setup" description="Change your temporary password in the web self-service portal, then sign in again." />
          <Action title="Sign out" onPress={signOut} />
        </Page>
      </View>
    );
  }

  const organization = session.user.organization?.name || session.user.organizationName || 'Cooperative Bank';
  const employee = session.context.employee?.name || session.user.name;
  const orgLogoUrl = session.user.organization?.logoUrl ? `${api.root}${session.user.organization.logoUrl}` : null;

  return (
    <View style={local.shell}>
      <StatusBar style="light" />
      {/* Notch-Adaptive Dark Header */}
      <View style={[local.header, { paddingTop: Math.max(insets.top, 14), paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
        {orgLogoUrl ? (
          <Image source={{ uri: orgLogoUrl }} resizeMode="contain" style={local.logo} accessibilityLabel={`${organization} logo`} defaultSource={require('./assets/icon.png')} />
        ) : (
          <Image source={require('./assets/icon.png')} resizeMode="contain" style={local.logo} accessibilityLabel="Default logo" />
        )}
        <View style={local.identity}>
          <Text style={local.bank} numberOfLines={1}>{organization}</Text>
          <Text style={local.name} numberOfLines={1}>{employee}</Text>
        </View>
      </View>

      {/* Screen Body */}
      <View style={{ flex: 1 }}>
        {section === 'Home' ? (
          <Home api={api} session={session} navigate={setSection} />
        ) : (
          <Services key={section} section={section} api={api} session={session} navigate={setSection} signOut={signOut} />
        )}
      </View>

      {/* Modern Redesigned Bottom Navigation Bar with Notch Inset */}
      <View style={[local.tabs, { paddingBottom: Math.max(insets.bottom, 10), paddingLeft: Math.max(insets.left, 8), paddingRight: Math.max(insets.right, 8) }]} accessibilityRole="tablist">
        {navigationItems.map(item => {
          const selected = isPrimarySectionSelected(section, item.section);
          return (
            <Pressable
              key={item.section}
              accessibilityRole="tab"
              accessibilityLabel={item.accessibilityLabel}
              accessibilityState={{ selected }}
              onPress={() => setSection(item.section)}
              style={({ pressed }) => [local.tab, pressed && local.tabPressed]}
            >
              <View style={[local.glyphWrap, selected && local.glyphWrapActive]}>
                <TabIcon section={item.section} selected={selected} />
              </View>
              <Text maxFontSizeMultiplier={1.25} style={[local.tabText, selected && local.tabTextActive]}>
                {item.label}
              </Text>
              {selected && <View style={local.activePip} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function LockScreen({ session, onUnlock, onSignOut }: { session: EmployeeSession; onUnlock: () => void; onSignOut: () => void }) {
  const insets = useSafeAreaInsets();
  const organization = session.user.organization?.name || session.user.organizationName || 'Cooperative Bank';
  const employee = session.context.employee?.name || session.user.name;
  const [busy, setBusy] = useState(false);

  const attemptUnlock = async () => {
    setBusy(true);
    const success = await promptAppUnlock();
    setBusy(false);
    if (success) onUnlock();
  };

  useEffect(() => {
    attemptUnlock();
  }, []);

  return (
    <View style={[local.lockContainer, { paddingTop: Math.max(insets.top, 32), paddingBottom: Math.max(insets.bottom, 24) }]}>
      <StatusBar style="light" />
      <View style={local.lockCard}>
        <Image source={require('./assets/icon.png')} style={local.lockLogo} resizeMode="contain" />
        <Text style={local.lockBank}>{organization}</Text>
        <Text style={local.lockTitle}>Application Locked</Text>
        <Text style={local.lockDesc}>
          Verify your biometric identity or phone screen lock PIN to resume your session as {employee}.
        </Text>
        <View style={{ width: '100%', gap: 12, marginTop: 24 }}>
          <Action title="Unlock with Biometrics" busy={busy} onPress={attemptUnlock} />
          <Action title="Sign out" secondary onPress={onSignOut} />
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.paper },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: colors.paper },
  loadingLogoWrap: { width: 104, height: 104, padding: 12, borderRadius: 28, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, shadowColor: colors.shadow, shadowOpacity: 0.14, shadowRadius: 18, elevation: 6 },
  loadingMark: { width: '100%', height: '100%' },
  loadingBrand: { color: colors.blue, fontSize: 13, fontWeight: '900', letterSpacing: 1.8, marginTop: 6 },
  loadingTitle: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '800', textAlign: 'center' },
  header: { backgroundColor: colors.ink, minHeight: 74, paddingBottom: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#1d3e5e' },
  logo: { width: 44, height: 44, backgroundColor: colors.white, borderRadius: 12 },
  identity: { flex: 1, minWidth: 0 },
  bank: { color: '#b2d1ea', fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.2 },
  name: { color: colors.white, fontSize: 17, lineHeight: 22, fontWeight: '800', marginTop: 1 },
  lockContainer: { flex: 1, backgroundColor: colors.ink, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  lockCard: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: radius.lg, padding: 24, alignItems: 'center', shadowColor: colors.shadow, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  lockLogo: { width: 64, height: 64, borderRadius: 16, marginBottom: 14 },
  lockBank: { color: colors.blue, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  lockTitle: { color: colors.ink, fontSize: 22, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  lockDesc: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
  tabs: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: colors.white,
    borderTopColor: '#e5edf3',
    borderTopWidth: 1,
    paddingTop: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  tab: { flex: 1, minHeight: 52, minWidth: 48, alignItems: 'center', justifyContent: 'center', gap: 3, position: 'relative' },
  tabPressed: { transform: [{ scale: 0.94 }], opacity: 0.85 },
  glyphWrap: { minWidth: 44, height: 32, paddingHorizontal: 10, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  glyphWrapActive: { backgroundColor: colors.pale },
  tabText: { color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  tabTextActive: { color: colors.blue, fontWeight: '900' },
  activePip: { position: 'absolute', top: -8, width: 22, height: 3, borderRadius: 2, backgroundColor: colors.blue },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <EmployeeApp />
    </SafeAreaProvider>
  );
}
