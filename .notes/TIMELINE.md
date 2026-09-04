# Timeline

- 2026-08-25 — Product, deployment, model, provider, and repository decisions
  resolved; implementation authorized without further human input.
- 2026-08-26 — Preview implementation completed. Offline capture/reconnect,
  outage recovery, live multilingual transcription, reflection, TTS, archive
  reconciliation, image metadata, and secret-boundary gates passed twice from
  clean isolated volumes after final reflection, style, and changelog review.
- 2026-08-26 — Post-commit independent review found and drove fixes for interrupted
  capture recovery, upload finalization concurrency, provisioning rollback, bounded
  auth delays, tag reprojection, silent transcripts, and safe API error boundaries.
  The corrected 25-test gate and full clean-volume verifier then passed twice.
- 2026-08-26 — Follow-up review hardened concurrent authentication, transient CSRF
  replay, malformed-tag reconciliation, older-browser recorder cleanup, and restart
  recovery of incomplete finalization claims. The expanded 26-test full verifier
  passed twice from clean isolated volumes.
- 2026-08-26 — Final review exposed authentication-slot starvation, synchronous
  recorder-start cleanup, and archive root-shape gaps; hardening resumed.
- 2026-08-26 — The second final verifier exposed a nondeterministic Dutch/German
  cognate in live speech recognition; the gate now accepts equivalent concepts.
- 2026-08-26 — Final hardening completed. Authentication capacity, failed recorder
  starts, malformed archive shapes, and multilingual live assertions were corrected.
  Two unchanged 27-test full verifiers (`172955-30853`, `173757-32282`) passed
  browser interruption, restart, live provider, reconciliation, and cleanup gates.
- 2026-08-26 — Distribution scope corrected: publish only through the reproducible
  GitHub Actions release workflow, then validate registry-pulled images. Operator
  documentation now leads with a copyable published-image Compose deployment.
- 2026-08-26 — Independent review added post-publish registry validation and caught
  clean-runner image naming and fail-open health probes before the first release.
- 2026-08-26 — GitHub Actions release `v0.1.0` passed two clean full-stack
  verifiers, published both `amd64`/`arm64` images, and validated the Docker Hub
  manifests and registry-pulled services. An additional anonymous pull of the
  exact README Compose passed pinned-model readiness, a real Chrome PWA journey,
  and service restart checks.
- 2026-08-28 — Upload feedback uses server-confirmed durable bytes. Short transfers
  stay visibly indeterminate; longer transfers advance by confirmed chunks and show
  a distinct finalization state before the server-safe acknowledgment.
- 2026-09-04 — Production audit found one audio job exhausted after eight exact
  five-minute header timeouts while the healthy CPU transcriber was still working.
  Recovery, durable retry, explicit per-recording location/transcription state, and
  readiness-aware deployment gates were implemented and passed the full verifier.
- 2026-09-04 — Post-commit independent review prevented archive-wide reprocessing
  after database recovery and kept the app available during model startup. It also
  removed deleted recording ghosts and hardened timeout and release diagnostics.
- 2026-09-04 — Follow-up review preserved uploaded rows during offline day fetches,
  aligned timeout labels with real abort/body errors, and bounded release readiness
  inside its job budget. Unit, browser, and full-stack verification resumed.
