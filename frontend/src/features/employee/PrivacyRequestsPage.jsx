import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Badge, EmptyState, Table } from '../../components/ui';
import { dpdpApi, fmt } from '../../api/client';
import './PrivacyRequestsPage.css';

const TABS = ['Your Data', 'Notices & Choices', 'Sharing', 'Requests & Nomination'];
const REQUEST_TYPES = ['ACCESS', 'DOWNLOAD', 'SHARING', 'CORRECTION', 'ERASURE', 'CONSENT_WITHDRAWAL', 'GRIEVANCE', 'NOMINATION'];
const rowsOf = value => value?.rows || (Array.isArray(value) ? value : []);
const words = value => String(value || '—').replaceAll('_', ' ');
const badge = status => ['COMPLETED', 'GRANTED', 'VERIFIED'].includes(status) ? 'success' : ['REJECTED', 'WITHDRAWN'].includes(status) ? 'danger' : ['IN_REVIEW', 'IDENTITY_VERIFICATION'].includes(status) ? 'info' : 'warning';

export function PrivacyRequestsPage() {
  const [activeTab, setActiveTab] = useState('Your Data');
  const [language, setLanguage] = useState('EN');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [request, setRequest] = useState({ requestType: 'ACCESS', details: '' });
  const [nomination, setNomination] = useState({ nomineeName: '', relationship: '', contact: '' });

  async function load() {
    setLoading(true); setError('');
    try {
      const [summary, notices, consents, sharing, requests, currentNomination, profile] = await Promise.all([dpdpApi.myPrivacySummary(), dpdpApi.myNotices(), dpdpApi.myConsents(), dpdpApi.mySharingHistory(), dpdpApi.myRequests(), dpdpApi.myNomination(), dpdpApi.myDpdpProfile()]);
      setData({ summary, notices, consents: rowsOf(consents), sharing: rowsOf(sharing), requests: rowsOf(requests), nomination: currentNomination, profile });
    } catch (err) { setError(err.message || 'Your privacy centre could not be loaded.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function run(key, action, success) {
    setBusy(key); setError(''); setNotice('');
    try { await action(); setNotice(success); await load(); return true; }
    catch (err) { setError(err.message || 'The privacy action could not be completed.'); return false; }
    finally { setBusy(''); }
  }

  if (loading) return <p className="privacy-loading" role="status">Loading your privacy centre…</p>;

  return <div className="privacy-centre">
    <div className="privacy-intro"><div><h2>Privacy & Data Rights</h2><p>See how your work data is used, manage optional choices, review sharing and contact your Data Protection Officer.</p></div><Badge variant="info">Session-owned records</Badge></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p className="privacy-success" role="status">{notice}</p>}
    <div className="privacy-tabs" role="tablist" aria-label="Privacy centre sections">{TABS.map(tab => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>

    {activeTab === 'Your Data' && <YourData summary={data.summary} profile={data.profile} />}
    {activeTab === 'Notices & Choices' && <Notices data={data.notices} consents={data.consents} language={language} setLanguage={setLanguage} busy={busy} onChoice={(row, decision) => run(`consent-${row.code}`, () => decision === 'GRANTED' ? dpdpApi.grantConsent(row.code, language) : dpdpApi.withdrawConsent(row.code, language), decision === 'GRANTED' ? 'Optional consent granted.' : 'Optional consent withdrawn.')} />}
    {activeTab === 'Sharing' && <Sharing rows={data.sharing} />}
    {activeTab === 'Requests & Nomination' && <Requests requests={data.requests} request={request} setRequest={setRequest} nomination={nomination} setNomination={setNomination} currentNomination={data.nomination} profile={data.profile} busy={busy} onRequest={async event => { event.preventDefault(); if (await run('request', () => dpdpApi.createMyRequest({ ...request, details: request.details.trim() }), 'Privacy request submitted.')) setRequest({ requestType: request.requestType, details: '' }); }} onNomination={async event => { event.preventDefault(); if (await run('nomination', () => dpdpApi.submitNomination(nomination), 'Nomination submitted for verification.')) setNomination({ nomineeName: '', relationship: '', contact: '' }); }} />}
  </div>;
}

function YourData({ summary, profile }) {
  const rows = summary?.processingActivities || [];
  return <div className="privacy-grid"><Card title="Your data-purpose summary"><p className="privacy-note">This list explains active processing recorded for employees. It is not a copy of every record.</p><Table columns={[{ field: 'module', label: 'System area' }, { field: 'dataCategory', label: 'Data category', render: row => words(row.dataCategory) }, { field: 'purpose', label: 'Purpose' }, { field: 'lawfulBasis', label: 'Basis', render: row => words(row.lawfulBasis) }, { field: 'retentionCategory', label: 'Retention', render: row => words(row.retentionCategory) }]} data={rows} keyField="code" emptyMessage="No employee processing activities are published yet." /></Card><DpoCard profile={profile} /></div>;
}

function Notices({ data, consents, language, setLanguage, busy, onChoice }) {
  const documents = [data?.terms, data?.platformPrivacy, data?.employeeNotice].filter(Boolean);
  return <div className="privacy-stack"><div className="privacy-language" role="group" aria-label="Notice language"><button className={language === 'EN' ? 'active' : ''} onClick={() => setLanguage('EN')}>English</button><button className={language === 'ML' ? 'active' : ''} onClick={() => setLanguage('ML')}>Malayalam</button></div><div className="privacy-documents">{documents.map(doc => <Card key={doc.id} title={doc.title}><p className="privacy-doc-meta">Version {doc.version} · effective {fmt.date(doc.effectiveAt)}</p><p className="privacy-document-body">{language === 'ML' ? doc.summaryMl || doc.bodyMl || 'Malayalam translation is not available for this version.' : doc.summary || doc.body}</p></Card>)}</div><Card title="Optional choices"><p className="privacy-note">These choices are optional. Withdrawing them does not stop payroll, attendance, statutory records or other required employment processing.</p>{consents.length ? <div className="privacy-choice-list">{consents.map(row => <div className="privacy-choice" key={row.id}><div><strong>{language === 'ML' ? row.titleMl || row.titleEn : row.titleEn}</strong><p>{language === 'ML' ? row.descriptionMl || row.descriptionEn : row.descriptionEn}</p><Badge variant={badge(row.decision)}>{row.decision ? words(row.decision) : 'NO CHOICE RECORDED'}</Badge></div><div className="privacy-choice-actions"><Button size="sm" disabled={busy === `consent-${row.code}` || row.decision === 'GRANTED'} onClick={() => onChoice(row, 'GRANTED')}>Grant</Button><Button size="sm" variant="secondary" disabled={busy === `consent-${row.code}` || row.decision !== 'GRANTED'} onClick={() => onChoice(row, 'WITHDRAWN')}>Withdraw</Button></div></div>)}</div> : <EmptyState title="No optional purposes" description="Your bank has not requested any optional consent choices." />}</Card></div>;
}

function Sharing({ rows }) { return <Card title="Personal data sharing history"><p className="privacy-note">Entries are limited to sharing events linked to your employee record.</p><Table columns={[{ field: 'sharedAt', label: 'Shared at', render: row => fmt.dateTime(row.sharedAt) }, { field: 'recipientName', label: 'Recipient', render: row => row.recipientName || `Processor #${row.processorId}` }, { field: 'dataCategories', label: 'Data categories', render: row => (row.dataCategories || []).map(words).join(', ') || '—' }, { field: 'purpose', label: 'Purpose' }, { field: 'lawfulAuthority', label: 'Authority' }]} data={rows} keyField="id" emptyMessage="No sharing event is recorded against your employee profile." /></Card>; }

function Requests({ requests, request, setRequest, nomination, setNomination, currentNomination, profile, busy, onRequest, onNomination }) {
  return <div className="privacy-stack"><div className="privacy-grid"><Card title="Submit a data-rights request"><form className="privacy-form" onSubmit={onRequest}><label><span>Request type</span><select className="input" value={request.requestType} onChange={event => setRequest({ ...request, requestType: event.target.value })}>{REQUEST_TYPES.map(type => <option key={type}>{words(type)}</option>)}</select></label><label><span>Request details</span><textarea className="input" value={request.details} onChange={event => setRequest({ ...request, details: event.target.value })} required /></label><Button type="submit" loading={busy === 'request'}>Submit request</Button></form></Card><Card title="Nominate a representative">{currentNomination && <div className="privacy-current-nomination"><Badge variant={badge(currentNomination.verificationStatus)}>{words(currentNomination.verificationStatus)}</Badge><strong>{currentNomination.nomineeName}</strong><span>{currentNomination.relationship} · {currentNomination.contact}</span></div>}<form className="privacy-form" onSubmit={onNomination}><Input label="Nominee name" value={nomination.nomineeName} onChange={event => setNomination({ ...nomination, nomineeName: event.target.value })} required /><Input label="Relationship" value={nomination.relationship} onChange={event => setNomination({ ...nomination, relationship: event.target.value })} required /><Input label="Contact" value={nomination.contact} onChange={event => setNomination({ ...nomination, contact: event.target.value })} required /><Button type="submit" loading={busy === 'nomination'}>Submit nomination</Button></form></Card></div><Card title="Request timeline"><Table columns={[{ field: 'caseId', label: 'Case ID', mono: true }, { field: 'requestType', label: 'Request', render: row => words(row.requestType) }, { field: 'createdAt', label: 'Submitted', render: row => fmt.date(row.createdAt) }, { field: 'dueAt', label: 'Target date', render: row => fmt.date(row.dueAt) }, { field: 'status', label: 'Status', render: row => <Badge variant={badge(row.status)}>{words(row.status)}</Badge> }, { field: 'dpoResponse', label: 'DPO response', render: row => row.dpoResponse || row.decisionReason || 'Awaiting review' }]} data={requests} keyField="id" emptyMessage="You have not submitted a privacy request." /></Card><DpoCard profile={profile} /></div>;
}

function DpoCard({ profile }) { return <Card title="Data Protection Officer"><dl className="privacy-dpo"><div><dt>Name</dt><dd>{profile?.dpoName || 'Not published'}</dd></div><div><dt>Email</dt><dd>{profile?.dpoEmail || 'Not published'}</dd></div><div><dt>Phone</dt><dd>{profile?.dpoPhone || 'Not published'}</dd></div><div><dt>Grievance process</dt><dd>{profile?.grievanceProcedure || 'Submit a grievance request from this privacy centre.'}</dd></div></dl></Card>; }

export default PrivacyRequestsPage;
