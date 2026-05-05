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

RUN mkdir -p /data && chown -R node:node /data /app

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/db ./db
COPY --from=builder --chown=node:node /app/scripts ./scripts

USER node

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.js && npm start"]
