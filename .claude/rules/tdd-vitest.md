# Vitest TDD Workflow

**Applies when:** editing `src/**/*.{ts,tsx}` for behavior changes.

- For behavior changes in `src`, follow Red -> Green -> Refactor.
- Write or adjust a Vitest test first and confirm it fails for the expected reason.
- Only then implement the minimal production change to make that test pass.
- Run the focused test while iterating, then run the full suite before finishing.
- Before claiming completion, run and verify `npm run lint`, `npm run test`, and `npm run build`.
- Keep tests deterministic and behavior-focused.
- This mirrors the repository skill patterns for `test-driven-development` and `verification-before-completion`.

**Cursor equivalent:** `.cursor/rules/tdd-vitest.mdc` — keep this file aligned when the workflow changes.
