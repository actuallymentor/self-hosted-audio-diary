# Human input

## 2026-08-25 — implementation preflight

- Deployment CPU architecture/core count, RAM, GPU/VRAM, and NVIDIA toolkit availability.
- Whether single recordings commonly mix English and Dutch.
- OpenRouter model, API key, and Zero Data Retention requirement.
- TTS provider/model/voice/key, or confirmation that configured-off is acceptable.
- Production HTTPS origin.
- Docker Hub image namespace/repository and publish scope; Actions credentials belong in GitHub secrets.
- Real iPhone/Android or device-cloud availability for the release gate, including
  a trusted TLS route to the iPhone.
- Add `.ssh_key.pub` as a write-enabled GitHub deploy key.
