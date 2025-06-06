FROM node:20-alpine AS base

FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN yarn global add turbo@2
COPY . .
RUN turbo prune web --docker

FROM base AS installer
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=builder /app/out/full/ .
RUN yarn install --frozen-lockfile

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --chown=nextjs:nodejs --from=installer /app .

USER nextjs

CMD ["sh", "-c", "cd apps/web && yarn dev --hostname 0.0.0.0 --port 3000"]


# FROM node:20-alpine

# WORKDIR /app
# ENV NODE_ENV=development
# # Install yarn globally
# # RUN npm install -g yarn

# # Copy root pack age files
# COPY package.json yarn.lock turbo.json ./

# # Install dependencies
# # RUN yarn install --frozen-lockfile
# COPY . .

# WORKDIR /app/apps/web
# EXPOSE 3000
# # RUN ["yarn", "build"]
# CMD ["yarn", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
# # CMD ["yarn", "uuid"]
# FROM node:20-alpine AS base
# RUN apk update && apk add --no-cache libc6-compat
# RUN yarn global add turbo@^2

# WORKDIR /app
# ENV NODE_ENV=development
# FROM base AS builder
# COPY . .
# RUN turbo prune web --docker

# FROM base AS installer
# WORKDIR /app
# COPY --from=builder /app/out/json/ ./
# RUN yarn install --frozen-lockfile

# COPY --from=builder /app/out/full/ ./
# RUN yarn turbo run build --filter=web...

# FROM base AS runner
# WORKDIR /app

# RUN addgroup --system --gid 1001 nodejs \
#  && adduser  --system --uid 1001 nextjs
# USER nextjs

# COPY --from=installer --chown=nextjs:nodejs \
#   /app/apps/web/.next/standalone ./ 
# COPY --from=installer --chown=nextjs:nodejs \
#   /app/apps/web/.next/static ./apps/web/.next/static
# COPY --from=installer --chown=nextjs:nodejs \
#   /app/apps/web/public ./apps/web/public

# EXPOSE 3000
# CMD ["yarn", "start"]
