from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, PasswordViewSet, SecretsView, healthz
from .views_auth import JWTLogoutView, csrf, login_view, logout_view, whoami
from api.views_jwt_whoami import jwt_whoami
from rest_framework_simplejwt.views import (
    TokenObtainPairView, TokenRefreshView, TokenVerifyView
)

app_name = "api"

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"passwords",   PasswordViewSet, basename="password")

urlpatterns = [
    # ⚠️ pas de 'api/' ici : le préfixe est posé par le projet
    path("", include(router.urls)),

    # Santé
    path("healthz/", healthz, name="api-healthz"),
    path("secrets/", SecretsView.as_view(), name="api-secrets"),

    # Auth (sessions legacy — conservé pour compat)
    path("auth/session/csrf/",   csrf,        name="api-session-csrf"),
    path("auth/session/login/",  login_view,  name="api-session-login"),
    path("auth/session/logout/", logout_view, name="api-session-logout"),
    path("auth/session/whoami/", whoami,      name="api-session-whoami"),

    # Alias historiques de compat session (deprecies)
    path("csrf/",   csrf,        name="api-csrf"),
    path("login/",  login_view,  name="api-login"),
    path("logout/", logout_view, name="api-logout"),

    # Whoami (DRF + JWT)
    path("whoami/", jwt_whoami, name="api-whoami"),

    # SimpleJWT
    path("auth/jwt/create/",  TokenObtainPairView.as_view(), name="jwt-create"),
    path("auth/jwt/logout/",  JWTLogoutView.as_view(),        name="jwt-logout"),
    path("auth/jwt/refresh/", TokenRefreshView.as_view(),    name="jwt-refresh"),
    path("auth/jwt/verify/",  TokenVerifyView.as_view(),     name="jwt-verify"),

    # Alias explicite sous /auth/
    path("auth/whoami/", jwt_whoami, name="jwt-whoami"),
]
