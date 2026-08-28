FROM python:3.11.16-slim-bookworm@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b

ARG APP_VERSION=0.2.0

LABEL org.opencontainers.image.title="SHAD local transcriber" \
    org.opencontainers.image.version="$APP_VERSION"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MODEL_CACHE_PATH=/var/lib/transcriber/huggingface \
    HF_HOME=/var/lib/transcriber/huggingface \
    HUGGINGFACE_HUB_CACHE=/var/lib/transcriber/huggingface

WORKDIR /service

COPY requirements.txt ./
RUN apt-get update \
    && apt-get install --yes --no-install-recommends util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir --only-binary=:all: -r requirements.txt

COPY app.py config.py engine.py entrypoint.sh ./

RUN groupadd --gid 10001 transcriber \
    && useradd --uid 10001 --gid 10001 --create-home transcriber \
    && install -d -o transcriber -g transcriber /var/lib/transcriber/huggingface \
    && chmod 0755 /service/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/service/entrypoint.sh"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
