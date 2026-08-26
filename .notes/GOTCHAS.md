# Project gotchas

- Babysit mounts `/workspace/node_modules` from a separate volume. Sibling Docker
  containers must build lockfile-coupled dependencies instead of bind-mounting the
  host workspace's `node_modules` path.
- Chrome treats the Docker hostname `app` as part of the HSTS-preloaded `.app`
  namespace. Browser tests use the reserved `diary.test` network alias.
- End-to-end microphone audio must contain recognizable speech. A tone validates
  `MediaRecorder`, but large-v3 correctly returns an empty transcript.
- Provider-synthesized multilingual speech can make large-v3 choose a neighboring
  language or phonetic cognate. Live gates should assert concepts, not exact prose.
- Failed verification artifacts may be uploaded by CI. Rendered Compose files and
  retained text logs must stay credential-free and be redacted defensively.
- Active `MediaRecorder` instances hold a Web Lock. Outbox recovery must validate
  every persisted chunk and never finalize a recording still locked by another tab.
- Chunk receipt writes and final assembly share one per-upload lock. Splitting those
  critical sections reintroduces canonical-file corruption under cross-tab replay.
- Authentication delays must finish before acquiring global authentication
  capacity. Sleeping while holding per-identifier or global slots lets a small
  parallel flood starve valid callers.
- Only production server startup clears interrupted upload-finalization claims.
  Maintenance runtimes may coexist with the live app and must not clear its claim.
- GitHub's `ubuntu-24.04` quality runner does not guarantee `ffmpeg` is installed.
  Provision it before host-side media integration tests; the production image
  already includes it.
