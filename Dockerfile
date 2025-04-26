# Stage 1: Build Stage
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the Next.js application
# Generate Prisma client if needed (uncomment if using Prisma)
# RUN npx prisma generate
RUN npm run build

# Prune development dependencies
RUN npm prune --production

# Stage 2: Production Stage
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy built app artifacts from the builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Expose the port the app runs on
EXPOSE 3000

CMD ["sh", "-c", "npm run db:migrate && npm start"]
