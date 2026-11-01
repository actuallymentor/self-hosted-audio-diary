# Deployments

## Production — Docker host

- Reach through the agent's `DOCKER_HOST` socket.
- Containers/Compose services: `audio-diary`, `audio-diary-transcriber`.
- Compose project: `docker-composition`; host directory:
  `/home/mentor/docker-composition`. Read the containers' Compose labels for the
  complete configuration-file list before updating only these two services.
- Images: `actuallymentor/self-hosted-audio-diary:latest` and
  `actuallymentor/self-hosted-audio-diary-transcriber:latest`.
- Deployed version: app `0.6.1`, transcriber `0.6.0` (no transcriber changes), verified 2026-11-01.
- Source: tag `v0.6.1`, commit `448653f`.
- CI: https://github.com/actuallymentor/self-hosted-audio-diary/actions/runs/41302717055 — passed.
- Release: https://github.com/actuallymentor/self-hosted-audio-diary/actions/runs/41303668614 — verification, publication, and published-image validation passed.
- Public URL: https://diary.mylentor.life (SWAG reverse proxy).
- After deployment: both containers healthy; transcriber model ready; public
  `/version` reports `0.6.1`, `/health/ready` reports `ok`. Real mobile Chrome
  login-page smoke passed with no JavaScript errors or horizontal overflow.
  Authenticated UX was exercised in isolated local Docker tests.
- No directly published app port.
- Inspect version/readiness inside `audio-diary` at
  `http://127.0.0.1:3000/version` and `/health/ready` using `docker exec`.
- App state: `/mnt/internalnvme/audio-diary/app` on host.
- Diary archive: `/mnt/raidbox/audio-diary/diary` on host.
- Publish through the GitHub Actions release workflow using an SSH-pushed version
  tag or a published GitHub release. Confirm CI, release jobs,
  registry validation, and running-service version before claiming deployment.

- Deploy recipe (verified 2026-11-01 for 0.6.0; run docker through `sudo -n`): sibling `docker:cli` container with the host Compose
  directory bind-mounted read-only, project `docker-composition`, all label-listed
  `-f` files; `pull` then `up -d --no-deps audio-diary audio-diary-transcriber`.
  Transcriber restart reloads `large-v3` and spikes host CPU; deploy only with owner approval.
  Confirm `latest` digests match the version tag before pulling.
  Watch CI with authenticated `gh`; anonymous API polling hits the shared-IP limit.

## Local verification

- `scripts/verify` creates isolated `shad-verify-*` Compose projects and
  `.test-runtime/verify-*` data; production state is separate.
- Agent restarts terminate the verifier process but can leave sibling test
  containers running. Remove only the interrupted verification project's services
  before starting a fresh run.
