import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
import dj_database_url




# --- Base ---
BASE_DIR = Path(__file__).resolve().parent.parent

def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and (v is None or str(v).strip() == ""):
        raise ImproperlyConfigured(f"Missing env: {name}")
    return v

DEBUG = str(env("DJANGO_DEBUG", "")).lower() in {"1", "true", "yes"}

SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE   = not DEBUG

SESSION_COOKIE_DOMAIN = ".mon-site.ca"
CSRF_COOKIE_DOMAIN    = ".mon-site.ca"





SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-secret", required=not DEBUG)

ALLOWED_HOSTS = [h.strip() for h in env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

# --- Apps ---
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

# --- Middleware (ordre important) ---
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",       # fichiers statiques en prod
    "corsheaders.middleware.CorsMiddleware",            # CORS avant Session
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Middleware DEV facultatif (désactive CSRF) – seulement si DEBUG
if DEBUG:
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

# --- DB ---
DATABASES = {
    "default": dj_database_url.config(
        default=env("DATABASE_URL"),      # ex: postgres://mdpuser:...@db:5432/mdpdb
        conn_max_age=600,
    )
}

# --- DRF ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
}

# --- Static files / WhiteNoise ---
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Proxy/HTTPS ---
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = False  # Apache gère la redirection → évite les boucles

# Cookies plus stricts en prod
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_DOMAIN = None if DEBUG else ".mon-site.ca"

# (SameSite par défaut "Lax" convient pour des sous-domaines du même site)

# --- CORS / CSRF ---
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
    # Prod : adapte si besoin via variables d'env
    CORS_ALLOWED_ORIGINS = [env("CORS_ALLOWED_ORIGIN", "https://app.mon-site.ca")]
    CSRF_TRUSTED_ORIGINS = [
        "https://app.mon-site.ca",
        "https://api.mon-site.ca",
    ]
