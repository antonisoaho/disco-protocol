# Course template normalization (round completion)

This document describes how **user-supplied par and length** (when official template data is missing) flow into **normalized templates**, aligned with `docs/architecture.md` §3.4 and the Firestore sketch in §4.

## Data placement

- **Template** documents under `courses/{courseId}/templates/{templateId}` store authoritative `holes[]` with `par`, optional `lengthMeters`, and `notes`.
- **Rounds** (`rounds/{roundId}`) store `holeOverrides`: a map keyed by hole number string (`"1"`, `"2"`, …) with optional `par` and `lengthMeters` for holes where the template did not supply enough data during play.

## During play

1. The player picks a `courseId` and `templateId`.
2. For each hole, if the template row lacks `par` or `lengthMeters`, the client prompts and writes the missing fields into `rounds.{roundId}.holeOverrides[holeNumber]` (Firestore `update` with shallow merge on the map key).
3. The active scorecard reads merged data via `mergeTemplateWithOverrides` in `src/courses/mergeTemplateWithOverrides.ts` so strokes vs par always use an effective par.

## On round completion

1. Set `status: 'completed'` and `completedAt` on the round (Scoring epic owns the full transition; Course epic defines the contract).
2. If `isMergeComplete(template, holeOverrides, holeCount)` is true, the client **may** create a new template document:
   - `source: 'derived'`
   - `holes`: output of `mergeTemplateWithOverrides`
   - `derivedFromRoundId`: the completed round id
   - `label`: e.g. `Derived from round …` or user-edited later
3. **Deduplication and moderation** (merging duplicates, hiding bad crowd rows) are intentionally out of scope here; a later Cloud Function or admin workflow can fold `derived` templates into `official` or mark superseded templates.

## Admin-only canonical edits

Deleting a course, renaming canonical fields (`name`, `slug`, `organization`, `geo`), or destructive template operations reserved for admins are enforced in `firestore.rules` using the Firebase Auth custom claim `admin: true`.
