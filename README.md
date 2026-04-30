# disco-protocol

**Mobile-first disc golf social web app** (React + Vite, Firebase, PWA). Product direction and data design live in **`docs/architecture.md`**. The **Planner** works in the main clone; **Workers** implement in **git worktrees** (see `.cursorrules`).

## Prerequisites

- **Git** and GitHub remote **`origin`**
- **GitHub CLI**: [https://cli.github.com](https://cli.github.com) — `gh auth login`
- **Python 3.10+** (stdlib only for orchestration scripts)
- **Node.js** + npm (see `package.json`)

## Workflow

```text
Plan → Issue → Worktree → PR → Review → Merge → Cleanup
```

1. **Plan** — Planner breaks work into issues with acceptance criteria (no feature code in main workspace per `.cursorrules`).
2. **Issue** — Track on GitHub (`orchestrator.py` or `gh`).
3. **Worktree** — `python3 scripts/agent_worker.py <N>` → `../worktrees/issue-<N>/`, branch `issue/<N>`.
4. **PR** — Push and open a pull request.
5. **Review / merge** — CI and code review.
6. **Cleanup** — `python3 scripts/cleanup.py <N>` after the PR is merged.

All orchestration docs and comments are in **English**.

## Firebase Hosting (merge to `main`)

Merging into **`main`** or **`master`** runs **`.github/workflows/firebase-hosting-merge.yml`**, which builds the app and deploys **`firebase deploy --only hosting`**. Enable **Hosting** for your Firebase project in the [console](https://console.firebase.google.com) before the first deploy succeeds.

**Secrets:** **`FIREBASE_SERVICE_ACCOUNT`** (full service account JSON with Hosting deploy permission) is **required**; the workflow exits with an error if it is missing or empty. The build step uses the same **`VITE_*`** variables as **CI** (see below); unset values use placeholders so the job still runs.

Default Firebase project id in **`.firebaserc`** is **`disco-protocol`**. If your real project id differs (for example **`disc-protocol`**), change **`default`** there—never commit **`.env.local`** or service account JSON.

**Local:** `npm run deploy:hosting` (runs `build` then Hosting deploy; requires `firebase login` or compatible credentials).

## GitHub Actions secrets (CI and Hosting)

**CI** (`.github/workflows/ci.yml`) and **Hosting deploy** read these optional **`VITE_*`** repository secrets; when missing, the build uses placeholders so forks without secrets still pass.

| Secret | Purpose |
|--------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain (e.g. `project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | GCP / Firebase project id |
| `VITE_FIREBASE_STORAGE_BUCKET` | Default storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender id |
| `VITE_FIREBASE_APP_ID` | Firebase web app id |

**Hosting only:** `FIREBASE_SERVICE_ACCOUNT` — JSON key for deploy (never commit this file).

**CLI** (trusted machine; values from `.env.local`, not committed):

```bash
gh secret set VITE_FIREBASE_API_KEY --body "your-api-key"
gh secret set VITE_FIREBASE_AUTH_DOMAIN --body "your-project.firebaseapp.com"
gh secret set VITE_FIREBASE_PROJECT_ID --body "your-project-id"
gh secret set VITE_FIREBASE_STORAGE_BUCKET --body "your-project.appspot.com"
gh secret set VITE_FIREBASE_MESSAGING_SENDER_ID --body "123456789012"
gh secret set VITE_FIREBASE_APP_ID --body "1:123:web:abc"
gh secret set FIREBASE_SERVICE_ACCOUNT < path/to/serviceAccount.json
```

**GitHub UI:** Repository **Settings → Secrets and variables → Actions**. Names are case-sensitive.

## Scripts

| Script | Purpose |
|--------|---------|
| `orchestrator.py` | `gh` helper: `create`, `list`, `show`, `track` |
| `scripts/agent_worker.py` | New worktree + branch for issue **N** |
| `scripts/cleanup.py` | Remove worktree + local branch after merge (`--force` skips `gh` check) |

### Examples

```bash
python3 orchestrator.py create --title "Task" --body "Acceptance: …"
python3 orchestrator.py track

python3 scripts/agent_worker.py 12
cd ../worktrees/issue-12

python3 scripts/cleanup.py 12
```

- Worktree path: `<parent-of-repo>/worktrees/issue-<N>/`
- Branch: `issue/<N>`

## Styling

- **SCSS** under `src/styles/`: `_variables.scss` (semantic **score** colors), `_mixins.scss`, `main.scss`
- **BEM** for UI components (`.block__element--modifier`)

## Firebase (local)

Copy [`.env.example`](.env.example) to **`.env.local`** and paste your Firebase web config (`VITE_*` keys). Vite only exposes variables prefixed with `VITE_`. The file is gitignored (`*.local`, `.env`, `.env.local`).

### Authentication

- **Primary sign-in:** email / password (Firebase Auth). OAuth providers can be enabled later in the Firebase console and wired in the client.
- **Profiles:** on first successful sign-in, the app creates `users/{uid}` in Firestore with `displayName`, `photoUrl`, `bio`, and `createdAt` (see `src/firebase/userProfile.ts`).
- **Security rules:** [`firestore.rules`](firestore.rules) restrict `users/{userId}` to the signed-in owner. Deploy with `firebase deploy --only firestore:rules` after `firebase login` and project selection.

### Admin (custom claims)

Course and moderation epics will require **admin** privileges. Grant out-of-band with the Firebase Admin SDK (backend script or Cloud Function), for example: `admin.auth().setCustomUserClaims(uid, { admin: true })`. In Firestore rules, check `request.auth.token.admin == true` for admin-only operations. No admin UI is included in this repo yet.

## Application commands

```bash
npm ci
npm run dev
npm run build
npm run lint
npm run deploy:hosting   # build + Firebase Hosting (needs Firebase auth)
```
