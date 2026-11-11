import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Api } from './api';

export const colors = { ink: '#17324d', blue: '#2364a0', pale: '#eaf2f8', paper: '#f7f9fc', white: '#fff', muted: '#53677a', line: '#d5e0e9', red: '#a02a35', green: '#196d53' };

export const styles = StyleSheet.create({
  page: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', padding: 18, paddingBottom: 32, gap: 16, backgroundColor: colors.paper },
  title: { color: colors.ink, fontSize: 27, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, gap: 12 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600', marginBottom: 5 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#aebfce', borderRadius: 10, minHeight: 48, paddingHorizontal: 12, color: colors.ink, fontSize: 16 },
  button: { minHeight: 46, paddingHorizontal: 15, borderRadius: 10, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: colors.pale, borderWidth: 1, borderColor: colors.line },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  buttonTextSecondary: { color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  line: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 12, gap: 4 },
  error: { color: colors.red, backgroundColor: '#fff0f0', padding: 12, borderRadius: 8, fontSize: 14 },
});

export function Page({ children }: { children: React.ReactNode }) { return <ScrollView style={{ backgroundColor: colors.paper }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView>; }
export function Card({ title, children }: { title?: string; children: React.ReactNode }) { return <View style={styles.card}>{title && <Text style={styles.cardTitle}>{title}</Text>}{children}</View>; }
export function Action({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.buttonSecondary, disabled && { opacity: 0.5 }]}><Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text></Pressable>; }
export function Field({ label, value, onChangeText, ...props }: React.ComponentProps<typeof TextInput> & { label: string; value: string; onChangeText: (value: string) => void }) { return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={value} onChangeText={onChangeText} placeholderTextColor={colors.muted} {...props} /></View>; }
export function ErrorText({ message }: { message?: string | null }) { return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null; }
export function Empty({ message }: { message: string }) { return <Text style={styles.muted}>{message}</Text>; }
export function Loading() { return <ActivityIndicator color={colors.blue} size="large" accessibilityLabel="Loading" />; }

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
