# syntax=docker/dockerfile:1

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

# ffmpeg produces thumbnails and reads durations. yt-dlp is only needed by the manual
# paste fallback; forwarded reels arrive as plain signed CDN links. The standalone
# yt-dlp build is used because it bundles the impersonation support Instagram now
# requires for anonymous access.
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && case "${TARGETARCH}" in \
      arm64) YTDLP_ASSET=yt-dlp_linux_aarch64 ;; \
      *)     YTDLP_ASSET=yt-dlp_linux ;; \
    esac \
 && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}" -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Migrations are applied via `fly ssh console -C "node scripts/migrate.mjs"`.
COPY --from=builder --chown=node:node /app/db ./db
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/node_modules/postgres ./node_modules/postgres

RUN mkdir -p /data/videos /data/thumbnails /data/tmp \
 && chown -R node:node /data

USER node

EXPOSE 3000
CMD ["node", "server.js"]
