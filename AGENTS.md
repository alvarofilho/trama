# Trama project instructions

These instructions apply to the entire repository. More specific `AGENTS.md` files may add rules for their own subtree, but must not weaken these guardrails.

## Preserve the architecture

- Keep the Angular/Tauri boundary explicit: UI and presentation belong in `apps/desktop/src/app`; reusable application, domain, and adapter code belongs in `apps/desktop/src/core`; native commands belong in `apps/desktop/src-tauri`.
- Preserve working Tauri, SQLite, Git, and agent behavior during UI work.
- Do not replace real native integrations with mocks outside tests.
- Keep filesystem values unchanged in the domain. Clean or shorten paths only in presentation code.

## Command execution guardrails

- Never run tests or builds without the user's explicit permission.
- This includes test runners, build scripts, compilation commands, and validation commands that execute tests or builds, whether run directly or through another script or tool.
- Ask for permission immediately before running any test or build command; permission from an earlier request or turn does not carry forward.

## Angular component guardrails

- Never use inline templates (`template`) or inline styles (`styles`) in Angular components.
- Every component must have four colocated files with the same basename: `.ts`, `.html`, `.scss`, and `.spec.ts`.
- Component metadata must use `templateUrl` and `styleUrl` (or `styleUrls` when the component has additional external styles), always referencing the colocated `.html` and `.scss` files.
- Generate components with the Angular CLI defaults from `apps/desktop/angular.json`.
- Never pass `--inline-template`, `--inline-style`, or `--skip-tests` when generating components.
- Use standalone components, Angular Signals, and the existing Signal Forms approach.
