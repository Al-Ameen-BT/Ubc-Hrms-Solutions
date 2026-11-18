import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Modal, Badge } from '../../components/ui';
import { organizationAccessApi } from '../../api/organizationAccess';
import { dpdpApi, fmt, api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function DpdpCompliancePage() {
  const { user, canPermission } = useAuth();
  const canManage = canPermission('dpdp.manage', ['ORG_ADMIN']);
  const canView = canPermission('dpdp.view', ['ORG_ADMIN', 'DATA_PROTECTION_OFFICER']);

  const [loading, setLoading] = useState(true);
  const [readiness, setReadiness] = useState(null);
  const [profile, setProfile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [error, setError] = useState(null);

  // DPO Assign modal
  const [dpoModalOpen, setDpoModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [dpoSubmitting, setDpoSubmitting] = useState(false);

  // Publish Notice modal
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('Employee Privacy Notice');
  const [noticeVersion, setNoticeVersion] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [noticeSummary, setNoticeSummary] = useState('');
  const [noticeEffectiveAt, setNoticeEffectiveAt] = useState('');
  const [noticeSubmitting, setNoticeSubmitting] = useState(false);

  const [retentionData, setRetentionData] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [rData, pData, docsRes, retRes] = await Promise.all([
        organizationAccessApi.dpdpReadiness(),
        organizationAccessApi.dpdpProfile(),
        dpdpApi.orgDocuments('EMPLOYEE_NOTICE').catch(() => ({ rows: [] })),
        dpdpApi.orgRetention().catch(() => null),
      ]);
      setReadiness(rData);
      setProfile(pData);
      setDocuments(docsRes.rows || []);
      setRetentionData(retRes);

      // If canManage, load eligible users for DPO
      if (canManage) {
        const usersRes = await api.get(`/organizations/${user?.organizationId}/users`);
        const activeLinked = (usersRes.rows || []).filter(u => u.status === 'ACTIVE' && u.employeeId);
        setEligibleUsers(activeLinked);
      }
    } catch (err) {
      setError(err.message || 'Failed to load DPDP compliance data.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignDpo(e) {
    e.preventDefault();
    if (!selectedUserId) return;
    if (!window.confirm('Assigning a new Data Protection Officer will update platform records and refresh active user sessions. Proceed?')) {
      return;
    }
    setDpoSubmitting(true);
    try {
      await organizationAccessApi.assignDpo({ userId: Number(selectedUserId) });
      setDpoModalOpen(false);
      await loadAll();
    } catch (err) {
      alert(err.message || 'Failed to assign DPO.');
    } finally {
      setDpoSubmitting(false);
    }
  }

  async function handlePublishNotice(e) {
    e.preventDefault();
    if (!noticeTitle.trim() || !noticeBody.trim() || !noticeVersion.trim()) {
      alert('Title, body, and version are required.');
      return;
    }
    if (!window.confirm(`Publishing Employee Notice v${noticeVersion} will require all employees to acknowledge the new notice on their next login. Continue?`)) {
      return;
    }
    setNoticeSubmitting(true);
    try {
      await dpdpApi.orgPublishDocument({
        type: 'EMPLOYEE_NOTICE',
        title: noticeTitle.trim(),
        body: noticeBody.trim(),
        version: noticeVersion.trim(),
        summary: noticeSummary.trim() || null,
        effectiveAt: noticeEffectiveAt ? new Date(noticeEffectiveAt).toISOString() : new Date().toISOString(),
      });
      setNoticeModalOpen(false);
      await loadAll();
    } catch (err) {
      alert(err.message || 'Failed to publish employee notice.');
    } finally {
      setNoticeSubmitting(false);
    }
  }

  if (loading) {
    return <div className="page p-6 text-slate-500">Loading DPDP compliance workspace…</div>;
  }

  return (
    <div className="page space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">DPDP Act Compliance & Governance</h1>
          <p className="text-sm text-slate-600 mt-1">
            Data Protection Officer assignment, readiness blockers, and Employee Privacy Notices.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDpoModalOpen(true)}>
              {readiness?.dpo ? 'Reassign DPO' : 'Assign DPO'}
            </Button>
            <Button onClick={() => {
              setNoticeVersion('');
              setNoticeBody('');
              setNoticeSummary('');
              setNoticeEffectiveAt(new Date().toISOString().slice(0, 16));
              setNoticeModalOpen(true);
            }}>
              Publish Employee Notice
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </div>
      )}

      {/* Compliance Readiness Card */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Compliance Readiness</h2>
        <div className="flex items-center gap-3 mb-4">
          <span className={`px-2.5 py-1 rounded text-xs font-semibold ${readiness?.isReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {readiness?.isReady ? 'COMPLIANT & READY' : 'ACTION REQUIRED'}
          </span>
          <span className="text-sm text-slate-600">
            {readiness?.isReady
              ? 'Organisation satisfies statutory Data Protection Officer and notice publication prerequisites.'
              : 'Organisation has unresolved readiness blockers.'}
          </span>
        </div>

        {readiness?.blockers && readiness.blockers.length > 0 && (
          <div className="p-3 bg-amber-50 rounded border border-amber-200 text-sm text-amber-800 space-y-1">
            <div className="font-semibold">Blockers:</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {readiness.blockers.map((b, i) => (
                <li key={b.code || i}>{b.message}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* DPO Profile Card */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Active Data Protection Officer (DPO)</h2>
        {profile?.dpoName ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="p-3 border rounded bg-slate-50">
              <span className="text-slate-500 block text-xs">Officer Name</span>
              <span className="font-semibold text-slate-900">{profile.dpoName}</span>
            </div>
            <div className="p-3 border rounded bg-slate-50">
              <span className="text-slate-500 block text-xs">Official Contact Email</span>
              <span className="font-semibold text-slate-900">{profile.dpoEmail}</span>
            </div>
            <div className="p-3 border rounded bg-slate-50">
              <span className="text-slate-500 block text-xs">Designation / Role</span>
              <span className="font-semibold text-slate-900">Data Protection Officer</span>
            </div>
            <div className="p-3 border rounded bg-slate-50">
              <span className="text-slate-500 block text-xs">Postal / Office Address</span>
              <span className="font-semibold text-slate-900">{profile.dpoAddress || 'Bank Registered Office'}</span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            No Data Protection Officer currently assigned. An active employee-linked officer must be assigned.
          </div>
        )}
      </Card>

      {/* Published Employee Notices History */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Employee Privacy Notices</h2>
        {documents.length === 0 ? (
          <div className="text-sm text-slate-500">No organisation employee privacy notices published yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-700">
                <tr>
                  <th className="py-2 px-3">Title</th>
                  <th className="py-2 px-3">Version</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Effective At</th>
                  <th className="py-2 px-3">Published At</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-600">
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td className="py-2 px-3 font-medium">{doc.title}</td>
                    <td className="py-2 px-3 font-mono text-xs">{doc.version}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-800 font-semibold">
                        {doc.state}
                      </span>
                    </td>
                    <td className="py-2 px-3">{fmt.dateTime(doc.effectiveAt)}</td>
                    <td className="py-2 px-3">{fmt.dateTime(doc.publishedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Retention Register & Candidate Expiry Report */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Data Retention Register & Legal Holds</h2>
        <p className="text-xs text-slate-500 mb-4">
          Statutory employee records (payroll, service book, audit logs) are permanently retained by law. Configurable retention operates report-only to protect audit integrity.
        </p>
        {retentionData?.candidates?.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-700">
                <tr>
                  <th className="py-2 px-3">Data Category</th>
                  <th className="py-2 px-3">Retention Period</th>
                  <th className="py-2 px-3">Legal Hold</th>
                  <th className="py-2 px-3">Candidate Count</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y text-slate-600">
                {retentionData.candidates.map((cand) => (
                  <tr key={cand.category}>
                    <td className="py-2 px-3 font-medium">{cand.category}</td>
                    <td className="py-2 px-3">{cand.periodMonths} months</td>
                    <td className="py-2 px-3">
                      {cand.legalHold ? (
                        <span className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-800 font-semibold">Active Hold</span>
                      ) : (
                        <span className="text-xs text-slate-500">None</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-semibold">{cand.candidateCount}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700 font-mono">
                        {cand.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            No retention categories configured yet. Default statutory protections are active.
          </div>
        )}
      </Card>

      {/* Assign DPO Modal */}
      {dpoModalOpen && (
        <Modal title="Assign Data Protection Officer" onClose={() => setDpoModalOpen(false)}>
          <form onSubmit={handleAssignDpo} className="space-y-4">
            <p className="text-sm text-slate-600">
              Select an active user linked to a confirmed employee record in this bank to serve as the Data Protection Officer.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Select Officer</label>
              <select
                className="w-full border rounded p-2 text-sm text-slate-800 focus:ring-1 focus:ring-slate-900 bg-white"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
              >
                <option value="">-- Choose an active linked user --</option>
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) - {u.role}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setDpoModalOpen(false)} disabled={dpoSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={!selectedUserId || dpoSubmitting}>
                {dpoSubmitting ? 'Assigning…' : 'Confirm Assignment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Publish Notice Modal */}
      {noticeModalOpen && (
        <Modal title="Publish Employee Privacy Notice" onClose={() => setNoticeModalOpen(false)}>
          <form onSubmit={handlePublishNotice} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notice Title</label>
              <Input
                type="text"
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Version String (e.g. 1.0, 1.1)</label>
              <Input
                type="text"
                value={noticeVersion}
                onChange={(e) => setNoticeVersion(e.target.value)}
                placeholder="1.0"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Summary of Key Data Uses</label>
              <Input
                type="text"
                value={noticeSummary}
                onChange={(e) => setNoticeSummary(e.target.value)}
                placeholder="Notice of HR, payroll, statutory, and attendance data processing"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Effective Date & Time</label>
              <Input
                type="datetime-local"
                value={noticeEffectiveAt}
                onChange={(e) => setNoticeEffectiveAt(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notice Body (Plain text)</label>
              <textarea
                className="w-full border rounded p-2 text-sm text-slate-800 font-mono h-48 focus:ring-1 focus:ring-slate-900"
                value={noticeBody}
                onChange={(e) => setNoticeBody(e.target.value)}
                placeholder="Full text of the employee privacy notice..."
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setNoticeModalOpen(false)} disabled={noticeSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={noticeSubmitting}>
                {noticeSubmitting ? 'Publishing…' : 'Publish Notice'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default DpdpCompliancePage;
