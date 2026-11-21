import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Api } from '../api';
import type { EmployeeSession } from '../session';
import { firstName, statusMeta } from '../presentation';
import {
  Action,
  Avatar,
  BanihalWatermark,
  CheckCircleIcon,
  ChevronRightIcon,
  colors,
  dateText,
  Empty,
  ErrorText,
  LeaveIcon,
  Loading,
  money,
  MoreIcon,
  Page,
  PayIcon,
  radius,
  StatusBadge,
  styles,
  TimeIcon,
  timeText,
  useResource,
} from '../ui';

type Balance = { id: number; closingBalance: number | string; LeaveType?: { name: string; code?: string } };
type TimeEntry = { id: number; localDate: string; checkInAt: string; checkOutAt?: string | null; correctionReason?: string };
type Payslip = { id: number; year: number; month: number; status: string; netPay: number | string };

function getGreeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Welcome back';
}

function getFormattedISTDate(now: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(now);
}

function getFormattedISTTime(now: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(now);
}

export function Home({ api, session, navigate }: { api: Api; session: EmployeeSession; navigate: (section: any) => void }) {
  const [clock, setClock] = useState(() => new Date());
  const [refreshAttendance, setRefreshAttendance] = useState(0);
  const [punchBusy, setPunchBusy] = useState(false);
  const [punchNotice, setPunchNotice] = useState('');

  // Live IST Clock ticking every second
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));

  const balances = useResource<Balance[]>(api, '/me/leave/balances', session.token);
  const attendance = useResource<TimeEntry[]>(api, `/me/time?year=${currentYear}&month=${currentMonth}`, session.token, refreshAttendance);
  const payslips = useResource<Payslip[]>(api, '/me/payslips', session.token);

  const employee = session.context.employee;
  const employeePhotoUrl = employee?.photoUrl
    ? `${api.root}${employee.photoUrl}`
    : employee?.id
    ? `${api.root}/api/v1/employees/${employee.id}/photo`
    : null;

  const hour = clock.getHours();
  const greeting = getGreeting(hour);
  const greetingName = firstName(employee?.name || session.user.name);

  // Today's entry
  const todayEntry = useMemo(() => {
    return attendance.data?.find(row => row.localDate === today);
  }, [attendance.data, today]);

  const isCheckedIn = !!todayEntry;
  const isCheckedOut = !!todayEntry?.checkOutAt;

  // Punch in/out action handlers
  const handleCheckIn = async () => {
    setPunchBusy(true);
    setPunchNotice('');
    try {
      await api.post('/me/time/check-in', {}, session.token);
      setPunchNotice('Check-in recorded successfully.');
      setRefreshAttendance(v => v + 1);
    } catch (err) {
      Alert.alert('Check-in error', err instanceof Error ? err.message : 'Unable to record check-in.');
    } finally {
      setPunchBusy(false);
    }
  };

  const handleCheckOut = async () => {
    setPunchBusy(true);
    setPunchNotice('');
    try {
      await api.post('/me/time/check-out', {}, session.token);
      setPunchNotice('Check-out recorded successfully.');
      setRefreshAttendance(v => v + 1);
    } catch (err) {
      Alert.alert('Check-out error', err instanceof Error ? err.message : 'Unable to record check-out.');
    } finally {
      setPunchBusy(false);
    }
  };

  // Calculate duty duration
  const durationText = useMemo(() => {
    if (!todayEntry) return null;
    const inTime = new Date(todayEntry.checkInAt).getTime();
    const outTime = todayEntry.checkOutAt ? new Date(todayEntry.checkOutAt).getTime() : clock.getTime();
    const elapsed = Math.max(0, outTime - inTime);
    const h = Math.floor(elapsed / 3600000);
    const m = Math.floor((elapsed % 3600000) / 60000);
    return `${h}h ${m}m ${todayEntry.checkOutAt ? 'completed' : 'active'}`;
  }, [todayEntry, clock]);

  // Weekly attendance analytics (past 6 days)
  const weeklyAnalytics = useMemo(() => {
    const list = attendance.data || [];
    const days: { label: string; date: string; hours: number; isToday: boolean; checked: boolean }[] = [];
    const baseDate = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
      const dayName = new Intl.DateTimeFormat('en-IN', { weekday: 'narrow', timeZone: 'Asia/Kolkata' }).format(d);
      const entry = list.find(row => row.localDate === iso);

      let hrs = 0;
      if (entry) {
        const inMs = new Date(entry.checkInAt).getTime();
        const outMs = entry.checkOutAt ? new Date(entry.checkOutAt).getTime() : (iso === today ? Date.now() : inMs + 8 * 3600000);
        hrs = Math.max(0, (outMs - inMs) / 3600000);
      }

      days.push({
        label: dayName,
        date: iso,
        hours: Math.round(hrs * 10) / 10,
        isToday: iso === today,
        checked: !!entry,
      });
    }

    // Monthly summary metrics
    const presentDays = list.length;
    let totalHrs = 0;
    let onTimeCount = 0;

    for (const row of list) {
      const inDate = new Date(row.checkInAt);
      const outMs = row.checkOutAt ? new Date(row.checkOutAt).getTime() : inDate.getTime() + 8 * 3600000;
      totalHrs += Math.max(0, (outMs - inDate.getTime()) / 3600000);

      // On-time if check-in <= 09:30 AM
      const inHour = inDate.getHours();
      const inMin = inDate.getMinutes();
      if (inHour < 9 || (inHour === 9 && inMin <= 30)) {
        onTimeCount++;
      }
    }

    const onTimeRate = presentDays > 0 ? Math.round((onTimeCount / presentDays) * 100) : 100;
    const avgHrs = presentDays > 0 ? (totalHrs / presentDays).toFixed(1) : '8.0';

    return { days, presentDays, onTimeRate, avgHrs };
  }, [attendance.data, today]);

  const latestPayslip = payslips.data?.[0];

  return (
    <Page>
      {/* Dynamic Welcoming & Profile Hero Card */}
      <View style={local.hero}>
        <View style={local.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={local.greetingEyebrow}>EMPLOYEE SELF-SERVICE</Text>
            <Text style={local.greetingTitle}>{greeting}, {greetingName}</Text>
            <Text style={local.dateText}>{getFormattedISTDate(clock)}</Text>
          </View>
          <Avatar name={employee?.name || session.user.name} photoUrl={employeePhotoUrl} size={66} isOnline={true} showStatus={true} />
        </View>

        {/* Identity & Branch Badges */}
        <View style={local.badgeRow}>
          {employee?.empCode && (
            <View style={local.badge}>
              <Text style={local.badgeText}>{employee.empCode}</Text>
            </View>
          )}
          <View style={local.badge}>
            <Text style={local.badgeText}>{employee?.designation || 'Staff Member'}</Text>
          </View>
          {employee?.branchName && (
            <View style={[local.badge, local.badgeBranch]}>
              <Text style={local.badgeTextBranch}>{employee.branchName}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Attendance & Check-In / Check-Out Analytics Card */}
      <View style={styles.card}>
        <View style={local.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Today's Attendance</Text>
            <Text style={local.liveClock}>{getFormattedISTTime(clock)} · IST</Text>
          </View>
          <StatusBadge
            label={isCheckedOut ? 'SHIFT COMPLETED' : isCheckedIn ? 'PRESENT' : 'AWAITING PUNCH'}
            tone={isCheckedOut ? 'info' : isCheckedIn ? 'success' : 'warning'}
          />
        </View>

        {punchNotice ? <Text style={local.noticeSuccess}>{punchNotice}</Text> : null}

        {/* Today's Punch Information */}
        <View style={local.punchPanel}>
          <View style={local.punchRow}>
            <View style={local.punchCol}>
              <Text style={local.punchLabel}>CHECK-IN</Text>
              <Text style={local.punchVal}>{todayEntry?.checkInAt ? timeText(todayEntry.checkInAt) : '—'}</Text>
            </View>
            <View style={local.punchDivider} />
            <View style={local.punchCol}>
              <Text style={local.punchLabel}>CHECK-OUT</Text>
              <Text style={local.punchVal}>{todayEntry?.checkOutAt ? timeText(todayEntry.checkOutAt) : isCheckedIn ? 'Active' : '—'}</Text>
            </View>
            <View style={local.punchDivider} />
            <View style={local.punchCol}>
              <Text style={local.punchLabel}>DURATION</Text>
              <Text style={local.punchVal}>{durationText || '0h 0m'}</Text>
            </View>
          </View>

          {/* Quick Punch Action Buttons */}
          <View style={local.punchActions}>
            {!isCheckedIn ? (
              <Action title="Punch In Now" busy={punchBusy} onPress={handleCheckIn} />
            ) : !isCheckedOut ? (
              <Action title="Punch Out" secondary busy={punchBusy} onPress={handleCheckOut} />
            ) : (
              <View style={local.shiftDoneRow}>
                <CheckCircleIcon color={colors.green} size={18} />
                <Text style={local.shiftDoneText}>Today's duty shift is completed</Text>
              </View>
            )}
          </View>
        </View>

        {/* Weekly Attendance Analytics Breakdown */}
        <View style={local.analyticsSection}>
          <Text style={local.analyticsTitle}>Weekly Check-in Breakdown</Text>
          <View style={local.barChartRow}>
            {weeklyAnalytics.days.map((item, idx) => {
              const maxBarHeight = 44;
              const fillHeight = Math.min(maxBarHeight, Math.max(4, Math.round((item.hours / 8.0) * maxBarHeight)));
              const barColor = item.hours >= 7.5 ? colors.green : item.hours >= 4 ? colors.blue : item.checked ? colors.amber : '#d4e0e8';

              return (
                <View key={item.date || idx} style={local.barCol}>
                  <Text style={local.barHrs}>{item.hours > 0 ? `${item.hours}h` : '—'}</Text>
                  <View style={local.barTrack}>
                    <View style={[local.barFill, { height: fillHeight, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[local.barLabel, item.isToday && local.barLabelToday]}>{item.label}</Text>
                </View>
              );
            })}
          </View>

          {/* Monthly Attendance Metrics */}
          <View style={local.metricsGrid}>
            <View style={local.metricBox}>
              <Text style={local.metricVal}>{weeklyAnalytics.presentDays}</Text>
              <Text style={local.metricLabel}>Days Present</Text>
            </View>
            <View style={local.metricBox}>
              <Text style={[local.metricVal, { color: colors.green }]}>{weeklyAnalytics.onTimeRate}%</Text>
              <Text style={local.metricLabel}>On-Time Rate</Text>
            </View>
            <View style={local.metricBox}>
              <Text style={local.metricVal}>{weeklyAnalytics.avgHrs}h</Text>
              <Text style={local.metricLabel}>Avg Daily Hrs</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Leave Balances Section */}
      <View style={styles.card}>
        <View style={local.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Leave Balances</Text>
            <Text style={styles.muted}>Available time-off allowances</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Apply for Leave" onPress={() => navigate('Leave')} style={local.cardActionBtn}>
            <Text style={local.cardActionText}>Apply Leave</Text>
          </Pressable>
        </View>

        {balances.loading ? (
          <Loading rows={2} />
        ) : balances.error ? (
          <ErrorText message={balances.error} />
        ) : balances.data?.length ? (
          <View style={local.balanceGrid}>
            {balances.data.map(row => (
              <View key={row.id} style={local.balanceCard}>
                <View style={local.balanceHeader}>
                  <Text style={local.balanceValue}>{Number(row.closingBalance)}</Text>
                  <Text style={local.balanceUnit}>DAYS</Text>
                </View>
                <Text numberOfLines={2} style={local.balanceName}>{row.LeaveType?.name || 'Leave'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Empty message="No active leave balances recorded yet." />
        )}
      </View>

      {/* Quick Services Navigation Grid */}
      <View style={{ gap: 10 }}>
        <Text style={styles.cardTitle}>Quick Services</Text>
        <View style={local.servicesGrid}>
          {/* Payslips Card */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View Payslips"
            onPress={() => navigate('Payslips')}
            style={({ pressed }) => [local.serviceCard, pressed && local.serviceCardPressed]}
          >
            <View style={local.serviceIconWrap}>
              <PayIcon color={colors.blue} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={local.serviceTitle}>Payslips</Text>
              <Text style={styles.muted} numberOfLines={1}>
                {latestPayslip ? `${money(latestPayslip.netPay)} · Net Salary` : 'View salary statements'}
              </Text>
            </View>
            <ChevronRightIcon color={colors.blue} size={16} />
          </Pressable>

          {/* Time & Attendance */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Attendance history and entries"
            onPress={() => navigate('Time')}
            style={({ pressed }) => [local.serviceCard, pressed && local.serviceCardPressed]}
          >
            <View style={local.serviceIconWrap}>
              <TimeIcon color={colors.blue} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={local.serviceTitle}>Time & Attendance</Text>
              <Text style={styles.muted} numberOfLines={1}>Monthly punch log & hours</Text>
            </View>
            <ChevronRightIcon color={colors.blue} size={16} />
          </Pressable>

          {/* Expense Claims */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit Expense Claims"
            onPress={() => navigate('Claims')}
            style={({ pressed }) => [local.serviceCard, pressed && local.serviceCardPressed]}
          >
            <View style={local.serviceIconWrap}>
              <LeaveIcon color={colors.blue} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={local.serviceTitle}>Reimbursement Claims</Text>
              <Text style={styles.muted} numberOfLines={1}>Submit receipts & track payout</Text>
            </View>
            <ChevronRightIcon color={colors.blue} size={16} />
          </Pressable>

          {/* Policies & Privacy */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Bank Policies and Legal"
            onPress={() => navigate('Policies')}
            style={({ pressed }) => [local.serviceCard, pressed && local.serviceCardPressed]}
          >
            <View style={local.serviceIconWrap}>
              <MoreIcon color={colors.blue} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={local.serviceTitle}>Bank Policies & Privacy</Text>
              <Text style={styles.muted} numberOfLines={1}>DPDP acknowledgements & rules</Text>
            </View>
            <ChevronRightIcon color={colors.blue} size={16} />
          </Pressable>
        </View>
      </View>

      {/* Persistent Banihal Technologies Watermark */}
      <BanihalWatermark />
    </Page>
  );
}

const local = StyleSheet.create({
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: 18,
    gap: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  greetingEyebrow: {
    color: '#8ec5f3',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  greetingTitle: {
    color: colors.white,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  dateText: {
    color: '#b2d1ea',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeBranch: {
    backgroundColor: 'rgba(35, 100, 160, 0.45)',
  },
  badgeTextBranch: {
    color: '#bfe0fb',
    fontSize: 11,
    fontWeight: '800',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  liveClock: {
    color: colors.blue,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.4,
  },
  cardActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.pale,
    borderWidth: 1,
    borderColor: '#cadfe9',
  },
  cardActionText: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  noticeSuccess: {
    color: colors.green,
    backgroundColor: colors.greenPale,
    borderWidth: 1,
    borderColor: '#c3e3d4',
    padding: 10,
    borderRadius: radius.sm,
    fontSize: 13,
    fontWeight: '700',
  },
  punchPanel: {
    backgroundColor: colors.pale,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#c7dce7',
    padding: 14,
    gap: 12,
  },
  punchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  punchCol: {
    flex: 1,
    alignItems: 'center',
  },
  punchDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#b8cedb',
  },
  punchLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  punchVal: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 3,
  },
  punchActions: {
    width: '100%',
  },
  shiftDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.greenPale,
    borderWidth: 1,
    borderColor: '#bfe2d1',
  },
  shiftDoneText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: '800',
  },
  analyticsSection: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 12,
  },
  analyticsTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  barChartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 4,
    height: 80,
  },
  barCol: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  barHrs: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  barTrack: {
    width: 14,
    height: 44,
    backgroundColor: '#e7eef2',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 7,
  },
  barLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  barLabelToday: {
    color: colors.blue,
    fontWeight: '900',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 6,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricVal: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  balanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  balanceCard: {
    minWidth: 100,
    flexGrow: 1,
    flexBasis: '29%',
    borderRadius: radius.md,
    backgroundColor: colors.pale,
    padding: 12,
    borderWidth: 1,
    borderColor: '#cbdde7',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  balanceValue: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  balanceUnit: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: '900',
  },
  balanceName: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
    fontWeight: '700',
  },
  servicesGrid: {
    gap: 10,
  },
  serviceCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  serviceCardPressed: {
    backgroundColor: colors.pale,
    transform: [{ scale: 0.985 }],
  },
  serviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.pale,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
});
