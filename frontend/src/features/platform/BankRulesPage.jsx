import React, { useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bankRulesApi, fmt } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import './BankRulesPage.css';

const emptyDraft = (bankClass) => ({ name: '', bankClass, orderNumber: '', issuingAuthority: '', orderDate: '', effectiveDate: '', sourceUrl: '', notes: '', posts: [], rules: [], payrollDefaults: {}, supersedesId: null });
const statusVariant = (status) => status === 'PUBLISHED' ? 'success' : status === 'DRAFT' ? 'warning' : 'default';
const fieldLabel = (key) => key === 'odMultiplier' ? 'OD eligibility (% of Basic + DA)' : key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/\b(Da|Hra|Pf|Gsli|Pt|Od|Cca)\b/g, s => s.toUpperCase());

function SelectField({ id, label, children, ...props }) {
  return <div className="field"><label className="field-label" htmlFor={id}>{label}</label><select id={id} className="input" {...props}>{children}</select></div>;
}
function TextArea({ id, label, ...props }) {
  return <div className="field"><label className="field-label" htmlFor={id}>{label}</label><textarea id={id} className="input" rows={3} {...props} /></div>;
}
function ErrorNotice({ error, retry }) {
  return error ? <div className="auth-error" role="alert">{error.message || String(error)}{retry && <Button variant="secondary" size="sm" onClick={retry}>Retry</Button>}</div> : null;
}

export function BankRulesPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const metadata = useQuery({ queryKey: ['bank-rules-metadata'], queryFn: bankRulesApi.metadata });
  const detail = useQuery({ queryKey: ['bank-rule', id], queryFn: () => bankRulesApi.get(id), enabled: !!id && id !== 'new', refetchOnWindowFocus: false, refetchOnReconnect: false });
  if (metadata.isPending || (id && id !== 'new' && detail.isPending)) return <div className="page" role="status">Loading bank rules…</div>;
  if (metadata.error || detail.error) return <div className="page"><Link to="/bank-rules">Back to bank rules</Link><ErrorNotice error={metadata.error || detail.error} retry={() => { metadata.refetch(); if (id !== 'new') detail.refetch(); }} /></div>;
  if (!id) return <CatalogueList metadata={metadata.data} />;
  const bankClass = metadata.data.classes.some(c => c.code === searchParams.get('bankClass')) ? searchParams.get('bankClass') : 'SPECIAL_GRADE';
  return <CatalogueEditor key={id === 'new' ? 'new' : `${id}:${detail.data.version}`} initial={id === 'new' ? emptyDraft(bankClass) : detail.data} metadata={metadata.data} />;
}

function CatalogueList({ metadata }) {
  const [bankClass, setBankClass] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ['bank-rules', bankClass, status], queryFn: () => bankRulesApi.list(bankClass, status) });
  const rows = list.data?.rows || [];
  return <div className="page bank-rules-page">
    <header className="page-header bank-rules-header"><div><h1>Bank Classes & Rules</h1><p>Government orders, job posts, pay stages and payroll setup for each bank class.</p></div><Button onClick={() => navigate(`/bank-rules/new${bankClass ? `?bankClass=${bankClass}` : ''}`)}>New revision</Button></header>
    <div className="bank-class-picker" role="group" aria-label="Filter by bank class">
      <button type="button" className={`bank-class-option ${!bankClass ? 'is-selected' : ''}`} aria-pressed={!bankClass} onClick={() => setBankClass('')}>All classes</button>
      {metadata.classes.map(c => <button type="button" key={c.code} className={`bank-class-option ${bankClass === c.code ? 'is-selected' : ''}`} aria-pressed={bankClass === c.code} onClick={() => setBankClass(c.code)}>{c.label.replace(' Urban Banks (Licensed Banks)', '')}</button>)}
    </div>
    <Card noPadding>
      <div className="table-toolbar"><p>Publish one verified setup per bank class. Revisions preserve earlier rules and salary history.</p><SelectField id="catalogue-status" label="Revision status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="SUPERSEDED">Superseded</option></SelectField></div>
      <ErrorNotice error={list.error} retry={list.refetch} />
      {list.isPending ? <p className="bank-rules-message" role="status">Loading revisions…</p> : !rows.length && !list.error ? <div className="empty-state"><h2 className="empty-state-title">No revisions in this view</h2><p className="empty-state-desc">Create a draft, add the government order and verify its class-wise pay stages before publishing.</p><Button onClick={() => navigate(`/bank-rules/new${bankClass ? `?bankClass=${bankClass}` : ''}`)}>Create draft</Button></div> : <div className="table-wrapper"><table className="table"><thead><tr>{['Revision / order', 'Bank class', 'Effective from', 'Setup', 'Status', ''].map((h, i) => <th scope="col" className="table-th" key={i}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr className="table-row" key={row.id}>
        <td className="table-td"><Link to={`/bank-rules/${row.id}`}>{row.name}</Link><div className="form-note">{row.orderNumber || 'Order not added'}</div></td>
        <td className="table-td">{metadata.classes.find(c => c.code === row.bankClass)?.label.replace(' Urban Banks (Licensed Banks)', '')}</td>
        <td className="table-td mono">{row.effectiveDate || 'Not set'}</td><td className="table-td">{row.postCount} posts · {row.ruleCount} rules · {row.payrollSettingCount} payroll settings</td><td className="table-td"><Badge variant={statusVariant(row.status)}>{row.status}</Badge></td><td className="table-td"><Link to={`/bank-rules/${row.id}`}>{row.status === 'DRAFT' ? 'Edit draft' : 'View revision'}</Link></td>
      </tr>)}</tbody></table></div>}
    </Card>
    <p className="form-note">Publishing records the platform standard. Organisation adoption and employee financial approval are separate steps.</p>
  </div>;
}

function CatalogueEditor({ initial, metadata }) {
  const [form, setForm] = useState(() => ({ ...initial, orderDate: initial.orderDate || '', effectiveDate: initial.effectiveDate || '' }));
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('source');
  const [selectedPost, setSelectedPost] = useState(0);
  const [settingKey, setSettingKey] = useState('');
  const [dialog, setDialog] = useState(null);
  const [verified, setVerified] = useState(false);
  const [verificationNote, setVerificationNote] = useState('');
  const navigate = useNavigate();
  const cache = useQueryClient();
  const toast = useToast();
  const leavingAfterSave = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leavingAfterSave.current && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  const editable = !initial.id || initial.status === 'DRAFT';
  const set = (patch) => { setForm(current => ({ ...current, ...patch })); setDirty(true); };
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const goBack = () => navigate('/bank-rules');
  const saved = (row, message) => {
    leavingAfterSave.current = true;
    setDirty(false);
    cache.setQueryData(['bank-rule', String(row.id)], row);
    cache.invalidateQueries({ queryKey: ['bank-rules'] });
    navigate(`/bank-rules/${row.id}`, { replace: true });
    toast.add(message, 'success');
  };
  const save = useMutation({ mutationFn: () => initial.id ? bankRulesApi.update(initial.id, form) : bankRulesApi.create(form), onSuccess: row => saved(row, 'Draft saved.') });
  const preview = useMutation({ mutationFn: () => bankRulesApi.preview(form), onSuccess: value => { setForm(current => ({ ...current, ...value })); toast.add('Setup validated. Stage previews updated.', 'success'); } });
  const reference = useMutation({ mutationFn: () => bankRulesApi.reference(form.bankClass), onSuccess: value => { set({ posts: value.posts, notes: [form.notes, value.note].filter(Boolean).join('\n') }); setSelectedPost(0); setDialog(null); toast.add('Reference posts loaded. Verify against the official order.', 'success'); } });
  const publish = useMutation({ mutationFn: () => bankRulesApi.publish(initial.id, { version: initial.version, verified, verificationNote }), onSuccess: row => { setDialog(null); saved(row, 'Revision published. Existing bank salaries are unchanged.'); } });
  const remove = useMutation({ mutationFn: () => bankRulesApi.delete(initial.id, initial.version), onSuccess: () => { leavingAfterSave.current = true; setDirty(false); cache.invalidateQueries({ queryKey: ['bank-rules'] }); navigate('/bank-rules'); toast.add('Draft deleted.', 'success'); } });
  const successor = useMutation({ mutationFn: () => bankRulesApi.create({ ...initial, name: `${initial.name.slice(0, 110)} — successor`, supersedesId: initial.id, orderNumber: '', orderDate: null, effectiveDate: null, sourceUrl: '', notes: '' }), onSuccess: row => saved(row, 'Successor draft created. Add its government order and effective date.') });
  const busy = save.isPending || preview.isPending || reference.isPending || publish.isPending || remove.isPending || successor.isPending;
  const error = save.error || preview.error || reference.error || publish.error || remove.error || successor.error;
  const updatePost = (index, patch) => set({ posts: form.posts.map((p, i) => i === index ? { ...p, ...patch, ...(patch.scaleExpression !== undefined ? { stages: undefined } : {}) } : p) });
  const setPayroll = (key, value) => set({ payrollDefaults: { ...form.payrollDefaults, [key]: value } });
  const post = form.posts[selectedPost];
  const tabs = [['source', 'Government order'], ['posts', `Posts & stages (${form.posts.length})`], ['rules', `Service rules (${form.rules.length})`], ['payroll', `Payroll setup (${Object.keys(form.payrollDefaults).length})`]];

  return <div className="page bank-rules-page">
    <div><Button variant="ghost" onClick={goBack}>Back to bank rules</Button></div>
    <header className="page-header bank-rules-header"><div><h1>{initial.id ? initial.name : 'New bank-class revision'}</h1><p>{metadata.classes.find(c => c.code === form.bankClass)?.label} · <Badge variant={statusVariant(initial.status || 'DRAFT')}>{initial.status || 'DRAFT'}</Badge>{dirty && <span className="bank-rules-unsaved">Unsaved changes</span>}</p></div>
      <div className="row-actions">{editable ? <><Button variant="secondary" disabled={busy} loading={preview.isPending} onClick={() => preview.mutate()}>Validate & preview</Button><Button disabled={busy} loading={save.isPending} onClick={() => save.mutate()}>Save draft</Button>{initial.id && <Button variant="secondary" disabled={busy || dirty} onClick={() => { setVerified(false); setVerificationNote(''); setDialog('publish'); }}>Review & publish</Button>}</> : initial.status === 'PUBLISHED' && <Button disabled={busy} loading={successor.isPending} onClick={() => successor.mutate()}>Create successor revision</Button>}</div>
    </header>
    <ErrorNotice error={error} />
    {!editable && <p className="bank-rules-notice">Published content is locked. Create a successor to change the government order, rules, scales or payroll setup.</p>}
    {form.supersedesId && <p className="form-note">Successor to <Link to={`/bank-rules/${form.supersedesId}`}>revision #{form.supersedesId}</Link>. Publication replaces that class’s current catalogue version.</p>}
    <div className="tabs" role="tablist" aria-label="Revision setup">{tabs.map(([key, label]) => <button key={key} id={`tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="catalogue-panel" className={`tab ${tab === key ? 'tab-active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}</div>
    <div id="catalogue-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {tab === 'source' && <Card title="Government order & applicability">
        <fieldset disabled={!editable || busy} className="bank-rules-fields"><div className="form-grid">
          <Input id="rule-name" label="Revision name" maxLength={128} required value={form.name} onChange={e => set({ name: e.target.value })} />
          <SelectField id="rule-class" label="Applicable bank class" value={form.bankClass} disabled={!!form.supersedesId} onChange={e => {
            if (form.posts.length && !window.confirm('Changing class clears the current posts and stages. Continue?')) return;
            set({ bankClass: e.target.value, posts: [] }); setSelectedPost(0);
          }}>{metadata.classes.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</SelectField>
          <Input id="rule-order" label="Government order number" maxLength={128} value={form.orderNumber || ''} onChange={e => set({ orderNumber: e.target.value })} />
          <Input id="rule-authority" label="Issuing authority" maxLength={255} value={form.issuingAuthority || ''} onChange={e => set({ issuingAuthority: e.target.value })} />
          <Input id="rule-order-date" label="Order date" type="date" value={form.orderDate || ''} onChange={e => set({ orderDate: e.target.value })} />
          <Input id="rule-effective" label="Pay revision effective from" type="date" value={form.effectiveDate || ''} onChange={e => set({ effectiveDate: e.target.value })} />
          <Input id="rule-source" label="Official source document URL" type="url" hint="Use an HTTPS link to the government order or official annexure." maxLength={1000} value={form.sourceUrl || ''} onChange={e => set({ sourceUrl: e.target.value })} />
        </div><TextArea id="rule-notes" label="Applicability notes" maxLength={10000} value={form.notes || ''} onChange={e => set({ notes: e.target.value })} /></fieldset>
        {form.sourceUrl && /^https:\/\//i.test(form.sourceUrl) && <p><a href={form.sourceUrl} target="_blank" rel="noopener noreferrer">Open source document</a></p>}
        <p className="form-note">Order number, authority, dates, source document and at least one post are required to publish. Payroll values are included only when explicitly entered.</p>
        {initial.publishedAt && <dl className="definition-list"><dt>Published</dt><dd>{fmt.dateTime(initial.publishedAt)}</dd><dt>Verified by</dt><dd>Platform user #{initial.publishedByUserId}</dd><dt>Verification record</dt><dd>{initial.verificationNote}</dd></dl>}
      </Card>}
      {tab === 'posts' && <Card title="Job posts & pay stages" actions={editable && <div className="row-actions"><Button variant="secondary" size="sm" disabled={busy} loading={reference.isPending} onClick={() => setDialog('reference')}>Load reference posts</Button><Button size="sm" disabled={busy || form.posts.length >= 100} onClick={() => set({ posts: [...form.posts, { code: '', name: '', scaleExpression: '', payableDays: 30, monthDays: null }] })}>Add post</Button></div>}>
        <p className="form-note">Enter the full government scale as START-INCREMENT/COUNT-CHECKPOINT. Validate to expand it into stages. Job posts do not grant application permissions.</p>
        {!form.posts.length ? <p className="bank-rules-message">No posts yet. Add a post or load the class’s reference library.</p> : <div className="table-wrapper"><table className="table bank-posts-table"><thead><tr>{['Post code', 'Job post / cadre', 'Scale expression', 'Payable days', 'Month divisor', 'Stages', ''].map((h, i) => <th scope="col" className="table-th" key={i}>{h}</th>)}</tr></thead><tbody>{form.posts.map((p, i) => <tr key={i} className="table-row">
          <td className="table-td"><input className="input mono" aria-label={`Post ${i + 1} code`} disabled={!editable || busy} maxLength={32} value={p.code} onChange={e => updatePost(i, { code: e.target.value })} /></td>
          <td className="table-td"><input className="input" aria-label={`Post ${i + 1} name`} disabled={!editable || busy} maxLength={128} value={p.name} onChange={e => updatePost(i, { name: e.target.value })} /></td>
          <td className="table-td"><input className="input mono" aria-label={`Post ${i + 1} scale expression`} disabled={!editable || busy} maxLength={255} value={p.scaleExpression} onChange={e => updatePost(i, { scaleExpression: e.target.value })} /></td>
          <td className="table-td"><input className="input mono" aria-label={`Post ${i + 1} payable days`} type="number" min={1} max={31} disabled={!editable || busy} value={p.payableDays} onChange={e => updatePost(i, { payableDays: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
          <td className="table-td"><input className="input mono" aria-label={`Post ${i + 1} month divisor`} type="number" min={1} max={31} disabled={!editable || busy} value={p.monthDays ?? ''} onChange={e => updatePost(i, { monthDays: e.target.value === '' ? null : Number(e.target.value) })} /></td>
          <td className="table-td"><Button size="sm" variant="secondary" onClick={() => setSelectedPost(i)} aria-pressed={selectedPost === i}>{p.stages?.length ? `${p.stages.length} stages` : 'Preview'}</Button></td>
          <td className="table-td">{editable && <Button variant="ghost" size="sm" disabled={busy} aria-label={`Remove post ${i + 1}`} onClick={() => { set({ posts: form.posts.filter((_, j) => j !== i) }); setSelectedPost(0); }}>Remove</Button>}</td>
        </tr>)}</tbody></table></div>}
        {post && <section className="bank-stage-preview" aria-live="polite"><h3>{post.name || `Post ${selectedPost + 1}`} — pay stages</h3>{post.stages?.length ? <ol className="bank-stage-list">{post.stages.map((amount, i) => <li key={i}><span>Stage {i + 1}</span><strong className="mono">{fmt.money(amount)}</strong></li>)}</ol> : <p>Choose “Validate & preview” to calculate this scale’s stages.</p>}</section>}
      </Card>}
      {tab === 'rules' && <Card title="Service rules & references" actions={editable && <Button size="sm" disabled={busy || form.rules.length >= 100} onClick={() => set({ rules: [...form.rules, { title: '', reference: '', description: '' }] })}>Add rule</Button>}>
        <p className="form-note">Record the applicable government clauses for increments, fixation, eligibility and exceptions. These references document the rules; they do not create executable salary formulas.</p>
        {!form.rules.length && <p className="bank-rules-message">No additional service rules recorded.</p>}
        {form.rules.map((rule, i) => <fieldset disabled={!editable || busy} className="bank-rule-entry" key={i}><legend>Rule {i + 1}</legend><div className="form-grid"><Input id={`rule-title-${i}`} label="Rule title" maxLength={128} value={rule.title} onChange={e => set({ rules: form.rules.map((r, j) => j === i ? { ...r, title: e.target.value } : r) })} /><Input id={`rule-reference-${i}`} label="Order clause / reference" maxLength={255} value={rule.reference} onChange={e => set({ rules: form.rules.map((r, j) => j === i ? { ...r, reference: e.target.value } : r) })} /></div><TextArea id={`rule-description-${i}`} label="Rule details & conditions" maxLength={4000} value={rule.description} onChange={e => set({ rules: form.rules.map((r, j) => j === i ? { ...r, description: e.target.value } : r) })} />{editable && <Button size="sm" variant="ghost" onClick={() => set({ rules: form.rules.filter((_, j) => j !== i) })}>Remove rule {i + 1}</Button>}</fieldset>)}
      </Card>}
      {tab === 'payroll' && <Card title="Class-wise payroll setup">
        <p className="form-note">Declare the rates and settings covered by this order. Unspecified settings remain bank-managed. Publication stores this template without changing a bank’s active payroll settings. Recoverable advances, earnings and pay progression are separate settings; new salary payments are managed under Allowances.</p>
        {editable && <div className="bank-payroll-add"><SelectField id="add-payroll-setting" label="Add a payroll setting" value={settingKey} disabled={busy} onChange={e => setSettingKey(e.target.value)}><option value="">Choose a setting…</option>{[...new Set(metadata.payrollFields.map(f => f.category))].map(category => <optgroup label={category} key={category}>{metadata.payrollFields.filter(f => f.category === category && !Object.hasOwn(form.payrollDefaults, f.key)).map(f => <option key={f.key} value={f.key}>{fieldLabel(f.key)}</option>)}</optgroup>)}</SelectField><Button variant="secondary" disabled={!settingKey || busy} onClick={() => {
          const f = metadata.payrollFields.find(item => item.key === settingKey);
          setPayroll(settingKey, f.type === 'BOOLEAN' ? false : f.type === 'ENUM' ? f.options[0] : ''); setSettingKey('');
        }}>Add setting</Button></div>}
        {!Object.keys(form.payrollDefaults).length && <p className="bank-rules-message">No payroll defaults declared in this revision.</p>}
        <div className="bank-payroll-grid">{Object.entries(form.payrollDefaults).map(([key, value]) => {
          const f = metadata.payrollFields.find(item => item.key === key);
          if (!f) return null;
          const props = { id: `payroll-${key}`, label: fieldLabel(key), disabled: !editable || busy, value: key === 'odMultiplier' && value != null && value !== '' ? Math.round(Number(value) * 100) : value ?? '' };
          return <div className="bank-payroll-setting" key={key}>{f.type === 'ENUM' || f.type === 'BOOLEAN' ? <SelectField {...props} value={value === null ? '__null' : String(value)} onChange={e => setPayroll(key, e.target.value === '__null' ? null : f.type === 'BOOLEAN' ? e.target.value === 'true' : e.target.value)}>{f.nullable && <option value="__null">Not specified</option>}{(f.options || ['true', 'false']).map(option => <option value={option} key={option}>{f.type === 'BOOLEAN' ? option === 'true' ? 'Yes' : 'No' : option.replace(/_/g, ' ')}</option>)}</SelectField> : <Input {...props} type={f.type === 'DATEONLY' ? 'date' : 'number'} min={f.min} max={key === 'odMultiplier' ? f.max * 100 : f.max} step={key === 'odMultiplier' ? 1 : f.type === 'INTEGER' || f.decimals === 0 ? 1 : f.decimals ? 10 ** -f.decimals : undefined} onChange={e => setPayroll(key, e.target.value === '' ? f.nullable ? null : '' : f.type === 'DATEONLY' ? e.target.value : key === 'odMultiplier' ? Number(e.target.value) / 100 : Number(e.target.value))} />}{editable && <Button variant="ghost" size="sm" disabled={busy} aria-label={`Remove ${fieldLabel(key)}`} onClick={() => { const next = { ...form.payrollDefaults }; delete next[key]; set({ payrollDefaults: next }); }}>Remove</Button>}</div>;
        })}</div>
      </Card>}
    </div>
    {editable && initial.id && <div className="bank-rules-footer"><p className="form-note">Save changes before publication. Published versions cannot be deleted.</p><Button variant="danger" size="sm" disabled={busy} onClick={() => setDialog('delete')}>Delete draft</Button></div>}
    <Modal open={!!dialog} onClose={() => !busy && setDialog(null)} title={dialog === 'publish' ? 'Publish verified bank-class setup' : dialog === 'delete' ? 'Delete this draft?' : 'Load reference posts?'} footer={<><Button variant="secondary" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button>{dialog === 'publish' ? <Button disabled={busy || !verified || !verificationNote.trim()} loading={publish.isPending} onClick={() => publish.mutate()}>Publish revision</Button> : dialog === 'delete' ? <Button variant="danger" disabled={busy} loading={remove.isPending} onClick={() => remove.mutate()}>Delete draft</Button> : <Button disabled={busy} loading={reference.isPending} onClick={() => reference.mutate()}>Load reference posts</Button>}</>}>
      {dialog === 'publish' ? <><p>Publish <strong>{initial.name}</strong> for <strong>{metadata.classes.find(c => c.code === initial.bankClass)?.label}</strong>, effective {initial.effectiveDate || 'date not set'}.</p><p>This locks the government source, posts, stages, rules and payroll setup. Banks’ existing salary records remain unchanged.</p><label className="bank-verification"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} disabled={busy} /><span>I checked every figure, applicable post, payroll setting and effective date against the government order.</span></label><TextArea id="verification-note" label="Verification record" maxLength={4000} value={verificationNote} disabled={busy} onChange={e => setVerificationNote(e.target.value)} /></> : dialog === 'delete' ? <p>The unpublished draft <strong>{initial.name}</strong> will be permanently removed.</p> : <><p>This replaces the draft’s posts with the existing reference library for <strong>{metadata.classes.find(c => c.code === form.bankClass)?.label}</strong>.</p><p>Reference figures are unverified. Check the actual government order and dates before publishing. The bank’s payable-day basis must also be confirmed.</p></>}
      <ErrorNotice error={dialog === 'publish' ? publish.error : dialog === 'delete' ? remove.error : reference.error} />
    </Modal>
    <Modal open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="Leave unsaved changes?" footer={<><Button variant="secondary" onClick={() => blocker.reset()}>Keep editing</Button><Button variant="danger" onClick={() => blocker.proceed()}>Discard changes & leave</Button></>}><p>Your changes to this draft have not been saved.</p></Modal>
  </div>;
}
