# Changelog

## [0.1.0] - 2026-08-26

### Added

- Ship the initial offline-first audio diary preview.
- Add archive-first notes, media, search, trash, and disaster recovery.
- Add pinned local large-v3 transcription, reflection, and speech.
- Add production Compose, multi-architecture CI, and release automation.
- Add real-browser, outage, provider, recovery, and secret-boundary gates.

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
