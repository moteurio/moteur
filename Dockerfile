# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.16.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app
ENV NODE_ENV="production"

ARG PNPM_VERSION=10.12.1
RUN npm install -g pnpm@$PNPM_VERSION


# -------- Build stage --------
FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Copy monorepo root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy everything else needed for build
COPY . .

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

# Build only the core package and its deps
RUN npm run build

# Prune dev deps for production
#RUN pnpm prune --prod
RUN ls -l /app/dist/src

# -------- Final stage --------
FROM base

COPY --from=build /app /app

EXPOSE 3000
CMD ["node", "dist/src/api.js"]
