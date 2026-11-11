# One image, two roles: the web app and the FFmpeg worker share the same code.
#   docker build -t clipforge .
#   web:    docker run clipforge npm run start
#   worker: docker run clipforge npm run start:worker
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
RUN mkdir -p /data/storage /data/tmp && chown -R node:node /data /app/apps/web/.next
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
