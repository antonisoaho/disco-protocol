# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Disc Golf Social ("Disc Protocol") — a mobile-first PWA built with React 19 + Vite 8 + TypeScript 6, backed by Firebase (Auth + Firestore). See `docs/architecture.md` for detailed design.

### Standard commands

All dev commands are in `package.json`:

- **Dev server:** `npm run dev` (Vite on `localhost:5173`)
- **Lint:** `npm run lint` (ESLint flat config)
- **Test:** `npm run test` (Vitest; 22 suites, ~89 tests; Firestore emulator tests auto-skip when `FIRESTORE_EMULATOR_HOST` is unset)
- **Build:** `npm run build` (`tsc -b && vite build`)
- **Verify:** `npm run verify:doctor` (react-doctor score > 95, zero major findings)
- **Full CI equivalent:** `npm run verify:doctor && npm run lint && npm run test && npm run build`

### Environment variables

The app requires `VITE_FIREBASE_*` env vars. For CI checks (lint, test, build), **placeholder values work** — `vitest.config.ts` injects its own placeholders for tests, and CI uses fallback placeholders for builds. For actually running the app with working Firebase Auth/Firestore, real values must be in `.env.local` (copy from `.env.example`).

### Gotchas

- **`vite-plugin-pwa` peer dep warnings:** The PWA plugin may lag behind Vite majors. Use `npm install --legacy-peer-deps` if peer conflicts arise during install. This does not affect runtime behavior.
- **Firestore emulator tests are skipped by default.** The test file `firestore.users.rules.emu.test.ts` uses `describe.skip` when `FIRESTORE_EMULATOR_HOST` is not set. This is expected and does not indicate a test failure.
- **Build chunk size warning:** The production build emits a warning about chunks > 500 kB. This is a known informational warning and does not fail the build.
- **No `.nvmrc`:** The repo has no pinned Node version. CI uses `lts/*`. Node 22 works.
- **Worker/worktree workflow:** Substantive code changes follow the issue → worktree → PR flow described in `.cursorrules`. The planner workspace (default clone) is for planning/orchestration only.
