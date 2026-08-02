# Mail-IQ backend (on-prem). Build context: ../backend
# node:20-slim (Debian) — Prisma + mupdf WASM behave better here than on Alpine.
FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (incl. prisma CLI, a devDependency) against the lockfile.
COPY package*.json ./
RUN npm ci

# App source (see backend/.dockerignore — private licence key & uploads excluded).
COPY . .

# Generate the Prisma client at build time.
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# On start: apply migrations, run first-run bootstrap (idempotent), then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/bootstrap.js && node src/index.js"]
