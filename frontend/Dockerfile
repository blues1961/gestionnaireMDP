# ====== Étape 1 : installer les dépendances via le lockfile ======
FROM node:20-alpine AS deps
WORKDIR /app
# On ne copie QUE les manifests pour maximiser le cache
COPY package.json package-lock.json ./
RUN npm ci

# ====== Étape 2 : image de dev (Vite) ======
FROM node:20-alpine AS dev
WORKDIR /app
# Réutilise node_modules installés à l’étape deps
COPY --from=deps /app/node_modules ./node_modules
# Copie le code après (pour que changer le code ne réinstalle pas les deps)
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
