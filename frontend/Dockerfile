# Dev-time serving: bun + Vite dev server (HMR-friendly for local development).
# Build context is the repo root so /fixtures (parity tests) is available.
FROM oven/bun:1
WORKDIR /workspace

# Healthcheck dependency
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY frontend/package.json frontend/bun.lock ./
COPY frontend/tsconfig.base.json frontend/vitest.config.ts frontend/playwright.config.ts ./
COPY frontend/.prettierrc.json frontend/.prettierignore ./
COPY frontend/apps apps
COPY frontend/packages packages
COPY frontend/assets assets
COPY fixtures fixtures

# Install after apps are present so workspace packages resolve.
RUN bun install

EXPOSE 5173
CMD ["bun", "run", "dev"]