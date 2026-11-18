import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Table, Badge, Modal } from '../../components/ui';
import { dpdpApi, fmt } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function DpdpDocumentsPage() {
  const { isSuperAdmin } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Publish modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [publishType, setPublishType] = useState('TERMS');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [version, setVersion] = useState('');
  const [summary, setSummary] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  async function loadDocuments() {
    setLoading(true);
    setError(null);
    try {
      const res = await dpdpApi.adminDocuments();
      setDocuments(res.rows || []);
    } catch (err) {
      setError(err.message || 'Failed to load platform DPDP documents.');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenPublish(type) {
    setPublishType(type);
    setTitle(type === 'TERMS' ? 'Terms of Service' : 'Platform Privacy Policy');
    setBody('');
    setVersion('');
    setSummary('');
    setEffectiveAt(new Date().toISOString().slice(0, 16));
    setModalOpen(true);
  }

  async function handlePublish(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !version.trim()) {
      alert('Title, body content, and version string are required.');
      return;
    }
    if (!window.confirm(`Are you sure you want to publish version ${version} of ${title}? Published legal versions are immutable.`)) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await dpdpApi.adminPublishDocument({
        type: publishType,
        title: title.trim(),
        body: body.trim(),
        version: version.trim(),
        summary: summary.trim() || null,
        effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : new Date().toISOString(),
      });
      setModalOpen(false);
      await loadDocuments();
    } catch (err) {
      alert(err.message || 'Failed to publish document.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="page p-6">
        <h1 className="text-xl font-bold text-red-600">Access Denied</h1>
        <p className="text-slate-600 mt-2">Only platform super administrators can manage platform legal documents.</p>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform DPDP Legal Documents</h1>
          <p className="text-sm text-slate-600 mt-1">
            Manage and publish versioned Terms of Service and Platform Privacy Notices required across all organisations.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleOpenPublish('TERMS')}>Publish New Terms</Button>
          <Button variant="secondary" onClick={() => handleOpenPublish('PLATFORM_PRIVACY')}>Publish New Privacy Policy</Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </div>
      )}

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Published Document History</h2>
        {loading ? (
          <div className="text-sm text-slate-500 py-4">Loading documents…</div>
        ) : documents.length === 0 ? (
          <div className="text-sm text-slate-500 py-4">No platform documents published yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-700">
                <tr>
                  <th className="py-2 px-3">Type</th>
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
                    <td className="py-2 px-3 font-medium">{doc.type}</td>
                    <td className="py-2 px-3">{doc.title}</td>
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

      {modalOpen && (
        <Modal
          title={`Publish ${publishType === 'TERMS' ? 'Terms of Service' : 'Privacy Notice'}`}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={handlePublish} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Version (e.g. 1.0, 2.0)</label>
              <Input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Summary of Key Changes</label>
              <Input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Plain-language summary of clauses or updates"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Effective Date & Time</label>
              <Input
                type="datetime-local"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Document Content (Plain text / Markdown)</label>
              <textarea
                className="w-full border rounded p-2 text-sm text-slate-800 font-mono h-48 focus:ring-1 focus:ring-slate-900"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Full text of legal document..."
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Publishing…' : 'Publish Document'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default DpdpDocumentsPage;
