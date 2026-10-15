# One image runs the web app, the worker and migrations (different commands in compose).
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Build-time placeholders only; real values come from the runtime environment.
ENV SKIP_ENV_VALIDATION=1
RUN npx prisma generate && npm run build && npm run build:worker
RUN npm prune --omit=dev --no-audit --no-fund

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_LOCAL_DIR=/data/storage
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/src/server/billing/catalog.ts ./src/server/billing/catalog.ts
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/next.config.ts /app/tsconfig.json ./
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "run", "start"]
