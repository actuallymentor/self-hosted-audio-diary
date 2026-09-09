# SHAD — Self-Hosted Audio Diary

Private voice journaling with offline recording, resumable uploads, local
multilingual transcription, search, reflections, and ordinary files you can back
up without SHAD.

Status: `0.4.0` preview. Images support `linux/amd64` and `linux/arm64`. Physical
iPhone and Android validation remains required before `1.0.0`.

## Requirements

- Docker Engine with Compose v2.
- About 8 GiB free during first pull and model setup.
- A persistent host with roughly 16 GiB RAM recommended for `large-v3`.
- A reverse proxy with HTTPS for internet-facing installs.

The first transcription start downloads roughly 3 GiB into the model cache.
English, Dutch, and mixed-language recordings are detected automatically.

## Install

Create an empty directory and save this as `compose.yaml`:

```yaml
name: shad

services:
  app:
    image: actuallymentor/self-hosted-audio-diary:0.4.0
    restart: unless-stopped
    init: true
    ports:
      - "${APP_PORT:-3000}:3000"
    environment:
      APP_DATA_PATH: /data/app
      APP_GID: ${APP_GID:-10001}
      APP_PORT: 3000
      APP_UID: ${APP_UID:-10001}
      DIARY_DATA_PATH: /data/diary
      NODE_ENV: production
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:-}
      OPENROUTER_REFLECTION_MODEL: ${OPENROUTER_MODEL:-anthropic/claude-sonnet-4.6}
      OPENROUTER_TTS_FORMAT: ${TTS_RESPONSE_FORMAT:-pcm}
      OPENROUTER_TTS_MODEL: ${TTS_MODEL:-google/gemini-3.1-flash-tts-preview}
      OPENROUTER_TTS_VOICE: ${TTS_VOICE:-Sulafat}
      OPENROUTER_ZDR: ${OPENROUTER_ZDR_ONLY:-true}
      SESSION_COOKIE_SECURE: ${SESSION_COOKIE_SECURE:-false}
      SESSION_TTL_DAYS: ${SESSION_TTL_DAYS:-30}
      TRANSCRIPTION_MODEL: large-v3
      TRANSCRIPTION_URL: http://transcriber:8000
      UPLOAD_TTL_DAYS: ${UPLOAD_TTL_DAYS:-30}
    volumes:
      - ${APP_DATA_PATH:-./data/app}:/data/app
      - ${DIARY_DATA_PATH:-./data/diary}:/data/diary
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(!r.ok)process.exit(1)})"]
      interval: 10s
      timeout: 5s
      retries: 6
    depends_on:
      transcriber:
        condition: service_started

  transcriber:
    image: actuallymentor/self-hosted-audio-diary-transcriber:0.4.0
    restart: unless-stopped
    init: true
    environment:
      APP_GID: ${APP_GID:-10001}
      APP_UID: ${APP_UID:-10001}
      HF_TOKEN: ${HF_TOKEN:-}
      MODEL_CACHE_PATH: /var/lib/transcriber/huggingface
      TRANSCRIPTION_COMPUTE_TYPE: ${TRANSCRIPTION_COMPUTE_TYPE:-int8}
      TRANSCRIPTION_CPU_THREADS: ${TRANSCRIPTION_CPU_THREADS:-auto}
      TRANSCRIPTION_MODEL: Systran/faster-whisper-large-v3
      TRANSCRIPTION_MODEL_REVISION: ${TRANSCRIPTION_MODEL_REVISION:-edaa852ec7e145841d8ffdb056a99866b5f0a478}
    volumes:
      - ${TRANSCRIPTION_MODEL_CACHE_PATH:-./data/models}:/var/lib/transcriber/huggingface
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/readyz')"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 1h
```

Create `.env` beside it:

```dotenv
APP_PORT=3000
APP_UID=10001
APP_GID=10001

APP_DATA_PATH=./data/app
DIARY_DATA_PATH=./data/diary
TRANSCRIPTION_MODEL_CACHE_PATH=./data/models

# Use true when users reach SHAD through HTTPS.
SESSION_COOKIE_SECURE=false

# Optional: enables reflections and spoken reflections.
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
OPENROUTER_ZDR_ONLY=true
TTS_MODEL=google/gemini-3.1-flash-tts-preview
TTS_VOICE=Sulafat
TTS_RESPONSE_FORMAT=pcm
```

Create writable storage, pull the published images, and start SHAD:

```bash
mkdir -p data/app data/diary data/models
sudo chown -R 10001:10001 data/app data/diary data/models
chmod 600 .env
docker compose pull
docker compose up --detach --wait
docker compose ps
```

Open `http://localhost:3000` on the Docker host or use the HTTPS URL from your
reverse proxy. The first account becomes administrator only when both the database
and diary archive are empty. Create later accounts with one-use invitations from
Settings.

## Daily use

- Press Record, speak, then stop. Every audio row shows whether its bytes are on
  this device, on the server, queued, transcribing, complete, or failed.
- Use **+** on Today for a note, photo, or video. Leaving Today stops and saves an active recording.
- Browse entries and edit day tags in Calendar; use the arrows or Today shortcut.
- Search diary text, transcripts, and tags.
- Reflect over Week (default), Month, Quarter, Year, or Custom. Presets include today;
  Week covers seven days, longer periods use calendar months with month-end clamping.
  The displayed dates are the exact inclusive range. Speech requires `OPENROUTER_API_KEY`.
- Adjust reading size and spacing in Settings with live values, default markers,
  resets, and a reading preview. Preferences persist on this browser.
- Open Menu on mobile; desktop navigation stays visible at the top.
- Install the PWA from its in-app Install button or browser menu.

Recordings survive offline use, reloads, and interrupted uploads. Valid local
chunks resume when connectivity returns. Damaged captures stay in the device
outbox as `Needs attention`; SHAD does not delete their bytes.

## Network and HTTPS

SHAD serves plain HTTP on `APP_PORT`. Keep that port private and terminate public
TLS at your reverse proxy. Forward `Host` and `X-Forwarded-Proto`.

Browsers allow microphone capture and full PWA behavior only in a secure context.
Use HTTPS from phones and other computers; plain HTTP works only through the
browser's localhost exception on the Docker host.

Set `SESSION_COOKIE_SECURE=true` when the browser-facing URL is HTTPS. Leave it
`false` only for direct HTTP on a trusted network.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `APP_PORT` | Host listener | `3000` |
| `APP_UID` / `APP_GID` | Container file ownership | `10001` |
| `APP_DATA_PATH` | SQLite, sessions, jobs, indexes | `./data/app` |
| `DIARY_DATA_PATH` | Canonical notes, media, transcripts | `./data/diary` |
| `TRANSCRIPTION_MODEL_CACHE_PATH` | Persistent large-v3 cache | `./data/models` |
| `TRANSCRIPTION_CPU_THREADS` | CPU threads; reserves one physical core | `auto` |
| `SESSION_COOKIE_SECURE` | HTTPS-only browser session cookie | `false` |
| `SESSION_TTL_DAYS` | Login lifetime | `30` |
| `UPLOAD_TTL_DAYS` | Incomplete upload retention | `30` |
| `OPENROUTER_API_KEY` | Optional reflection and speech access | empty |
| `OPENROUTER_MODEL` | Reflection model | Claude Sonnet 4.6 |
| `TTS_MODEL` / `TTS_VOICE` | Speech model and voice | Gemini / Sulafat |
| `OPENROUTER_ZDR_ONLY` | Request zero-data-retention routing | `true` |

Recording, search, archive access, and local transcription work without
OpenRouter.

## Data and backups

The diary filesystem is canonical. SQLite is replaceable operational state.

```text
data/
├── app/                       # accounts, sessions, jobs, derived indexes
├── models/                    # reusable large-v3 cache
└── diary/
    ├── .incoming/             # resumable upload staging
    └── users/<account>/
        ├── profile.json
        ├── days/YYYY-MM-DD/   # metadata, media, notes, transcripts
        ├── reflections/YYYY/
        └── .trash/
```

Back up `data/app` and `data/diary` together. For a simple consistent backup:

```bash
docker compose stop
tar -czf shad-backup.tgz data/app data/diary
docker compose start
```

Deletion moves files into each account's `.trash`; it does not erase them
immediately. Never edit `.incoming` while uploads are active.

## Recovery

Run maintenance commands with the same mounted archive:

```bash
# Rebuild database projections from the human-readable archive.
docker compose run --rm --no-deps app npm run reconcile

# Rebuild only full-text search indexes.
docker compose run --rm --no-deps app npm run rebuild-index

# Re-establish an administrator after database loss.
docker compose run --rm --no-deps app \
  npm run recover-accounts -- --admin-email=owner@example.com
```

Recovered identities remain pending until explicitly claimed.

## Update

Change both image tags in `compose.yaml` to the same published version, then:

```bash
docker compose pull
docker compose up --detach --wait --remove-orphans
```

Use versioned tags for controlled upgrades. `latest` tracks the newest published
preview and may change; pin the published manifest digest when immutability matters.

## Troubleshooting

```bash
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 transcriber
```

- `permission denied`: re-run `chown` with the configured `APP_UID:APP_GID`.
- Transcription unavailable after first start: large-v3 may still be downloading.
- Login loops behind HTTPS: set `SESSION_COOKIE_SECURE=true` and restart `app`.
- Reflection or speech unavailable: verify `OPENROUTER_API_KEY`; diary capture and
  local transcription remain available.
