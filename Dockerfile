# syntax=docker/dockerfile:1

# ---------- Etapa 1: compilar ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma necesita OpenSSL para generar el cliente
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Solo para generar el cliente de Prisma durante el build (no se conecta a nada).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Etapa 2: imagen final ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# node_modules incluye el cliente de Prisma ya generado.
# prisma/ debe viajar porque /abc lee prisma/frecuencia_lotes.json en tiempo de ejecución.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
