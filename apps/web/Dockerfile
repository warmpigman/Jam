# 1. Base image with Turborepo installed
FROM node:20-alpine AS base
RUN apk update && apk add --no-cache libc6-compat
# (optional) Install your major turbo version
RUN yarn global add turbo@^2

WORKDIR /app
ENV NODE_ENV=development
# -------------------------------------------------------------------
# 2. Builder: prune the monorepo to only web’s dependencies
FROM base AS builder
COPY . .
# This generates /app/out/json (lockfile + package.json’s) and /app/out/full (all needed source)
RUN turbo prune web --docker

# -------------------------------------------------------------------
# 3. Installer: first install deps (cache-friendly)
FROM base AS installer
WORKDIR /app
# Only the pruned lockfile & package.json’s
COPY --from=builder /app/out/json/ ./
RUN yarn install --frozen-lockfile

# Copy full source and build
COPY --from=builder /app/out/full/ ./
RUN yarn turbo run build --filter=web...

# -------------------------------------------------------------------
# 4. Runner: copy Next.js standalone output
FROM base AS runner
WORKDIR /app

# Drop privileges
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs
USER nextjs

# Next.js standalone output traces only what's needed at runtime
COPY --from=installer --chown=nextjs:nodejs \
  /app/apps/web/.next/standalone ./ 
COPY --from=installer --chown=nextjs:nodejs \
  /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=nextjs:nodejs \
  /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["yarn", "start"]
