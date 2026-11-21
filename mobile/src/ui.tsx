import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Api } from './api';
import type { StatusTone } from './presentation';

export const colors = { ink: '#17324d', blue: '#2364a0', pale: '#eaf2f8', paper: '#f5f7fa', white: '#fff', muted: '#5e7181', line: '#d5e0e3', red: '#a4363f', redPale: '#fff0f1', green: '#176b52', greenPale: '#e8f5ef', amber: '#8a5b13', amberPale: '#fff6df', info: '#235f8d', infoPale: '#e9f2fb', shadow: '#0d2e45' };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const styles = StyleSheet.create({
  page: { flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 20, paddingBottom: 40, gap: 18, backgroundColor: colors.paper },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  eyebrow: { color: colors.blue, fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 16, gap: 13, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', marginBottom: 6 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#9eb2c0', borderRadius: radius.sm, minHeight: 50, paddingHorizontal: 13, paddingVertical: 11, color: colors.ink, fontSize: 16 },
  button: { minHeight: 50, paddingHorizontal: 17, borderRadius: radius.sm, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  buttonSecondary: { backgroundColor: colors.pale, borderWidth: 1, borderColor: '#c7dce7' },
  buttonPressed: { transform: [{ scale: 0.985 }], opacity: 0.86 },
  buttonText: { color: colors.white, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  buttonTextSecondary: { color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  line: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 12, gap: 5 },
  error: { color: colors.red, backgroundColor: colors.redPale, borderWidth: 1, borderColor: '#edc9cd', padding: 12, borderRadius: radius.sm, fontSize: 14, lineHeight: 20 },
});

export function Page({ children }: { children: React.ReactNode }) {
  return <ScrollView style={{ backgroundColor: colors.paper }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>{children}</ScrollView>;
}

export function ScreenHeading({ title, description, eyebrow }: { title: string; description?: string; eyebrow?: string }) {
  return <View style={{ gap: 5 }}>{eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}<Text style={styles.title}>{title}</Text>{description && <Text style={styles.subtitle}>{description}</Text>}</View>;
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) { return <View style={styles.card}>{title && <Text style={styles.cardTitle}>{title}</Text>}{children}</View>; }

export function Action({ title, onPress, secondary = false, disabled = false, busy = false, accessibilityHint }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean; accessibilityHint?: string }) {
  const unavailable = disabled || busy;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint} accessibilityState={{ disabled: unavailable, busy }} disabled={unavailable} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, unavailable && { opacity: 0.48 }, pressed && !unavailable && styles.buttonPressed]}>
    {busy && <ActivityIndicator color={secondary ? colors.blue : colors.white} size="small" />}
    <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>
  </Pressable>;
}

export function Field({ label, value, onChangeText, ...props }: React.ComponentProps<typeof TextInput> & { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }]} value={value} onChangeText={onChangeText} placeholderTextColor={colors.muted} {...props} /></View>;
}

export function ErrorText({ message }: { message?: string | null }) { return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null; }

export function Notice({ message, tone = 'info' }: { message?: string | null; tone?: 'info' | 'success' }) {
  if (!message) return null;
  const success = tone === 'success';
  return <Text accessibilityRole="alert" style={[styles.error, { color: success ? colors.green : colors.info, backgroundColor: success ? colors.greenPale : colors.infoPale, borderColor: success ? '#bfdfd0' : '#c8dced' }]}>{message}</Text>;
}

export function Empty({ message, action }: { message: string; action?: React.ReactNode }) {
  return <View style={{ alignItems: 'center', paddingVertical: 18, paddingHorizontal: 10, gap: 12 }}><Text style={{ fontSize: 26, color: colors.blue }}>◇</Text><Text style={[styles.muted, { textAlign: 'center' }]}>{message}</Text>{action}</View>;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ gap: 10 }}>{Array.from({ length: rows }, (_, index) => <View key={index} style={{ height: index === 0 ? 18 : 12, width: index === 0 ? '55%' : index === rows - 1 ? '72%' : '92%', borderRadius: radius.pill, backgroundColor: index === 0 ? '#d5e4ee' : '#e3ebf0' }} />)}</View>;
}

const toneStyles: Record<StatusTone, { backgroundColor: string; color: string }> = {
  success: { backgroundColor: colors.greenPale, color: colors.green }, warning: { backgroundColor: colors.amberPale, color: colors.amber }, danger: { backgroundColor: colors.redPale, color: colors.red }, info: { backgroundColor: colors.infoPale, color: colors.info }, neutral: { backgroundColor: '#edf1f4', color: colors.muted },
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  return <View accessibilityLabel={`Status: ${label}`} style={[{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill }, toneStyles[tone]]}><Text style={{ color: toneStyles[tone].color, fontSize: 12, fontWeight: '800' }}>{label}</Text></View>;
}

export function DataRow({ label, value, emphasis = false, last = false }: { label: string; value: React.ReactNode; emphasis?: boolean; last?: boolean }) {
  return <View style={{ minHeight: 44, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}><Text style={[styles.muted, emphasis && { color: colors.ink, fontWeight: '800' }]}>{label}</Text><Text style={[styles.body, { textAlign: 'right', flexShrink: 1 }, emphasis && { color: colors.green, fontSize: 19, fontWeight: '800' }]}>{value}</Text></View>;
}

export function useResource<T>(api: Api, path: string, token: string, refresh = 0) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: true });
  useEffect(() => {
    let active = true;
    setState({ data: null, error: '', loading: true });
    api.get<T>(path, token).then(data => { if (active) setState({ data, error: '', loading: false }); }).catch(error => { if (active) setState({ data: null, error: error.message, loading: false }); });
    return () => { active = false; };
  }, [api, path, token, refresh]);
  return state;
}

export const money = (value: number | string | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value));
export const dateText = (value?: string | null) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value.length === 10 ? `${value}T12:00:00+05:30` : value)) : '—';
export const timeText = (value?: string | null) => value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : '—';

/* ================= Custom Vector Icons (Strictly No Emojis) ================= */

export function HomeIcon({ color = colors.blue, size = 20 }: { color?: string; size?: number }) {
  const w = size;
  const h = size;
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: w * 0.44, borderRightWidth: w * 0.44, borderBottomWidth: h * 0.38, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color }} />
      <View style={{ width: w * 0.64, height: h * 0.44, backgroundColor: color, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, alignItems: 'center', justifyContent: 'flex-end' }}>
        <View style={{ width: w * 0.22, height: h * 0.24, backgroundColor: colors.white, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
      </View>
    </View>
  );
}

export function PayIcon({ color = colors.blue, size = 20 }: { color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, borderWidth: 1.8, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: Math.round(size * 0.62), fontWeight: '900', lineHeight: Math.round(size * 0.72) }}>₹</Text>
    </View>
  );
}

export function LeaveIcon({ color = colors.blue, size = 20 }: { color?: string; size?: number }) {
  return (
    <View style={{ width: size * 0.88, height: size, borderRadius: 4, borderWidth: 1.8, borderColor: color, overflow: 'hidden' }}>
      <View style={{ height: size * 0.32, backgroundColor: color, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 1 }}>
        <View style={{ width: 2, height: 4, backgroundColor: colors.white, borderRadius: 1 }} />
        <View style={{ width: 2, height: 4, backgroundColor: colors.white, borderRadius: 1 }} />
      </View>
      <View style={{ flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size * 0.34, height: size * 0.18, borderBottomWidth: 1.8, borderLeftWidth: 1.8, borderColor: color, transform: [{ rotate: '-45deg' }], marginTop: -2 }} />
      </View>
    </View>
  );
}

export function TimeIcon({ color = colors.blue, size = 20 }: { color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.8, borderColor: color, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color, position: 'absolute' }} />
      <View style={{ width: 1.8, height: size * 0.28, backgroundColor: color, position: 'absolute', top: size * 0.22, borderRadius: 1 }} />
      <View style={{ width: size * 0.28, height: 1.8, backgroundColor: color, position: 'absolute', right: size * 0.22, borderRadius: 1 }} />
    </View>
  );
}

export function MoreIcon({ color = colors.blue, size = 20 }: { color?: string; size?: number }) {
  const dot = Math.round(size * 0.32);
  return (
    <View style={{ width: size, height: size, justifyContent: 'space-between', padding: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ width: dot, height: dot, borderRadius: 2.5, backgroundColor: color }} />
        <View style={{ width: dot, height: dot, borderRadius: 2.5, backgroundColor: color }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ width: dot, height: dot, borderRadius: 2.5, backgroundColor: color }} />
        <View style={{ width: dot, height: dot, borderRadius: 2.5, backgroundColor: color }} />
      </View>
    </View>
  );
}

export function ChevronRightIcon({ color = colors.muted, size = 16 }: { color?: string; size?: number }) {
  return (
    <View style={{ width: size * 0.44, height: size * 0.44, borderTopWidth: 2, borderRightWidth: 2, borderColor: color, transform: [{ rotate: '45deg' }] }} />
  );
}

export function CheckCircleIcon({ color = colors.green, size = 20 }: { color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.42, height: size * 0.22, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: colors.white, transform: [{ rotate: '-45deg' }], marginTop: -2 }} />
    </View>
  );
}

/* ================= Profile Avatar ================= */

export function Avatar({ name, photoUrl, size = 64, isOnline = true, showStatus = true }: { name?: string | null; photoUrl?: string | null; size?: number; isOnline?: boolean; showStatus?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initialsText = (name || 'Employee').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'E';
  const indicatorSize = Math.max(12, Math.round(size * 0.22));

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: '#3b82f6', overflow: 'hidden', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 6, elevation: 4 }}>
        {photoUrl && !imageFailed ? (
          <Image source={{ uri: photoUrl }} onError={() => setImageFailed(true)} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        ) : (
          <View style={{ width: '100%', height: '100%', backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.white, fontSize: Math.round(size * 0.38), fontWeight: '900', letterSpacing: 0.5 }}>{initialsText}</Text>
          </View>
        )}
      </View>
      {showStatus && (
        <View style={{ position: 'absolute', bottom: 1, right: 1, width: indicatorSize, height: indicatorSize, borderRadius: indicatorSize / 2, backgroundColor: isOnline ? colors.green : colors.muted, borderWidth: 2, borderColor: colors.white }} />
      )}
    </View>
  );
}

/* ================= Banihal Watermark (Matches Web App Style) ================= */

export function BanihalWatermark({ version }: { version?: string }) {
  return (
    <View style={watermarkStyles.container}>
      {version ? <Text style={watermarkStyles.version}>Version {version}</Text> : null}
      <Text style={watermarkStyles.poweredBy}>Powered By</Text>
      <Image
        source={require('../assets/banihal-logo.png')}
        style={watermarkStyles.logo}
        resizeMode="contain"
        accessibilityLabel="Banihal Technologies"
      />
    </View>
  );
}

const watermarkStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
    marginTop: 10,
  },
  version: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  poweredBy: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  logo: {
    width: 130,
    height: 22,
    opacity: 0.85,
  },
});
