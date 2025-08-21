#!/bin/bash
set -euo pipefail

echo "🚀 Déploiement en production…"

# 1) Arrêt des conteneurs existants
docker compose -f docker-compose.prod.yml down

# 2) Reconstruction et démarrage en arrière-plan
docker compose -f docker-compose.prod.yml up -d --build

# 3) Vérification des logs backend pour la migration / collectstatic
echo "⏳ Attente du backend (gunicorn)…"
sleep 10
docker compose -f docker-compose.prod.yml logs --tail=20 backend

# 4) Reload Apache
echo "🔄 Reload Apache…"
sudo systemctl reload apache2

echo "✅ Déploiement terminé !"
