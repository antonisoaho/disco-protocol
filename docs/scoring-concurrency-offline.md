# Scoring: concurrency and offline behavior

This note satisfies the Scoring epic (#4) requirements for **documented** conflict handling and offline limitations. Product rules remain in `docs/architecture.md` §3.2–3.3 and §6.

## Concurrency (shared rounds)

- **Hole scores** are stored on the round document under `holeScores` (map keyed by hole number).
- Clients apply changes with **`runTransaction`**: read the round, merge one hole entry (`strokes`, `par`, `updatedAt`, `updatedBy`), write back.
- **Conflict policy**: **last-write-wins per hole** at transaction commit time. If two participants edit the **same** hole concurrently, Firestore serializes transactions; the later commit wins for that hole’s fields. There is no operational transform for numeric strokes.
- **Different holes** can be updated in parallel without user-visible conflicts because each transaction merges its hole key only (other keys are copied from the read snapshot).
- **Participant list changes** use `arrayUnion` from the owner; rules allow `participantIds` updates **only** from `ownerId` so invite/join cannot be forged by non-owners.

## Offline (PWA + Firestore)

- The web client enables **Firestore persistent local cache** by default (`IndexedDB`, multi-tab manager) so listeners and queued writes survive refresh and short offline periods.
- While offline, **listeners** serve cached snapshots; **writes** (create round, transaction hole save, `arrayUnion` participant) are queued and sent when connectivity returns.
- **Limitations**: offline queues can still fail after reconnect if **security rules** or **schema validation** reject the write; the user may need to retry. **Transactions** that conflict heavily will retry automatically up to Firestore limits; extreme contention can surface as a client error.
- Opt out of persistence for debugging or special environments: set `VITE_FIRESTORE_PERSISTENCE=false` in `.env.local`.

## Visibility and rules

- **Private / unlisted**: reads are limited to **participants** (same rule shape today).
- **Public**: any **signed-in** user may read the round document (feeds restricted to followers are deferred to the social epic #5).
