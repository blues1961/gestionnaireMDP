# settings.py
import os
from pathlib import Path

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
DB_USER = env("POSTGRES_USER", required=True)
DB_PASS = env("POSTGRES_PASSWORD", required=True)
DB_HOST = env("POSTGRES_HOST", default="db")
DB_PORT = env("POSTGRES_PORT", default="5432")
DB_NAME = env("POSTGRES_DB", required=True)

# Construit DATABASE_URL (utile pour logs, libs tierces, debug…)
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
os.environ["DATABASE_URL"] = DATABASE_URL  # <— rendu dispo pour dj-database-url & co

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": DB_NAME,
        "USER": DB_USER,
        "PASSWORD": DB_PASS,
        "HOST": DB_HOST,
        "PORT": DB_PORT,
    }
}
# ───────────────────────── Debug: affiche la DB courante ─────────────────────────
if DEBUG:
    safe_url = DATABASE_URL.replace(DB_PASS, "********") if DB_PASS else DATABASE_URL
    print(f"[DEBUG] DATABASE_URL = {safe_url}")


# ───────────────────────── DRF ─────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
}

from datetime import timedelta
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(env("ACCESS_TOKEN_LIFETIME_MIN", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(env("REFRESH_TOKEN_LIFETIME_DAYS", "7"))),
}


# ───────────────────────── Statique / WhiteNoise ─────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

if not DEBUG:
    STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
else:
    STATICFILES_STORAGE = "whitenoise.storage.CompressedStaticFilesStorage"


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
    # Par défaut, colle à ton dev: Vite=5274, Front nginx=5275
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5274",
        "http://127.0.0.1:5274",
        "http://localhost:5275",
        "http://127.0.0.1:5275",
    ]
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:5274",
        "http://127.0.0.1:5274",
        "http://localhost:5275",
        "http://127.0.0.1:5275",
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
