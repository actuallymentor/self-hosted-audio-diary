# SHAD — Self-Hosted Audio Diary

Private, archive-first voice journaling. SHAD records in the browser, survives
offline use, synchronizes resumable uploads, transcribes locally with
`faster-whisper`, and stores canonical diary content as ordinary files.

Status: `0.1.0` preview. Automated desktop/mobile-PWA gates are implemented;
physical iPhone and Android testing remains required before `1.0.0`.

## Stack

- `app`: React PWA, Fastify API, SQLite/FTS5, background jobs, reflection, TTS.
- `transcriber`: pinned multilingual `large-v3`, CPU INT8, one serialized worker.
- Plain HTTP only. Put the stack behind your existing TLS reverse proxy.
- Two independent bind mounts: operational app data and the human-readable diary.

Primary target: x86-64 Intel NUC, 16 GiB RAM. Published images also target ARM64.
The first model load downloads roughly 3 GiB into the persistent model cache.

## Quick start

Requirements: Docker Engine with Compose v2, writable host directories, and
roughly 8 GiB free disk during first build/model download.

```bash
cp .env.example .env
mkdir -p data/app data/diary data/models
sudo chown -R 10001:10001 data/app data/diary data/models
chmod 600 .env
docker compose up --detach --build
docker compose ps
```

Open `http://HOST:3000`. The first account becomes administrator only when both
the database and archive are empty. Later users require one-use invitations.

Set `APP_PORT` to change the host listener. Do not expose it directly to the
internet: the operator-owned reverse proxy handles hostname, TLS, redirects,
certificates, and public security headers.

## Configuration

Copy [`.env.example`](./.env.example); it is the canonical variable reference.
Important values:

| Variable | Purpose | Default |
| --- | --- | --- |
| `APP_DATA_PATH` | SQLite, jobs, sessions, derived indexes | `./data/app` |
| `DIARY_DATA_PATH` | Canonical media, notes, transcripts, metadata | `./data/diary` |
| `TRANSCRIPTION_MODEL_CACHE_PATH` | Persistent Hugging Face model cache | `./data/models` |
| `APP_UID` / `APP_GID` | Runtime ownership for all bind mounts | `10001` |
| `APP_PORT` | Host-side plain HTTP port | `3000` |
| `SESSION_COOKIE_SECURE` | Mark sessions HTTPS-only at the browser | `false` |
| `OPENROUTER_API_KEY` | Optional reflection and speech | empty |
| `OPENROUTER_MODEL` | Reflection model | Claude Sonnet 4.6 |
| `TTS_MODEL` / `TTS_VOICE` | Speech model and provider voice | Gemini / Sulafat |

OpenRouter features are optional. Recording, archive access, search, and local
transcription continue when the provider is absent. `OPENROUTER_ZDR_ONLY=true`
requests zero-data-retention routing.

Set `SESSION_COOKIE_SECURE=true` for a public HTTPS origin unless the reverse
proxy explicitly adds the `Secure` cookie attribute. Keep `false` only for direct
plain-HTTP access on a trusted network.

Compose passes an explicit environment allowlist. Registry credentials never
enter application containers; `HF_TOKEN` enters only the transcriber.

## Archive contract

The filesystem is canonical; SQLite is replaceable operational state.

```text
data/diary/
├── .incoming/<user-id>/<upload-id>/
└── users/<safe-email>--<stable-user-id>/
    ├── profile.json
    ├── days/YYYY-MM-DD/
    │   ├── metadata.json
    │   ├── audio/
    │   ├── images/
    │   ├── video/
    │   ├── text/
    │   └── transcripts/
    ├── reflections/YYYY/
    └── .trash/
```

Back up `APP_DATA_PATH` and `DIARY_DATA_PATH` independently. The diary remains
browsable without SHAD; retaining app data preserves accounts and sessions.

## Maintenance and recovery

Maintenance commands run with the production image and mounted archive:

```bash
docker compose run --rm --no-deps app npm run reconcile
docker compose run --rm --no-deps app npm run rebuild-index
docker compose run --rm --no-deps app npm run recover-accounts -- --admin-email=owner@example.com
```

- `reconcile`: rebuild users, days, items, jobs, and derived state from the archive.
- `rebuild-index`: replace only derived FTS data.
- `recover-accounts`: re-establish an administrator after database loss; recovered
  identities remain pending until explicitly claimed.

Deletion moves canonical files into per-user `.trash`; it does not immediately
erase them. Never edit `.incoming` while uploads are active.

## Verification

Node.js 24 and Docker Compose are required on the verification host.

```bash
npm ci
cp .env.example .env            # use live credentials only when intended
./scripts/verify
```

`scripts/verify` builds production images, runs unit/integration tests inside the
app image, starts clean isolated volumes, loads real `large-v3`, drives native
Chrome/MediaRecorder through online and offline journeys, interrupts services
with queued jobs, optionally tests live OpenRouter reflection/TTS, destroys and
rebuilds the database from the archive, emits redacted failure artifacts, and
tears down on success.

Enable paid/live provider gates explicitly:

```dotenv
RUN_OPENROUTER_TESTS=true
RUN_TTS_TESTS=true
OPENROUTER_API_KEY=...
```

Run two consecutive clean-volume verifications before publishing. Failed runs
remain under `.test-runtime/verify-*/`; successful runs remove their runtime.

Focused commands:

```bash
npm run lint:check
npm test
npm run test:e2e
npm run test:live
npm run build
npm audit
```

## Release

`package.json` owns the version. The verifier checks API, Compose image tags, and
OCI labels against it. Publishing occurs only from a GitHub release whose tag is
exactly `v${package.version}`. CI publishes exact SemVer plus `latest` for both
application and transcriber manifests.

Do not push, tag, or publish from the verification script.
