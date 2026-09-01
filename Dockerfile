# --- Build stage: compile TypeScript with dev dependencies ---
FROM node:22-alpine AS build
WORKDIR /app
# The playwright package tries to download browsers at install time; the
# agent works without them (web tools degrade to a friendly error), and
# browsers would defeat the point of a slim image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
RUN npm run build

# --- Runtime stage: production dependencies plus compiled output ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
ENTRYPOINT ["node", "dist/index.js"]
