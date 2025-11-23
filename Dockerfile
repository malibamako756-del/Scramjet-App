# Production container for Scramjet demo with wisp-js
FROM node:20-slim AS base

ENV NODE_ENV=production

# Enable pnpm via corepack and install a tiny init for proper signal handling
RUN corepack enable \
 && corepack prepare pnpm@9.12.2 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS runner
WORKDIR /app

# Copy runtime files and production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY public ./public
COPY src ./src
COPY package.json ./package.json

# Drop privileges
RUN chown -R node:node /app
USER node

EXPOSE 8080

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
