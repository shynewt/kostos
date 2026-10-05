FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/build ./build
COPY --from=builder /app/scripts/serve.js ./scripts/serve.js
COPY --from=builder /app/scripts/relay.js ./scripts/relay.js
COPY --from=builder /app/src/lib/sync/relay-protocol.js ./src/lib/sync/relay-protocol.js
ENV KOSTOS_DATA_DIR=/data
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
	CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "scripts/serve.js"]
