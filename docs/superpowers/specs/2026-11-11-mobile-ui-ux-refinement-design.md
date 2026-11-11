# UCB-HRMS mobile UI/UX refinement

Status: proposed for approval on 2026-11-11.

## Intent

Improve the complete employee mobile experience without rebuilding the app. Preserve the existing Expo React Native architecture, QR-only device linking, API contracts, screen navigation, security behavior and employee feature set. Rename the installed app to **UCB-HRMS** and use the platform provider's current favicon as the installed app icon for every new native release.

## Selected approach

Refine the existing application in place. Strengthen the shared `mobile/src/ui.tsx` components and tokens first, then apply the resulting patterns to `App.tsx`, onboarding, Home and every existing service screen. Keep the current five bottom destinations and the current in-memory screen selection instead of introducing a navigation framework.

Two alternatives were rejected:

- A full navigation and component-system rebuild would add dependencies and regression risk without improving the existing employee capabilities.
- A cosmetic-only colour and spacing pass would leave the current loading, recovery, form, accessibility and information-hierarchy problems unresolved.

## Product and visual direction

- Keep the established HRMS identity and adapt its **Salary Passbook** visual language for a phone: warm paper background, bank-blue structure, ruled separators, aligned financial figures and restrained status colours.
- Brand expression stays quiet and operational. Employee tasks remain more prominent than decoration.
- Use one spacing, type, colour, radius and touch-target scale through shared tokens. Remove screen-level raw colours and repeated one-off layout values where a shared role exists.
- Keep the current light appearance for this refinement. Dark mode, tablet-specific navigation and a new animation system are outside this change.
- Preserve organisation branding after device linking. The platform favicon brands launch, setup and the installed icon; the employee's organisation name and logo remain visible inside the authenticated app.

## Release-time platform favicon

- Add a mobile build preparation script that reads the fixed `EXPO_PUBLIC_API_BASE_URL` and downloads `GET /assets/platform/favicon` from that origin before native assets are generated.
- Accept only HTTPS origins. For the fixed UAT origin, trust only the checked-in UAT public certificate already used by the Android network-security plugin. Do not disable TLS verification globally.
- Enforce the platform favicon size limit, validate the returned image type and decode it before use. Normalize the source into a square high-resolution PNG suitable for Expo launcher and splash generation using the image utility already present in the Expo toolchain.
- Write the normalized image to an ignored generated-asset path. Log the source origin and SHA-256 digest without logging credentials or response data.
- Fail the native release build when the favicon cannot be downloaded, decoded or normalized. Do not silently publish with a stale icon.
- Wire the preparation step into the documented local UAT build and the EAS build lifecycle before prebuild/native asset generation. Tests must prove that the configured icon path resolves to the generated asset during a release build.
- Rename the Expo display name to `UCB-HRMS`. Keep the existing package identifier, slug and device-link identity so installed UAT upgrades and server sessions remain compatible.
- A favicon change affects only newly compiled APK/IPA releases. It cannot modify the icon of an already-installed build without an app update.

## Shared UI refinement

### Screen structure

- Retain `Page`, `Card`, `Action`, `Field`, `Loading`, `Empty` and `ErrorText`, improving their implementation rather than replacing every caller.
- Add only the small shared primitives repeatedly needed across screens: a screen heading, status treatment, structured list row and state panel/skeleton.
- Use safe areas and keyboard-aware layouts so fields and primary actions remain reachable with the keyboard open.
- Keep content width bounded on large windows while making phone layouts use the available width without cramped two-column controls.

### Loading and feedback

- Native splash and session restoration use the generated platform icon, **UCB-HRMS** name, concise security-oriented copy and a calm progress treatment.
- Screen data uses lightweight skeleton placeholders shaped like the incoming content. Avoid replacing an entire page with a spinner.
- Mutations show loading only on the control being used, disable duplicate submission and preserve the rest of the page.
- Empty states explain what is absent and, where the employee can act, provide the relevant action.
- Error states use plain language, retain useful server messages, and provide retry when the failed operation is repeatable.
- Success feedback is visible after submissions such as leave, claims, policy acknowledgement and password changes; it must not rely only on data disappearing or a page refresh.

### Controls and accessibility

- All interactive controls meet a 48 dp Android target and at least 44 pt on iOS, with visible pressed and disabled states.
- Preserve accessibility roles and add labels, selected/expanded state and concise hints where visible text is insufficient.
- Support system text scaling without clipping important controls or financial values.
- Keep semantic colour contrast sufficient and never rely on colour alone for status.
- Use native alerts only for decisions or failures that must interrupt. Use inline feedback for ordinary validation and recoverable errors.

## Screen-by-screen refinement

### App shell and bottom navigation

- Keep Home, Payslips, Leave, Time and More as the five top-level destinations.
- Replace the current narrow text-only navigation with a broader, full-width bottom dock that uses the available screen width and respects the device safe area. It must not appear as a small floating capsule or a compressed centre-aligned strip.
- Give every destination a clear, consistent icon. Keep labels minimal: the active destination shows its short label, while inactive destinations may be icon-led when accessibility labels remain available to screen readers.
- Make selection immediately recognizable through a restrained active background, icon treatment and label transition rather than colour alone. Nested More screens continue to select More.
- Add responsive pressed feedback and a short native-feeling selection transition. Motion must not delay navigation and must respect reduced-motion preferences.
- Distribute the five targets evenly, retain at least 48 dp touch areas and prevent long translations or large system text from overlapping adjacent actions.
- Keep the dock visually connected to the app shell with a subtle top boundary/elevation. Avoid excessive glass effects, oversized floating buttons or decorative movement that competes with employee tasks.
- The authenticated header gives organisation and employee context without consuming excessive vertical space. Long bank and employee names wrap or truncate predictably.
- Preserve Android predictive Back behavior and avoid custom gesture interception.

### QR onboarding

- Present the three steps clearly: open the portal, scan the QR and approve the displayed code.
- Give camera permission, scanning, submitting, waiting, expired and retry states distinct layouts and copy.
- Keep the verification code prominent and readable, with its organisation and expiry context.
- Preserve the existing security protocol and API polling behavior exactly.

### Home

- Prioritize today's work state and the two most common actions: time entry and leave request.
- Present leave balances as scannable values rather than sentence rows.
- Keep payslips, claims and policy as secondary quick access.
- Loading or failure of leave balances must not block the rest of Home.

### Payslips

- Show pay period and status first, then gross, deductions and net pay in aligned ledger rows.
- Make net pay the visual result and keep PDF sharing as the single row action.
- Preserve whole-rupee display and approved/paid-only behavior.

### Leave

- Separate request entry, balances and request history with a clear reading order.
- Make the selected leave type unambiguous and improve date-field guidance and validation.
- Show request status, dates and fractional days consistently; withdrawal remains available only for pending requests.

### Time

- Make today's open/completed state clear before presenting check-in or check-out.
- Prevent the unavailable action from looking active when the current entry state is known.
- Improve month navigation and render entries as consistent rows with correction information disclosed secondarily.

### Policies

- Distinguish acknowledgement-required and acknowledged states using text and status treatment.
- Improve policy-body readability and keep the confirmation sequence explicit.
- Present acknowledgement history as dated rows instead of undifferentiated text.

### Calendar

- Preserve the existing month grid while improving tap-free readability, today treatment, event legend and event list hierarchy.
- Holidays, leave and time entries use symbols plus labels so colour is never the only signal.
- Month controls remain reachable at large text sizes.

### Workplace

- Retain bank → branch → department → role grouping.
- Improve hierarchy, person-row scanning and handling of long departments/roles without exposing extra employee data.
- Avoid decoding every full-resolution logo or illustration inside repeated rows.

### Reimbursement claims

- Give the submission form a clear field order, receipt state and validation summary.
- Display claim amount, date and status prominently in history; reasons, payment reference and receipt actions remain secondary.
- Show submission success and prevent duplicate submission while uploading.

### Profile and More

- Turn More into a clean service list with descriptions and consistent row targets rather than a stack of secondary buttons.
- Structure profile identity, organisation context, password change, version and sign-out as separate groups.
- Keep password-change security behavior and device revocation unchanged.
- Keep the versioning on center and bold and low opacity.
- Below the versioning keep the watermark of Power By banihal and Banihal banner logo (Small size Low Opacity seted)

## Performance and implementation constraints

- Do not add a navigation framework, state-management library or general component library.
- Reuse Expo and React Native platform capabilities already installed. Add a direct dependency only when an existing transitive Expo image utility must be made explicit for deterministic build-time favicon normalization.
- Avoid new full-screen bitmap artwork. Resize existing illustrations for their rendered dimensions and do not decode release-sized icons in small in-app slots.
- Confidential employee data remains in memory; no new offline cache, analytics, logging or persistence is introduced.
- No backend, database, payroll, authorisation or API-contract change is part of this refinement.

## Verification

- Unit checks cover favicon origin validation, download failure, content-size/type validation, normalization and generated-asset selection.
- Existing mobile API, QR, session, receipt and validation tests remain green; TypeScript type checking and version consistency pass.
- Export Android and iOS bundles, then build the UAT APK and inspect its display name, package identifier, version, launcher icon, splash resources and embedded UAT origin.
- On Android hardware or an emulator, inspect onboarding, session loading, Home and every feature screen at normal and 1.3× font scale, including loading, empty, error, success and disabled states.
- Check camera denial/recovery, long names, long policy text, multiple leave balances, large workplace trees and claims with/without payment details.
- iOS source/bundle checks are required locally; simulator/device visual verification requires an available macOS/iOS environment and signing setup.

## Acceptance criteria

- The installed name is exactly **UCB-HRMS**.
- The displayed and packaged application version uses numeric **nn.nn.nn** form only, with no prerelease or other label, across web and mobile surfaces.
- Every release build fetches and validates the current platform favicon; a failed fetch stops the build.
- The installed icon and splash use that fetched favicon, while authenticated screens continue to use organisation branding.
- All existing employee capabilities and QR linking behavior remain available with the same authorization boundaries.
- Loading, empty, error, success and disabled states are consistent and actionable across the app.
- The bottom navigation spans the usable screen width, provides icons for all five destinations, uses minimal labelling and gives immediate pressed and selected feedback without reducing accessibility.
- Core tasks remain usable with system text scaling and platform touch-target requirements.
- No employee data, security control or payroll behavior is weakened or moved to the client.

## Remaining implementation choices

- Exact semantic token values and skeleton geometry will be resolved against the current app on the first implementation pass.
- Android visual/device verification will use whichever connected device or emulator is available; unavailable device classes will be reported rather than inferred.
