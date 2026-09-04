# Changelog

## [0.3.0] - 2026-09-04

### Added

- Show device, server, and transcription state on every audio row.
- Let users requeue failed or missing transcriptions.

### Changed

- Gate transcriber health and published-image checks on model readiness.

### Fixed

- Allow slow CPU transcription to exceed five minutes and survive outages.
- Recover failed or missing jobs during upgrades and archive reconstruction.
- Preserve completed transcript state during archive-only database recovery.
- Finalize uploads and enqueue transcription in one database transaction.
- Preserve model-cache ownership in verification and release checks.
- Keep capture and search available while the transcription model starts.
- Log inference failures with their server-side exception details.
- Keep uploaded recordings visible with explicit unknown server state while offline.
- Classify request abort and body timeouts as bounded transcription failures.
- Preserve release diagnostics when published-image readiness fails or is cancelled.

## [0.2.0] - 2026-08-28

### Added

- Show durable upload progress and server finalization in the device outbox.

## [0.1.0] - 2026-08-26

### Added

- Ship the initial offline-first audio diary preview.
- Add archive-first notes, media, search, trash, and disaster recovery.
- Add pinned local large-v3 transcription, reflection, and speech.
- Add production Compose, multi-architecture CI, and release automation.
- Add real-browser, outage, provider, recovery, and secret-boundary gates.

### Changed

- Publish and validate versioned images, then lead documentation with operator deployment.
- Provision ffmpeg before CI media integration tests.

### Fixed

- Recover interrupted captures from validated local chunks after reload.
- Serialize chunk receipt and final media assembly across concurrent tabs.
- Roll back failed account provisioning without consuming bootstrap or invites.
- Preserve tag search and silent transcripts through reprojection and recovery.
- Bound login pressure without account lockout or authentication-slot starvation.
- Clean failed capture starts and skip malformed archive metadata safely.
- Retry cross-tab CSRF races and clear interrupted finalization claims on restart.
- Keep terminal upload failures local and sanitize public error details.
- Restore offline sessions and refresh CSRF before outbox replay.
- Wait for in-flight jobs during shutdown.
- Serve standards-compliant open, suffix, and overlong byte ranges.
