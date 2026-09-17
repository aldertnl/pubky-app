# Arena awards MVP

Seven transparent PNG designs are integrated into the actual Arena application.

**MVP decision (2026-09-17):** keep the Neon-authoritative ledger and homeserver copies for the trial. These are not double-entry accounting or independently signed credentials. User-written receipt files alone cannot create valid Arena awards. Artwork is bundled with Arena, not stored on users’ homeservers. Revisit this architecture after approval for product inclusion; see the [technical Nexus migration and graduation proposal](arena-awards-nexus-plan.md).

- Arena toolbar → **Awards**: discover the seven badges, inspect criteria, open the collection, check activity.
- Another author's post menu → **Recognize**: select one of four user badges, write a reason (10–500 characters), and optionally provide an HTTP(S) artifact URL for Built on This.
- Profile notifications: Wear on profile / Unwear / Hide. Awards are received automatically. New indicators and unread counts clear after an award card is actually viewed, independently of wearing or hiding. Viewed notifications remain available; hidden awards do not appear there.
- Profile identity row: up to three distinct chosen designs aligned right of the status emoji. Hover for the name; tap for details. Nothing is added to author cards or People nodes.
- Details show source, issuer, explanation, source contribution, artifact link, date, criteria and recipient status. Visitors see visible awards in the collection. Hidden records remain publicly readable at the storage/API level; hiding controls presentation, not storage privacy.

`ARENA AWARDED` is deliberately used instead of `PUBKY AWARDED`: this service is not an official Pubky issuer.

## Rules

| Badge                | Awarding  | Evidence                                                                                                                                                                         |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contender            | Automatic | 3 original posts excluding replies, reposts and collections; 3 replies; `counts.tagged >= 3` (tags applied, not tags received).                                                  |
| Catalyst             | Automatic | One original post with direct replies from 5 distinct other public keys.                                                                                                         |
| Explorer             | Automatic | Replies in 5 distinct root conversations with 5 distinct normalized topic tags. Maximum matching assigns one topic per conversation; a single thread with 5 tags cannot qualify. |
| Made It Click        | User      | Source contribution + explanation.                                                                                                                                               |
| New Lens             | User      | Source contribution + explanation.                                                                                                                                               |
| Good Sport           | User      | Source contribution + explanation.                                                                                                                                               |
| Built on This        | User      | Source contribution + explanation; optional resulting artifact link.                                                                                                                     |

3 user recognitions per issuer per calendar week, Monday 00:00 UTC through Sunday. No self-awards, no repeated badge on the same contribution, no refund on hiding. Automatic badges are earned once, never expire through inactivity, and do not consume the weekly budget. Repeated user recognitions remain separate receipts; a design can only be worn once.

Automatic verification runs when an authenticated user visits Arena and is eligible for another check; also available from the gallery. Check cooldown: 15 minutes. This is a bounded pilot: latest 25 author candidates and 25 replies, up to 10 original-post reply streams (50 keys each), up to 15 reply ancestry walks (8 levels maximum), under a 60-second Nexus deadline. Missing older evidence is not proof of ineligibility; the UI says so. A failed check does not fabricate an award. These milestones measure public-key activity, not unique human identity or content quality.

## Storage and authorization

Client flow: UI → hook → AwardController → AwardApplication → AwardService / AwardModel. A dedicated `arena-awards-v1` Dexie database stores the last snapshot and one pending command per account; it does not reset the app's existing cache database.

User-owned homeserver namespace: `/pub/pubky.app/awards/arena/v1/`.

- `commands/<uuid>.json`: versioned exact intent (recognize, choose, check, seen), with timestamp and ID.
- `issued/<receipt-id>.json`: issuer's copy of the Arena-verified user receipt.
- `received/<receipt-id>.json`: recipient's copy after responding, or after an automatic award check.
- `responses/<zero-padded-revision>.json`: revisioned recipient choices (files remain owner-writable) and ordered worn IDs.
- `seen/<command-id>.json`: owner-published sets of viewed receipt IDs; union these records for homeserver read state. Neon stores the authoritative monotonic seen set.
- `display.json`: latest display convenience pointer. When reading independently, prefer the highest response revision; concurrent homeserver mirrors can finish out of order.

The existing `/pub/pubky.app/:rw` capability covers this namespace. There are no generic tag writes.

`POST /api/awards` accepts only `{user,id}`. The service fetches the exact command from that user's resolved Pubky homeserver, validates its version, ID, age and schema, then verifies source ownership/eligibility. A supplied API payload, `source` flag, copied receipt, or generic tag cannot issue an award. Completing a public command can be triggered by another reader, but can only execute the exact intent the owner published. Completed IDs are idempotent. Recipient mutations require an expected revision; stale commands cannot override newer choices.

The PostgreSQL ledger (or SQLite fallback) atomically enforces quota, duplicate prevention, ownership, distinct worn designs, and recipient revision updates. The service generates automatic receipts under its durable `arena:<instance-id>` identity. The ledger freezes issuance evidence; later source deletion or issuer edits do not revoke that historical receipt. Do not describe these as portable signed credentials: homeserver authentication and the authoritative online ledger are the MVP trust model. Other Vibes must adopt and verify this protocol explicitly.

A command is persisted locally before IO. Publication failures retain the command for retry. Once registered, a failed homeserver mirror retries without reissuing the award and fetches the latest recipient state. Only one local request may be pending per account. Retries republish the same command ID and intent with a fresh publication timestamp, so the ten-minute verification window does not strand an offline request; server idempotency and quota remain authoritative if an earlier attempt completed. Clearing a local request does not revoke an issued award. Rejected recognition commands stay public on the homeserver until the owner removes them.

## Run and deployment

Use Node 24 (native `node:sqlite`) and the app's existing runtime network configuration:

```sh
npm run dev:webpack -- --hostname 127.0.0.1 --port 3003
```

Local development currently uses the shared Neon connection. SQLite fallback/backup: `.arena/awards.sqlite` (ignored by Git). Keep the database and its WAL/SHM sidecars on the same durable volume and back them up together using a SQLite-aware backup mechanism. Losing the ledger loses issuer identity, verification history, quota history, and the notification index; homeserver copies alone do not reconstruct trust automatically.

For Vercel, connect Neon with the custom prefix `ARENA_AWARDS` and set the server-only `ARENA_AWARDS_DATABASE_URL` to its pooled Postgres connection URL. Production and Preview may share the database for this team trial. Never use a `NEXT_PUBLIC_` prefix. Tables initialize automatically. The API uses transactions and a per-user row lock for quotas, choices and command retries across function instances. PostgreSQL connection failures return a recoverable 503; they never fall back to SQLite.

Without `ARENA_AWARDS_DATABASE_URL`, development uses SQLite. A persistent single-host production deployment can still set an absolute `ARENA_AWARDS_DB` path. Vercel without a Postgres URL fails closed because its filesystem is temporary.

### Import existing local awards before deployment

1. Pause award writes and back up SQLite with its backup mechanism.
2. Securely provide `ARENA_AWARDS_DATABASE_URL` in the local environment (do not paste it in chat or commit it).
3. With Node 24, run `node scripts/migrate-awards-to-postgres.mjs .arena/awards.sqlite` from the app directory.
4. The import is transactional, leaves SQLite unchanged, and refuses a target containing awards, profiles or commands. It preserves issuer identity, receipts, choices, quota history and completed commands.
5. Deploy after migration, then verify the collection, recipient acceptance and a recognition round trip. Do not run the new backend before migration: cached issuer identity must match the imported identity.

If starting fresh, skip the import. Homeserver copies are not automatically imported into this ledger. Deleting a homeserver copy does not erase its ledger entry.

Local PostgreSQL tests use PGlite. Live Neon connection, concurrent-instance locking, and deployment verification remain separate acceptance checks.

Other pilot limits: pull notifications (60-second polling), up to 1,000 received and issued receipts per snapshot, no push notifications, no signed/offline credential verification, no moderation/revocation console, no historical full-graph backfill, and no cross-Vibe adoption. These require a follow-up before a broad production launch.

## Validation

- Ledger tests: weekly boundaries, idempotency, duplicates, automatic issuance, recipient ownership, stale revisions, dismissal, worn selection, artifact URLs, topic matching.
- Verification tests: owner-bound homeserver proof, expiry/version/ID checks, source author validation, no self-awards, activity evidence and tag direction.
- Application tests: local persistence before IO, interrupted publication, mirror recovery, duplicate request protection.
- UI tests: seven designs, source labels, notifications/actions, worn badges, visitor permissions.
- Browser visual tests: desktop and mobile gallery, recognition form, and actual ProfilePageHeader with three badges; aligned right of status, no horizontal overflow.
- Live signed-in homeserver publishing still requires an end-to-end run with a dedicated test identity. Automated tests use mocked external IO and local SQLite/IndexedDB; they do not give awards to real people.


## Receiving, hiding and read-state migration

Awards require no acceptance. Default/unset choices are visible. Owner actions are Wear on profile, Unwear, Hide, and Show in awards. Hiding removes the award from the worn list; restoring does not wear it automatically. My awards includes an owner-only HIDDEN section below visible awards, with an eye-slash card indicator. Public collections, profile badges and visible notifications exclude hidden awards.

The idempotent `visibility-v2` ledger migration maps accepted to visible and dismissed to hidden, preserves profile revisions and worn IDs, and seeds seen IDs from existing explicit choices to avoid re-notifying previously handled awards. Legacy queued choose commands remain readable and normalize on application. Previously pending awards become visible and unread.

A new owner-bound `seen` command records up to 5 receipt IDs per request. It validates ownership and unions IDs atomically without changing recipient choice revision. Viewing a card for at least 500 ms at 50% visibility marks it read; loading an off-screen collection does not. Read receipts use the existing durable retry queue and are mirrored separately from choices. Read state has no effect on wearing or hiding.


### Notification dismissal (follow-up product decision)

Notification cards have an explicit top-right ×, styled like the sidebar header icon buttons. Closing a notification is separate from Hide: it persists in `dismissedNotifications`, marks that receipt seen, and does not alter collection visibility, worn IDs or choice revision. Details is the first action; opening Details or viewing the card does not close it automatically. Hidden awards are also excluded from notifications. The closed-notification set must be preserved across refreshes, devices, storage migration and future Nexus backfill. Owner-authorized `dismiss-notification` commands are idempotent and mirrored under `notifications/<command-id>.json`. Notification wording is “You received award [name] from [issuer].”


Sync recovery is silent and periodic (at most one retry per account per minute while active). No inline sync error/banner or retry panel is shown. After 3 consecutive sync failures, one standard warning toast is shown; further retries continue without repeated warnings until a success resets the counter. Unsaved validation errors can still show an immediate toast. Notification dismissal remains independent of this recovery behavior.
