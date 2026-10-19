# Human-Centered UI/UX Audit Checklist

## How to use this checklist

- Review the product as a person with a goal, limited time, and incomplete knowledge—not as its designer. Use realistic tasks and representative data.
- Evaluate each applicable item as **Pass**, **Issue**, **Not applicable**, or **Not verified**. Record evidence, not just opinions. Mark the relevant screen, route, viewport, state, and steps.
- For every issue, describe the user impact and a practical recommendation. Distinguish observed defects from hypotheses that need research.
- Run the checklist across the agreed platforms, input methods, breakpoints, and states. A pass on one device does not establish a pass everywhere.
- Use this as an audit aid, not a substitute for usability research, accessibility conformance testing, security review, or product-specific requirements.

**Status key:** `[ ]` not reviewed · `[x]` reviewed · `[!]` issue found · `[N/A]` not applicable · `[?]` not verified

---

## 1. First impression and visual design

### Visual hierarchy and composition
- [ ] Is the product's purpose and the primary next action understandable at a glance?
- [ ] Does visual emphasis match task importance, reading order, and likely user intent?
- [ ] Are headings, labels, body text, and supporting details clearly differentiated?
- [ ] Is the layout balanced, with intentional alignment, grouping, and whitespace?
- [ ] Are important actions and status information easy to locate without scanning every element?
- [ ] Are decorative elements helping orientation or comprehension, rather than competing with tasks?
- [ ] Does the screen avoid unexplained empty space, awkward crowding, accidental overlaps, and clipped content?

### Typography, color, imagery, and assets
- [ ] Are fonts legible at the expected viewing distance and supported across target platforms?
- [ ] Are line lengths, line height, letter spacing, and text scaling comfortable and resilient?
- [ ] Is color used consistently and not as the only means of conveying meaning?
- [ ] Do text and interactive elements have sufficient contrast in all relevant states and themes?
- [ ] Do icons have familiar meanings, visible labels where needed, and consistent visual weight?
- [ ] Are images, illustrations, avatars, and product screenshots relevant, current, and appropriately cropped?
- [ ] Are image alternatives provided when meaningful, and empty alternatives used for purely decorative imagery?
- [ ] Are brand assets crisp and correctly sized on high-density screens?
- [ ] Do light/dark themes and forced-color settings preserve clarity, if supported?

### Polish and authenticity
- [ ] Does the visual language feel intentional and appropriate for the audience and context?
- [ ] Are spacing, radii, shadows, borders, and elevation used consistently rather than arbitrarily?
- [ ] Do animations and transitions support continuity or feedback instead of adding spectacle?
- [ ] Are there obvious placeholder assets, lorem ipsum, debug labels, broken icons, or unfinished sections?
- [ ] Does the interface avoid misleading affordances, fake controls, or visual treatments that imply functionality that does not exist?

**Notes / evidence:** [Screens, routes, viewport, observations]

## 2. Interaction realism and feedback

- [ ] Do controls behave as their appearance and labels promise?
- [ ] Can a person tell what is clickable, tappable, draggable, editable, or disabled?
- [ ] Do controls respond promptly to mouse, touch, keyboard, and supported assistive input?
- [ ] Is there a clear response after every meaningful action: pressed, selected, saved, sent, expanded, copied, or failed?
- [ ] Are loading, progress, success, and failure feedback timely and proportionate?
- [ ] Are destructive, irreversible, or high-consequence actions clearly distinguished and confirmed appropriately?
- [ ] Can users undo, cancel, go back, or recover from common mistakes where feasible?
- [ ] Do menus, dialogs, popovers, tooltips, and sheets open and close predictably? Can users dismiss them using expected methods?
- [ ] Are hover-only behaviors also available to touch and keyboard users?
- [ ] Are gestures discoverable, forgiving, and supplemented with visible controls when needed?
- [ ] Do animations respect reduced-motion preferences and avoid blocking interaction?
- [ ] Are double submission, duplicate purchases, repeated sends, and accidental taps prevented or handled safely?
- [ ] Does focus remain logical after route changes, dialogs, validation, and dynamically updated content?
- [ ] Do external links, downloads, and app handoffs make the destination or context change clear?

**Human interaction check:** Complete core tasks with realistic interruptions and imperfect input. Note moments where the interface feels robotic, surprising, overly eager, or unclear about what it has done.

## 3. Usability and task completion

- [ ] Can a first-time user understand where to start without prior explanation?
- [ ] Are the most important tasks reachable in a reasonable number of clear steps?
- [ ] Are labels, instructions, and choices written in language familiar to the target audience?
- [ ] Are choices limited and grouped in a way that supports decisions without hiding meaningful options?
- [ ] Are defaults safe and sensible, and are their consequences visible?
- [ ] Does the interface show where a person is in a longer process and what remains?
- [ ] Are system status and the results of actions visible without requiring memory or repeated checking?
- [ ] Can users recognize options and prior information rather than having to remember them?
- [ ] Are advanced features discoverable without overwhelming common tasks?
- [ ] Are repeated tasks efficient for returning users while remaining understandable to new users?
- [ ] Do empty states explain why there is no content and what useful next step is available?
- [ ] Are important actions available without unnecessary account creation, data entry, or permission requests?
- [ ] Can users safely pause and resume longer tasks, where expected?
- [ ] Are terms and workflows consistent with the user's real-world mental model?
- [ ] Are there dead ends, circular paths, unnecessary steps, or points where users must guess?

**Core tasks to attempt:**
1. [Task and success outcome]
2. [Task and success outcome]
3. [Task and success outcome]

## 4. Accessibility and inclusive use

Assess against the applicable standard and target platforms: [e.g., WCAG version/level, native platform guidance, legal requirement]. A visual review alone cannot establish conformance.

### Perception and readability
- [ ] Is meaningful information available in text or another usable equivalent, not only color, shape, sound, or position?
- [ ] Are text, controls, focus indicators, and meaningful graphics sufficiently distinguishable from their backgrounds?
- [ ] Does content remain usable when text is enlarged, spacing is increased, or the viewport is reflowed?
- [ ] Are captions, transcripts, and audio descriptions available where needed?
- [ ] Do charts and complex visuals have a concise explanation and accessible data alternative?
- [ ] Are flashing, parallax, motion, and auto-playing media avoided or controllable?

### Operation and input
- [ ] Can all functionality be operated with a keyboard, with a visible focus indicator and no keyboard trap?
- [ ] Is focus order logical and does it follow the meaningful visual sequence?
- [ ] Are touch targets large and spaced enough for reliable use? Are alternatives provided for complex gestures?
- [ ] Are time limits absent where possible, adjustable, and accompanied by warnings and extensions when appropriate?
- [ ] Can users pause, stop, or hide moving or auto-updating content?
- [ ] Are shortcuts discoverable and remappable or avoidable where they may conflict with assistive technology?

### Structure and assistive technology
- [ ] Are page titles, headings, landmarks, lists, tables, and reading order meaningful?
- [ ] Do controls have accessible names, roles, values, and states that match their visible purpose?
- [ ] Are form labels, instructions, required status, and errors programmatically associated with fields?
- [ ] Are status updates announced appropriately without moving focus unexpectedly?
- [ ] Are dialogs, disclosure widgets, tabs, menus, and custom controls exposed and operated correctly?
- [ ] Are accessible names concise and not duplicated by redundant announcements?
- [ ] Do screen-reader users receive equivalent information and actions, including for icon-only controls?
- [ ] Is language declared and language switching handled for relevant content?

### Cognitive, situational, and inclusive considerations
- [ ] Is the language plain, respectful, and free of unnecessary jargon or stigmatizing assumptions?
- [ ] Are instructions short, specific, and presented where they are needed?
- [ ] Can people with low vision, color-vision differences, motor differences, hearing differences, or cognitive disabilities complete core tasks?
- [ ] Does the experience account for small screens, glare, noisy environments, one-handed use, slow connections, and interrupted attention?
- [ ] Do identity, demographic, and relationship fields allow appropriate choice without forcing inaccurate assumptions?
- [ ] Are localization, right-to-left layout, date, number, currency, and name formats considered where in scope?

**Assistive technology checks performed:** [Screen reader, switch, voice control, magnification, keyboard, etc.]  
**Accessibility evidence / limitations:** [Record tool, platform, steps, and unresolved coverage]

## 5. Responsive behavior and platform fit

Check representative widths and device classes: [small phone] · [large phone] · [tablet] · [laptop] · [wide desktop] · [other].

- [ ] Does content reflow without unintended horizontal scrolling, clipping, or overlap?
- [ ] Are key actions and navigation still findable at each breakpoint?
- [ ] Are layouts adapting to content and available space rather than relying on brittle fixed dimensions?
- [ ] Do images, tables, charts, and embedded content remain usable on narrow screens?
- [ ] Are mobile controls comfortable for touch and desktop controls usable with pointer and keyboard?
- [ ] Do sticky headers, bottom bars, safe areas, and virtual keyboards avoid obscuring content or controls?
- [ ] Does orientation change preserve task progress and usable layout?
- [ ] Are desktop hover affordances translated into mobile-friendly interactions?
- [ ] Are native platform conventions respected where they support predictability, without unnecessary inconsistency?
- [ ] Do browser zoom, text scaling, and OS display settings preserve function?
- [ ] Do insets, notches, cutouts, and home indicators avoid covering interactive content?
- [ ] Does the app handle backgrounding, returning, and transient connectivity loss in expected ways?

**Coverage matrix:** [Platform × browser/OS × viewport × input method × test result]

## 6. Navigation, orientation, and information architecture

- [ ] Are primary, secondary, and contextual navigation clearly distinguished?
- [ ] Do labels describe destinations or outcomes in terms users understand?
- [ ] Can users tell which section, screen, or step they are in?
- [ ] Are active, selected, expanded, and current states visible and available to assistive technology?
- [ ] Do browser back/forward, app back, breadcrumbs, and close actions behave predictably?
- [ ] Do deep links, refresh, and shared links lead to the expected destination or a helpful fallback?
- [ ] Is search easy to find, tolerant of realistic terms, and clear about scope and results?
- [ ] Are search results, filters, sorting, and pagination understandable and reversible?
- [ ] Are breadcrumbs and hierarchy useful rather than decorative or misleading?
- [ ] Do navigation items avoid duplicate labels or destinations that differ only subtly?
- [ ] Is navigation consistent across related pages and across signed-in/out states?
- [ ] Can a user recover if a destination is unavailable, access is denied, or a session expires?

## 7. Content, language, and trust

- [ ] Does each screen explain its purpose and the action the user can take?
- [ ] Are labels, button text, headings, and help text specific and consistent?
- [ ] Are claims accurate, current, and appropriately qualified?
- [ ] Are prices, fees, renewal terms, eligibility, delivery dates, and other consequential details visible before commitment?
- [ ] Are error messages respectful, actionable, and specific without exposing sensitive details?
- [ ] Are empty, loading, success, and failure messages written for the actual situation?
- [ ] Is legal, privacy, and consent language understandable at the decision point?
- [ ] Are links descriptive and do they accurately signal external destinations or file types?
- [ ] Is content free of placeholder text, unexplained abbreviations, stale dates, and inconsistent terminology?
- [ ] Are translations complete and culturally appropriate, with room for text expansion?
- [ ] Does the experience avoid deceptive urgency, preselected consent, confusing opt-outs, or misleading button emphasis?
- [ ] Are generated, user-submitted, or third-party contents clearly distinguished when that matters?

## 8. Forms and data entry

- [ ] Does each field have a persistent visible label, appropriate input type, and clear purpose?
- [ ] Are required and optional fields identified before the user submits?
- [ ] Are examples, format hints, character limits, and input constraints provided at the right time?
- [ ] Are input masks and formatting aids forgiving and compatible with paste, autofill, and assistive technology?
- [ ] Are sensible autocomplete tokens and mobile keyboards used where appropriate?
- [ ] Are fields grouped in a meaningful order, with related questions kept together?
- [ ] Are defaults safe, transparent, and not likely to cause unintended commitments?
- [ ] Is entered information preserved after validation errors, navigation, and recoverable failures?
- [ ] Are errors shown near fields and summarized when useful, with clear correction instructions?
- [ ] Is error focus or announcement handled without losing context?
- [ ] Can users review and correct important information before submission?
- [ ] Are password rules shown before entry, and do reveal, paste, and password-manager features work?
- [ ] Are destructive or sensitive data requests explained with a clear reason?
- [ ] Do multi-step forms show progress, save state, and consequences of leaving?
- [ ] Are date, address, name, phone, and identity fields flexible enough for the audience and locales?
- [ ] Are consent choices separate, explicit, and recorded in an understandable way?

## 9. States, edge cases, and resilience

Review each relevant screen or flow in its meaningful states:

- [ ] Initial / first-use
- [ ] Returning user / populated
- [ ] Empty / no results
- [ ] Loading / slow response
- [ ] Success / saved / completed
- [ ] Validation error / rejected input
- [ ] Network offline / timeout / retry
- [ ] Permission denied / permission not yet requested
- [ ] Signed out / expired session / insufficient access
- [ ] Partial completion / interrupted workflow
- [ ] Duplicate action / conflict / stale data
- [ ] Very long content, names, labels, or localized text
- [ ] Minimum, maximum, zero, and unusual numeric values
- [ ] Missing, deleted, unavailable, or malformed content
- [ ] Rapid repeated taps, double-clicks, and concurrent updates
- [ ] Browser refresh, app backgrounding, process restart, or device rotation
- [ ] Unsupported browser, blocked storage/cookies, or restricted environment
- [ ] Permission recovery, retry, cancel, and alternative path

For each state:
- [ ] Is the state visible and understandable?
- [ ] Does the user know what happened and what they can do next?
- [ ] Are entered work and important context preserved when possible?
- [ ] Are retries safe and duplicate effects prevented?
- [ ] Is the recovery path accessible and tested?

## 10. Performance perception and continuity

- [ ] Does the interface acknowledge an action immediately, even when the full result takes time?
- [ ] Are progress indicators used when a task takes long enough to create uncertainty?
- [ ] Are skeletons, optimistic updates, and placeholders truthful and stable rather than misleading?
- [ ] Do layout shifts avoid moving controls just as a person is about to use them?
- [ ] Are large images, animations, and transitions restrained on slower devices or reduced-motion settings?
- [ ] Does slow or failed loading offer a useful explanation and next step?
- [ ] Are saved or submitted results clearly confirmed, with a way to verify them later where appropriate?
- [ ] Does navigation feel continuous, without jarring resets or unexplained context loss?
- [ ] Are background tasks and notifications timed and worded so they do not interrupt unexpectedly?

Record perceived delay and device/network context; do not infer backend performance from appearance alone.

## 11. Security and privacy UX

This section reviews how security and privacy choices are communicated and experienced. It does not replace a technical security assessment.

- [ ] Is the reason for requesting personal data or a device permission explained at the moment it is needed?
- [ ] Can users decline optional permissions and still understand available alternatives?
- [ ] Are sensitive details masked where appropriate, with a clear, accessible way to reveal them?
- [ ] Are sign-in, account recovery, verification, and session-expiration flows understandable and recoverable?
- [ ] Are security codes, passwords, and one-time links handled in ways compatible with assistive technology and autofill?
- [ ] Are privacy controls discoverable, specific, and consistent with what the product actually does?
- [ ] Can users understand, correct, export, or delete relevant data where product policy provides those rights?
- [ ] Are consent choices clear, granular where appropriate, and not bundled with unrelated actions?
- [ ] Are users warned before sharing, publishing, or making information visible to others?
- [ ] Are account, payment, health, location, or other sensitive actions confirmed with context and consequences?
- [ ] Do notifications and lock-screen content avoid exposing sensitive information by default?
- [ ] Do error messages avoid revealing account existence or other sensitive details where that would create risk?
- [ ] Are trust signals factual, current, and free from unsupported security claims?

## 12. Consistency and design-system quality

- [ ] Do components with the same purpose share behavior, labels, spacing, and states?
- [ ] Are interactive states consistent: hover, focus, pressed, selected, disabled, loading, and error?
- [ ] Are headings, buttons, links, fields, icons, alerts, cards, and dialogs applied consistently?
- [ ] Do repeated patterns behave alike across routes and platforms?
- [ ] Are platform-specific differences intentional and documented?
- [ ] Are tokens and components used where expected, rather than one-off approximations?
- [ ] Are exceptions justified by user needs and not simply implementation drift?
- [ ] Are empty, error, and success patterns consistent without losing context-specific meaning?
- [ ] Do terminology and formatting conventions remain consistent across content?

## 13. Testing methodology and evidence

### Prepare
- [ ] Confirm scope, build, user groups, critical tasks, supported platforms, and applicable standards.
- [ ] Gather product requirements, design files, content guidance, known limitations, and analytics/research where available.
- [ ] Select representative devices, browsers, assistive technology, network conditions, and input modes.
- [ ] Use privacy-safe test accounts and non-production data unless explicitly authorized.
- [ ] Record the build identifier and environment so findings can be reproduced.

### Evaluate
- [ ] Walk through key tasks from entry point to completion, including likely detours and recovery.
- [ ] Perform exploratory review without a script to find unexpected friction and inconsistent behavior.
- [ ] Inspect relevant states, edge cases, and error recovery rather than only the happy path.
- [ ] Test keyboard and assistive technology workflows on applicable platforms.
- [ ] Compare implementation against intended designs and requirements while noting where the requirement itself is unclear.
- [ ] Separate observations (what happened) from interpretation (why it may matter) and recommendation (what to change).
- [ ] Reproduce issues at least once where feasible; record intermittent behavior as such.
- [ ] Avoid treating personal taste as a defect; connect each finding to user impact, evidence, a requirement, or a usability principle.

### Evidence to capture
- [ ] Route/screen, build, timestamp, platform, browser/OS, device, viewport, zoom, and input method.
- [ ] Preconditions, exact steps, expected result, actual result, and reproducibility.
- [ ] Screenshot, recording, console/network observation, or assistive-technology output as appropriate and privacy-safe.
- [ ] User/task impact and affected audience, including access needs.
- [ ] Whether the issue blocks completion, causes error, increases effort, or reduces trust.

**Research note:** An expert audit identifies risks and defects; it does not prove how often they occur or how users will behave. Validate uncertain or high-impact hypotheses with representative users when feasible.

## 14. Severity, reach, and prioritization

Rate severity based on the consequence to users, not how easy the issue is to fix. Consider frequency, affected audience, task importance, workarounds, and reversibility.

| Priority | Guidance | Typical response |
|---|---|---|
| **P0 — Critical** | A core or safety-critical task is impossible, data is at serious risk, or users face severe harm with no reasonable workaround. | Stop release or mitigate immediately; involve the accountable owner. |
| **P1 — High** | A common or important task is blocked or substantially impaired; a major accessibility or trust barrier affects meaningful use. | Resolve before release where possible; otherwise obtain explicit risk acceptance and a dated plan. |
| **P2 — Medium** | A task remains possible but causes notable confusion, effort, errors, or inconsistent behavior; a workaround exists. | Prioritize in the next planned iteration. |
| **P3 — Low** | Limited friction, cosmetic inconsistency, or a refinement with small impact and easy workaround. | Schedule as capacity allows; track recurring patterns. |

For each issue record:
- **Severity:** [P0 / P1 / P2 / P3]
- **Reach:** [How many users, which platforms or audience segments]
- **Frequency:** [Every time / common / occasional / unknown]
- **Task criticality:** [Core / important / optional]
- **Workaround:** [None / difficult / reasonable]
- **Confidence:** [Observed / reproduced / inferred / needs research]

## 15. Finding template

Copy this block for each finding.

### [ID] [Short, specific title]
- **Priority:** [P0–P3]
- **Area:** [Visual / interaction / usability / accessibility / responsive / navigation / content / forms / state / performance / privacy / consistency]
- **Location:** [Route, screen, component, or step]
- **Environment:** [Build, device, OS/browser, viewport, input method, assistive technology]
- **Audience / task affected:** [Who is affected and what they are trying to do]
- **Preconditions:** [Account state, data, permissions, network, etc.]
- **Steps to reproduce:**
  1. [Step]
  2. [Step]
- **Expected:** [What a person reasonably expects, based on requirement or convention]
- **Observed:** [What actually happens]
- **User impact:** [Consequence, friction, risk, or loss of confidence]
- **Evidence:** [Screenshot/recording reference, exact text, measurements, AT output]
- **Recommendation:** [Practical change that addresses the underlying issue]
- **Reach / frequency / workaround:** [Estimate or unknown]
- **Confidence:** [Observed / reproduced / inferred / needs research]
- **Owner / status:** [Owner, open/in progress/resolved/accepted]
- **Acceptance criteria:** [Observable conditions for closure]

## 16. Questions for ambiguous or unsolvable requirements

Ask only when the answer changes the intended behavior, acceptance decision, compliance obligation, or user risk. First check existing product requirements, design files, platform conventions, and known decisions.

### Clarify intent
- What user goal is this requirement intended to support?
- Which audience, task, or scenario takes precedence if needs conflict?
- What should happen when the user chooses [option] or does not act?
- Is this behavior required, preferred, or only an example?
- What is the expected result and how will success be measured?

### Resolve competing constraints
- Which requirement has priority when [constraint A] conflicts with [constraint B]?
- Is a simpler accessible alternative acceptable if the requested interaction cannot work on a target platform?
- Which platforms, browsers, input methods, languages, or assistive technologies are in scope?
- What is the fallback if the dependency, permission, network, or device capability is unavailable?
- Is the current limitation temporary, and who owns the decision and resolution date?

### Confirm policy and risk
- What data is necessary, why is it needed, and how long is it retained?
- Is consent required here, and can the user decline without losing unrelated functionality?
- What is the approved behavior for account recovery, identity verification, or sensitive actions?
- Which accessibility, legal, safety, or security standard governs acceptance?
- Who can accept residual risk, and what mitigation is required before release?

### If no definitive answer is available
- Record the exact ambiguity, options considered, affected users, and consequences.
- Mark the item **Not verified** or **Blocked on decision**; do not silently invent a requirement.
- Propose the least harmful, most reversible behavior consistent with known requirements and platform conventions.
- Identify the decision owner and a date or milestone for resolution.
- Escalate before sign-off if the uncertainty affects a core task, accessibility, safety, privacy, legal obligations, or irreversible action.

**Decision log:** [Question] · [Options] · [Decision owner] · [Decision/date] · [Impact on acceptance]

## 17. Acceptance criteria and closure

A finding is ready to close when all applicable conditions are met:

- [ ] The agreed behavior is implemented and matches the approved requirement or documented decision.
- [ ] The original reproduction steps no longer produce the issue on the affected platform and state.
- [ ] Related responsive, keyboard, touch, screen-reader, zoom, and error states have been checked as applicable.
- [ ] No entered data, focus, status feedback, or recovery path regressed in the affected flow.
- [ ] The change has been reviewed by the designated product/design/accessibility owner when required.
- [ ] Evidence is attached, and the finding status, owner, and resolution are recorded.
- [ ] Any remaining limitation has an explicit owner, rationale, mitigation, and target date; it is not marked fixed by assumption.

Project-specific acceptance thresholds:
- **Critical tasks that must pass:** [List]
- **Required platforms and assistive technology:** [List]
- **Applicable accessibility/security/privacy criteria:** [List]
- **Open issues permitted at release:** [Policy and approver]
- **Required research or validation:** [List]

## 18. Final audit summary and sign-off

### Summary
- **Overall assessment:** [Ready / Ready with accepted risks / Not ready / Incomplete]
- **Scope completed:** [Routes, flows, platforms, states]
- **Scope not completed and reason:** [Details]
- **Critical / high / medium / low findings:** [Counts]
- **Most important user risks:** [Top findings]
- **Positive patterns worth preserving:** [Examples]
- **Open decisions:** [Question, owner, due date]
- **Known limitations:** [Details]
- **Recommended next validation:** [User research, accessibility testing, platform checks, etc.]

### Sign-off

| Role | Name | Decision | Date | Notes / accepted risks |
|---|---|---|---|---|
| Design | [Name] | [Approve / conditional / decline] | [Date] | [Notes] |
| Product | [Name] | [Approve / conditional / decline] | [Date] | [Notes] |
| Engineering | [Name] | [Approve / conditional / decline] | [Date] | [Notes] |
| Accessibility / QA | [Name] | [Approve / conditional / decline] | [Date] | [Notes] |
| Risk / privacy owner, if applicable | [Name] | [Approve / conditional / decline] | [Date] | [Notes] |

**Final decision:** [Decision]  
**Decision owner:** [Name / role]  
**Conditions or follow-up date:** [Details]

---

## Quick pre-release sweep

- [ ] A new user can identify the product's purpose and begin a core task.
- [ ] Core tasks work end to end on required platforms and recover from common failures.
- [ ] Interactive elements provide clear feedback and have no misleading affordances.
- [ ] Keyboard and assistive-technology users can complete in-scope tasks.
- [ ] Layout and content remain usable at required viewport sizes and text scales.
- [ ] Forms explain requirements, preserve work, and make errors actionable.
- [ ] Empty, loading, success, error, permission, and offline states are covered.
- [ ] Privacy and security choices are understandable at the point of decision.
- [ ] High-impact findings are resolved or explicitly accepted by the right owner.
- [ ] Evidence, open questions, limitations, and final sign-off are recorded.
