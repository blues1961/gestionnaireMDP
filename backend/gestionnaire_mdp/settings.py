# settings.py
import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
import dj_database_url

# ───────────────────────── Base ─────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

def env(name, default=None, required=False):
    """petit helper env avec 'required' optionnel"""
    v = os.environ.get(name, default)
    if required and (v is None or str(v).strip() == ""):
        raise ImproperlyConfigured(f"Missing env: {name}")
    return v

def env_list(name, default=""):
    """split par virgules, espaces ignorés"""
    raw = env(name, default=default) or ""
    return [item.strip() for item in raw.split(",") if item.strip()]

# ───────────────────────── Mode (dev/prod) ─────────────────────────
# Par défaut on se comporte comme DEV (True), et on met DJANGO_DEBUG=false en prod.
DEBUG = str(env("DJANGO_DEBUG", "true")).lower() in {"1", "true", "yes"}

# ───────────────────────── Secret key ─────────────────────────
# En dev : valeur par défaut; en prod : OBLIGATOIRE
SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-secret", required=not DEBUG)

# ───────────────────────── Hôtes ─────────────────────────
if DEBUG:
    # suffisants pour Vite (localhost:5173) et backend (localhost:8000)
    ALLOWED_HOSTS = list(set(
        env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0")
    ))
else:
    # en prod on force par défaut vos domaines; surcharge possible via env
    ALLOWED_HOSTS = list(set(
        env_list("DJANGO_ALLOWED_HOSTS", "mon-site.ca,api.mon-site.ca,app.mon-site.ca")
    ))

# ───────────────────────── Apps ─────────────────────────
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "api",
]

# ───────────────────────── Middleware ─────────────────────────
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",            # CORS avant Session
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# (optionnel) désactiver CSRF en dépannage quand DEBUG et DISABLE_CSRF=true
if DEBUG and str(env("DISABLE_CSRF", "false")).lower() in {"1", "true", "yes"}:
    MIDDLEWARE.insert(3, "gestionnaire_mdp.middleware.DisableCSRFMiddleware")

ROOT_URLCONF = "gestionnaire_mdp.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "gestionnaire_mdp.wsgi.application"

# ───────────────────────── Base de données ─────────────────────────
# ───────────────────────── Base de données ─────────────────────────
# Priorité à DATABASE_URL si présent (Heroku/Render/etc.), sinon DB_* avec
# repli automatique sur POSTGRES_* — plus de fallback SQLite pour éviter
# les décalages entre CLI et appli.
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    DATABASES = {"default": dj_database_url.parse(DATABASE_URL, conn_max_age=600)}
else:
    def _env(name, default=None, required=False):
        v = os.environ.get(name, default)
        if required and (v is None or str(v).strip() == ""):
            raise ImproperlyConfigured(f"Missing env: {name}")
        return v

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": _env("DB_HOST", "mdp_db"),
            "PORT": int(_env("DB_PORT", "5432")),
            # DB_* si définies, sinon POSTGRES_*
            "NAME": (_env("DB_NAME") or _env("POSTGRES_DB", required=True)),
            "USER": (_env("DB_USER") or _env("POSTGRES_USER", required=True)),
            "PASSWORD": (_env("DB_PASSWORD") or _env("POSTGRES_PASSWORD", required=True)),
        }

    }

# ───────────────────────── DRF ─────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
}

# ───────────────────────── Statique / WhiteNoise ─────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ───────────────────────── HTTPS/Proxy ─────────────────────────
# Apache/Nginx gère TLS; on évite la redirection ici pour ne pas boucler
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = False

# ───────────────────────── Cookies (sessions/CSRF) ─────────────────────────
# En prod on met le cookie sur le domaine parent pour partager entre sous-domaines
COOKIE_PARENT_DOMAIN = env("COOKIE_PARENT_DOMAIN", default=".mon-site.ca" if not DEBUG else None)

SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE   = not DEBUG
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE    = "Lax"

# En DEV : domaine None (requis pour que le navigateur accepte sur localhost)
# En PROD : domaine parent (ex: .mon-site.ca)
SESSION_COOKIE_DOMAIN = None if DEBUG else COOKIE_PARENT_DOMAIN
CSRF_COOKIE_DOMAIN    = None if DEBUG else COOKIE_PARENT_DOMAIN

# ───────────── CORS / CSRF ─────────────
CORS_ALLOW_CREDENTIALS = True

if DEBUG:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
    ]
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
    ]
else:
    CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "https://app.mon-site.ca")
    CSRF_TRUSTED_ORIGINS = env_list(
        "CSRF_TRUSTED_ORIGINS",
        "https://app.mon-site.ca,https://mon-site.ca"
    )

# === Overrides from environment (standardisation prod/dev) ===
def _split_env(name: str, default: str = ""):
    import os
    return [x.strip() for x in os.environ.get(name, default).split(",") if x.strip()]

# Autorise hosts depuis .env (ex: 127.0.0.1,localhost,mdp-api.mon-site.ca)
_env_allowed = _split_env("ALLOWED_HOSTS")
if _env_allowed:
    ALLOWED_HOSTS = _env_allowed

# CSRF / CORS depuis .env (ex: https://mdp.mon-site.ca,https://mdp-api.mon-site.ca)
_env_csrf = _split_env("CSRF_TRUSTED_ORIGINS")
if _env_csrf:
    CSRF_TRUSTED_ORIGINS = _env_csrf

_env_cors = _split_env("CORS_ALLOWED_ORIGINS")
if _env_cors:
    CORS_ALLOWED_ORIGINS = _env_cors

# Indique au backend que le proxy frontal termine le TLS
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
