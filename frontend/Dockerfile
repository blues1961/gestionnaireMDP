FROM node:20-alpine
WORKDIR /app

# Installer deps
COPY package*.json ./
RUN npm ci

# Copier le code et builder
COPY . .
# (facultatif) si tu utilises une variable Vite au build :
# ENV VITE_API_BASE=https://api.mon-site.ca
RUN npm run build

# Servir le build avec vite preview
CMD ["npm","run","preview","--","--host","0.0.0.0","--port","4173"]
