import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Api } from '../api';
import type { EmployeeSession } from '../session';
import { firstName } from '../presentation';
import { Action, Card, colors, Empty, ErrorText, Loading, Page, radius, styles, useResource } from '../ui';

type Balance = { id: number; closingBalance: number | string; LeaveType?: { name: string } };

const shortcuts = [
  { section: 'Payslips', glyph: '₹', title: 'Payslips', detail: 'View finalized salary records' },
  { section: 'Claims', glyph: '↗', title: 'Claims', detail: 'Submit and track expenses' },
  { section: 'Policies', glyph: '✓', title: 'Policies', detail: 'Read and acknowledge updates' },
] as const;

export function Home({ api, session, navigate }: { api: Api; session: EmployeeSession; navigate: (section: any) => void }) {
  const balances = useResource<Balance[]>(api, '/me/leave/balances', session.token);
  const employee = session.context.employee;
  const identity = [employee?.empCode, employee?.designation || 'Employee', employee?.branchName].filter(Boolean).join(' · ');
  return <Page>
    <View style={local.hero}>
      <Text style={styles.eyebrow}>Employee self-service</Text>
      <Text style={local.greeting}>Good day, {firstName(employee?.name || session.user.name)}</Text>
      <Text style={local.identity}>{identity || 'Your workplace'}</Text>
    </View>

    <Card title="Today at work">
      <Text style={styles.muted}>Record your workday or plan time away.</Text>
      <View style={local.actionGrid}><View style={local.actionCell}><Action title="Check in or out" onPress={() => navigate('Time')} /></View><View style={local.actionCell}><Action title="Request leave" onPress={() => navigate('Leave')} secondary /></View></View>
    </Card>

    <Card title="Leave balances">
      {balances.loading ? <Loading rows={2} /> : balances.error ? <><ErrorText message={balances.error} /><Text style={styles.muted}>Other employee services are still available.</Text></> : balances.data?.length ? <View style={local.balanceGrid}>{balances.data.map(row => <View key={row.id} style={local.balance}><Text style={local.balanceValue}>{Number(row.closingBalance)}</Text><Text style={local.balanceUnit}>days</Text><Text numberOfLines={2} style={local.balanceName}>{row.LeaveType?.name || 'Leave'}</Text></View>)}</View> : <Empty message="No leave balances have been recorded yet." />}
    </Card>

    <View style={{ gap: 10 }}><Text style={styles.cardTitle}>Quick access</Text>{shortcuts.map(item => <Pressable accessibilityRole="button" accessibilityLabel={item.title} key={item.section} onPress={() => navigate(item.section)} style={({ pressed }) => [local.shortcut, pressed && local.shortcutPressed]}><View style={local.shortcutIcon}><Text style={local.shortcutGlyph}>{item.glyph}</Text></View><View style={{ flex: 1 }}><Text style={local.shortcutTitle}>{item.title}</Text><Text style={styles.muted}>{item.detail}</Text></View><Text style={local.chevron}>›</Text></Pressable>)}</View>
  </Page>;
}

const local = StyleSheet.create({
  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: 20, gap: 5, overflow: 'hidden' },
  greeting: { color: colors.white, fontSize: 27, lineHeight: 34, fontWeight: '900', letterSpacing: -0.4 },
  identity: { color: '#c5d9e8', fontSize: 14, lineHeight: 20 },
  actionGrid: { flexDirection: 'row', gap: 10 },
  actionCell: { flex: 1 },
  balanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  balance: { minWidth: 112, flexGrow: 1, flexBasis: '30%', borderRadius: radius.md, backgroundColor: colors.pale, padding: 14, borderWidth: 1, borderColor: '#cbdde7' },
  balanceValue: { color: colors.ink, fontSize: 26, lineHeight: 31, fontWeight: '900' },
  balanceUnit: { color: colors.blue, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  balanceName: { color: colors.muted, fontSize: 13, lineHeight: 17, marginTop: 8, fontWeight: '700' },
  shortcut: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  shortcutPressed: { backgroundColor: colors.pale, transform: [{ scale: 0.99 }] },
  shortcutIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  shortcutGlyph: { color: colors.blue, fontSize: 19, fontWeight: '900' },
  shortcutTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  chevron: { color: colors.blue, fontSize: 26, fontWeight: '500' },
});
