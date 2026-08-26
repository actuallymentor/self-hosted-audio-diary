import asyncio
from pathlib import Path
from threading import Lock

import ctranslate2
from faster_whisper import WhisperModel
from huggingface_hub import snapshot_download

from config import (
    COMPUTE_TYPE,
    CPU_THREADS,
    MODEL_CACHE_PATH,
    MODEL_ID,
    MODEL_OFFLINE,
    MODEL_REVISION,
)


class TranscriptionEngine:
    """Own one serialized CPU model without duplicating its large memory footprint."""

    def __init__(self):
        self.model = None
        self.error = None
        self.error_detail = None
        self.state = "loading"
        self.lock = Lock()

    async def load(self):
        """Load the pinned model after HTTP binds, retrying transient cold starts."""

        while self.state != "ready":
            try:
                self.state = "loading"
                self.model = await asyncio.to_thread(self._load_sync)
                self.error = None
                self.error_detail = None
                self.state = "ready"
            except Exception as error:
                self.error = type(error).__name__
                self.error_detail = str(error)[:300]
                self.state = "failed"
                await asyncio.sleep(30)

    def _load_sync(self):
        supported = ctranslate2.get_supported_compute_types("cpu")

        if COMPUTE_TYPE not in supported:
            raise RuntimeError(f"CPU does not support {COMPUTE_TYPE}")

        snapshot = Path(snapshot_download(
            repo_id=MODEL_ID,
            revision=MODEL_REVISION,
            cache_dir=MODEL_CACHE_PATH,
            local_files_only=MODEL_OFFLINE,
        ))

        if snapshot.name != MODEL_REVISION:
            raise RuntimeError("Resolved model revision does not match the configured commit")

        return WhisperModel(
            str(snapshot),
            device="cpu",
            compute_type=COMPUTE_TYPE,
            cpu_threads=CPU_THREADS,
            num_workers=1,
            local_files_only=True,
        )

    async def transcribe(self, target, language):
        """Decode one upload while keeping inference concurrency at one."""

        if self.state != "ready":
            raise RuntimeError(f"Model is {self.state}")

        return await asyncio.to_thread(self._transcribe_sync, target, language)

    def _transcribe_sync(self, target, language):
        with self.lock:
            selected_language = None if language in {"auto", "mixed"} else language
            mixed = language == "mixed"
            segments, info = self.model.transcribe(
                str(target),
                task="transcribe",
                language=selected_language,
                multilingual=mixed,
                condition_on_previous_text=not mixed,
                vad_filter=True,
                vad_parameters={
                    "threshold": 0.5,
                    "neg_threshold": None,
                    "min_speech_duration_ms": 0,
                    "min_silence_duration_ms": 2000,
                    "speech_pad_ms": 400,
                },
                word_timestamps=False,
            )
            materialized = list(segments)

        return {
            "text": " ".join(segment.text.strip() for segment in materialized).strip(),
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "model": MODEL_ID,
            "revision": MODEL_REVISION,
            "segments": [
                {
                    "id": segment.id,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                }
                for segment in materialized
            ],
        }
