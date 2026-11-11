import React from 'react';
import { Text, View } from 'react-native';
import type { Api } from '../api';
import type { EmployeeSession } from '../session';
import { Action, Card, Empty, ErrorText, Loading, Page, styles, useResource } from '../ui';

type Balance = { id: number; closingBalance: number | string; LeaveType?: { name: string } };

export function Home({ api, session, navigate }: { api: Api; session: EmployeeSession; navigate: (section: any) => void }) {
  const balances = useResource<Balance[]>(api, '/me/leave/balances', session.token);
  const employee = session.context.employee;
  return <Page>
    <Text style={styles.title}>Good day, {employee?.name?.split(' ')[0] || session.user.name}</Text>
    <Text style={styles.subtitle}>{employee?.empCode} · {employee?.designation || 'Employee'} · {employee?.branchName || 'Your bank'}</Text>
    <Card title="Your workday"><View style={styles.row}><Action title="Check in or out" onPress={() => navigate('Time')} /><Action title="Request leave" onPress={() => navigate('Leave')} secondary /></View></Card>
    <Card title="Leave balance">
      {balances.loading ? <Loading /> : balances.error ? <ErrorText message={balances.error} /> : balances.data?.length ? balances.data.map(row => <View key={row.id} style={styles.line}><Text style={styles.body}>{row.LeaveType?.name || 'Leave'} · {Number(row.closingBalance)} days</Text></View>) : <Empty message="No leave balances recorded yet." />}
    </Card>
    <Card title="Quick access"><Action title="My payslips" onPress={() => navigate('Payslips')} secondary /><Action title="Reimbursement claims" onPress={() => navigate('Claims')} secondary /><Action title="Bank policy" onPress={() => navigate('Policies')} secondary /></Card>
  </Page>;
}
