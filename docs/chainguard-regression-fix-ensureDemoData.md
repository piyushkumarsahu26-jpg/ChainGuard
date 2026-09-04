# ChainGuard — Regression Fix Report
## `ensureDemoData is not defined` on Live GPS "Start Simulation"

## Root cause

Confirmed by direct inspection, not assumed: `TransportMonitoring.jsx` called `ensureDemoData()` inside `startSimulation()`, but the function's *definition* did not exist anywhere in the file.

This was a genuine regression I introduced during **Integration Sprint 2**. That sprint moved the GPS simulation loop from the frontend to the backend, which required rewriting a large block of `TransportMonitoring.jsx` — `stopSimulation`, `startSimulation`, `pauseSimulation`, `resumeSimulation`, and the client-driven interval logic between them. That rewrite was done as a single line-range replacement (lines 318–555 of the file at the time). `ensureDemoData()` — added earlier, in the Transport-module hotfix sprint, immediately before that same block — sat inside the range that got replaced. The replacement correctly preserved every *call* to `ensureDemoData()` inside the new `startSimulation()`, but the function's own definition was not part of the new content written in, so it was deleted along with the old simulation loop it used to sit next to.

This is exactly the failure mode a large blind block-replacement risks, and it went undetected at the time because **a production build does not catch it**: `ensureDemoData` is a plain runtime identifier reference, not an import or an export, so esbuild/Rollup have no reason to flag it — the error only surfaces when that specific line of code actually executes in a browser. My verification at the end of Integration Sprint 2 was a syntax check plus a production build, both of which passed cleanly despite the bug being present. That gap in verification method, not just the missing function, is addressed below.

## Fix

Restored `ensureDemoData()` exactly as documented in `docs/chainguard-transport-demo-hotfix-report.md` — the same three fields it always checked (envelope, vehicle, route), the same demo values, the same "create via existing endpoint only if missing" behavior, the same state updates. Nothing about its logic was changed or redesigned; it was reconstructed from the hotfix report's own detailed documentation of its behavior, not reinvented. It's placed back in its original position, immediately before `stopSimulation`.

No other function was touched. `startSimulation()` itself — rewritten in Integration Sprint 2 to call the backend's auto-simulation instead of running its own loop — is unchanged by this fix; it already called `ensureDemoData()` correctly, it just had nothing to call.

## Files modified

- `frontend/src/pages/TransportMonitoring.jsx` — `ensureDemoData()` restored. No other file needed a change; the bug was entirely self-contained to this one missing function definition.

## Verification performed

- **Confirmed the exact root cause directly**: grepped the file for `ensureDemoData` before making any change, found exactly one reference (the call) and zero definitions.
- **Cross-checked the correct field values against the hotfix sprint's own documentation** (`docs/chainguard-transport-demo-hotfix-report.md`) rather than reconstructing from memory alone — the demo envelope/vehicle/route values restored here match that report's own recorded description exactly.
- After the fix, confirmed exactly one definition and one call, correctly ordered (definition before the call site, so the closure resolves correctly by the time a click triggers `startSimulation`).
- Syntax-checked the file.
- **A stronger check than last time, specifically because a build alone missed this bug**: ran a targeted `no-undef` lint pass (ESLint, JSX-aware, no project config needed for this diagnostic) — first verified the check genuinely catches this class of error at all, by running it against a deliberately broken test file and confirming it reported the expected error; then ran it clean against `TransportMonitoring.jsx` and found zero problems.
- **Extended that same check to every page modified in Integration Sprints 2 and 3** (Dashboard, Live Monitoring, Security Command Center, Analytics, Envelope Scanner, Envelope Details, QR Verification, Reports, Navbar) — all clean. One flagged line in `QRVerification.jsx` was confirmed to be a harmless false positive (an `eslint-disable-line` comment referencing a plugin rule this minimal diagnostic config doesn't have loaded, not a real undefined-variable bug) — checked the actual line directly to confirm this before dismissing it.
- Full production frontend build: 2855 modules, zero errors (unchanged count — this was an edit to an existing file, not a new one).
- Full backend test suite re-run: 40/40 passing, confirming this was an isolated frontend bug with no backend involvement, as expected (nothing on the backend changed).

**What "verify the button works" could and could not mean here, stated plainly**: I have not clicked the button in a running browser. This sandbox cannot run the real backend against a live database — `prisma generate` is blocked by this environment's network allowlist, the same disclosed restriction that has applied to every backend verification in this project since Phase 1, so a full `npm run dev` click-through was not possible here either, independent of this specific bug. What I have done is confirm, as directly as this environment allows: the exact missing piece, restored with verified-correct content, no longer missing; a tool that specifically detects this class of error, proven to work, finding nothing wrong; and every other page touched by the same sprint that introduced this bug checked the same way, not just the one that was reported.

## Remaining limitations

- **The specific bug reported — `ensureDemoData is not defined` on "Start Simulation" — is fixed and independently verified via the no-undef check described above.** A live, in-browser click-through has not been performed, for the sandbox reason stated above, not because it was skipped.
- **This verification pass did not include every frontend file in the project** — it covered the pages actually modified during Integration Sprints 2 and 3 (the sprints capable of having introduced this specific regression), not the full frontend tree. If a similar large block-replacement happens in a future sprint, the same no-undef check is worth running again on whatever was touched.
- **No permanent ESLint configuration was added to the project.** The check used here was a temporary, ad-hoc diagnostic (`npx eslint` with an inline config, no plugins), not a new project dependency or config file — consistent with "do not redesign the GPS module" and "repair using the existing architecture." Adding a real, permanent lint step to this project's own tooling would be a reasonable, separate improvement if wanted, but is a build-tooling decision beyond the scope of this specific bug fix.
