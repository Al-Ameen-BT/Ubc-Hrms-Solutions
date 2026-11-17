# Task 13 implementer report

## Scope

Implemented the employee mobile workplace chart and access-change recovery from the approved Task 13 brief. The chart consumes `/me/chart`, keeps only the server's work-identity allowlist, separates Head Office leadership from the employee's current branch, loads private photographs with the device bearer token, and adds no management or vacancy interface.

Access-version or device-revocation responses now skip token refresh, clear SecureStore before leaving the authenticated shell, and return the employee to QR-only linking with a neutral re-link explanation. Linked operational users are accepted only after the server-issued mobile identity and `/me/context` confirm an active employee link; client role text is not an identity authority.

The parent approved the necessary additions to `mobile/App.tsx` and `mobile/src/screens/Auth.tsx`, because those files own the authenticated-to-QR transition and QR screen. `mobile/src/ui.tsx` did not need a change; the existing `Card`, `Notice`, `Empty`, and typography tokens covered the surface without a new abstraction.

## RED evidence

After adding the Task 13 tests, `npm test` from `mobile/` was first blocked in the managed sandbox because `tsx` could not create `/tmp/tsx-1000/68.pipe` (`listen EPERM`). The same command was rerun with the narrow approved `npm test` escalation.

The escalated RED run failed six checks for the intended missing behavior:

- `ACCESS_CHANGED` attempted one access-token renewal instead of zero.
- `parseEmployeeChart` and `employeeChartSections` were absent.
- `ACCESS_RELINK_MESSAGE` was absent.
- the workplace still used `/me/workplace` without authenticated photographs.
- App/Auth had no re-link notice path.

## GREEN evidence

- `npm test` in `mobile/`: 38/38 tests passed.
- `npm run typecheck` in `mobile/`: exited 0. The sandbox printed three stream-FD permission warnings before TypeScript completed.
- `npm run version:check` at repository root: exited 0; application version `0.2.2` is consistent.
- `git diff --check`: exited 0.

The tests cover:

- no retry of a revoked access token and awaited session-ending cleanup;
- credential deletion before QR re-link recovery;
- linked operational employee acceptance and unlinked-context rejection;
- chart work-identity allowlisting and removal of unexpected pay/contact fields;
- same-origin private photo references;
- own-branch and Head Office sectioning that drops unrelated branches;
- long, wrapping names, authenticated photo headers, accessible photo labels, and absence of management/vacancy controls.

## Design and runtime verification boundaries

This is an adaptive Expo React Native surface. The Impeccable native guidance says its HTML/CSS detector does not apply, so no manual detector was run. Automatic edit hooks produced no actionable native finding. No Android/iOS emulator, physical-device capture, dark-mode, large-text, or runtime network flow was available in this task; Task 14 retains those checks.

The server already issues mobile sessions only to active, uniquely linked employees and PERMISSIONS mode gives every linked operational user the protected own-record baseline. A remaining cross-task compatibility boundary is that legacy `/me/*` route allowlists still name only the legacy `EMPLOYEE` role. Thus a linked operational user in a tenant that has not activated PERMISSIONS mode may link successfully but receive a self-service 403. This task did not broaden backend legacy route semantics; final verification/review must decide that compatibility fix before release.

## Files

- `mobile/App.tsx`
- `mobile/src/api.ts`
- `mobile/src/screens/Auth.tsx`
- `mobile/src/screens/Services.tsx`
- `mobile/src/session.ts`
- `mobile/tests/api.test.mjs`
- `mobile/tests/deviceSession.test.mjs`
- `mobile/tests/presentation.test.mjs`
- this report
