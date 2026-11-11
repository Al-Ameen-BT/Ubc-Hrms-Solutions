import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Api } from '../api';
import type { EmployeeSession } from '../session';
import { sharePrivateFile, pickReceipt } from '../files';
import { bankToday, claimAmount, periodQuery } from '../validation';
import { isCurrentBankPeriod, statusMeta } from '../presentation';
import { Action, Card, DataRow, Empty, ErrorText, Field, Loading, Notice, Page, radius, ScreenHeading, StatusBadge, colors, dateText, money, styles, timeText, useResource } from '../ui';
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

function Feedback({ error, loading, notice }: { error?: string; loading?: boolean; notice?: string }) {
  return <>{loading && <Loading />}<ErrorText message={error} /><Notice message={notice} tone="success" /></>;
}

function useAction() {
  const [busyKey, setBusyKey] = useState<string | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const run = async (key: string, action: () => Promise<unknown>, done?: () => void, success?: string) => {
    setError(''); setNotice(''); setBusyKey(key);
    try { await action(); done?.(); if (success) setNotice(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'Action failed. Try again.'); }
    finally { setBusyKey(null); }
  };
  return { busy: busyKey !== null, busyKey, error, notice, run };
}

function PeriodControl({ year, month, move }: { year: number; month: number; move: (direction: number) => void }) {
  const label = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1));
  return <View style={local.period}><Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => move(-1)} style={({ pressed }) => [local.periodButton, pressed && local.pressed]}><Text style={local.periodGlyph}>‹</Text></Pressable><Text style={local.periodLabel}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => move(1)} style={({ pressed }) => [local.periodButton, pressed && local.pressed]}><Text style={local.periodGlyph}>›</Text></Pressable></View>;
}

function Payslips({ api, session }: Props) {
  const { data, error, loading } = useResource<Pay[]>(api, '/me/payslips', session.token);
  const action = useAction();
  return <Page><ScreenHeading eyebrow="Salary passbook" title="My payslips" description="Only approved or paid payroll appears here." /><Feedback error={error || action.error} loading={loading} />
    {data?.length ? data.map(row => { const status = statusMeta(row.status); return <Card key={row.id}>
      <View style={local.cardHeader}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(row.year, row.month - 1))}</Text><Text style={styles.muted}>Finalized salary statement</Text></View><StatusBadge {...status} /></View>
      <View style={local.ledger}><DataRow label="Gross earnings" value={money(row.grossEarnings)} /><DataRow label="Deductions" value={money(row.totalDeductions)} /><DataRow label="Net pay" value={money(row.netPay)} emphasis last /></View>
      <Action title="Share payslip PDF" secondary busy={action.busyKey === `payslip-${row.id}`} disabled={action.busy} onPress={() => action.run(`payslip-${row.id}`, () => sharePrivateFile(api, `/me/payslips/${row.id}/pdf`, session.token, `payslip-${row.year}-${row.month}`))} />
    </Card>; }) : !loading && !error && <Empty message="No finalized payslips are available yet." />}
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
  const submit = () => action.run('leave-submit', async () => {
    if (!typeId) throw new Error('Choose a leave type.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) throw new Error('Enter valid dates in YYYY-MM-DD order.');
    await api.post('/me/leave/applications', { leaveTypeId: typeId, fromDate, toDate, reason }, session.token);
  }, () => { setFromDate(''); setToDate(''); setReason(''); setTypeId(null); setRefresh(value => value + 1); }, 'Leave request submitted for approval.');
  return <Page><ScreenHeading eyebrow="Time away" title="My leave" description="Check balances, submit a request and follow its approval status." /><Feedback error={action.error || types.error || balances.error || applications.error} loading={types.loading || balances.loading || applications.loading} notice={action.notice} />
    {!!balances.data?.length && <View style={local.balanceGrid}>{balances.data.map(row => <View key={row.id} style={local.balance}><Text style={local.balanceValue}>{Number(row.closingBalance)}</Text><Text style={local.balanceUnit}>days</Text><Text style={local.balanceName}>{row.LeaveType?.name || 'Leave'}</Text></View>)}</View>}
    <Card title="Request leave">
      <Text style={styles.label}>Leave type</Text><View style={local.chips}>{types.data?.map(type => { const selected = typeId === type.id; return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} key={type.id} onPress={() => setTypeId(type.id)} style={({ pressed }) => [local.chip, selected && local.chipSelected, pressed && local.pressed]}><Text style={[local.chipText, selected && local.chipTextSelected]}>{selected ? '✓ ' : ''}{type.name}</Text></Pressable>; })}</View>
      <Field label="From date" value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /><Field label="To date" value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /><Field label="Reason (optional)" value={reason} onChangeText={setReason} multiline />
      <Action title="Submit leave request" onPress={submit} busy={action.busyKey === 'leave-submit'} disabled={action.busy} />
    </Card>
    <Card title="Request history">{applications.data?.length ? applications.data.map(row => { const status = statusMeta(row.status); return <View key={row.id} style={local.listItem}><View style={local.cardHeader}><View style={{ flex: 1 }}><Text style={styles.body}>{row.LeaveType?.name || 'Leave'}</Text><Text style={styles.muted}>{dateText(row.fromDate)} – {dateText(row.toDate)} · {Number(row.days)} days</Text></View><StatusBadge {...status} /></View>{row.status === 'PENDING' && <Action title="Withdraw request" secondary busy={action.busyKey === `leave-withdraw-${row.id}`} disabled={action.busy} onPress={() => action.run(`leave-withdraw-${row.id}`, () => api.post(`/me/leave/applications/${row.id}/cancel`, {}, session.token), () => setRefresh(value => value + 1), 'Leave request withdrawn.')} />}</View>; }) : <Empty message="No leave requests yet." />}</Card>
  </Page>;
}

function Policies({ api, session }: Props) {
  const [refresh, setRefresh] = useState(0); const [read, setRead] = useState(false); const action = useAction();
  const { data, error, loading } = useResource<Policy>(api, '/me/policy', session.token, refresh);
  return <Page><ScreenHeading eyebrow="Workplace guidance" title="Bank policies" description="Read the current policy and keep a record of acknowledgements." /><Feedback error={error || action.error} loading={loading} notice={action.notice} />
    <Card title={data?.policy?.title || 'No policy published'}>{data?.policy ? <><View style={local.cardHeader}><Text style={styles.muted}>Version {data.policy.version}</Text><StatusBadge {...statusMeta(data.acknowledged ? 'ACKNOWLEDGED' : 'REQUIRED')} /></View><View style={local.policyBody}><Text style={styles.body}>{data.policy.body}</Text></View>{!data.acknowledged && <><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: read }} onPress={() => setRead(!read)} style={({ pressed }) => [local.checkRow, read && local.checkRowSelected, pressed && local.pressed]}><Text style={local.checkMark}>{read ? '✓' : ''}</Text><Text style={[styles.body, { flex: 1 }]}>I have read and understood this policy</Text></Pressable><Action title="Acknowledge policy" disabled={!read || action.busy} busy={action.busyKey === 'policy-acknowledge'} onPress={() => action.run('policy-acknowledge', () => api.post('/me/policy/acknowledge', { version: data.policy?.version }, session.token), () => { setRead(false); setRefresh(value => value + 1); }, 'Policy acknowledgement recorded.')} /></>}</> : !loading && <Empty message="Your bank has not published a policy yet." />}</Card>
    <Card title="Acknowledgement history">{data?.history?.length ? data.history.map(row => <View key={row.id} style={local.listItem}><Text style={styles.body}>{row.EmployeePolicy?.title || 'Policy'}</Text><Text style={styles.muted}>Version {row.EmployeePolicy?.version} · {dateText(row.acknowledgedAt)}</Text></View>) : <Empty message="No acknowledgements yet." />}</Card>
  </Page>;
}

function Calendar({ api, session }: Props) {
  const today = bankToday(); const [year, setYear] = useState(Number(today.slice(0, 4))); const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const { data, error, loading } = useResource<CalendarData>(api, `/me/calendar?${periodQuery(year, month)}`, session.token);
  const move = (direction: number) => { const date = new Date(year, month - 1 + direction, 1); setYear(date.getFullYear()); setMonth(date.getMonth() + 1); };
  const first = new Date(year, month - 1, 1).getDay(); const days = new Date(year, month, 0).getDate();
  return <Page><ScreenHeading eyebrow="Schedule" title="My calendar" description="Holidays, approved leave and recorded workdays in one view." /><PeriodControl year={year} month={month} move={move} /><Feedback error={error} loading={loading} />
    <Card><View style={local.calendar}>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <Text key={day} style={local.weekday}>{day}</Text>)}{Array.from({ length: first }, (_, index) => <View key={`blank-${index}`} style={local.day} />)}{Array.from({ length: days }, (_, index) => {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
      const holiday = data?.holidays.some(row => row.date === date); const leave = data?.leave.some(row => row.fromDate <= date && row.toDate >= date); const entry = data?.time.some(row => row.localDate === date);
      const marker = holiday ? 'H' : leave ? 'L' : entry ? '●' : '';
      return <View key={date} accessibilityLabel={`${date}${holiday ? ', holiday' : leave ? ', leave' : entry ? ', checked in' : ''}`} style={[local.day, date === today && local.today]}><Text style={[local.dayNumber, date === today && local.todayNumber]}>{index + 1}</Text><Text style={[local.marker, holiday ? { color: colors.red } : leave ? { color: colors.blue } : { color: colors.green }]}>{marker}</Text></View>;
    })}</View><View style={local.legend}><Text style={styles.muted}><Text style={{ color: colors.red, fontWeight: '900' }}>H</Text> Holiday</Text><Text style={styles.muted}><Text style={{ color: colors.blue, fontWeight: '900' }}>L</Text> Leave</Text><Text style={styles.muted}><Text style={{ color: colors.green, fontWeight: '900' }}>●</Text> Checked in</Text></View></Card>
    {!!data?.holidays.length && <Card title="Holidays">{data.holidays.map(row => <DataRow key={row.date} label={dateText(row.date)} value={row.name} />)}</Card>}
    {!!data?.leave.length && <Card title="Leave on this calendar">{data.leave.map(row => <View key={row.id} style={local.listItem}><Text style={styles.body}>{row.LeaveType?.name || 'Leave'}</Text><Text style={styles.muted}>{dateText(row.fromDate)} – {dateText(row.toDate)}</Text></View>)}</Card>}
  </Page>;
}

function Workplace({ api, session }: Props) {
  const { data, error, loading } = useResource<Person[]>(api, '/me/workplace', session.token);
  const branches = [...new Set((data || []).map(row => row.branchName || 'Unassigned branch'))];
  return <Page><ScreenHeading eyebrow="Organisation" title="Workplace tree" description="Bank → branch → department → role" /><Feedback error={error} loading={loading} />
    {branches.map(branch => <Card key={branch}><View style={local.branchTitle}><Text style={local.branchGlyph}>⌂</Text><Text style={styles.cardTitle}>{branch}</Text></View>{[...new Set((data || []).filter(row => (row.branchName || 'Unassigned branch') === branch).map(row => row.department || 'Unassigned department'))].map(department => <View key={department} style={local.department}><Text style={local.departmentTitle}>{department}</Text>{[...new Set((data || []).filter(row => (row.branchName || 'Unassigned branch') === branch && (row.department || 'Unassigned department') === department).map(row => row.designation || row.postName || 'Unassigned role'))].map(role => <View key={role} style={local.role}><Text style={styles.eyebrow}>{role}</Text>{(data || []).filter(row => (row.branchName || 'Unassigned branch') === branch && (row.department || 'Unassigned department') === department && (row.designation || row.postName || 'Unassigned role') === role).map(person => <View key={person.id} style={local.person}><View style={local.personMark}><Text style={local.personMarkText}>{person.name.trim()[0]?.toUpperCase() || 'E'}</Text></View><View><Text style={styles.body}>{person.name}</Text><Text style={styles.muted}>{person.empCode}</Text></View></View>)}</View>)}</View>)}</Card>)}
    {!loading && !branches.length && <Empty message="No employees are listed in the workplace tree." />}
  </Page>;
}

function Time({ api, session }: Props) {
  const today = bankToday(); const [year, setYear] = useState(Number(today.slice(0, 4))); const [month, setMonth] = useState(Number(today.slice(5, 7))); const [refresh, setRefresh] = useState(0);
  const action = useAction(); const { data, error, loading } = useResource<TimeEntry[]>(api, `/me/time?${periodQuery(year, month)}`, session.token, refresh);
  const move = (direction: number) => { const date = new Date(year, month - 1 + direction, 1); setYear(date.getFullYear()); setMonth(date.getMonth() + 1); };
  const viewingCurrentMonth = isCurrentBankPeriod(today, year, month);
  const todayEntry = viewingCurrentMonth ? data?.find(row => row.localDate === today) : undefined; const open = !!todayEntry && !todayEntry.checkOutAt; const completed = !!todayEntry?.checkOutAt;
  return <Page><ScreenHeading eyebrow="Attendance" title="Check-in and check-out" description="Times use India Standard Time. HR reconciles attendance and payroll separately." /><Feedback error={error || action.error} loading={loading} notice={action.notice} />
    <Card><View style={local.cardHeader}><View><Text style={styles.cardTitle}>Today</Text><Text style={styles.muted}>{dateText(today)}</Text></View><StatusBadge {...statusMeta(viewingCurrentMonth ? completed ? 'COMPLETED' : open ? 'OPEN' : 'Not started' : 'History')} /></View>{!viewingCurrentMonth && <><Notice message="Return to the current month before recording today’s attendance." /><Action title="Return to current month" secondary onPress={() => { setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7))); }} /></>}{todayEntry && <View style={local.ledger}><DataRow label="Check-in" value={timeText(todayEntry.checkInAt)} /><DataRow label="Check-out" value={timeText(todayEntry.checkOutAt)} last /></View>}<View style={local.actionGrid}><View style={{ flex: 1 }}><Action title="Check in" disabled={!viewingCurrentMonth || !!todayEntry || action.busy} busy={action.busyKey === 'time-check-in'} onPress={() => action.run('time-check-in', () => api.post('/me/time/check-in', {}, session.token), () => setRefresh(value => value + 1), 'Check-in recorded.')} /></View><View style={{ flex: 1 }}><Action title="Check out" secondary disabled={!viewingCurrentMonth || !open || action.busy} busy={action.busyKey === 'time-check-out'} onPress={() => action.run('time-check-out', () => api.post('/me/time/check-out', {}, session.token), () => setRefresh(value => value + 1), 'Check-out recorded.')} /></View></View></Card>
    <PeriodControl year={year} month={month} move={move} />
    <Card title="My time entries">{data?.length ? data.map(row => <View key={row.id} style={local.listItem}><View style={local.cardHeader}><Text style={styles.body}>{dateText(row.localDate)}</Text><StatusBadge {...statusMeta(row.checkOutAt ? 'COMPLETED' : 'OPEN')} /></View><Text style={styles.muted}>In {timeText(row.checkInAt)} · Out {timeText(row.checkOutAt)}</Text>{row.correctionReason && <Notice message={`Correction: ${row.correctionReason}`} />}</View>) : !loading && <Empty message="No entries for this month." />}</Card>
  </Page>;
}

function Claims({ api, session }: Props) {
  const [refresh, setRefresh] = useState(0); const [date, setDate] = useState(bankToday()); const [category, setCategory] = useState(''); const [purpose, setPurpose] = useState(''); const [amount, setAmount] = useState(''); const [receipt, setReceipt] = useState<{ name: string; dataUrl: string } | null>(null);
  const action = useAction(); const { data, error, loading } = useResource<Claim[]>(api, '/me/expenses', session.token, refresh);
  const submit = () => action.run('claim-submit', async () => {
    const rupees = claimAmount(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !category.trim() || !purpose.trim() || !receipt) throw new Error('Enter date, category, purpose and a receipt.');
    await api.post('/me/expenses', { expenseDate: date, category: category.trim(), purpose: purpose.trim(), amount: rupees, receiptDataUrl: receipt.dataUrl }, session.token);
  }, () => { setCategory(''); setPurpose(''); setAmount(''); setReceipt(null); setRefresh(value => value + 1); }, 'Claim submitted for approval.');
  return <Page><ScreenHeading eyebrow="Expenses" title="Reimbursement claims" description="Claims are reviewed and paid separately from payroll." /><Feedback error={error || action.error} loading={loading} notice={action.notice} />
    <Card title="Submit a claim"><Field label="Expense date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" /><Field label="Category" value={category} onChangeText={setCategory} placeholder="Travel, stationery, medical…" /><Field label="Business purpose" value={purpose} onChangeText={setPurpose} multiline /><Field label="Amount (whole rupees)" value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="₹ 0" /><Action title={receipt ? `Receipt: ${receipt.name}` : 'Choose receipt (PDF or image)'} secondary busy={action.busyKey === 'claim-receipt'} disabled={action.busy} onPress={() => action.run('claim-receipt', async () => { const selected = await pickReceipt(); if (selected) setReceipt(selected); })} /><Action title="Submit claim" onPress={submit} busy={action.busyKey === 'claim-submit'} disabled={action.busy} /></Card>
    <Card title="Claim history">{data?.length ? data.map(row => <View key={row.id} style={local.listItem}><View style={local.cardHeader}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{money(row.amount)}</Text><Text style={styles.body}>{row.purpose}</Text></View><StatusBadge {...statusMeta(row.status)} /></View><Text style={styles.muted}>{dateText(row.expenseDate)} · {row.category}</Text>{row.decisionReason && <Notice message={row.decisionReason} />}{row.paymentReference && <Notice tone="success" message={`Paid ${dateText(row.paidAt)} · ${row.paymentReference}`} />}<View style={local.actionGrid}><View style={{ flex: 1 }}><Action title="Open receipt" secondary busy={action.busyKey === `claim-receipt-open-${row.id}`} disabled={action.busy} onPress={() => action.run(`claim-receipt-open-${row.id}`, () => sharePrivateFile(api, `/me/expenses/${row.id}/receipt`, session.token, `receipt-${row.id}`))} /></View>{['SUBMITTED', 'PREPARED'].includes(row.status) && <View style={{ flex: 1 }}><Action title="Withdraw" secondary busy={action.busyKey === `claim-withdraw-${row.id}`} disabled={action.busy} onPress={() => action.run(`claim-withdraw-${row.id}`, () => api.post(`/me/expenses/${row.id}/withdraw`, {}, session.token), () => setRefresh(value => value + 1), 'Claim withdrawn.')} /></View>}</View></View>) : !loading && <Empty message="No reimbursement claims yet." />}</Card>
  </Page>;
}

function Profile({ api, session, signOut }: Props & { signOut: () => void }) {
  const employee = session.context.employee;
  return <Page><ScreenHeading eyebrow="Account" title="My profile" description="Your work identity and account security." /><Card>{session.user.organization?.logoUrl && <Image source={{ uri: `${api.root}${session.user.organization.logoUrl}` }} resizeMode="contain" style={local.profileLogo} accessibilityLabel={`${session.user.organization.name} logo`} />}<Text style={styles.cardTitle}>{employee?.name || session.user.name}</Text><Text style={styles.muted}>{session.user.organization?.name || session.user.organizationName}</Text><View style={local.ledger}><DataRow label="Employee code" value={employee?.empCode || '—'} /><DataRow label="Email" value={session.user.email} /><DataRow label="Role" value={employee?.designation || 'Employee'} /><DataRow label="Department" value={employee?.department || 'Unassigned'} /><DataRow label="Branch" value={employee?.branchName || 'Unassigned'} last /></View></Card><PasswordForm api={api} session={session} onSignOut={signOut} /><Action title="Sign out of this phone" secondary onPress={signOut} /><Text style={[styles.muted, { textAlign: 'center' }]}>UCB-HRMS · Version {version}</Text></Page>;
}

const moreItems = [
  { section: 'Policies', glyph: '✓', title: 'Bank policies', detail: 'Read and acknowledge current guidance' },
  { section: 'Calendar', glyph: '▦', title: 'My calendar', detail: 'Holidays, leave and workdays' },
  { section: 'Workplace', glyph: '⌘', title: 'Workplace tree', detail: 'Branches, departments and roles' },
  { section: 'Claims', glyph: '₹', title: 'Reimbursement claims', detail: 'Submit expenses and track payment' },
  { section: 'Profile', glyph: '○', title: 'Profile and security', detail: 'Identity, password and sign-out' },
];

export function Services({ section, api, session, navigate, signOut }: Props & { section: string; signOut: () => void }) {
  if (section === 'Payslips') return <Payslips api={api} session={session} navigate={navigate} />;
  if (section === 'Leave') return <Leave api={api} session={session} navigate={navigate} />;
  if (section === 'Time') return <Time api={api} session={session} navigate={navigate} />;
  if (section === 'Policies') return <Policies api={api} session={session} navigate={navigate} />;
  if (section === 'Calendar') return <Calendar api={api} session={session} navigate={navigate} />;
  if (section === 'Workplace') return <Workplace api={api} session={session} navigate={navigate} />;
  if (section === 'Claims') return <Claims api={api} session={session} navigate={navigate} />;
  if (section === 'Profile') return <Profile api={api} session={session} navigate={navigate} signOut={signOut} />;
  return <Page><ScreenHeading eyebrow="Employee services" title="More" description="Everything else you need from your workplace." />{moreItems.map(item => <Pressable accessibilityRole="button" accessibilityLabel={item.title} key={item.section} onPress={() => navigate(item.section)} style={({ pressed }) => [local.serviceRow, pressed && local.pressed]}><View style={local.serviceIcon}><Text style={local.serviceGlyph}>{item.glyph}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.muted}>{item.detail}</Text></View><Text style={local.chevron}>›</Text></Pressable>)}</Page>;
}

const local = StyleSheet.create({
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  ledger: { borderTopWidth: 1, borderTopColor: colors.line },
  listItem: { paddingVertical: 12, gap: 9, borderBottomWidth: 1, borderBottomColor: colors.line },
  actionGrid: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  period: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 8 },
  periodButton: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  periodGlyph: { color: colors.blue, fontSize: 30, lineHeight: 34, fontWeight: '500' },
  periodLabel: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  balanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  balance: { minWidth: 108, flexGrow: 1, flexBasis: '30%', borderRadius: radius.md, backgroundColor: colors.pale, padding: 14, borderWidth: 1, borderColor: '#cbdde7' },
  balanceValue: { color: colors.ink, fontSize: 26, lineHeight: 31, fontWeight: '900' },
  balanceUnit: { color: colors.blue, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  balanceName: { color: colors.muted, fontSize: 13, lineHeight: 17, marginTop: 7, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  chipSelected: { borderColor: colors.blue, backgroundColor: colors.pale },
  chipText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  chipTextSelected: { color: colors.blue, fontWeight: '900' },
  policyBody: { paddingVertical: 5 },
  checkRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, padding: 10 },
  checkRowSelected: { borderColor: colors.blue, backgroundColor: colors.pale },
  checkMark: { width: 26, height: 26, textAlign: 'center', textAlignVertical: 'center', borderRadius: 7, borderWidth: 1, borderColor: colors.blue, color: colors.blue, fontWeight: '900' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.28%', textAlign: 'center', color: colors.muted, fontSize: 12, fontWeight: '800', paddingBottom: 8 },
  day: { width: '14.28%', minHeight: 53, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  today: { backgroundColor: colors.ink },
  dayNumber: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  todayNumber: { color: colors.white },
  marker: { minHeight: 15, fontSize: 11, fontWeight: '900' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 8 },
  branchTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  branchGlyph: { width: 32, height: 32, textAlign: 'center', textAlignVertical: 'center', borderRadius: 9, backgroundColor: colors.pale, color: colors.blue, fontSize: 18, fontWeight: '900' },
  department: { marginLeft: 8, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: '#c9dce7', gap: 10, paddingVertical: 8 },
  departmentTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  role: { gap: 7, paddingTop: 5 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  personMark: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  personMarkText: { color: colors.blue, fontWeight: '900' },
  profileLogo: { width: '100%', height: 72, marginBottom: 4 },
  serviceRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  serviceIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale },
  serviceGlyph: { color: colors.blue, fontSize: 20, fontWeight: '900' },
  chevron: { color: colors.blue, fontSize: 30, fontWeight: '300' },
});
