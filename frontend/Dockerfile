# --- Build Vite ---
FROM node:20-bookworm-slim AS build
WORKDIR /app

ARG VITE_API_BASE="https://mdp-api.mon-site.ca"
ENV VITE_API_BASE=${VITE_API_BASE}

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}
RUN VITE_API_BASE=${VITE_API_BASE} npm run build

# --- Runtime Nginx (statique) ---
FROM nginx:alpine
# Healthcheck via /healthz
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/

