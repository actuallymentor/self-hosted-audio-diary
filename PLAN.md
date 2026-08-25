# SHAD One-Run Implementation Plan

## Outcome

Build and verify the complete self-hosted multimedia diary described in
[`IDEA.md`](./IDEA.md) in one uninterrupted implementation run.

The run is complete only when the production Docker Compose stack starts from
empty volumes, the core flows pass through a real browser, the configured local
speech model transcribes real English and Dutch audio, recovery behavior is
proven, and the release workflow is internally consistent.

The archive remains the product. SQLite, search, transcripts, summaries, and AI
outputs enhance ordinary files; they never become the only copy of canonical
diary content.

## Preflight: human input required

Resolve these before the implementation run. They change live acceptance or
deployment and have no safe universal answer.

1. **Deployment hardware** — CPU architecture/core count, RAM, NVIDIA GPU model,
   VRAM, and NVIDIA Container Toolkit availability. Default without an answer:
   CPU-only, `faster-whisper` `small`, INT8, `linux/amd64` and `linux/arm64` app
   images in CI; local verification builds only the host-native architecture.
2. **Language behavior** — whether one recording commonly switches between
   English and Dutch. Default: automatic language selection per recording;
   separate English and Dutch acceptance fixtures.
3. **OpenRouter** — exact model and whether Zero Data Retention-only routing is
   mandatory. Default: no model guess; fail preflight if live reflection testing
   is requested without a configured model and funded key.
4. **TTS** — provider, API base URL, model, and voice. Default: ship the provider
   interface disabled; TTS is not a core-run blocker when explicitly deferred.
5. **Production origin** — exact external HTTPS URL. Default for local tests:
   `http://127.0.0.1:3000`.
6. **Docker Hub** — namespace/repository and whether both app and transcription
   images should publish. Default: publish both images after credentials exist.
7. **Device gate** — access to one real iPhone running Safari and one Android
   phone running Chrome, or device-cloud credentials. Desktop emulation cannot
   prove mobile recording lifecycle behavior. Android may reach the local secure
   context through `adb reverse`; iPhone requires a real trusted TLS origin such
   as the production reverse proxy or Tailscale Serve. A LAN-IP HTTP URL cannot
   exercise microphone, service-worker, install, or wake-lock behavior.
8. **Model provisioning** — whether the pinned transcription model may download
   on first start or must be bundled for an offline deployment. Default: download
   once into a persistent cache, and prewarm that cache during verification.

The invitation flow, deletion behavior, backend, database, transcript edits,
and filesystem names use the conservative defaults below. They do not need a
separate decision.

## Credentials and external setup

Create `.env` from the generated `.env.example`. Never commit `.env`.

```dotenv
# Bind mounts on the Docker host
APP_DATA_PATH=./runtime/app
DIARY_DATA_PATH=./runtime/diary
APP_UID=10001
APP_GID=10001

# Public application boundary
APP_ORIGIN=http://127.0.0.1:3000
TRUST_PROXY=false

# Local speech-to-text
TRANSCRIPTION_BACKEND=faster-whisper
TRANSCRIPTION_URL=http://transcription:8000/v1
TRANSCRIPTION_MODEL=small
TRANSCRIPTION_MODEL_REVISION=<pinned-revision>
TRANSCRIPTION_DEVICE=cpu
TRANSCRIPTION_COMPUTE_TYPE=int8
TRANSCRIPTION_LANGUAGE=auto
HF_TOKEN=

# Reflection
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
OPENROUTER_ZDR_ONLY=true
OPENROUTER_SITE_URL=

# Optional text-to-speech
TTS_PROVIDER=disabled
TTS_API_BASE_URL=
TTS_API_KEY=
TTS_MODEL=
TTS_VOICE=

# Live verification switches
RUN_OPENROUTER_TESTS=false
RUN_TTS_TESTS=false
```

Local `.env` cannot configure hosted GitHub Actions. Add these in the GitHub
repository settings before exercising image publication:

- Actions variable `DOCKERHUB_IMAGE`, for example `owner/shad`.
- Actions secret `DOCKERHUB_USERNAME`.
- Actions secret `DOCKERHUB_TOKEN`; use a scoped access token, not a password.
- A second image name variable if the transcription image publishes separately.

The repository remote is already
`git@github.com:actuallymentor/self-hosted-audio-diary.git`. Add `.ssh_key.pub` as
a write-enabled deploy key at the repository's **Settings → Deploy keys** page.
The private `.ssh_key` is mode `0600`, ignored by Git, and must not be copied to
`.env` or GitHub.

After the key is added, verify access without changing global SSH configuration:

```bash
GIT_SSH_COMMAND='ssh -i /workspace/.ssh_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' \
    git ls-remote origin
```

Do not push until the human explicitly requests a push.

## Definition of done

- `./scripts/verify` performs preflight, production image builds, Compose startup,
  migrations, tests, browser journeys, recovery checks, artifact collection, and
  teardown in one command.
- The app remains usable when OpenRouter, TTS, or transcription is unavailable.
- An offline recording survives closing and reopening the installed PWA, then
  synchronizes exactly once when connectivity returns.
- A finalized recording is playable, searchable after transcription, and stored
  as an ordinary media file with ordinary transcript and metadata files.
- Two users cannot read, mutate, enumerate, or infer each other's diary data.
- Deleting the application database and rebuilding it from the diary archive
  loses almost no diary content.
- App-data and diary-data mounts are independently configurable and may be on
  different filesystems.
- Version in `package.json`, API, UI, OCI labels, Git tag, and Docker tag agrees.
- All automated gates pass; real iPhone/Android checks are recorded before a
  production release.

## Fixed technology choices

### Application

- Node.js 24 LTS, pinned in `.nvmrc` and container base image.
- Plain ESM JavaScript; no TypeScript.
- One root `package.json`; its `version` is canonical.
- Fastify 5 for HTTP/API/static delivery.
- React and Vite for the client.
- `better-sqlite3` with SQLite FTS5. Node 24's built-in `node:sqlite` remains a
  release-candidate API, so it is not the boring choice yet.
- `argon2` using Argon2id for passwords.
- `mentie` for logging/helpers; inspect its installed exports before use.
- `zod` schemas shared at HTTP and provider boundaries.

### Client

- `react-router` `BrowserRouter`.
- `use-query-params` for shareable filters/date/search state.
- Zustand only for state consumed concurrently by multiple components.
- Dexie over IndexedDB for durable recordings, chunks, operations, and migrations.
- `styled-components`, `react-hot-toast`, and `less-lazy`.
- `vite-plugin-pwa` with an injected service worker and explicit update UI.

### Speech and media

- A separate `faster-whisper` HTTP container behind an engine-neutral,
  OpenAI-style transcription contract.
- CPU default: `small` with INT8. NVIDIA quality default after hardware approval:
  `large-v3-turbo` with float16.
- Optional alternative: Parakeet TDT 0.6B v3 through NeMo-Speech.cpp, using the
  same external contract.
- FFmpeg/ffprobe for validation and derived 16 kHz mono FLAC transcription input.
  Preserve the browser's original recording unchanged as canonical media.
- No transcription credential for public models; `HF_TOKEN` stays optional.

### Testing

- Node's built-in test runner for focused unit/integration tests.
- Puppeteer plus installed Google Chrome for real browser E2E and PWA testing.
- A pinned official Puppeteer/Chrome `test_runner` service in
  `compose.test.yaml`, so browser gates are Docker/CI-identical rather than
  dependent on host browser packages.
- Chrome native fake microphone input from licensed WAV fixtures. Never replace
  `MediaRecorder` with a JavaScript fake.
- Docker Compose for every app/transcriber run. No host-only success path.

### Dependencies and style

Run the required lint scaffold once at project creation:

```bash
curl -o- https://raw.githubusercontent.com/actuallymentor/airier/main/quickstart.sh | bash
```

Commit the generated lint configuration. Use template literals, snake_case,
breathing whitespace, intent comments, and JSDoc on every exported function.
React component names and files remain PascalCase.

## Repository shape

```text
.
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── migrations/
├── public/
│   └── assets/
├── scripts/
│   ├── reconcile.js
│   └── verify
├── src/
│   ├── client/
│   │   ├── components/{atoms,molecules,pages}/
│   │   ├── hooks/
│   │   ├── modules/
│   │   ├── routes/
│   │   └── stores/
│   ├── server/
│   │   ├── api/
│   │   ├── archive/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── jobs/
│   │   ├── providers/
│   │   └── search/
│   └── shared/
├── tests/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── transcriber/
├── Dockerfile
├── compose.yaml
├── compose.test.yaml
├── package.json
└── vite.config.js
```

The production Node image builds Vite assets in one stage, then runs Fastify as
a non-root user in the final stage. Fastify serves `/dist` and the same-origin
API. The transcription image remains separate. Development/test-only services
do not change the production one-app-container rule.

Bind-mount ownership is explicit. A narrow root entrypoint creates only known
subdirectories under `/data/app` and `/data/diary`, checks ownership/write access,
then drops to `APP_UID:APP_GID`; it never recursively changes an existing archive.
Deployment docs tell the operator to pre-create/chown host directories when they
use a different UID/GID. `scripts/verify` pre-creates isolated mounts with the
configured IDs. The transcription model cache receives the same treatment before
its process drops privileges.

## Durable archive contract

### Paths

```text
DIARY_DATA_PATH/
├── .incoming/<user-id>/<upload-id>/
└── users/<safe-email>--<stable-user-id>/
    ├── profile.json
    ├── days/2026-08-25/
    │   ├── metadata.json
    │   ├── audio/14-03-22.410--<item-id>.webm
    │   ├── images/...
    │   ├── video/...
    │   ├── text/15-11-02.100--<item-id>.txt
    │   └── transcripts/
    │       ├── 14-03-22.410--<item-id>.machine.txt
    │       └── 14-03-22.410--<item-id>.txt
    ├── reflections/2026/2026-08-25T18-30-00Z--<reflection-id>.md
    └── .trash/<deleted-utc>/<tombstone-id>/
```

The stable user ID prevents email changes and normalization collisions. The
email prefix keeps directories recognizable. Renaming a user's email updates
`profile.json`; it does not silently move decades of content during a request.

`profile.json` records the stable user ID and last-known email. Database disaster
recovery scans these profiles and re-creates `recovery_pending` user rows with the
original IDs. A local `npm run recover-accounts -- --admin-email=<email>` command
prints a one-use admin recovery link; that administrator sets a new password and
reissues account recovery links tied to the existing IDs. Password hashes and
session state remain intentionally unrecoverable from the archive.

`.incoming` lives on the diary filesystem so finalization can use an atomic
rename even when app data and diary data are different mounts.
Incomplete uploads expire 30 days after last server activity. A janitor/reconcile
pass removes only expired staging data and receipts. The client retains its local
copy until final acknowledgment, so a later retry can recreate the upload. The TTL
is configurable but never defaults to hours.

### Day metadata

`metadata.json` is schema-versioned and sufficient to reconstruct chronology:

- day date and archive schema version;
- normalized lowercase tags;
- stable item ID, type, relative path, canonical/derived classification;
- UTC instant, client IANA timezone, offset minutes, local wall time, local date;
- MIME, codec, duration, byte size, and SHA-256 where applicable;
- transcript machine/display paths and whether display text is machine or manual;
- deletion tombstones and relevant provenance.

Write metadata to a sibling temporary file, flush file and directory, then rename
under a per-day keyed mutex. Never build a path from a client-supplied filename.
Resolve every server-derived path and prove it remains beneath that user's root.

### Canonical and derived files

Canonical: original audio, user text, uploaded image/video, tags, manual transcript
corrections, reflection question, and saved reflection answer.

Derived: machine transcripts, normalized STT input, FTS rows, cached summaries,
generated TTS, duration/probe caches, and operational state.

The displayed transcript starts as a copy of `.machine.txt`. Once edited, mark it
manual. Retranscription may replace `.machine.txt` but never the manual display
file.

Deletion moves content and a tombstone into per-user `.trash`; v1 never purges
automatically. Restore and explicit permanent deletion are separate actions.
Deleting a transcript cannot delete its audio.

## SQLite contract

Use WAL, foreign keys, a busy timeout, explicit transactions, and one application
replica. Keep SQLite on local fast storage, never an NFS/SMB mount.

Tables:

- `schema_migrations`
- `users`, `sessions`, `invitations`, `login_attempts`
- `days`, `items`, `tags`, `day_tags`
- `uploads`, `upload_chunks`, `operations`
- `jobs` with status, lease owner/expiry, attempts, `run_after`, and last error
- `reflections`, `provider_usage`
- `search_documents` plus an FTS5 external-content virtual table
- `archive_inventory` for reconciliation hashes/mtime

Except for accounts, sessions, invitations, and operational state, database rows
are cached/indexed views of files. Migrations are forward-only, transactional, and
run before readiness. Each archive metadata version has a tested migration and
reader; unknown newer versions fail safely without rewriting files.

## Authentication and authorization

- Normalize emails for comparison; preserve display form separately.
- The first-user claim is one transaction guarded by a unique singleton row, so
  concurrent requests cannot create two administrators.
- First-user claim is allowed only when both the database and diary archive contain
  no user identity. If the archive has any `profile.json` or recovery-pending rows,
  bootstrap refuses and directs the operator to `recover-accounts`; database loss
  can never reopen public administrator claim.
- The administrator creates an expiring, one-use invite link shown once for manual
  sharing. No SMTP dependency.
- Hash passwords with Argon2id using parameters recorded with the hash.
- Generate 256-bit opaque sessions. Store only a SHA-256 digest server-side.
- Cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax`, narrow path, bounded
  lifetime, rotation on login and password changes.
- Check configured Origin on every unsafe request; no permissive CORS.
- Rate-limit login/invite consumption without leaking whether an email exists.
- Derive user ownership from the session at every archive/database boundary.
- Media endpoints authenticate and support HTTP Range without exposing real paths.

## HTTP and synchronization contract

Version all APIs under `/api/v1`. Validate body, params, headers, and response at
boundaries. Important groups:

- `/auth/bootstrap`, `/auth/login`, `/auth/logout`, `/auth/session`
- `/admin/invitations` and `/auth/register/:token`
- `/days/:date`, `/days/:date/items`, `/days/:date/tags`
- `/uploads`, `/uploads/:id`, `/uploads/:id/chunks/:sequence`,
  `/uploads/:id/complete`
- `/media/:item_id`
- `/search`, `/maintenance/reconcile`
- `/reflections`, `/reflections/:id`, `/reflections/:id/speech`
- `/health/live`, `/health/ready`, `/version`

### Resumable upload

1. Client generates a UUID before capture/upload and persists a manifest.
2. `POST /uploads` idempotently creates an upload scoped to the session user.
3. `PUT /uploads/:id/chunks/:sequence` carries size and SHA-256. The server streams
   to a temporary part, verifies, flushes, and renames.
4. Repeating the same sequence/hash succeeds; a different hash returns `409`.
5. `GET /uploads/:id` returns received sequence/hash receipts for resume.
6. `POST /uploads/:id/complete` supplies ordered hashes, total bytes, whole digest,
   MIME, capture timestamps, and canonical local date.
7. Server streams parts into `.partial`, verifies the whole digest, ffprobes media,
   flushes, atomically renames, updates metadata/SQLite, then queues transcription.
8. Finalization is idempotent; a retry returns the same item.

Use the protocol for audio, images, and video. Reject quota/disk exhaustion before
accepting a part where possible. Never remove the client copy until finalization
acknowledges the digest and a subsequent status read confirms the item.

### Client outbox

Dexie tables partition data by authenticated account: `recordings`, `chunks`,
`operations`, `upload_receipts`, `settings`, and schema metadata.

- Select `MediaRecorder` MIME by capability: WebM/Opus first, then MP4/AAC/native.
- Start with an approximately five-second timeslice, but never infer elapsed time
  from chunk count; browser delivery timing is not exact.
- Persist each `dataavailable` blob transactionally before marking it queued.
- Coalesce ordered recorder blobs into approximately 1–5 MiB upload parts without
  altering their bytes, avoiding thousands of requests for a long recording.
- Validate recovered manifests before upload. WebM continuation blobs depend on
  the initial container segment; a missing/corrupt first blob is reported as
  unrecoverable instead of uploading media that cannot pass ffprobe.
- On stop, request final data, await the final event, persist it, then finalize the
  manifest.
- Request Screen Wake Lock while recording; release on stop and reacquire after a
  relevant `visibilitychange` when allowed.
- Request persistent browser storage and show quota/storage warnings honestly.
- Resume on app startup, focus/visibility, and `online`; use Background Sync only
  opportunistically because it is not available/reliable on every browser.
- Use exponential backoff with jitter and a visible retry action.
- Recovery after reload includes emitted chunks. Do not promise recovery of audio
  still trapped inside a suspended or destroyed browser recorder.

State machine:

```text
recording -> saved_local -> syncing -> uploaded -> queued -> transcribing -> complete
                  |           |                        |
                  +-> retry <-+------------------------+
```

Every UI state must distinguish device-only safety from server durability.
Text/image/video skip the transcription states. A `needs_auth` state pauses retry
after `401`, preserves all local content under the last-known account partition,
and asks the user to sign in; it never loops or discards the outbox.

## UI and PWA

Pages: Today, Day/Calendar, Search, Reflection/History, Settings, and Admin Invites.
Today opens directly to one dominant, one-hand **Record** action and a chronological
timeline. Text, photo, video, and tags remain secondary.

Apply the design preferences as constraints:

- accent `#7ec0d0`, body `#fafbfc`, Montserrat Variable headings, Nunito Variable
  body, and resilient system fallbacks;
- self-host licensed Montserrat/Nunito variable font files obtained from Google
  Fonts; never make a runtime third-party font request or block core UI on fonts;
- at least 48 dp touch targets, 4.5:1 body contrast, no color-only state;
- `html { font-size: 100%; }`, fluid `rem` typography, 45–75 character prose;
- user controls for font size, letter spacing, and line height;
- independent haptic and sound toggles; both default conservative;
- no autoplay, infinite scroll, decorative motion, or manipulative badges.

PWA behavior:

- Precache only the versioned shell/icons; never cache authenticated API or diary
  media responses in the service-worker cache.
- Offline relaunch opens a local workspace with pending captures/text, not a stale
  representation of the full server diary.
- A bottom-left **Install App** pill uses `beforeinstallprompt` and hides in
  standalone mode.
- `onNeedRefresh` raises a persistent update badge. The normal update activates
  the waiting worker after user action.
- A menu **Update app** recovery action unregisters app workers, removes only
  app-owned Cache Storage entries, cache-bust reloads, and never clears IndexedDB.
- IndexedDB migrations are additive/backward-aware. Old and new clients use a
  compatible upload protocol during rolling service-worker updates.

## Jobs, transcription, and search

The app owns a durable SQLite job queue. A worker leases jobs with bounded
concurrency, renews leases, retries with exponential backoff, and exposes failed
jobs without affecting source media. No Redis.

For transcription, the app creates a derived 16 kHz mono FLAC input, streams it to
the internal `/v1/audio/transcriptions` service, validates the result, atomically
writes machine/display transcript files, records engine/model revision/language/
source checksum, then indexes display text. The transcription container has no
host port. Pin Python dependencies and model revisions; never rely on `latest`.

FTS5 uses `unicode61 remove_diacritics 2`, prefix terms, BM25 ranking, user/date/
tag/type filters, and normalized text. Search indexes text notes, displayed
transcripts, and tags. Result snippets carry stable day/item targets.

`npm run reconcile` scans archive metadata/files, validates confinement and
schema, compares hashes/mtime, rebuilds cache/FTS, and reports conflicts. A full
`npm run rebuild-index` drops only derived search data. Direct filesystem edits
must never cause silent destructive rewrites.

## Reflection and TTS

All provider calls use narrow adapters and direct `fetch` with timeouts. Never log
diary prompts, transcripts, answers, or provider keys.

Assign every source a stable citation such as `[2026-08-25:<item-id>]`.

1. Select every source in the requested rolling/custom range.
2. If raw material fits a conservative model budget, send it with citation IDs.
3. Otherwise map over **every** bounded chronological chunk with the user's
   question, producing structured summaries and retained citations.
4. Recursively reduce all summaries until the full-period representation fits.
5. Add top FTS raw evidence for detail without replacing chronological coverage.
6. Request a structured answer where the chosen model supports JSON Schema.
7. Validate that every returned citation exists in the selected source set.
8. Save Markdown atomically with frontmatter: range, question, created time, model,
   usage, answer, citations, and source checksums.

Never silently truncate older material. Cache summaries as derived files keyed by
source checksum, prompt version, provider, and model. OpenRouter failure leaves
the diary untouched and creates a retryable job. Require explicit UI disclosure
that selected diary text leaves the server; support ZDR-only provider routing.

TTS consumes only the saved reflection answer through a provider adapter. Save
generated audio as derived content next to the reflection. Missing configuration
shows **Listen unavailable** rather than breaking reflection.

## One-run execution sequence

Each phase ends in a hard gate. Fix failures immediately; never defer a broken
gate to the final test pass. Commit each green vertical slice with a gitmoji
message, without Co-Authored-By lines.

### Phase 0 — preflight and baseline

- Validate required human inputs, `.env`, Docker access, disk space, CPU/GPU, model
  cache space, ports, remote, and deploy-key read access.
- Snapshot `git status`; preserve all pre-existing human changes.
- Add `.nvmrc`, package metadata, `.env.example`, scripts, and documentation.
- Gate: no secret tracked; Compose interpolation succeeds; clean test directories
  are explicit and safe to remove.

### Phase 1 — scaffold and production skeleton

- Create Vite/React/Fastify package and required client structure.
- Install `mentie`, inspect its exports, install preferred libraries, run Airier.
- Add multi-stage app image, transcription image, Compose health checks, separate
  mounts, non-root runtime, and graceful shutdown.
- Gate: production images build; empty Compose stack becomes healthy; Fastify
  serves the compiled PWA and `/version` matches `package.json`.

### Phase 2 — archive, database, and authentication vertical slice

- Implement migrations, archive confinement/atomic-write primitives, and schemas.
- Implement first-admin claim, invite registration, sessions, origin/rate checks.
- Create Today shell and login/bootstrap/admin invite pages.
- Gate: integration tests cover first-admin race, invite expiry/reuse, session
  rotation, traversal attempts, and two-user isolation through real SQLite/files.

### Phase 3 — day, text, tags, and media

- Implement day routes/metadata, text edits, tags, generic attachment upload,
  chronological timeline, authenticated Range playback, image enlargement.
- Implement recoverable trash and transcript-safe delete rules.
- Gate: real files match the archive contract; concurrent day writes stay valid;
  browser creates multiple items, edits them, plays/seeks media, and restores one.

### Phase 4 — resumable upload and local-first recording

- Implement chunk protocol, server staging/finalization, Dexie schema/outbox,
  MediaRecorder capability selection, upload-part coalescing, wake lock, status UI,
  quota handling, expired-session pause, and 30-day staging cleanup.
- Gate: duplicate/out-of-order chunks, hash mismatch, connection loss, app restart,
  server restart, slow network, and near-full disk paths behave without duplicates
  or source loss.

### Phase 5 — PWA lifecycle

- Implement service worker, offline shell, install pill, persistent update badge,
  manual recovery update, and compatible IndexedDB migrations.
- Gate: warm a persistent Chrome profile, stop the Compose app service to create a
  real origin failure, record offline, close/reopen while the service remains down,
  show pending content, restart the service, sync once, then update workers without
  losing IDB. DevTools offline emulation is secondary because it can behave
  differently for service-worker fetches.

### Phase 6 — real transcription

- Implement engine-neutral adapter, faster-whisper container, durable job leases,
  derived normalization, transcript provenance, retry/dead-letter UI, manual edits.
- Gate: configured real model transcribes licensed English and Dutch fixtures via
  the normal recording/upload/job path; recognizable phrases pass tolerant checks;
  forced worker failure preserves audio; retranscription preserves manual text.

### Phase 7 — search and recovery

- Implement FTS query/ranking/filter/snippets and stable result deep links.
- Implement reconcile and full index rebuild commands.
- Gate: search finds text/transcripts/tags fuzzily; user isolation holds; deleting
  the app database and rebuilding from archive recovers diary/searchable content.

### Phase 8 — reflection and optional TTS

- Implement ranges, audio/text questions, hierarchical coverage, citations,
  OpenRouter adapter, history, Markdown persistence, and configured TTS adapter.
- Gate: real OpenRouter run selects only in-range sources and returns valid linked
  citations; a forced-small context exercises multi-level reduction with no source
  chunk omitted; real TTS output is playable when credentials are enabled.

### Phase 9 — design, accessibility, and settings

- Apply brand/accessibility rules, sensory preferences, skeleton/progress behavior,
  responsive one-hand layouts, settings, and understandable sync/failure states.
- Gate: keyboard/focus/labels/contrast/touch-size automated checks plus clicked
  mobile and desktop journeys. No browser console errors or failed requests.

### Phase 10 — operations and release automation

- Add dev/test/prod Compose profiles, health/readiness, log levels, migrations,
  version labels, backup/reconciliation docs, and CI.
- CI runs lint, focused tests, production build, Docker integration, browser E2E,
  and a CPU transcription smoke using the real small model.
- Cache the transcription model directory by backend/model/pinned revision in CI.
  Use robust Dutch fixture phrases and tolerant word-level assertions suitable for
  the CPU `small` model; never assert punctuation verbatim.
- Release runs only for a published `vX.Y.Z` GitHub release; abort unless the tag
  equals `v${package.version}` and tests/build pass. Publish exact SemVer and
  `latest`, never rolling major/minor tags. Pin Actions by commit SHA.
- Gate: local CI-equivalent passes and workflow syntax/version logic is tested
  without publishing an accidental release.

### Phase 11 — adversarial full verification

Run `./scripts/verify`. It must:

1. create explicit isolated app/diary directories;
2. build production images from a cold cache where practical;
3. start Compose and wait on readiness;
4. run unit/integration suites inside the app build environment;
5. load the real transcription model;
6. run Puppeteer in the Compose `test_runner` service with browser-console/network
   capture and screenshots;
7. run live OpenRouter/TTS tests when switches and credentials are present;
8. restart services during upload/job work;
9. exercise index/database disaster recovery;
10. print archive tree, `ffprobe` results, versions, and test summary;
11. tear down on success, preserving redacted artifacts and volumes on failure.

Gate: two consecutive clean-volume runs pass. Inspect browser flows as a user, not
only assertions: click record/stop, observe states, play/seek, search, navigate,
reflect, reload, go offline, close/reopen, and update the PWA.

### Phase 12 — mobile hardware and handoff

- Real iPhone Safari: native AAC/MP4 fallback, install/relaunch, offline recording,
  screen lock/background lifecycle, interruption, quota warning, reconnect sync.
- Real Android Chrome: WebM/Opus, install/relaunch, wake lock, network handoff,
  interruption, background/resume sync.
- Record devices/browser versions and outcomes. Browser emulation remains useful
  but cannot replace this gate.
- Run reflect, style, changelog/version, complete tests, cleanup, commits,
  phone-a-friend review, and human notification.

## Automated test inventory

### Focused unit tests

- Path confinement, email/tag/file normalization, archive naming.
- DST, travel, timezone offset, and canonical local-day assignment.
- Sync reducer, operation idempotency, retry/backoff, digest manifests.
- Reflection range boundaries, chunk/reduce coverage, citation validation.
- Transcript manual-correction overwrite protection.

### Docker integration tests

- First-admin concurrency; invite/session/auth/rate/origin behavior.
- Empty database plus populated archive refuses first-admin bootstrap and requires
  the account-recovery flow.
- User isolation for every route, file, job, search row, and error message.
- Day metadata atomicity under concurrent text/tag/upload mutations.
- Chunk duplicate, missing, out-of-order, mismatch, finalize, crash, and resume.
- Real SQLite WAL/jobs/leases/retries plus app/transcriber restarts.
- Real FFmpeg/ffprobe, HTTP Range, filesystem layout, trash/restore.
- Real transcription model with English/Dutch fixtures.
- FTS ranking/filtering, transcript reindex, reconciliation, full rebuild.
- Reflection selection/hierarchy/citations; live providers when configured.
- Fresh and upgraded migration fixtures.

### Chrome/Puppeteer E2E

- First admin, invite, second account, logout/login, isolation attempts.
- Native fake microphone record/stop using
  `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, and
  `--use-file-for-fake-audio-capture=<wav>`.
- Full local → upload → transcribe → complete journey and playback/search.
- Offline shell, record/text while offline, close/reopen same profile, reconnect,
  idempotent sync, delayed local cleanup.
- Expired session while offline: content remains locally attributed, retry pauses
  in `needs_auth`, login resumes exactly-once synchronization.
- Network cut during upload, slow network, retry, server restart.
- Text/image/video/tags, chronology, edits, transcript corrections, trash.
- Calendar/day deep links, search filters/results, reflections/history/TTS.
- Manifest/icons/standalone PWA installation, update badge, forced recovery update.
- Mobile viewport/touch and desktop; keyboard/focus/accessibility scan.

### Soak and release-only tests

- Multi-hour recording fixture, large video, disk pressure, model cold start.
- Multiple users uploading while transcription and reconciliation run.
- Old service worker/new server and new service worker/old server compatibility.
- Physical iOS/Android recording, interruption, screen lock, network handoff.

## Known limits to communicate honestly

- Browsers may suspend capture or sync; Background Sync is best-effort and not
  broadly available. Wake Lock requires a visible secure context.
- IndexedDB may be evicted even after requesting persistence. Warn; never label
  device-only content as server-safe.
- Emitted chunks can survive reload. Audio not yet emitted by a destroyed recorder
  cannot be guaranteed.
- Safari recording/container and installed-PWA lifecycle require a physical device.
- Slow/full diary storage must fail without removing browser copies.
- External filesystem edits can race application writes. Atomic writes, hashes,
  conflict logs, and reconcile reduce risk; they cannot make arbitrary manual edits
  transactional.
- OpenRouter and external TTS receive sensitive diary text. Consent and ZDR routing
  matter; logging must stay redacted.
- Model download and CPU transcription may be slow. Keep recording/search usable
  while readiness, queued work, and progress are truthful.

## Research anchors

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- [OpenAI Whisper models and languages](https://github.com/openai/whisper#available-models-and-languages)
- [CTranslate2 hardware support](https://opennmt.net/CTranslate2/hardware_support.html)
- [Parakeet TDT 0.6B v3 model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- [NeMo-Speech.cpp](https://github.com/NVIDIA/NeMo-Speech.cpp)
- [MediaRecorder chunk timing caveats](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event)
- [Background Sync limited availability](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [Vite PWA update behavior](https://vite-pwa-org.netlify.app/guide/auto-update)
- [Node 24 SQLite status](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart)
- [GitHub Docker image publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
- [Docker multi-platform GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/)
