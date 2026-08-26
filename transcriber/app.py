import asyncio
from contextlib import asynccontextmanager
from contextlib import suppress
from pathlib import Path
import tempfile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from config import COMPUTE_TYPE, MODEL_ID, MODEL_REVISION
from engine import TranscriptionEngine


engine = TranscriptionEngine()


@asynccontextmanager
async def lifespan(_app):
    """Bind liveness first; model download and load continue in the background."""

    task = asyncio.create_task(engine.load())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/healthz")
async def health():
    """Report process liveness without touching model or network state."""

    return {"status": "ok"}


@app.get("/readyz")
async def ready():
    """Report whether the pinned model can accept work."""

    if engine.state != "ready":
        return JSONResponse(
            status_code=503,
            content={
                "status": engine.state,
                "code": "MODEL_LOAD_FAILED" if engine.state == "failed" else None,
                "errorType": engine.error,
                "errorDetail": engine.error_detail,
            },
        )

    return {
        "status": "ready",
        "backend": "faster-whisper",
        "model": MODEL_ID,
        "revision": MODEL_REVISION,
        "device": "cpu",
        "computeType": COMPUTE_TYPE,
    }


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("large-v3"),
    language: str = Form("auto"),
    response_format: str = Form("verbose_json"),
):
    """Serve an OpenAI-shaped boundary backed entirely by the local model."""

    if engine.state != "ready":
        raise HTTPException(status_code=503, detail=f"Model is {engine.state}")

    if language not in {"auto", "en", "nl", "mixed"}:
        raise HTTPException(status_code=400, detail="Unsupported language mode")

    with tempfile.NamedTemporaryFile(suffix=".flac", delete=False) as temporary:
        target = Path(temporary.name)
        byte_size = 0

        while chunk := await file.read(1024 * 1024):
            byte_size += len(chunk)
            temporary.write(chunk)

    if not byte_size:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Audio is empty")

    try:
        result = await engine.transcribe(target, language)
    except Exception as error:
        raise HTTPException(status_code=422, detail="Audio could not be transcribed") from error
    finally:
        target.unlink(missing_ok=True)

    if response_format == "text":
        return JSONResponse(content={"text": result["text"]})

    return result
