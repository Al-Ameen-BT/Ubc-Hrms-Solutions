import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import type { Api } from '../api';
import type { EmployeeSession } from '../session';
import { sharePrivateFile, pickReceipt } from '../files';
import { bankToday, claimAmount, periodQuery } from '../validation';
import { Action, Card, Empty, ErrorText, Field, Loading, Page, colors, dateText, money, styles, timeText, useResource } from '../ui';
import { PasswordForm } from './Auth';
import { version } from '../../package.json';

type Props = { api: Api; session: EmployeeSession; navigate: (section: any) => void };
type Pay = { id: number; year: number; month: number; status: string; grossEarnings: number; totalDeductions: number; netPay: number };
type LeaveType = { id: number; name: string };
type Balance = { id: number; closingBalance: string | number; LeaveType?: LeaveType };
type LeaveApplication = { id: number; fromDate: string; toDate: string; days: string | number; status: string; LeaveType?: LeaveType };
type Policy = { policy: { version: number; title: string; body: string } | null; acknowledged: boolean; history: { id: number; acknowledgedAt: string; EmployeePolicy?: { title: string; version: number } }[] };
type CalendarData = { holidays: { date: string; name: string }[]; leave: LeaveApplication[]; time: TimeEntry[] };
type Person = { id: number; empCode: string; name: string; branchName?: string; department?: string; designation?: string; postName?: string };
type TimeEntry = { id: number; localDate: string; checkInAt: string; checkOutAt?: string | null; correctionReason?: string };
type Claim = { id: number; expenseDate: string; category: string; purpose: string; amount: number; status: string; decisionReason?: string; paidAt?: string; paymentReference?: string };

function Heading({ title, description }: { title: string; description?: string }) { return <><Text style={styles.title}>{title}</Text>{description && <Text style={styles.subtitle}>{description}</Text>}</>; }
function Feedback({ error, busy }: { error?: string; busy?: boolean }) { return <>{busy && <Loading />}<ErrorText message={error} /></>; }
function useAction() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const run = async (action: () => Promise<unknown>, done?: () => void) => {
    setError(''); setBusy(true);
    try { await action(); done?.(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed. Try again.'); }
    finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

function Payslips({ api, session }: Props) {
  const { data, error, loading } = useResource<Pay[]>(api, '/me/payslips', session.token);
  const action = useAction();
  return <Page><Heading title="My payslips" description="Only approved or paid payroll appears here." /><Feedback error={error || action.error} busy={loading} />
    {data?.length ? data.map(row => <Card key={row.id} title={`${new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(row.year, row.month - 1))} · ${row.status}`}>
      <Text style={styles.body}>Gross {money(row.grossEarnings)} · Deductions {money(row.totalDeductions)}</Text>
      <Text style={[styles.cardTitle, { color: colors.green }]}>Net pay {money(row.netPay)}</Text>
      <Action title="Share payslip PDF" secondary disabled={action.busy} onPress={() => action.run(() => sharePrivateFile(api, `/me/payslips/${row.id}/pdf`, session.token, `payslip-${row.year}-${row.month}`))} />
    </Card>) : !loading && !error && <Empty message="No finalized payslips yet." />}
  </Page>;
}

function Leave({ api, session }: Props) {
  const [refresh, setRefresh] = useState(0);
  const types = useResource<LeaveType[]>(api, '/me/leave/types', session.token);
  const balances = useResource<Balance[]>(api, '/me/leave/balances', session.token, refresh);
  const applications = useResource<LeaveApplication[]>(api, '/me/leave/applications', session.token, refresh);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState(''); const [reason, setReason] = useState('');
  const action = useAction();
  const submit = () => action.run(async () => {
    if (!typeId) throw new Error('Choose a leave type.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) throw new Error('Enter valid dates in YYYY-MM-DD order.');
    await api.post('/me/leave/applications', { leaveTypeId: typeId, fromDate, toDate, reason }, session.token);
  }, () => { setFromDate(''); setToDate(''); setReason(''); setRefresh(value => value + 1); });
  return <Page><Heading title="My leave" description="Request leave and track your balance." /><Feedback error={action.error || types.error || balances.error || applications.error} busy={types.loading || balances.loading || applications.loading} />
    <Card title="Request leave">
      <Text style={styles.label}>Leave type</Text>
      <View style={styles.row}>{types.data?.map(type => <Action key={type.id} title={`${typeId === type.id ? '✓ ' : ''}${type.name}`} secondary onPress={() => setTypeId(type.id)} />)}</View>
      <Field label="From date (YYYY-MM-DD)" value={fromDate} onChangeText={setFromDate} placeholder="2026-11-11" keyboardType="numbers-and-punctuation" />
      <Field label="To date (YYYY-MM-DD)" value={toDate} onChangeText={setToDate} placeholder="2026-11-12" keyboardType="numbers-and-punctuation" />
      <Field label="Reason" value={reason} onChangeText={setReason} multiline />
      <Action title="Submit leave request" onPress={submit} disabled={action.busy} />
    </Card>
    <Card title="Balances">{balances.data?.length ? balances.data.map(row => <Text key={row.id} style={styles.body}>{row.LeaveType?.name || 'Leave'} · {Number(row.closingBalance)} days</Text>) : <Empty message="No balances recorded." />}</Card>
    <Card title="Requests">{applications.data?.length ? applications.data.map(row => <View key={row.id} style={styles.line}><Text style={styles.body}>{row.LeaveType?.name} · {row.status}</Text><Text style={styles.muted}>{dateText(row.fromDate)} – {dateText(row.toDate)} · {Number(row.days)} days</Text>{row.status === 'PENDING' && <Action title="Withdraw request" secondary disabled={action.busy} onPress={() => action.run(() => api.post(`/me/leave/applications/${row.id}/cancel`, {}, session.token), () => setRefresh(value => value + 1))} />}</View>) : <Empty message="No leave requests yet." />}</Card>
  </Page>;
}

function Policies({ api, session }: Props) {
  const [refresh, setRefresh] = useState(0); const [read, setRead] = useState(false); const action = useAction();
  const { data, error, loading } = useResource<Policy>(api, '/me/policy', session.token, refresh);
  return <Page><Heading title="Bank policies" /><Feedback error={error || action.error} busy={loading} />
    <Card title={data?.policy?.title || 'No policy published'}>
      {data?.policy ? <><Text style={styles.muted}>Version {data.policy.version} · {data.acknowledged ? 'Acknowledged' : 'Acknowledgement required'}</Text><Text style={styles.body}>{data.policy.body}</Text>{!data.acknowledged && <><Action title={read ? 'Read and understood ✓' : 'I have read this policy'} secondary onPress={() => setRead(!read)} /><Action title="Acknowledge policy" disabled={!read || action.busy} onPress={() => action.run(() => api.post('/me/policy/acknowledge', { version: data.policy?.version }, session.token), () => { setRead(false); setRefresh(value => value + 1); })} /></>}</> : !loading && <Empty message="Your bank has not published a policy yet." />}
    </Card>
    <Card title="Acknowledgement history">{data?.history?.length ? data.history.map(row => <Text key={row.id} style={styles.body}>{row.EmployeePolicy?.title} · v{row.EmployeePolicy?.version} · {dateText(row.acknowledgedAt)}</Text>) : <Empty message="No acknowledgements yet." />}</Card>
  </Page>;
}

function Calendar({ api, session }: Props) {
  const today = bankToday(); const [year, setYear] = useState(Number(today.slice(0, 4))); const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const { data, error, loading } = useResource<CalendarData>(api, `/me/calendar?${periodQuery(year, month)}`, session.token);
  const move = (direction: number) => { const date = new Date(year, month - 1 + direction, 1); setYear(date.getFullYear()); setMonth(date.getMonth() + 1); };
  const first = new Date(year, month - 1, 1).getDay(); const days = new Date(year, month, 0).getDate();
  return <Page><Heading title="My calendar" description="Holidays, leave and check-ins." /><View style={styles.row}><Action title="Previous month" secondary onPress={() => move(-1)} /><Text style={styles.cardTitle}>{new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1))}</Text><Action title="Next month" secondary onPress={() => move(1)} /></View><Feedback error={error} busy={loading} />
    <Card><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <Text key={day} style={{ width: '14.28%', textAlign: 'center', color: colors.muted }}>{day}</Text>)}{Array.from({ length: first }, (_, index) => <View key={`blank-${index}`} style={{ width: '14.28%', height: 53 }} />)}{Array.from({ length: days }, (_, index) => {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
      const holiday = data?.holidays.some(row => row.date === date); const leave = data?.leave.some(row => row.fromDate <= date && row.toDate >= date); const entry = data?.time.some(row => row.localDate === date);
      return <View key={date} style={{ width: '14.28%', height: 53, alignItems: 'center', paddingTop: 8, backgroundColor: date === today ? colors.pale : colors.white }}><Text style={styles.body}>{index + 1}</Text><Text style={{ color: holiday ? colors.red : leave ? colors.blue : colors.green, fontSize: 11 }}>{holiday ? 'H' : leave ? 'L' : entry ? '●' : ''}</Text></View>;
    })}</View><Text style={styles.muted}>H holiday · L leave · ● checked in</Text></Card>
    {data?.holidays.map(row => <Text key={row.date} style={styles.body}>{dateText(row.date)} · {row.name}</Text>)}
    {data?.leave.map(row => <Text key={row.id} style={styles.body}>{dateText(row.fromDate)} – {dateText(row.toDate)} · {row.LeaveType?.name} · {row.status}</Text>)}
  </Page>;
}

function Workplace({ api, session }: Props) {
  const { data, error, loading } = useResource<Person[]>(api, '/me/workplace', session.token);
  const branches = [...new Set((data || []).map(row => row.branchName || 'Unassigned branch'))];
  return <Page><Heading title="Workplace tree" description="Bank → branch → department → role" /><Feedback error={error} busy={loading} />
    {branches.map(branch => <Card key={branch} title={branch}>{[...new Set((data || []).filter(row => (row.branchName || 'Unassigned branch') === branch).map(row => row.department || 'Unassigned department'))].map(department => <View key={department} style={styles.line}><Text style={styles.cardTitle}>{department}</Text>{[...new Set((data || []).filter(row => (row.branchName || 'Unassigned branch') === branch && (row.department || 'Unassigned department') === department).map(row => row.designation || row.postName || 'Unassigned role'))].map(role => <View key={role} style={{ gap: 4, paddingTop: 8 }}><Text style={styles.label}>{role}</Text>{(data || []).filter(row => (row.branchName || 'Unassigned branch') === branch && (row.department || 'Unassigned department') === department && (row.designation || row.postName || 'Unassigned role') === role).map(person => <Text key={person.id} style={styles.body}>{person.name} · {person.empCode}</Text>)}</View>)}</View>)}</Card>)}
    {!loading && !branches.length && <Empty message="No employees listed." />}
  </Page>;
}

function Time({ api, session }: Props) {
  const today = bankToday(); const [year, setYear] = useState(Number(today.slice(0, 4))); const [month, setMonth] = useState(Number(today.slice(5, 7))); const [refresh, setRefresh] = useState(0);
  const action = useAction(); const { data, error, loading } = useResource<TimeEntry[]>(api, `/me/time?${periodQuery(year, month)}`, session.token, refresh);
  const move = (direction: number) => { const date = new Date(year, month - 1 + direction, 1); setYear(date.getFullYear()); setMonth(date.getMonth() + 1); };
  return <Page><Heading title="Check-in and check-out" description="Times are recorded by the server in India Standard Time. HR reconciles payroll separately." /><Feedback error={error || action.error} busy={loading} />
    <Card title="Today"><View style={styles.row}><Action title="Check in" disabled={action.busy} onPress={() => action.run(() => api.post('/me/time/check-in', {}, session.token), () => setRefresh(value => value + 1))} /><Action title="Check out" secondary disabled={action.busy} onPress={() => action.run(() => api.post('/me/time/check-out', {}, session.token), () => setRefresh(value => value + 1))} /></View></Card>
    <Card title="My time entries"><View style={styles.row}><Action title="Previous month" secondary onPress={() => move(-1)} /><Text style={styles.body}>{month}/{year}</Text><Action title="Next month" secondary onPress={() => move(1)} /></View>{data?.length ? data.map(row => <View key={row.id} style={styles.line}><Text style={styles.body}>{dateText(row.localDate)} · {row.checkOutAt ? 'Completed' : 'Open'}</Text><Text style={styles.muted}>In {timeText(row.checkInAt)} · Out {timeText(row.checkOutAt)}</Text>{row.correctionReason && <Text style={styles.muted}>Correction: {row.correctionReason}</Text>}</View>) : !loading && <Empty message="No entries this month." />}</Card>
  </Page>;
}

function Claims({ api, session }: Props) {
  const [refresh, setRefresh] = useState(0); const [date, setDate] = useState(bankToday()); const [category, setCategory] = useState(''); const [purpose, setPurpose] = useState(''); const [amount, setAmount] = useState(''); const [receipt, setReceipt] = useState<{ name: string; dataUrl: string } | null>(null);
  const action = useAction(); const { data, error, loading } = useResource<Claim[]>(api, '/me/expenses', session.token, refresh);
  const submit = () => action.run(async () => {
    const rupees = claimAmount(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !category.trim() || !purpose.trim() || !receipt) throw new Error('Enter date, category, purpose and a receipt.');
    await api.post('/me/expenses', { expenseDate: date, category: category.trim(), purpose: purpose.trim(), amount: rupees, receiptDataUrl: receipt.dataUrl }, session.token);
  }, () => { setCategory(''); setPurpose(''); setAmount(''); setReceipt(null); setRefresh(value => value + 1); });
  return <Page><Heading title="Reimbursement claims" description="Claims are approved and paid separately from payroll." /><Feedback error={error || action.error} busy={loading} />
    <Card title="Submit a claim"><Field label="Expense date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" /><Field label="Category" value={category} onChangeText={setCategory} /><Field label="Business purpose" value={purpose} onChangeText={setPurpose} multiline /><Field label="Amount (₹, whole rupees)" value={amount} onChangeText={setAmount} keyboardType="number-pad" /><Action title={receipt ? `Receipt: ${receipt.name}` : 'Choose receipt (PDF or image)'} secondary onPress={() => action.run(async () => { const selected = await pickReceipt(); if (selected) setReceipt(selected); })} /><Action title="Submit claim" onPress={submit} disabled={action.busy} /></Card>
    <Card title="My claims">{data?.length ? data.map(row => <View key={row.id} style={styles.line}><Text style={styles.body}>{row.purpose} · {money(row.amount)}</Text><Text style={styles.muted}>{dateText(row.expenseDate)} · {row.category} · {row.status}</Text>{row.decisionReason && <Text style={styles.muted}>{row.decisionReason}</Text>}{row.paymentReference && <Text style={styles.muted}>Paid {dateText(row.paidAt)} · {row.paymentReference}</Text>}<Action title="Open receipt" secondary disabled={action.busy} onPress={() => action.run(() => sharePrivateFile(api, `/me/expenses/${row.id}/receipt`, session.token, `receipt-${row.id}`))} />{['SUBMITTED', 'PREPARED'].includes(row.status) && <Action title="Withdraw claim" secondary disabled={action.busy} onPress={() => action.run(() => api.post(`/me/expenses/${row.id}/withdraw`, {}, session.token), () => setRefresh(value => value + 1))} />}</View>) : !loading && <Empty message="No claims yet." />}</Card>
  </Page>;
}

export function Services({ section, api, session, navigate, signOut }: Props & { section: string; signOut: () => void }) {
  if (section === 'Payslips') return <Payslips api={api} session={session} navigate={navigate} />;
  if (section === 'Leave') return <Leave api={api} session={session} navigate={navigate} />;
  if (section === 'Time') return <Time api={api} session={session} navigate={navigate} />;
  if (section === 'Policies') return <Policies api={api} session={session} navigate={navigate} />;
  if (section === 'Calendar') return <Calendar api={api} session={session} navigate={navigate} />;
  if (section === 'Workplace') return <Workplace api={api} session={session} navigate={navigate} />;
  if (section === 'Claims') return <Claims api={api} session={session} navigate={navigate} />;
  if (section === 'Profile') return <Page><Heading title="My profile" /><Card title={session.user.organization?.name || 'Work identity'}>{session.user.organization?.logoUrl && <Image source={{ uri: `${api.root}${session.user.organization.logoUrl}` }} resizeMode="contain" style={{ width: '100%', height: 72 }} accessibilityLabel={`${session.user.organization.name} logo`} />}<Text style={styles.body}>{session.context.employee?.name} · {session.context.employee?.empCode}</Text><Text style={styles.muted}>{session.user.email}</Text><Text style={styles.muted}>{session.context.employee?.designation || 'Employee'} · {session.context.employee?.department || 'Department unassigned'} · {session.context.employee?.branchName || 'Branch unassigned'}</Text></Card><PasswordForm api={api} session={session} onSignOut={signOut} /><Action title="Sign out" secondary onPress={signOut} /><Text style={styles.muted}>Version {version}</Text></Page>;
  return <Page><Heading title="More services" /><Card title="Explore"><Action title="Bank policies" secondary onPress={() => navigate('Policies')} /><Action title="My calendar" secondary onPress={() => navigate('Calendar')} /><Action title="Workplace tree" secondary onPress={() => navigate('Workplace')} /><Action title="Reimbursement claims" secondary onPress={() => navigate('Claims')} /><Action title="My profile and password" secondary onPress={() => navigate('Profile')} /></Card></Page>;
}
