import React, { useEffect, useState } from 'react';
import { dpdpApi, fmt } from '../../api/client';
import { Card } from '../../components/ui';

export function PublicPrivacyPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    dpdpApi.publicBundle()
      .then(res => {
        setData(res);
        setError(null);
      })
      .catch(err => {
        setError(err.message || 'Failed to load public privacy notice.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="border-b pb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-800">
              Statutory Disclosure
            </span>
            <span className="text-xs text-slate-500">Digital Personal Data Protection Act, 2023</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Platform Privacy Policy & Terms</h1>
          <p className="text-sm text-slate-600 mt-2">
            UCB-HRMS provides cooperative banking institutions and workforce members with compliant, sovereign HR and payroll software.
          </p>
        </div>

        {loading && <div className="text-slate-500 text-sm">Loading privacy governance documents…</div>}
        {error && <div className="p-4 rounded bg-rose-50 text-rose-800 text-sm">{error}</div>}

        {data?.platformPrivacy && (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between items-baseline border-b pb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{data.platformPrivacy.title}</h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  Version {data.platformPrivacy.version} · Effective: {fmt.date(data.platformPrivacy.effectiveAt)}
                </div>
              </div>
            </div>
            <div className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-wrap font-sans text-slate-700">
              {data.platformPrivacy.body}
            </div>
          </Card>
        )}

        {data?.terms && (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between items-baseline border-b pb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{data.terms.title}</h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  Version {data.terms.version} · Effective: {fmt.date(data.terms.effectiveAt)}
                </div>
              </div>
            </div>
            <div className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-wrap font-sans text-slate-700">
              {data.terms.body}
            </div>
          </Card>
        )}

        <Card className="p-6 space-y-3 bg-white">
          <h3 className="text-base font-bold text-slate-900">Data Fiduciary Identity & Privacy Inquiries</h3>
          <p className="text-sm text-slate-600">
            For personal data inquiries, corrections, or grievance redressal under the DPDP Act, workforce members may use the in-app privacy request workspace or contact their bank’s appointed Data Protection Officer.
          </p>
          <div className="text-xs text-slate-500 pt-2 border-t">
            UCB-HRMS Platform Governance · Compliant with the Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023).
          </div>
        </Card>
      </div>
    </div>
  );
}

export default PublicPrivacyPage;
