import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

def env_required(name):
    v = os.environ.get(name)
    if not v:
        raise ImproperlyConfigured(f"Missing env: {name}")
    return v

DEBUG = os.environ.get("DJANGO_DEBUG","").lower() in {"1","true","yes"}

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") if DEBUG else env_required("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

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

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",           # doit être tout en haut
    "gestionnaire_mdp.middleware.DisableCSRFMiddleware",  # <- notre middleware DEV
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",       # reste en place pour admin/production
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "gestionnaire_mdp.urls"

TEMPLATES = [{
    "BACKEND":"django.template.backends.django.DjangoTemplates",
    "DIRS":[],
    "APP_DIRS":True,
    "OPTIONS":{"context_processors":[
        "django.template.context_processors.debug",
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]

WSGI_APPLICATION = "gestionnaire_mdp.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE":"django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB","mdpdb"),
        "USER": os.environ.get("POSTGRES_USER","mdpuser"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD","password"),
        "HOST": os.environ.get("DB_HOST","db"),
        "PORT": int(os.environ.get("DB_PORT","5432")),
    }
}

# --- DRF ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    # Nos ViewSets vérifient déjà que l'utilisateur est authentifié (IsOwner)
}

# --- CORS / CSRF (DEV) ---
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = os.environ.get("CORS_ALLOWED_ORIGINS","http://localhost:5173").split(",")

# On ajoute explicitement les origines de confiance pour le CSRF (utile si on réactive la vérif)
CSRF_TRUSTED_ORIGINS = os.environ.get(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000"
).split(",")

# Cookies non sécurisés en dev (HTTP)
if DEBUG:
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SESSION_COOKIE_SAMESITE = "Lax"
    CSRF_COOKIE_SAMESITE = "Lax"

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
