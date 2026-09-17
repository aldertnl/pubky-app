# Awards: product graduation and Nexus migration proposal

Status: proposal, not an approved Nexus protocol or implementation commitment.
Recorded: 2026-09-17.
Start condition: the Arena awards MVP is approved for graduation into an actual product. Until then, keep the current Neon-backed MVP and collect product feedback.
Audience: Arena, Nexus, Pubky SDK/specification, and infrastructure maintainers.

## Decision recorded for the MVP

The current design is acceptable for the team trial. Neon is the authoritative award ledger; users' homeservers contain commands and copies of receipts and display choices. These are two representations, not an accounting double-entry ledger and not two independent validators.

A user can write a fabricated receipt to their own homeserver. Arena does not import arbitrary receipts as valid awards: it reads its validated ledger. Other applications must not treat the existence of a receipt file as evidence of valid issuance.

Receipts are not currently cryptographically signed. The durable `arena:<instance-id>` identifies the MVP service but is not a cryptographic public key. The migration must preserve that historical identity without presenting it as a signing key.

Images are bundled with Arena under `public/images/awards/`; they are not copied to users' homeservers. A receipt refers to a badge ID and definition version. User ownership of a receipt copy does not currently make its verification or rendering independent of Arena.

Local development and Vercel are intentionally configured to share Neon for the trial. Product graduation must explicitly revisit development/preview isolation; the trial arrangement is not the proposed production default.

## Current implementation and boundaries

| Concern | Current owner / behavior |
| --- | --- |
| Intent | User publishes `commands/<uuid>.json` in `/pub/pubky.app/awards/arena/v1/` |
| Command authorization | Arena fetches the exact record through resolved Pubky storage; checks owner-bound location, schema, ID and a 10-minute age window |
| Execution | `POST /api/awards` accepts `{user,id}`; someone else may trigger processing but cannot substitute an arbitrary command payload |
| Recognition validation | Arena checks source contribution ownership via Nexus and rejects self-recognition |
| Achievement validation | Arena queries bounded Nexus activity and computes eligibility |
| Durable state | Neon stores receipts, profiles/choices, processed command IDs and issuer metadata |
| Concurrency | Transactional per-actor row locking, weekly quota, duplicate constraints and expected recipient revision |
| Homeserver mirrors | Issuer receipt after recognition; recipient receipt after a choice or achievement check; revisioned choices and `display.json` |
| Recovery | Browser Dexie outbox records command/mirror stages; retry uses the same command identity |
| Reads | Arena snapshots include received/issued awards, choices, wearing state and weekly allowance |

Relevant code:

- `src/libs/awards/awards.ts`: schemas, badge IDs and definitions.
- `src/server/awards/verification.ts`: owner-bound command retrieval and eligibility checks.
- `src/server/awards/postgres.ts`, `postgres-schema.ts`, `store.ts`: ledger rules and storage boundary.
- `src/app/api/awards/route.ts`: present command/read API.
- `src/core/application/award/award.ts`: durable client retry stages.
- `src/core/services/award/award.ts`: homeserver publication and mirroring.

Stable IDs differ from some display names: `conversation-starter` displays as Catalyst and `changed-my-mind` as New Lens. Do not migrate by label or rename historical IDs accidentally.

## Proposed target architecture

Nexus should expose verified award queries and indexed recipient state. A single authoritative command processor must own policy enforcement and issuance. The Nexus team must decide whether that processor belongs inside Nexus or in a companion service operated with it. This document does not assume Nexus currently implements award ingestion, command execution, or these endpoints.

Proposed flow:

1. A user publishes authenticated intent on their homeserver.
2. Ingestion authenticates the record's owner and records a durable processing job. An optional submission endpoint can reduce index latency; it must perform the same validation.
3. The processor checks the referenced post, policy, duplicates and revisions, then commits the resulting event and command outcome atomically.
4. A transactional outbox publishes an attestation and updates the Nexus read model. Failures retry publication without reissuing.
5. Clients query Nexus, distinguish processing from rejection, and mirror/export user-owned records. A homeserver mirror failure does not reverse an already committed award.

Moving data into a Nexus index alone does not replace the current quota/authorization service. Eventually consistent replicas cannot independently enforce a global weekly budget without a designated authority or another agreed coordination protocol. Avoid implementing one quota ledger per Nexus replica.

`AwardStore` is an initial seam for server-side storage changes. A final Nexus API integration will also require changes to the API adapter, client service, schemas and recovery flow; it is not necessarily a drop-in database replacement.

## Trust and portable verification

There are three separate claims to represent:

1. **Issuer intent:** a particular account recognized a contribution.
2. **Policy attestation:** the recognized contribution and issuance satisfied a specified service policy, including any quota.
3. **Recipient choice:** the recipient received, hidden or chose to wear the award.

For portable receipts, propose a versioned signed envelope binding receipt ID, issuer, recipient, badge/definition version, contribution reference, reason, optional artifact, issuance time, policy version and evidence digest. Select canonical serialization, signing primitives, key discovery and verification with the SDK/security maintainers. Do not invent a custom cryptographic format as part of the UI feature.

For user recognition, a service signature attests that it observed authorized issuer intent; it is not the user's own signature. If direct user signatures are required, confirm the SDK/capability model can produce and verify them without exposing private keys to applications. For automatic achievements, a designated achievement authority signs the eligibility assertion.

Document key custody, rotation, compromise response, historical key validity and revocation/status discovery. A valid signature proves attribution and payload integrity, not human uniqueness, content quality, current visibility, or compliance with an independently enforced weekly quota. Those require separate policy/state checks.

Legacy MVP receipts must be marked as imported, service-verified historical records. An import attestation can sign their digest and migration provenance; it cannot retroactively create the original user's signature or turn the old Arena instance ID into a public key.

## Protocol and data model proposal

Agree on a product namespace and schema version before changing the existing Arena namespace. Continue reading legacy records through an explicit compatibility adapter.

| Entity | Minimum proposed fields / constraints |
| --- | --- |
| Definition | Stable ID, version, display copy, criteria/policy version, issuer class, artwork URI/hash/media type |
| Command | Owner, command ID, action, canonical payload digest, created time, ingestion time, expected revision where applicable |
| Command outcome | Unique owner/ID, payload digest, pending/committed/rejected status, structured reason, resulting receipt/revision |
| Receipt | Stable ID, issuer, recipient, definition reference, contribution, reason/artifact, issued time, evidence references, source provenance |
| Policy attestation | Receipt digest, authority/key ID, policy version, signature and status reference |
| Recipient state | Owner, monotonically increasing revision, choices and ordered worn receipt IDs |
| Quota entry | Issuer, UTC week, issuance ID; updated atomically with receipt issuance |
| Publication outbox | Event ID, payload reference, destination, attempt count, next attempt, completion state |
| Index projection | Recipient/issuer/post indexes, pagination cursors, revision/watermark and deletion/status state |

Required invariants, unless product explicitly changes them:

- 3 recognitions per issuer per UTC calendar week, resetting Monday 00:00 UTC; no self-awards.
- No repeated badge by the same issuer for the same contribution, including across weeks.
- Achievements earned once per authority/user/badge policy; no inactivity expiry or recognition quota consumption.
- Up to 3 worn, visible, owned receipts with distinct badge designs.
- Only the recipient changes visibility/display; stale revisions cannot overwrite newer choices.
- Same owner/command ID and same payload returns the recorded outcome. Same identity with a changed payload is rejected.
- A committed award is not reissued because a client timed out, the index lagged, or a mirror failed.

Keep historical quota timestamps and duplicate keys on import. Decide whether new badge-definition versions permit re-earning; never let a definition update accidentally reset earned state.

## API and client contract to agree

Endpoint names are intentionally unspecified until agreed with Nexus maintainers. Required operations:

- Submit/trigger processing of an owner-bound command and query its outcome.
- Cursor-paginated awards by recipient, issuer and contribution, with explicit visibility/status filters.
- Recipient choices, worn badges and revision.
- Recognition allowance/reset time from the authoritative policy processor.
- Achievement check status and evidence completeness; index lag must not be represented as definitive ineligibility.
- Definition and verification-key discovery, and any revocation/moderation status lookup.

Use structured outcomes such as processing, committed, expired, stale revision, quota exhausted, invalid intent and temporarily unavailable. Retry temporary failures with bounded backoff. For expired uncommitted intent or stale choices, request a fresh user-authorized command rather than silently changing an existing signed/published payload. Return an operation ID/watermark so clients can display pending state until reads catch up.

Replace the current 1,000-record snapshot cap with pagination and explicit counts. Acceptance/display updates should provide read-your-write behavior or a visible pending revision rather than flickering between projections.

## Product and operations decisions before implementation

- **Public visibility:** distinguish public storage from UI filtering. Decide visibility of pending/hidden awards, reasons and notifications. Hiding a card does not make its public record private.
- **Deletion and revocation:** currently deleting a homeserver copy does not delete the ledger award. Specify separate meanings for deleting a copy, withdrawing issuer intent, recipient hiding, moderation hiding and authority revocation. Decide retained quota history and audit retention.
- **Source edits/deletion:** decide whether evidence is a historical assertion or continuously re-evaluated. Avoid storing unnecessary personal content just to preserve evidence.
- **Artwork portability:** choose versioned shared assets or content-addressed assets with availability guarantees; optional homeserver copies are a separate decision. Verify content hashes, media limits and safe rendering. Do not fetch arbitrary artifact URLs as trusted media.
- **Abuse:** quotas are per key, not per human. Define rate limits, resource budgets, replay handling, moderation and cross-account farming expectations.
- **Achievement completeness:** the MVP scans bounded recent activity. Decide historical backfill, progress reporting and incremental evaluation when Nexus indexes more evidence.
- **Infrastructure:** durable queue/outbox, backups and restore drills, retention, database migrations, capacity limits, monitoring and ownership of incidents.

## Delivery plan and gates

### Phase 0 — graduation decision and contract review

Product approves the feature and its visibility/deletion rules. Nexus, SDK/spec and security maintainers agree on command processing ownership, trust model, namespace and schema. Record an ADR and threat model. Exit: owners and visibility criteria signed off; no production migration yet.

### Phase 1 — protocol and reference verification

Publish versioned schemas, canonicalization/signature test vectors if signing is selected, and a verifier. Include forged recipient copies, altered payloads, replay, expired intent and rotated/compromised keys. Exit: interoperable verification and an explicit legacy policy.

### Phase 2 — processor and index in isolation

Implement transactional rules, command outcomes, outbox, read projections and APIs in a dedicated test environment. Exercise concurrent requests through multiple instances against real PostgreSQL; PGlite/unit tests alone do not prove distributed locking. Exit: invariants, crash recovery and load targets pass.

### Phase 3 — backfill and shadow reads

Export the Neon ledger with a migration manifest, schema version, counts and digests. Include receipts, issuer metadata, original timestamps, profile revisions, choices/worn order and command outcomes. The MVP stores completed command IDs but not a frozen digest of every original command: preserve replay protection and mark that provenance limit instead of inventing missing proof.

Import idempotently. Use the verified ledger as the historical source; do not accept arbitrary homeserver receipt files. Preserve automatic receipt IDs and the legacy issuer mapping. Compare individual records, read ordering, profiles, counts, quotas and duplicate prevention, not only row totals.

Run Nexus shadow queries while Neon remains the sole writer. Mirror/index discrepancies are reported, not silently repaired by trusting the less authoritative copy. Exit: parity and acceptable processing/index latency over an agreed observation period.

### Phase 4 — controlled cutover

1. Take verified backups and record the rollback procedure.
2. Pause issuance and recipient mutations; drain in-flight commands and define treatment of pending browser outboxes.
3. Import the final delta, including current-week quota and recently processed IDs; verify digests and revisions.
4. Fence the old writer before enabling the new one. Changing a frontend environment variable alone does not stop old deployments or clients from writing.
5. Route old and new clients through a compatible gateway or require an upgrade; retained pending commands must resolve against the new outcome store.
6. Switch reads/writes, resume operations and run dedicated-account smoke checks. Track processing failures, lag and mirror backlog.

Exit: one authoritative writer, preserved records and successful user journeys. Do not enable independent dual writes.

### Phase 5 — stabilization and retirement

Keep Neon read-only for an agreed rollback window and compare production metrics with the pre-cutover baseline. Once received, remove the Arena-specific command/verification implementation and retire Neon according to retention policy. Keep only client integration and any explicitly retained achievement issuer service.

Before new writes occur, rollback can restore the old routing. After Nexus accepts writes, rollback requires fencing it and reconciling all new receipts, choices, quotas and processed IDs back to Neon before re-enabling the old writer. Never roll back by simply pointing clients at the stale snapshot. Define who owns the reverse migration before cutover.

## Graduation visibility checklist

- Forged homeserver receipts, changed command payloads and unauthorized recipient changes cannot create valid awards.
- Concurrent issuance, weekly boundaries, replay and conflicting recipient revisions preserve invariants across instances.
- Offline clients, expired commands, interrupted publication and delayed indexing recover without duplicate issuance or lost choices.
- Historical receipts, issuer provenance, definitions, quota history and worn order survive migration.
- Dedicated users can give, receive, hide, restore, wear/remove and inspect awards across Arena and the target product.
- Visibility, deletion, revocation, artwork availability and pending-notification behavior match approved product policy.
- Restore and post-cutover rollback are rehearsed; operational ownership and measurable service targets are documented.

No implementation work in Nexus, remote schema changes or deployment is authorized by this proposal itself.


## Product decision update: automatic receipt and reversible hiding

The approved follow-up removes the acceptance step. Awards are visible on receipt. Only wearing is opt-in. Hide removes an award from the public collection and profile, but preserves issuance. Owners can find it in HIDDEN and choose Show in awards without automatically wearing it. Hidden notifications are excluded; viewed notifications remain accessible.

The Nexus target must keep a monotonic owner-bound seen-ID set separate from visibility and wearing. Counts/New indicators reflect unseen visible receipts. Seen events must be idempotent, merge across devices, and must not invalidate a concurrent choice revision. Include this state in backfill and rollback. Legacy accepted/dismissed records normalize to visible/hidden; previously handled receipts initialize as seen. Hiding is presentation control, not a promise to delete public data.


### Notification dismissal (follow-up product decision)

Notification cards have an explicit top-right ×, styled like the sidebar header icon buttons. Closing a notification is separate from Hide: it persists in `dismissedNotifications`, marks that receipt seen, and does not alter collection visibility, worn IDs or choice revision. Details is the first action; opening Details or viewing the card does not close it automatically. Hidden awards are also excluded from notifications. The closed-notification set must be preserved across refreshes, devices, storage migration and future Nexus backfill. Owner-authorized `dismiss-notification` commands are idempotent and mirrored under `notifications/<command-id>.json`. Notification wording is “You received award [name] from [issuer].”
