# --- Build Vite ---
FROM node:20-bookworm-slim AS build
WORKDIR /app

ARG VITE_API_BASE=/api
ARG VITE_APP_SLUG=mdp
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_APP_SLUG=${VITE_APP_SLUG}

COPY package*.json ./
RUN npm ci

COPY . .
RUN VITE_API_BASE=${VITE_API_BASE} VITE_APP_SLUG=${VITE_APP_SLUG} npm run build

# --- Runtime Nginx (statique) ---
FROM nginx:alpine
# Healthcheck via /healthz
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
