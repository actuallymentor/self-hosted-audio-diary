# Deployments

## Production — Docker host

- Reach through the agent's `DOCKER_HOST` socket.
- Containers/Compose services: `audio-diary`, `audio-diary-transcriber`.
- Compose project: `docker-composition`; host directory:
  `/home/mentor/docker-composition`. Read the containers' Compose labels for the
  complete configuration-file list before updating only these two services.
- Images: `actuallymentor/self-hosted-audio-diary:latest` and
  `actuallymentor/self-hosted-audio-diary-transcriber:latest`.
- Observed version before the 2026-09-09 UX deployment: `0.3.0`.
- No published app port. Public URL has not been verified in this session.
- Inspect version/readiness inside `audio-diary` at
  `http://127.0.0.1:3000/version` and `/health/ready` using `docker exec`.
- App state: `/mnt/internalnvme/audio-diary/app` on host.
- Diary archive: `/mnt/raidbox/audio-diary/diary` on host.
- Publish through the GitHub Actions release workflow; confirm CI, release jobs,
  registry validation, and running-service version before claiming deployment.

## Local verification

- `scripts/verify` creates isolated `shad-verify-*` Compose projects and
  `.test-runtime/verify-*` data; production state is separate.
- Agent restarts terminate the verifier process but can leave sibling test
  containers running. Remove only the interrupted verification project's services
  before starting a fresh run.
