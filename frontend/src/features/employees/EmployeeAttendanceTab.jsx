import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceBookApi } from '../../api/extended';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* Attendance / Loss of Pay — one row per month (routes/serviceBook.js, backed
   by models/employeeAttendance.js). LOP days pro-rate Basic, DA and the
   allowances on the payslip. */
export function EmployeeAttendanceTab({ employeeId }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [draft, setDraft] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['emp-attendance', employeeId, year],
    queryFn: () => serviceBookApi.attendance(employeeId, year),
  });

  const months = data?.months || [];

  useEffect(() => { setDraft({}); }, [year, data]);

  const save = useMutation({
    mutationFn: (row) => serviceBookApi.markAttendance(employeeId, { year, month: row.month, lopDays: row.lopDays, remarks: row.remarks }),
    onSuccess: (_, row) => {
      queryClient.invalidateQueries({ queryKey: ['emp-attendance', employeeId, year] });
      toast.add(`${MONTHS[row.month - 1]} attendance saved.`, 'success');
    },
    onError: (err) => toast.add(err.message || 'Could not save.', 'error'),
  });

  const valueFor = (row) => (draft[row.month] ?? { lopDays: row.lopDays ?? 0, remarks: row.remarks || '' });
  const edit = (month, patch) => setDraft((d) => ({ ...d, [month]: { ...(d[month] || valueFor(months.find((m) => m.month === month))), ...patch } }));

  const totalLop = months.reduce((s, m) => s + Number((draft[m.month]?.lopDays ?? m.lopDays) || 0), 0);

  return (
    <Card title={`Attendance / Loss of Pay — ${year}`} noPadding>
      <div className="table-toolbar">
        <span className="form-note">Enter Loss of Pay days for any month; allowances and Basic are pro-rated for the days marked.</span>
        <div className="row-actions">
          <Button variant="secondary" size="sm" onClick={() => setYear((y) => y - 1)}>◀ {year - 1}</Button>
          <Button variant="secondary" size="sm" onClick={() => setYear((y) => y + 1)} disabled={year >= thisYear + 1}>{year + 1} ▶</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="form-note" style={{ padding: '1rem' }}>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th className="table-th">Month</th>
              <th className="table-th table-th-right">LOP Days</th>
              <th className="table-th">Remarks</th>
              <th className="table-th" />
            </tr>
          </thead>
          <tbody>
            {months.map((row) => {
              const v = valueFor(row);
              const dirty = !!draft[row.month];
              return (
                <tr key={row.month} className="table-row">
                  <td className="table-td">{MONTHS[row.month - 1]}</td>
                  <td className="table-td table-td-right">
                    <input
                      className="input mono"
                      type="number" min="0" max="31"
                      style={{ width: '6rem' }}
                      value={v.lopDays}
                      onChange={(e) => edit(row.month, { lopDays: e.target.value })}
                      aria-label={`${MONTHS[row.month - 1]} LOP days`}
                    />
                  </td>
                  <td className="table-td">
                    <input
                      className="input"
                      value={v.remarks}
                      onChange={(e) => edit(row.month, { remarks: e.target.value })}
                      aria-label={`${MONTHS[row.month - 1]} remarks`}
                    />
                  </td>
                  <td className="table-td">
                    <Button
                      size="sm"
                      variant={dirty ? 'primary' : 'secondary'}
                      loading={save.isPending && save.variables?.month === row.month}
                      onClick={() => save.mutate({ month: row.month, lopDays: v.lopDays, remarks: v.remarks })}
                    >Save</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="table-row">
              <td className="table-td"><strong>Total LOP</strong></td>
              <td className="table-td table-td-right mono"><strong>{totalLop}</strong></td>
              <td className="table-td" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  );
}
