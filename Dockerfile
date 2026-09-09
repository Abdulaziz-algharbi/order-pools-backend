# ---- build: compile TypeScript to dist/ ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production deps only + compiled output ----
FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8000

# /ping is mounted directly on the Express app (not under /api), so it's
# reachable here even though nginx only proxies /api/* to this service.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8000/ping || exit 1

CMD ["node", "dist/src/server.js"]
