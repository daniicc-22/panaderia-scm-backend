# syntax=docker/dockerfile:1

# ---------- Etapa 1: compilar con Vite ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Las variables VITE_* se escriben dentro del build: hay que fijarlas al construir la imagen.
ARG VITE_API_URL=http://localhost:3000
ARG VITE_API_MODE=real
ENV VITE_API_URL=$VITE_API_URL \
    VITE_API_MODE=$VITE_API_MODE

RUN npm run build

# ---------- Etapa 2: servir con Nginx ----------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
