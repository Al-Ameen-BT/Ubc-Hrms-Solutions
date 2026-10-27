<!-- SEED: established with the user before implementation; re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: UCB HRMS & Payroll
description: Config-driven HRMS & payroll for Urban Co-operative Banks, styled as a printed salary passbook — warm paper, banking ink, red-ink money.
---

# Design System: UCB HRMS & Payroll — "The Salary Passbook"

## Overview

**Creative North Star: "The Salary Passbook"**

This surface is a printed bank passbook that learned to compute. Every screen reads like an official document issued by the bank: warm paper instead of white glass, banking ink instead of slate greys, ruled hairlines instead of rounded cards, and a single red-ink voice reserved for the two things a passbook never lies about — **money and dates**. A staff member completing a payroll run and a clerk leafing through a paper passbook share the same mental model: entries, columns, ledgers, and a stamp of authority at the end.

The world replaces the project's previous dark-teal identity **and** an interim generic glassmorphism scaffold currently in `frontend/src/styles/` (frosted white surfaces, blue-500 accent, Inter, auto dark mode). That scaffold predates the confirmed direction and is **not** the reference for this system; re-skinning it is a replacement, not a refinement — its tokens are disposable during the re-skin, kept only until each value lands here.

Two sign-in surfaces inherit this world: the platform console (`/`) and each bank's console (`/o/<CODE>`), each with the bank's own branding while speaking the same paper-and-ink language.

**Key Characteristics:**
- Warm ivory **paper ground** in light print quality — never pure white, never glass
- **Bank-blue ink** for structure and identity; **red-ink** strictly for money and dates
- **Ruled hairlines** as the boundary system — passbook rules, not card boxes
- **Tabular figures everywhere** numbers appear; digits align in every column
- The **running-balance move**: chronological entries printed as ledger lines with a balance column that carries forward
- The **authority-stamp motif** for approved / certified states — an honest stamped impression, nothing glossy
- Operate-mode craft: dense, keyboard-first, trustworthy; the ledger comes before decoration

## Colors

The palette is three inks on paper. Blue does the work, red does the meaning, paper does the rest. All values are `[to be resolved during implementation]` — the roles and their exclusivity rules are the commitment, the hexes land with the first build.

### Primary
- **Bank-Blue Ink** `[to be resolved during implementation]`: The default writing voice — headings, labels, tabular text, links, primary actions, focus rings. It reads like the blue-black ink of real bank documents: darker and cooler than a corporate blue, never Tailwind `#3b82f6`. Its dark sibling deepens the platform surface framing without becoming a "dark theme".

### Secondary (omit — the system intentionally has one accent)

### Red Inks
- **Red-Ink Money/Date** `[to be resolved during implementation]`: Reserved for rupee amounts, debit/credit figures, effective dates, and die-date milestones. The rarity is the meaning — if it appears on anything but money or a date, the ledger stops reading like a passbook.
- **Rubber-Stamp Crimson** `[to be resolved during implementation]`: The stamp-motif color for APPROVED / CERTIFIED impressions. Close kin to the money red, used at stamp scale and mostly transparent, underscored by slight rotation texture — never used for destructive buttons.

### Neutral
- **Warm Ivory Paper** `[to be resolved during implementation]`: The ground for every screen and ledger surface; slightly warm, pick a value by eye against real print, mind screenshots washed by displays.
- **Ledger-Grey Ink** `[to be resolved during implementation]`: Secondary text, table sub-lines, help text; cooler than the paper, warmer than pure slate.
- **Hairline Rule** `[to be resolved during implementation]`: 1px ruled line color — table rows, ledger bands, section joints. A true hairline: thin enough to feel printed, dark enough to rule.
- **Error Ink** `[to be resolved during implementation]`: Validation and failure text. Because red-ink money is spoken for, errors use a **distinguishable voice** (darker red-brown, or paired with icon + underline severity) so a failing field never reads like a balance.

### Named Rules
**The Red Is Money Rule.** The red-ink accent appears only on rupee amounts and dates. No badges, no buttons, no charts in red — a red rupee on this surface is a fact, not an alert.

**The Paper Ground Rule.** Screen backgrounds are paper, not white, not glass, never gradient washes or frosted panels. Color fields belong to regions of a document (a header band, a ledger), never to panel borders trying to look modern.

## Typography

**Body/Display Font pairing:** `[to be resolved during implementation]` — the character is committed even though the voices aren't: a print-forward official voice for headings (document/serif-flavored or a print-quality grotesque) plus a workhorse text voice for the dense operational body. The hard constraint: **every numeral in tables, ledgers, and money contexts uses tabular figures** (`font-variant-numeric: tabular-nums` or a monospaced-digit face); proportional digits in a ledger column are a defect, not a style choice.

**Character:** Government-print authority, not a type foundry's self-expression. Ledger labels may run small caps or tracked uppercase; headings are quiet and stamped-in, never neon or oversized.

### Hierarchy
- **Display** `[sizes at implementation]`: Platform/bank console page titles; the largest ledger head; sparse.
- **Headline** `[sizes at implementation]`: Section titles inside a surface (e.g. "Increment Policy — Organisations Detail").
- **Title** `[sizes at implementation]`: Card/ledger titles, modal headers, form-group names.
- **Body** `[15px-ish base at implementation; target ~65–75ch line length]`: Table cells, ledger lines, form fields. Dense but airy — bank staff read fast; the branch-machine context keeps the base around 15px.
- **Label** `[weight, ~0.02–0.06em tracking, small caps or sentence case — fix at implementation]`: Column heads, form labels, audit-trail metadata.
- **Numerals**: tabular figures mandatory in any column that stores money, dates, or counts.

### Named Rules
**The Aligned Column Rule.** If a column could be summed, its digits align. Period.

## Layout

Ledgers before cards. The spatial model is a **document**: a printed header band (surface identity + record title + stamp state), then ruled ledger bands that let dense tables read like official print. The grid is a max-width work column appropriate to dense tables (final value at implementation), with the persistent left navigation railed to the two-surface orientation.

- **Density:** bank-grade — long tables are the primary object; whitespace is earned, not default.
- **Rhythm:** an even typographic baseline grid (final ratio at implementation); ledger rows get taller padding than body text to allow row-level reading, never cramped.
- **Responsive:** staff work at desktops first; the small-screen state collapses the navigation and lets ledger bands scroll horizontally **with the balance column pinned**, since losing sight of money to a scroll breaks the passbook model; mobile is a desk job, not a redesign.

## Elevation & Depth

**Flat, by doctrine.** This is a print world: no glass, no drop shadows layered for style, no hover lifts. Depth arrives only via the document object itself — a raised **paper sheet** (slightly lighter paper against the ground, with a hairline edge so it doesn't disappear onto the background) for genuinely modal things (dialogs, pay-fixation previews, print views). Everything else sits on the paper like ink on stock.

### Shadow Vocabulary (if applicable)
- **Paper sheet lift** `[exact value at implementation]`: A single low-radius, low-parity shadow, only on the floating document object that must sit visibly above the ruled page (modals, print preview). Nothing else casts a shadow.

### Named Rules
**The Flat Ledger Rule.** Surfaces do not float for style. If a component casts the paper-sheet shadow, it is one of the few specifically modal objects; everything else sits at print depth within hairline rules.

## Shapes

**The hairline is the corner.** Containers get ruled edges, not rounded boxes — passbook pages have straight ruled lines, so the form language is a ruling frame, with a very small radius (1–3px, final at implementation) reserved for inputs, chips, and stamps whose physical models wear one. Borders are hairline rules full-length, never soft editor strokes. Where a rule intersects a band, it terminates cleanly (the ledger joint), no half-alpha borders floating in space. The stamp motif supplies the one departure: the approval mark may be slightly rotated and irregular — it's an impression, not a decal.

## Do's and Don'ts

### Do:
- **Do** keep the red-ink accent exclusively to money and dates (amounts, dates, balances, effective dates in ledgers, arrears figures, expiry dates on licences).
- **Do** rule ledger boundaries as 1px full-length hairlines; treat a table without row rules as an incomplete thought.
- **Do** render every money/date column in tabular figures; align decimal separators and dates by column.
- **Do** carry the running-balance structure (entries chronologically, balance carried forward) wherever a numeric history exists (payroll runs, arrears, licence windows) — it is the signature move.
- **Do** use the authority-stamp motif sparingly for approved/certified states, always referencing its physical model (rubber stamp impression with slight rotation/ink texture) rather than a glossy badge.
- **Do** keep both surfaces (platform `/`, bank `/o/<CODE>`) in this world while allowing per-bank branding substitution.
- **Do** keep work Operate-mode: 15px-ish base, keyboard paths, density over decoration.

### Don't:
- **Don't** use frosted-glass surfaces, backdrop blur, gradient background washes, or auto dark themes — the interim glass scaffold's language is retired with its predecessor, not merged.
- **Don't** apply the money-red accent to any meaning other than rupee amounts and dates (status dots, buttons, charts); destructive actions get the dedicated **Error Ink**, never money red.
- **Don't** put a shadow on anything that isn't the floating paper sheet (dialogs, print views).
- **Don't** allow proportional (non-tabular) numerals inside any table column.
- **Don't** hard-code Kerala service rules, increment dates, or pay-scale values into visuals — all rule logic is configuration data; the UI renders whatever the engine returns [binding product constraint from PRODUCT.md].
