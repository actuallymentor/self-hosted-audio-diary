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

## Resolved deployment decisions

- Primary deployment: x86-64 Intel NUC, 16 GiB RAM, Intel integrated graphics,
  no NVIDIA GPU.
- Publish both images for `linux/amd64` and `linux/arm64`; exercise the primary
  `linux/amd64` target on every run and smoke-test ARM64 on a native CI runner.
- Transcribe on CPU. CTranslate2 does not use the Intel integrated GPU, and speed
  is secondary to output quality.
- Use multilingual `faster-whisper` `large-v3` with INT8, automatic language
  detection, and code-switching enabled. English is primary; Dutch and other
  languages may occur within the same recording.
- Download the pinned model on first start into a persistent cache. Verification
  prewarms it. Recordings remain available while a cold download is in progress.
- Use OpenRouter for both reflection and text-to-speech. One OpenRouter API key
  authenticates both features; separate model/voice values select behavior.
- Physical mobile testing is deferred until after the first preview Docker images
  publish. Automated Chrome mobile/PWA gates remain mandatory before publication;
  owner iOS/Android results gate the stable `1.0.0` release.
- Invitation flow, deletion behavior, backend, database, transcript edits, and
  filesystem names use the conservative defaults below.

## Credentials and external setup

Create `.env` from the generated `.env.example`. Never commit `.env`.

```dotenv
# Bind mounts on the Docker host
APP_DATA_PATH=./runtime/app
DIARY_DATA_PATH=./runtime/diary
TRANSCRIPTION_MODEL_CACHE_PATH=./runtime/models
APP_UID=10001
APP_GID=10001

# Public application boundary
APP_ORIGIN=http://127.0.0.1:3000
TRUST_PROXY=false

# Local speech-to-text
TRANSCRIPTION_BACKEND=faster-whisper
TRANSCRIPTION_URL=http://transcription:8000/v1
TRANSCRIPTION_MODEL=large-v3
TRANSCRIPTION_MODEL_REVISION=<pinned-revision>
TRANSCRIPTION_DEVICE=cpu
TRANSCRIPTION_COMPUTE_TYPE=int8
TRANSCRIPTION_LANGUAGE=auto
TRANSCRIPTION_MULTILINGUAL=true
TRANSCRIPTION_CPU_THREADS=auto
TRANSCRIPTION_VAD_FILTER=true
HF_TOKEN=

# Reflection and TTS use one OpenRouter account/key
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
OPENROUTER_ZDR_ONLY=true
OPENROUTER_SITE_URL=

# Text-to-speech through OpenRouter
TTS_PROVIDER=openrouter
TTS_MODEL=google/gemini-3.1-flash-tts-preview
TTS_VOICE=Sulafat
TTS_RESPONSE_FORMAT=pcm

# Live verification switches
RUN_OPENROUTER_TESTS=false
RUN_TTS_TESTS=false

# Image publishing; never passed into application containers
DOCKERHUB_USERNAME=
DOCKERHUB_TOKEN=
DOCKERHUB_APP_IMAGE=<dockerhub-namespace>/self-hosted-audio-diary
DOCKERHUB_TRANSCRIBER_IMAGE=<dockerhub-namespace>/self-hosted-audio-diary-transcriber
```

Most values are not required to begin development:

- `APP_ORIGIN=http://127.0.0.1:3000` is sufficient for local development. The
  production HTTPS origin is needed only for deployment-time cookie/Origin checks,
  reverse-proxy correctness, PWA APIs on non-localhost devices, and optional
  OpenRouter attribution.
- `OPENROUTER_API_KEY` is unnecessary for archive/auth/recording/search work. It
  becomes required for real reflection and TTS tests; without it those features
  can be implemented and contract-tested but cannot be declared live-tested.
- Set `RUN_OPENROUTER_TESTS=true` and `RUN_TTS_TESTS=true` in the private `.env`
  once the key is present. `.env.example` keeps both false for credential-free work.
- `OPENROUTER_MODEL` is separate because an API key authenticates an account but
  does not choose which model should answer. The configured default is a strong,
  long-context reflection model and remains runtime-configurable.
- `OPENROUTER_ZDR_ONLY=true` restricts diary text to provider endpoints that claim
  zero data retention. It is a privacy control, not a development requirement.
- Docker Hub values are needed only when publishing. Local multi-architecture
  builds do not require registry credentials.
- Compose services use explicit `environment:` allowlists and never use `.env` as
  a service-level `env_file`. Registry/GitHub credentials must not enter any container;
  `HF_TOKEN` may enter only the transcription service when it is non-empty.

The authenticated GitHub CLI has already copied the publication values into
repository Actions configuration:

- Actions variables `DOCKERHUB_APP_IMAGE` and `DOCKERHUB_TRANSCRIBER_IMAGE`.
- Actions secret `DOCKERHUB_USERNAME`.
- Actions secret `DOCKERHUB_TOKEN`; use a scoped access token, not a password.

Repository Actions policy permits only GitHub-owned actions and verified
Marketplace creators, and requires every action reference to use a full commit
SHA. The default workflow token is read-only and cannot approve pull requests.

There are two published images because the product brief deliberately isolates
local speech inference from the main application:

1. `self-hosted-audio-diary`: React assets, Fastify API, jobs, SQLite, and search.
2. `self-hosted-audio-diary-transcriber`: FFmpeg, Python/CTranslate2,
   `faster-whisper`, and the pinned local model runtime.

Users still deploy one Compose stack with one command. Keeping inference separate
prevents its native/Python dependencies and model lifecycle from bloating or
destabilizing the main application image.

The repository remote is
`git@github.com:actuallymentor/self-hosted-audio-diary.git`. Its write-enabled
deploy key is installed and verified. The private `.ssh_key` is mode `0600`,
ignored by Git, and must not be copied to `.env` or GitHub.

Verify access without changing global SSH configuration:

```bash
GIT_SSH_COMMAND='ssh -i /workspace/.ssh_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' \
    git ls-remote origin

DEPLOY_KEY_CHECK_REF="refs/heads/deploy-key-write-check-$(git rev-parse --short HEAD)"
GIT_SSH_COMMAND='ssh -i /workspace/.ssh_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new' \
    git push --dry-run origin HEAD:"$DEPLOY_KEY_CHECK_REF"
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
- App and transcription image manifests contain tested `linux/amd64` and
  `linux/arm64` variants; Intel NUC `linux/amd64` is the primary deployment.
- Version in `package.json`, API, UI, OCI labels, Git tag, and Docker tag agrees.
- All automated gates pass before the first preview images publish. Owner
  iPhone/Android results are recorded and resolved before stable `1.0.0`.

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
- Primary model: multilingual `large-v3` with INT8 on x86-64 CPU. Enable automatic
  language detection and code-switching; leave one CPU thread available to the
  app unless measurement supports another setting.
- The Intel integrated GPU remains unused in v1: CTranslate2's supported GPU path
  targets NVIDIA CUDA. Quality matters more than transcription latency here.
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

Compose variable interpolation and container environments are separate concerns.
Every service lists only the variables it consumes. The verification script
inspects `/proc/1/environ` in running containers and fails if publishing tokens
appear anywhere, or if `HF_TOKEN` appears outside the transcriber.

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

TTS consumes only the saved reflection answer through a provider adapter. Gemini
3.1 Flash TTS on OpenRouter accepts `pcm`, not `mp3`; wrap its raw 24 kHz mono
16-bit PCM response in a WAV container, then transcode it to MP3 for compact,
broadly compatible browser playback. Save generated audio next to the reflection.
Missing configuration shows **Listen unavailable** rather than breaking
reflection.

## One-run execution sequence

Each phase ends in a hard gate. Fix failures immediately; never defer a broken
gate to the final test pass. Commit each green vertical slice with a gitmoji
message, without Co-Authored-By lines.

### Phase 0 — preflight and baseline

- Validate required human inputs, `.env`, Docker access, disk space, CPU/GPU, model
  cache space, ports, remote, and deploy-key read/write access without pushing.
- Snapshot `git status`; preserve all pre-existing human changes.
- Query the current OpenRouter Models API and official runtime/model sources to
  verify configured reflection/TTS slugs, TTS voice, CTranslate2 architectures,
  model revision, and download URLs. Fail with a replacement instruction when a
  preview model has disappeared; never silently switch providers/models.
- Render Compose configuration and assert every service has an explicit
  environment allowlist. Reject any service-level `env_file: .env`.
- Add `.nvmrc`, package metadata, `.env.example`, scripts, and documentation.
- Gate: no secret tracked; Compose interpolation succeeds; clean test directories
  are explicit and safe to remove; publishing credentials cannot reach containers.

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
- Request approximately 128 kbit/s audio with `audioBitsPerSecond` for Opus/AAC
  where supported, retain the browser's native result, and degrade gracefully when
  a browser ignores the bitrate hint.
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
- Pass the pinned revision to faster-whisper's revision-aware model loader, record
  the resolved snapshot commit, and refuse a mismatch. Map
  `TRANSCRIPTION_CPU_THREADS=auto` to physical CPU cores minus one, minimum one.
- Enable VAD by default to reduce silence hallucinations. Compare representative
  English-only output with per-segment multilingual detection on and off; keep
  code-switching quality without accepting a material monolingual regression.
  `large-v2` or recording-level language detection is an allowed measured fallback,
  never a silent downgrade.
- Gate: real `large-v3` INT8 transcribes licensed English, Dutch, and mixed-language
  fixtures through the normal recording/upload/job path; recognizable phrases pass
  tolerant checks; forced worker failure preserves audio; retranscription preserves
  manual text. Record cold-download size/time and steady-state NUC throughput
  without making speed a pass/fail quality proxy.

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
  version labels, backup/reconciliation docs, README quickstart/Compose example,
  bind-mount ownership guidance, and CI.
- CI runs lint, focused tests, production build, Docker integration, browser E2E,
  and a CPU transcription smoke using the real model.
- Cache the transcription model directory by backend/model/pinned revision in CI.
  Use robust multilingual fixture phrases and tolerant word-level assertions;
  never assert punctuation verbatim.
- Build app and transcription images separately on native amd64 and ARM64 runners,
  test each native artifact, then merge digests into multi-architecture manifests.
  QEMU-only build success is insufficient proof for native inference dependencies.
- Budget model and Docker caches explicitly within repository CI limits. A cache
  miss performs a bounded cold pinned-model download and reports progress; cache
  eviction is not a flaky test failure by itself.
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
10. inspect running container environments and fail on registry/GitHub secret
    leakage or misplaced `HF_TOKEN`;
11. print archive tree, `ffprobe` results, versions, and test summary;
12. tear down on success, preserving redacted artifacts and volumes on failure.

Gate: two consecutive clean-volume runs pass. Inspect browser flows as a user, not
only assertions: click record/stop, observe states, play/seek, search, navigate,
reflect, reload, go offline, close/reopen, and update the PWA.

### Phase 12 — preview publication and owner mobile handoff

- Publish the first reviewed multi-architecture images as a SemVer `0.x` preview
  after all automated gates pass.
- Give the owner an exact Compose example and test script for iPhone Safari and
  Android Chrome: install/relaunch, native codec, offline recording, screen lock,
  interruption, quota warning, network handoff, reconnect, and background sync.
- The iPhone test URL must use trusted HTTPS through the production reverse proxy,
  Tailscale Serve, or an equivalent TLS route; a LAN-IP HTTP URL cannot exercise
  microphone, service-worker, install, or wake-lock APIs. Android may use the same
  HTTPS origin or `adb reverse` to its localhost secure context.
- Record devices/browser versions and owner outcomes as release evidence. Fix
  device findings before stable `1.0.0`; browser emulation never becomes evidence
  that physical lifecycle behavior works.
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
- [OpenRouter text-to-speech](https://openrouter.ai/docs/guides/overview/multimodal/tts)
- [OpenRouter Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)
- [Gemini TTS languages and voices](https://ai.google.dev/gemini-api/docs/speech-generation)
- [GitHub Docker image publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
- [Docker multi-platform GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/)
