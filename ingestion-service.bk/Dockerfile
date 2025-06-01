FROM node:20-alpine AS base
RUN apk update && apk add --no-cache libc6-compat
RUN yarn global add turbo@^2

WORKDIR /app
ENV NODE_ENV=production

FROM base AS builder
COPY . .
RUN turbo prune ingestion-service --docker

FROM base AS installer
WORKDIR /app
COPY --from=builder /app/out/json/ ./
RUN yarn install --frozen-lockfile

COPY --from=builder /app/out/full/ ./
RUN yarn turbo run build --filter=ingestion-service...

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 ingestion
USER ingestion

COPY --from=installer --chown=ingestion:nodejs /app/apps/ingestion-service/dist ./dist
COPY --from=installer --chown=ingestion:nodejs /app/apps/ingestion-service/package.json ./package.json
COPY --from=installer --chown=ingestion:nodejs /app/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "dist/index.js"]