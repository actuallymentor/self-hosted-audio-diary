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

## Still needed

- Add `.ssh_key.pub` as a write-enabled GitHub deploy key.
- Put `OPENROUTER_API_KEY` in `.env` before live reflection/TTS verification.
- Put Docker Hub username, scoped token, app image name, and transcriber image name
  in the documented `.env` variables before publication.
- Put a fine-grained `GH_TOKEN` with repository Secrets and Variables write
  permission in `.env` if the agent should install GitHub Actions configuration.
- Set the production `APP_ORIGIN` when the deployed HTTPS hostname is known; the
  localhost default is sufficient for development. Physical iPhone testing needs
  that trusted HTTPS route; LAN-IP HTTP is not a valid PWA/microphone test origin.
