# Government pay catalogue and organisation adoption

Date: 2026-11-04
Status: Proposed design for approval

## Intent and agreed ownership

Manage government-prescribed job posts and staged basic-pay scales by bank class.
Platform Admin maintains and publishes the catalogue. Organisation Admin adopts
applicable revisions and assigns employees. Payroll Officer prepares financial
changes; Approving Authority signs them off. Job posts remain separate from
application access roles.

## Approaches

The selected approach is a central published catalogue with organisation-owned
adoptions. It provides one verified source and preserves tenant isolation.
Independent bank-maintained government scales were considered but would duplicate
verification and allow figures to diverge. Directly replacing all tenant scales
on publication was rejected because adoption and employee fixation need explicit
review and must preserve history.

## Existing foundation

Reuse Express, Sequelize, MySQL and React; add no dependencies. Existing
Organization.bankClass supports Special Grade and Classes I–V. PostCadre,
PayRevision, PayScale and PayStage are tenant-owned. payScaleExpr expands stage
ladders; payScaleRevision creates new scales without moving employees. Existing
fixation, payroll approval, documents and audit services remain the foundation.

The seed catalogue is reference material, not verified government authority: its
effective dates are placeholders. Existing scales must not be relabelled verified.

## Catalogue

Add platform-owned catalogue revisions with order number, issuing authority,
order date, effective date, source document, verification record and publication
actor/time. Each revision explicitly covers one or more bank classes. Each class
contains permitted post codes, official names and scale expressions expanded into
ordered stages. Shared part-time contingent posts require explicit applicability.

Lifecycle: DRAFT -> PUBLISHED -> SUPERSEDED. Publication requires complete source
evidence, valid calendar dates, explicit applicability and validated positive,
strictly increasing stages with unique post codes per class. Reject malformed,
oversized or inconsistent expressions. Published financial content is immutable;
corrections require a successor revision. Superseded revisions remain readable.
Publication does not itself change any bank or employee salary.

## Organisation adoption

Organisation Admin previews a published revision matching the bank class,
including post mappings, changed amounts and affected employees. Adoption creates
a tenant snapshot linked to the exact catalogue revision, including local posts,
scales and stages, in one transaction. Enforce one adoption per org/revision and
class, including concurrent requests. Record actor and timestamp in the audit log.

Treat adoption as staging eligibility, not authorisation to change employee pay.
Future-effective scales are unavailable for earlier assignments. Reject overlapping
effective revisions unless an explicit supersession relation resolves them. Keep
old records for historical employees and payroll; prevent new assignments to
historical scales outside their permitted dates. Preserve local post identity by
mapping stable catalogue post codes explicitly; never match by display name.

## Employee financial changes

Payroll Officer prepares a proposed fixation or transition using the adopted
revision. Store employee, post, scale/stage, effective date, old/new amounts,
calculation inputs and explanation in an immutable submitted snapshot.
Approving Authority approves or rejects with an audit record. A preparer cannot
approve their own proposal, including a preparer with administrator privileges.
Organisation Admin assigns the approved result; an initial salary assignment also
requires financial approval. Validate org, class, post, revision, stage membership
and effective dates again when applying it. If the underlying employee salary or
applicable revision has changed, reject the stale proposal and require preparation
again. Apply once transactionally and append pay history; never rewrite it.

Reusing an existing fixation approval mechanism is preferred where its actual
contract supports this workflow; otherwise add the smallest persisted proposal
record. Existing general update/CSV/fixation routes must not bypass approval for
catalogue-governed salary fields. Payroll officers cannot edit published figures.

Bank class changes add eligibility for the new class but do not move employees.
An explicit approved transition records old/new class context and preserves prior
pay. Historical assignments remain readable even when their class no longer matches.
Government publication or adoption does not automatically generate arrears. Existing
DA arrears remain separate; general basic-pay revision arrears are outside this scope.

## Access controls

- Platform Admin: catalogue drafts, source evidence, publication, supersession.
- Organisation Admin: own-bank adoption, post mappings and approved assignments.
- Payroll Officer: own-bank financial proposals and previews.
- Approving Authority: own-bank submitted proposals; no self-approval.
- Other roles: retain permitted reads; no catalogue publication, adoption or salary mutation.
- Employee: only authorised self-service data; no staff catalogue administration.

Enforce permissions and tenant/class/stage relationships on the server. React
routes, menus and buttons mirror those permissions. Source documents obey the
same access rules. Account onboarding, profile editing and recovery from the
original request remain a subsequent workstream, not cancelled by this design.

## Screens and scope

Platform: Government Pay Catalogue list, revision/source details, class/post/stage
editor, validation preview and publish confirmation. Organisation: applicable
catalogue, adoption preview/history, governed posts/scales, financial proposal
and approval views integrated with employee fixation. Reuse house components.

No document OCR, automatic government scraping, custom permission builder or new
salary formula engine. Actual government figures and dates require supplied or
verified official evidence; none will be invented.

## Implementation boundaries and verification

Changes reach models, non-destructive schema migration, services, API routes,
existing salary mutation paths, React API client, role guards, navigation, employee
assignment/fixation UI and focused tests. Preserve user changes in frontend config
and the existing untracked self-service design. Do not reset, reseed or migrate a
live database as part of development without separate deployment authorisation.

Verify expression/date validation, class/post/stage mismatch rejection, cross-tenant
access, immutable publication, idempotent/concurrent adoption, effective dates,
self-approval denial, stale proposals, bypass routes, atomic application and
unchanged historical pay. Run the frontend build and backend focused checks.

## Builder decisions proposed for approval

One revision may cover several explicitly listed classes. Adoption only stages
scales; financial approval gates employee pay. Only Approving Authority signs off;
administrator roles have no implicit bypass. Existing reference data is retained
as legacy/unverified. New screens target React; legacy clients still receive the
same server-side restrictions. No production migration is executed automatically.

Builder review identified these additional proposed defaults: annual increments
also require a prepared and approved proposal in this first version; automatic
progression is deferred. Employees may be saved with salary assignment pending,
but payroll must exclude them and report the exclusion until an approved salary
assignment is applied. Store effective-dated bank-class history and validate
retrospective assignments against that history. Recheck employee snapshots at
approval and lock/recheck during application. Successor publications replace the
whole revision and must contain the complete applicable class/post set; partial
supersession is deferred. Published source documents are immutable as well as
figures; replacement requires a successor publication.
