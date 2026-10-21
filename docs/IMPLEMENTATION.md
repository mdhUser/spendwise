# MVP implementation ledger

Specification: the approved SpendWise AI four-week plan in this conversation.

- Existing implementation: Next.js pages, PostgreSQL schema, anonymous invitation access, catalog comparison, model extraction adapter, user items, snapshots and feedback.
- Remaining: regression tests, database migrations, runtime fixes, browser verification, maintenance docs, dependency audit and final review.
- Ruling: resume the existing checkout on `feat/spendwise-mvp` rather than copy unfinished files to a new checkout. This preserves the user's requested repository location; no concurrent implementation is running.
- Ruling: keep explicitly labeled fictional fixtures until an operator supplies verified quotes. No real shopping data or provider credentials have been supplied; public launch remains gated on them.
- Ruling: use the installed PostgreSQL binary for local verification because Docker is not running. Docker Compose remains the deployment artifact.
- Baseline: TypeScript passes; ESLint identified a plain internal anchor and anonymous config export. No tests or migration files existed before resumption.

## Acceptance checklist

- [x] 50 deterministic calculation/validation/form cases pass
- [x] Successful migration and 36-item demo seed
- [x] Invite, ownership, CRUD, feedback, model fallback, daily/global limits, expiry cascade and atomic CSV import exercised
- [x] 22 desktop/mobile browser/API tests pass; screenshots inspected
- [x] Build, lint, typecheck pass; production audit zero findings; full audit retains five high findings in the ESLint glob/braces chain
- [x] Backup restored to spendwise_restore; all 36 offers present
- [x] Operations documented; real provider/catalog/public deployment/user study remain external prerequisites

## Review and fixes

- Fixed: refined-schema omission crashed manual-item validation; separate shared fields from category/unit refinement. Regression reproduced and passed.
- Fixed: partial schema defaults overwrote previous needs; patch schemas now contain no implicit defaults. Regression reproduced and passed.
- Fixed: untouched form fields overrode natural-language updates; only edited controls override a nonempty request.
- Fixed: paper-layer filters eliminated detergent candidates; apply layers only to paper. Regression RED → GREEN.
- Fixed and browser-tested: preserve complete draft needs through clarification, independently of a recommendation snapshot.
- Follow-up resolved: history now returns the newest 100 messages in chronological order; regression first reproduced oldest-message behavior.
- Follow-up resolved: additions lock the conversation row and atomically check the 10-item cap. A test-only delayed insert reproduced three concurrent requests incorrectly exceeding the limit; after the fix only one succeeds from nine existing items.
- Regraded Important: model-accepted layer values 1/6/7/8 must remain representable in the form. Browser regression reproduced a reset to empty; all 1–8 options now exist and desktop/mobile regression tests pass.
- Ruling: update vulnerable Prisma tooling/client together to 7.10.1 and use its PostgreSQL adapter, retaining the same database schema. Cost if incompatible: integration regressions; migration, seed and API tests must pass before delivery.

- Fixed: demo mode was frozen at build time. Build with demo off + start with demo on reproduced missing warning; page is now dynamically rendered.

- Fixed: operator scripts required an on-disk .env despite Docker providing environment variables. A no-.env subprocess test failed first; changed scripts to Node's optional env-file loading.
- Review declined items accepted as prerequisites, not completed claims: real provider accuracy/cost, verified catalog quality, public hosting and 10-user/30-session field trial.

## Delivery evidence (2026-10-21)

- `npm test`: 50/50 pass.
- `npm run test:e2e`: 22/22 pass across desktop and emulated iPhone viewport, including CSV atomicity, model budgets, expired records and privacy checks. Mobile checks use Chromium emulation, not a physical iOS/Safari device.
- `npm run lint`, `npm run typecheck`, optimized production build: pass.
- `npm audit --omit=dev`: 0 known vulnerabilities. Full audit: 5 high findings in development-only ESLint/fast-glob/micromatch/braces chain; no compatible patched braces release in the audit's recommendations. Do not apply the suggested downgrade to Next 14 blindly.
- Migration and seed verified with Prisma 7.10.1; backup restored into a separate database with 36 offers.
- `docker compose config --quiet`: pass. Docker was started for follow-up validation. Image build remained at Docker Hub metadata retrieval; Compose startup is not claimed tested. Standalone production server is exercised locally.
- Native engine postinstall download initially failed with ECONNRESET. Dependencies were recovered with scripts skipped, then `prisma generate`, migration, seed, build and all tests explicitly executed successfully.
- Local standalone preview bound to loopback on port 3000; development PostgreSQL on port 55432.
- No public deployment, provider charge, user invitation message or real purchase performed.
