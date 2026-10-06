# Deployments

## Production — Docker host

- Reach through the agent's `DOCKER_HOST` socket.
- Containers/Compose services: `audio-diary`, `audio-diary-transcriber`.
- Compose project: `docker-composition`; host directory:
  `/home/mentor/docker-composition`. Read the containers' Compose labels for the
  complete configuration-file list before updating only these two services.
- Images: `actuallymentor/self-hosted-audio-diary:latest` and
  `actuallymentor/self-hosted-audio-diary-transcriber:latest`.
- Deployed version: `0.5.0`, verified 2026-10-06; prior version `0.4.0`.
- Source: tag `v0.5.0`, commit `a57e5ba`.
- CI: https://github.com/actuallymentor/self-hosted-audio-diary/actions/runs/34340778213 — all four jobs passed.
- Release: https://github.com/actuallymentor/self-hosted-audio-diary/actions/runs/34340808962 — verification, publication, and published-image validation passed.
- Public URL: https://diary.mylentor.life (SWAG reverse proxy).
- After deployment: both containers healthy; transcriber model ready; public
  `/version` reports `0.5.0`, `/health/ready` reports `ok`. Real mobile Chrome
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

- Deploy recipe (verified 2026-10-06 for 0.5.0): sibling `docker:cli` container with the host Compose
  directory bind-mounted read-only, project `docker-composition`, all label-listed
  `-f` files; `pull` then `up -d --no-deps audio-diary audio-diary-transcriber`.
  Transcriber restart reloads `large-v3` and spikes host CPU; ask before deploying.
  Confirm `latest` digests match the version tag before pulling.

## Local verification

- `scripts/verify` creates isolated `shad-verify-*` Compose projects and
  `.test-runtime/verify-*` data; production state is separate.
- Agent restarts terminate the verifier process but can leave sibling test
  containers running. Remove only the interrupted verification project's services
  before starting a fresh run.
