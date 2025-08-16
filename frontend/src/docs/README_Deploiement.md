# README — Déploiement en production

Application : **gestionnaire\_mdp\_zero\_knowledge** (Frontend Vite + API Django + PostgreSQL)

Domains :

* Frontend : **[https://app.mon-site.ca](https://app.mon-site.ca)**
* API : **[https://api.mon-site.ca](https://api.mon-site.ca)**

> Ce guide décrit l’architecture, les prérequis, les commandes de déploiement, la configuration Apache/Certbot, la base de données, les sauvegardes, les vérifications et le dépannage.

---

## 1) Architecture

* **Reverse proxy** : Apache 2.4 (vhosts HTTP :80 et HTTPS :443)
* **Certificats** : Let’s Encrypt gérés par **certbot**
* **Containers** : `frontend` (Vite preview), `backend` (Django/Gunicorn), `db` (PostgreSQL)
* **Réseau** : `app.mon-site.ca` → Apache → `127.0.0.1:4173`; `api.mon-site.ca` → Apache → `127.0.0.1:8000`

---

## 2) Prérequis serveur (Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin apache2 certbot python3-certbot-apache
sudo a2enmod proxy proxy_http headers ssl rewrite
sudo systemctl restart apache2
```

---

## 3) DNS (GoDaddy)

Enregistrements **A** :

* `app.mon-site.ca` → IP publique du Linode (ex : `192.46.222.52`)
* `api.mon-site.ca` → IP publique du Linode

*(Éviter AAAA si IPv6 non utilisée.)*

---

## 4) Récupération du code

```bash
sudo mkdir -p /opt/apps && cd /opt/apps
sudo git clone git@github.com:blues1961/gestionnaire_mdp_zero_knowledge.git
cd gestionnaire_mdp_zero_knowledge
```

---

## 5) Variables d’environnement

### 5.1 Fichier `.env` (racine du projet)

```env
POSTGRES_DB=mdpdb
POSTGRES_USER=mdpuser
POSTGRES_PASSWORD=<mot_de_passe_pg>
DB_HOST=db
DB_PORT=5432
```

### 5.2 `backend/.env`

```env
DJANGO_SECRET_KEY=<secret_django>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=api.mon-site.ca,app.mon-site.ca
DJANGO_CSRF_TRUSTED_ORIGINS=https://api.mon-site.ca,https://app.mon-site.ca
DATABASE_URL=postgres://mdpuser:<mot_de_passe_pg>@db:5432/mdpdb
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

> **Ne jamais** committer ces fichiers avec des secrets réels.

---

## 6) Déploiement / mise à jour

```bash
cd /opt/apps/gestionnaire_mdp_zero_knowledge
sudo docker compose build --no-cache
sudo docker compose up -d
sudo docker compose ps
```

### Migrations Django

```bash
sudo docker compose exec backend python manage.py migrate
```

### (Option) Créer un admin

```bash
sudo docker compose exec backend python manage.py createsuperuser
```

---

## 7) Apache — vhosts HTTP (proxy)

`/etc/apache2/sites-available/app-mon-site.conf`

```apache
<VirtualHost *:80>
  ServerName app.mon-site.ca
  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "http"
  RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s
  ProxyPass        /  http://127.0.0.1:4173/
  ProxyPassReverse /  http://127.0.0.1:4173/
</VirtualHost>
```

`/etc/apache2/sites-available/api-mon-site.conf`

```apache
<VirtualHost *:80>
  ServerName api.mon-site.ca
  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "http"
  RequestHeader set X-Forwarded-For %{REMOTE_ADDR}s
  ProxyPass        /  http://127.0.0.1:8000/
  ProxyPassReverse /  http://127.0.0.1:8000/
</VirtualHost>
```

Activation :

```bash
sudo a2ensite app-mon-site.conf api-mon-site.conf
sudo apache2ctl configtest && sudo systemctl reload apache2
```

---

## 8) Certificats Let’s Encrypt

### 8.1 Émission/installation

```bash
sudo certbot --apache -d app.mon-site.ca --redirect
sudo certbot --apache -d api.mon-site.ca --redirect
```

Cela crée :

* `/etc/apache2/sites-available/app-mon-site-le-ssl.conf`
* `/etc/apache2/sites-available/api-mon-site-le-ssl.conf`

> En vhost **:443**, utiliser `RequestHeader set X-Forwarded-Proto "https"`.

### 8.2 Renouvellement auto

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

---

## 9) En-têtes de sécurité (Apache)

Conf globale (HTTPS uniquement) : `/etc/apache2/conf-available/security-headers.conf`

```apache
<IfModule mod_headers.c>
  <If "%{HTTPS} = 'on'">
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  </If>
  Header always set X-Frame-Options "DENY"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "same-origin"
</IfModule>
```

Activation :

```bash
sudo a2enconf security-headers
sudo apache2ctl configtest && sudo systemctl reload apache2
```

Vérification :

```bash
curl -sI https://app.mon-site.ca | egrep -i 'strict|frame|content-type-options|referrer-policy'
curl -sI https://api.mon-site.ca | egrep -i 'strict|frame|content-type-options|referrer-policy'
```

---

## 10) Frontend (Vite)

`frontend/vite.config.js`

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ['app.mon-site.ca'], // 'any' en dépannage
  },
})
```

Rebuild :

```bash
sudo docker compose build --no-cache frontend && sudo docker compose up -d frontend
```

**Base API** (ex : variable d’env) : `VITE_API_BASE=https://api.mon-site.ca`

---

## 11) Django (prod)

Dans `settings.py` :

```python
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = True
# CORS/CSRF si le front appelle l’API
# CORS_ALLOWED_ORIGINS = ["https://app.mon-site.ca"]
# CSRF_TRUSTED_ORIGINS = ["https://app.mon-site.ca", "https://api.mon-site.ca"]
```

Vérifier à l’exécution :

```bash
sudo docker compose exec backend \
  python manage.py shell -c "from django.conf import settings;print(settings.ALLOWED_HOSTS, settings.CSRF_TRUSTED_ORIGINS)"
```

---

## 12) Base PostgreSQL

Connexion rapide :

```bash
sudo docker compose exec -e PGPASSWORD='<mot_de_passe_pg>' db \
  psql -h db -U mdpuser -d mdpdb -c '\\conninfo'
```

Durcissement du rôle (après stabilisation) :

```bash
sudo docker compose exec -e PGPASSWORD='<mot_de_passe_pg>' db \
  psql -h db -U mdpuser -d postgres -c "ALTER ROLE mdpuser NOSUPERUSER NOCREATEROLE NOCREATEDB;"
```

---

## 13) Sauvegardes & restauration

Dump :

```bash
sudo mkdir -p /opt/backups
sudo docker compose exec db pg_dump -U mdpuser -d mdpdb > /opt/backups/mdpdb_$(date +%F).sql
```

Restore :

```bash
sudo docker compose exec -T db psql -U mdpuser -d mdpdb < /opt/backups/mdpdb_YYYY-MM-DD.sql
```

---

## 14) Vérifications / logs

```bash
curl -I https://app.mon-site.ca/
curl -I https://api.mon-site.ca/admin/

sudo docker compose logs --tail=200 backend
sudo docker compose logs --tail=200 frontend
sudo tail -n 200 /var/log/apache2/error.log
```

Healthcheck simple (API) :

```python
# urls.py
from django.http import HttpResponse
def health(_): return HttpResponse("ok")
urlpatterns += [path("health/", health)]
# Test: curl -s https://api.mon-site.ca/health/
```

---

## 15) Dépannage express

* **HTTP redirigé avant Certbot** : désactiver la redirection sur :80 le temps d’émettre les certs.
* **400 / Invalid host** : ajouter `api.mon-site.ca` dans `DJANGO_ALLOWED_HOSTS` (backend/.env) puis rebuild backend.
* **403 Vite** : `allowedHosts: ['app.mon-site.ca']` (ou `'any'`) dans `vite.config.js` puis rebuild.
* **DB auth** :

```bash
sudo docker compose exec -e PGPASSWORD='<mot_de_passe_pg>' db \
  psql -h db -U mdpuser -d postgres -c "ALTER ROLE mdpuser WITH PASSWORD '<mot_de_passe_pg>';"
```

---

## 16) Cheatsheet utile

```bash
# Rebuild un seul service
sudo docker compose build --no-cache backend && sudo docker compose up -d backend

# Forcer Host local via Apache
curl -i -H "Host: app.mon-site.ca" http://127.0.0.1/

# Vhosts actifs
sudo apache2ctl -S

# DNS rapide
dig +short app.mon-site.ca A
```

> Adapte les placeholders (`<mot_de_passe_pg>`, `<secret_django>`) et conserve ce document dans ton dépôt / sur mon-site.ca.
