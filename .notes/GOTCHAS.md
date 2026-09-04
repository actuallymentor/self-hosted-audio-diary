# Project gotchas

- Repository access is SSH-only. Keep `origin` on the GitHub SSH URL; the ignored
  repo-local `.ssh_key` is always allowed for repository access.
- Node's bundled `fetch` has a five-minute headers timeout. CPU transcription uses
  one matching Undici `fetch`/`FormData`/dispatcher set with explicit long timeouts;
  mixing the global and package implementations silently breaks multipart uploads.
- When verification runs through `sudo`, test service IDs must come from the
  workspace owner so the restored model cache stays readable and writable.
- Archive reconciliation must project completed job rows for existing transcripts;
  otherwise startup repair queues the entire recovered audio archive again.
- App availability must depend only on the transcriber process starting. Model
  readiness may lag or fail without blocking capture, playback, search, or upload.
- Uploaded local rows are hidden only after a successful day fetch proves they are
  absent remotely. While offline, keep them visible, mark remote state unknown,
  and describe the upload acknowledgment as historical.
- A synchronization event invalidates day absence before refetching. Background
  transcription polls stay quiet and mark the remote snapshot stale on failure.
- Interrupted-capture browser gates must wait for IndexedDB status recovery. DOM
  text can briefly omit the still-persisted `recording` row during page startup.
- Published-image readiness loops must finish inside the job timeout so diagnostics
  and cleanup still run on a normal step failure.
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
- Completed upload manifests have no chunk receipts because finalization deletes
  them. Client resume must handle `status: complete` before treating an empty
  receipt list as zero uploaded bytes.
- Authentication delays must finish before acquiring global authentication
  capacity. Sleeping while holding per-identifier or global slots lets a small
  parallel flood starve valid callers.
- Only production server startup clears interrupted upload-finalization claims.
  Maintenance runtimes may coexist with the live app and must not clear its claim.
- GitHub's `ubuntu-24.04` quality runner does not guarantee `ffmpeg` is installed.
  Provision it before host-side media integration tests; the production image
  already includes it.
