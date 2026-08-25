# Human decisions and inputs

## 2026-08-25 — resolved

- Publish `linux/amd64` and `linux/arm64`; primary host is an x86-64 Intel NUC with
  16 GiB RAM, integrated Intel graphics, and no NVIDIA GPU.
- Prefer transcription quality over speed. Use CPU `faster-whisper` `large-v3`
  INT8 with automatic multilingual/code-switching support.
- English is primary; recordings may mix Dutch and other languages.
- A pinned transcription model may download on first start into persistent cache.
- Use one OpenRouter key for reflection and OpenRouter TTS; model and voice remain
  independently configurable.
- Physical mobile testing follows the first published preview images. Owner will
  test devices; results gate stable `1.0.0`, not the initial preview.
- Publish separate app and transcription images in one Compose stack.
- The GitHub deploy key authenticates successfully and has repository read/write
  access; write access was verified with a dry run and nothing was pushed.
- GitHub CLI is authenticated as `actuallymentor` with repository administrator
  access. Its stored token may configure repository Actions settings, secrets, and
  variables; a separate `GH_TOKEN` in `.env` is unnecessary in this workspace.
- GitHub Actions contains `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` as secrets,
  plus `DOCKERHUB_APP_IMAGE` and `DOCKERHUB_TRANSCRIBER_IMAGE` as variables.
- GitHub Actions is enabled with all actions allowed; the default workflow token
  remains read-only and cannot approve pull requests.
- OpenRouter authentication and a live ZDR Claude Sonnet 4.6 request passed.
  Gemini 3.1 Flash TTS with the Sulafat voice also passed with ZDR when requesting
  PCM. Its OpenRouter endpoint rejects MP3, so `.env` and the plan now request PCM
  and require transcoding afterward.
- `.env` is ignored and restricted to mode `600`.

## Still needed

- Set the production `APP_ORIGIN` when the deployed HTTPS hostname is known; the
  localhost default is sufficient for development. Physical iPhone testing needs
  that trusted HTTPS route; LAN-IP HTTP is not a valid PWA/microphone test origin.
