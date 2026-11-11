import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
