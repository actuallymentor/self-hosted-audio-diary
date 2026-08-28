FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS dependencies

ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS production_dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Reuse native artifacts built once in the toolchain stage.
COPY --from=dependencies /app/node_modules/argon2 ./node_modules/argon2
COPY --from=dependencies /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runtime

ARG APP_VERSION=0.2.0

LABEL org.opencontainers.image.title="Self Hosted Audio Diary" \
    org.opencontainers.image.version="$APP_VERSION"

ENV NODE_ENV=production \
    APP_PORT=3000 \
    APP_DATA_PATH=/data/app \
    DIARY_DATA_PATH=/data/diary

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg util-linux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=production_dependencies /app/node_modules ./node_modules

COPY --from=build /app/dist ./dist
COPY scripts/reconcile.js scripts/rebuild_index.js scripts/recover_accounts.js ./scripts/
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server/server.js"]
