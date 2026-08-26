# Dev-time serving: bun + Vite dev server (HMR-friendly for local development).
FROM oven/bun:1
WORKDIR /workspace

# Healthcheck dependency
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY tsconfig.base.json vitest.config.ts playwright.config.ts .prettierrc.json .prettierignore ./
COPY apps apps

# Install after apps are present so workspace packages resolve.
RUN bun install

EXPOSE 5173
CMD ["bun", "run", "dev"]