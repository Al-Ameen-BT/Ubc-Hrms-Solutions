import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Modal, Badge } from '../../components/ui';
import { dpdpApi, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const REQUEST_TYPES = [
  { value: 'ACCESS', label: 'Access Summary of Personal Data' },
  { value: 'CORRECTION', label: 'Correction / Updating of Inaccurate Data' },
  { value: 'ERASURE', label: 'Erasure of Personal Data' },
  { value: 'GRIEVANCE', label: 'Grievance Redressal with DPO' },
  { value: 'NOMINATION', label: 'Nomination of Representative' },
];

export function PrivacyRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New Request modal
  const [modalOpen, setModalOpen] = useState(false);
  const [requestType, setRequestType] = useState('ACCESS');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const res = await dpdpApi.myRequests();
      setRequests(res.rows || []);
    } catch (err) {
      setError(err.message || 'Failed to load your privacy requests.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!details.trim()) {
      alert('Please specify the details of your request.');
      return;
    }
    setSubmitting(true);
    try {
      await dpdpApi.createMyRequest({
        requestType,
        details: details.trim(),
      });
      setModalOpen(false);
      setDetails('');
      await loadRequests();
    } catch (err) {
      alert(err.message || 'Failed to submit privacy request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Privacy & Data Rights Requests</h1>
          <p className="text-sm text-slate-600 mt-1">
            Exercise your statutory rights under the Digital Personal Data Protection Act, 2023.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>New Privacy Request</Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </div>
      )}

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Your Submitted Requests</h2>
        {loading ? (
          <div className="text-sm text-slate-500 py-4">Loading requests…</div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-slate-500 py-4">You have not submitted any data rights requests.</div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div key={req.id} className="p-4 border rounded bg-white space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs font-mono text-slate-400">Request #{req.id}</span>
                    <h3 className="font-semibold text-slate-900 text-base">{req.requestType}</h3>
                  </div>
                  <span className={`px-2.5 py-0.5 text-xs rounded font-semibold ${
                    req.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                    req.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    req.status === 'IN_REVIEW' ? 'bg-blue-100 text-blue-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    {req.status}
                  </span>
                </div>

                <p className="text-sm text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-100 whitespace-pre-wrap">
                  {req.details}
                </p>

                {req.dpoResponse && (
                  <div className="mt-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded text-sm space-y-1">
                    <span className="text-xs font-bold text-indigo-900 block">DPO Decision & Response:</span>
                    <p className="text-slate-800 whitespace-pre-wrap">{req.dpoResponse}</p>
                    {req.retentionReason && (
                      <p className="text-xs text-amber-900 bg-amber-50 p-2 rounded mt-2 border border-amber-200">
                        <span className="font-semibold">Statutory Retention Ground:</span> {req.retentionReason}
                      </p>
                    )}
                  </div>
                )}
                <div className="text-xs text-slate-400 pt-1">
                  Submitted: {fmt.dateTime(req.createdAt)}
                  {req.decidedAt && ` • Decided: ${fmt.dateTime(req.decidedAt)}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title="Submit Data Rights Request" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Request Type</label>
              <select
                className="w-full border rounded p-2 text-sm text-slate-800 bg-white focus:ring-1 focus:ring-slate-900"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
              >
                {REQUEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Details & Specification</label>
              <textarea
                className="w-full border rounded p-2 text-sm text-slate-800 h-32 focus:ring-1 focus:ring-slate-900"
                placeholder="Describe your request clearly (e.g., categories of records, corrections sought, or grievance details)..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default PrivacyRequestsPage;
