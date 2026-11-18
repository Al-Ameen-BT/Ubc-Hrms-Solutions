import React, { useState, useEffect } from 'react';
import { Card, Button } from '../../components/ui';
import { dpdpApi } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function DpdpAcknowledgementPage() {
  const { user, refreshMe, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [statusData, setStatusData] = useState(null);
  const [agreedDocs, setAgreedDocs] = useState({});

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const data = await dpdpApi.myStatus();
      setStatusData(data);
      const initial = {};
      (data.missingDocuments || []).forEach(doc => {
        initial[doc.id] = false;
      });
      setAgreedDocs(initial);
    } catch (err) {
      setError(err.message || 'Failed to load DPDP compliance documents.');
    } finally {
      setLoading(false);
    }
  }

  function handleCheck(docId) {
    setAgreedDocs(prev => ({
      ...prev,
      [docId]: !prev[docId],
    }));
  }

  const missingDocs = statusData?.missingDocuments || [];
  const allChecked = missingDocs.length > 0 && missingDocs.every(d => agreedDocs[d.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allChecked) return;
    setSubmitting(true);
    setError(null);
    try {
      const docIds = missingDocs.map(d => d.id);
      const res = await dpdpApi.acknowledge(docIds);
      if (res?.token) {
        sessionStorage.setItem('token', res.token);
      }
      await refreshMe();
    } catch (err) {
      setError(err.message || 'Failed to submit DPDP acknowledgement.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
        <div className="text-slate-600">Loading required compliance documents…</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="w-full max-w-2xl">
        <Card className="p-6 shadow-sm">
          <div className="border-b pb-4 mb-4">
            <h1 className="text-xl font-bold text-slate-900">DPDP Compliance Acknowledgement Required</h1>
            <p className="text-sm text-slate-600 mt-1">
              In accordance with the Digital Personal Data Protection Act, 2023, please review and acknowledge the updated legal notices and consent terms before accessing your account.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
              {error}
            </div>
          )}

          {missingDocs.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-emerald-700 font-medium">Your compliance acknowledgements are fully up-to-date.</p>
              <Button className="mt-4" onClick={() => refreshMe()}>Continue to Application</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                {missingDocs.map((doc) => (
                  <div key={doc.id} className="p-4 border rounded bg-white shadow-none space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-base font-semibold text-slate-900">{doc.title}</h2>
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          Version: {doc.version}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {doc.type}
                      </span>
                    </div>

                    {doc.summary && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                        {doc.summary}
                      </p>
                    )}

                    <div className="text-xs text-slate-700 max-h-48 overflow-y-auto whitespace-pre-wrap p-2 border rounded bg-slate-50/50">
                      {doc.body}
                    </div>

                    <div className="pt-2">
                      <label className="flex items-start gap-2 cursor-pointer text-sm font-medium text-slate-800">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={!!agreedDocs[doc.id]}
                          onChange={() => handleCheck(doc.id)}
                        />
                        <span>
                          I have read, understood, and accept the terms of {doc.title} (v{doc.version}).
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={logout}
                  disabled={submitting}
                >
                  Sign Out
                </Button>
                <Button
                  type="submit"
                  disabled={!allChecked || submitting}
                >
                  {submitting ? 'Submitting…' : 'Accept & Proceed'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default DpdpAcknowledgementPage;
