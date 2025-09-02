# --- Build ---
FROM node:20-bookworm-slim AS build
WORKDIR /app
ARG VITE_API_BASE="http://localhost:9004"
ENV VITE_API_BASE=${VITE_API_BASE}
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime (Nginx statique) ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
