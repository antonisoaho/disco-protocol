# Master Architecture — Disc Golf Social (Mobile-First PWA)

This document is the **single source of truth** for technical direction. **Planners** maintain it; **Workers** implement against it in git worktrees (`scripts/agent_worker.py`).

## 1. Product summary

A **mobile-first** social web application for disc golf: users log **hole-by-hole** rounds with timestamps and course context, see activity from people they follow, play **shared rounds** that sync to every participant’s dashboard, and contribute **crowdsourced course templates** (par/length) that normalize into reusable layouts. **Analytics** cover head-to-head, strokes vs par, and hole-level comparisons. **Admins** are the only actors who may delete or rename canonical course records.

## 2. Technical stack

| Layer | Choice |
|--------|--------|
| App shell | React 19 + TypeScript + Vite |
| Backend | Firebase Authentication, Cloud Firestore, Firebase Hosting |
| Offline | Service Worker (PWA): cache shell + queue writes for scoring where safe |
| Styling | SCSS, **BEM** naming (`.block__element--modifier`), tokens in `src/styles/_variables.scss` |
| Collaboration | Git **worktrees** per issue; branch `issue/<N>` |

## 3. Core domain rules

### 3.1 Users and social graph

- Each authenticated user has a profile document (display name, avatar, optional bio, privacy flags).
- **Following** is directional: `followerId` follows `followeeId`. Denormalize follower counts only if needed for read performance; source of truth is edge documents or subcollections (Worker decision with Planner review).
- **Timeline**: default feed is rounds from users the current user follows, ordered by round start or last activity (Worker defines pagination and indexes).

### 3.2 Rounds

- A **round** belongs to one **course template** snapshot (see courses) and one **layout** instance (hole count, order, tees if modeled).
- **Hole-by-hole** data: per hole store strokes, par at time of play (denormalized from template), optional lie/notes; **timestamps** per hole update or round-level `startedAt` / `completedAt`.
- **Visibility**: public to followers, private, or unlisted (exact enum is a Worker deliverable; must support timeline queries).

### 3.3 Shared rounds

- Multiple **registered** users in the same round reference the same `roundId` (or shared session id that merges into one round document set).
- **Automatic appearance**: when user A adds user B as a participant with B’s consent (or join flow), updates propagate so the round appears on **each participant’s** dashboard/history without manual duplication.
- **Concurrency**: Firestore transactions or batched writes for hole updates; conflict policy (last-write vs operational transform) is an implementation detail documented in the Scoring epic.

### 3.4 Courses and templates

- **Course** is a logical entity (name, location, organization). **Template** holds normalized holes: number, par, length (optional), notes.
- If official data is missing, users may enter **par/length** during play; on **completion**, the system proposes or saves a **normalized template** (Planner-approved rules for deduplication and moderation).
- **Admin-only**: delete course, rename canonical course fields, or merge duplicates. Enforce via **Custom Claims** + Security Rules.

### 3.5 Analytics

- **Head-to-head**: win/loss/ties filtered to rounds where both users participated (same event or overlapping course/day—Worker defines matching rules).
- **± par**: aggregate and trends per user, per course template, date range.
- **Hole-by-hole**: compare average strokes vs par per hole for two users or vs field (expensive queries → precomputed aggregates or Cloud Functions).

### 3.6 Score protocol (v1 baseline)

- Every round stores a **score protocol envelope**: `scoreProtocolVersion` + `holeCount` + `holeScores`.
- `holeScores` remains a map keyed by canonical decimal hole strings (`"1"`, `"2"`, ...). Each hole entry must include integer `strokes` and integer `par` snapshot.
- **Invariants (v1)**: supported version only (`1`), `holeCount` in allowed range, hole keys normalize to positive integers, no duplicate keys after normalization (`"1"` and `"01"` may not coexist), hole numbers cannot exceed `holeCount`, strokes/par must stay in configured numeric bounds.
- Aggregation is protocol-driven: totals (`strokes`, `par`, `delta`) and missing-hole detection derive from normalized protocol data only (not UI assumptions).
- **Extensibility rule**: future protocol changes are additive through explicit version bumps (`scoreProtocolVersion = 2+`) with dedicated normalization/validation adapters; clients must reject unknown versions until migration logic is implemented.

## 4. Firestore data model (initial sketch)

Names are indicative; Workers normalize to consistent `camelCase` and collection IDs.

**`users/{userId}`** — profile, settings, `role: 'user' | 'admin'` (or admin via custom claims only).

**`follows/{followerId_followeeId}`** or subcollection — `followerId`, `followeeId`, `createdAt`.

**`courses/{courseId}`** — canonical name, slug, geo, `createdBy`, `adminMetadata`. Subcollection **`templates/{templateId}`** — holes array or `holes/{holeNumber}` docs.

**`rounds/{roundId}`** — `ownerId`, `courseId`, `templateId`, `participantIds[]` (registered UIDs + stable `anon:*` ids), optional `anonymousParticipants[]` (`id`, `displayName`), `visibility`, `startedAt`, `completedAt`, `holeScores` map or subcollection `holes/{n}`.

**`roundEvents/{eventId}`** (optional) — append-only audit for shared sync troubleshooting.

Security rules must enforce: only participants and owner mutate scores; only admins mutate canonical course delete/rename; reads respect visibility and blocks.

## 5. Authentication and authorization

- Email/password, OAuth providers as needed (Worker).
- **Admin**: Firebase Auth custom claims `admin: true`; Firestore rules gate destructive course operations. No admin UI in main workspace until Auth + Course epics allow.

## 6. PWA and offline scoring

- **Service Worker** (Vite PWA plugin or Workbox—Worker choice): precache app shell; runtime cache for static assets.
- **Offline scoring**: queue hole updates locally (IndexedDB or Firestore persistence); sync when online. Document conflict handling in Scoring epic.
- **Manifest**: name, icons, `display`, theme color aligned with `src/styles/_variables.scss`.

## 7. UI architecture

- **Mobile-first** breakpoints use tokens in `_variables.scss` and mixins in `_mixins.scss`.
- **BEM** for components: e.g. `.scorecard`, `.scorecard__row`, `.scorecard__cell--birdie`.
- **Score colors**: use semantic map `eagle | birdie | par | bogey | double-bogey-plus` (see `_variables.scss`); never hard-code score hues in TSX.

## 8. Delivery process

1. Planner breaks work into GitHub Issues (epics below).
2. Worker: `python3 scripts/agent_worker.py <N>`.
3. Before opening a PR: `git fetch origin` and **`git rebase origin/main`** (or merge `origin/main` if the team disallows rebase); then push and open PR from `issue/<N>`; CI must pass on the updated branch.
4. Merge → `python3 scripts/cleanup.py <N>`.

By default the **Planner** uses GitHub CLI to **review**, **fix** if needed, and **merge** when checks and criteria are satisfied—**without** requiring a formal GitHub PR approval step—unless repository policy blocks merge (see `.cursorrules`).

## 9. Epic backlog (GitHub Issues)

| # | Epic |
|---|------|
| [1](https://github.com/antonisoaho/disc-protocol/issues/1) | Scaffolding — Firebase shell, PWA, mobile-first baseline |
| [2](https://github.com/antonisoaho/disc-protocol/issues/2) | Authentication & user profiles |
| [3](https://github.com/antonisoaho/disc-protocol/issues/3) | Course engine, templates & admin-only course ops |
| [4](https://github.com/antonisoaho/disc-protocol/issues/4) | Scoring engine, shared rounds & offline scoring |
| [5](https://github.com/antonisoaho/disc-protocol/issues/5) | Social graph & following timeline |
| [6](https://github.com/antonisoaho/disc-protocol/issues/6) | Analytics — H2H, ± par, hole-by-hole |

Admin behavior is implemented inside the **Course** epic unless split later.

---

*Version: initial orchestration pass — Workers refine collections and indexes with Planner approval.*
