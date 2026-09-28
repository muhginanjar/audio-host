# ── Build stage ──────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ── Runtime stage (prod deps only; no toolchain needed) ──────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries for linux x64/arm64 glibc
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
RUN mkdir -p data storage && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
