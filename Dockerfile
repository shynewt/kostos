# Stage 1: Build Stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# Stage 2: Production Stage
FROM node:22-alpine

ENV NODE_ENV=production \
    DATABASE_URL=/data/kostos.db

WORKDIR /app

RUN mkdir -p /data/backups && chown -R node:node /data /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/db ./db
COPY --from=builder --chown=node:node /app/scripts ./scripts

EXPOSE 3000

# Start as root only long enough to fix bind-mounted SQLite file permissions, then drop to node.
# If a rootless Docker setup does not allow chown, continue as root rather than failing startup.
CMD ["sh", "-c", "mkdir -p /data/backups && if chown -R node:node /data 2>/dev/null; then su node -s /bin/sh -c 'node scripts/migrate.js && npm start'; else echo 'Warning: could not chown /data; running as current user'; node scripts/migrate.js && npm start; fi"]
