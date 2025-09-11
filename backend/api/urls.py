# backend/api/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, PasswordViewSet, healthz
from .views_auth import csrf, login_view, logout_view

app_name = "api"

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"passwords",   PasswordViewSet, basename="password")

urlpatterns = [
    # ⚠️ Pas de 'api/' ici : le préfixe 'api/' est ajouté au niveau du projet
    path("", include(router.urls)),

    # Endpoint santé (utile pour healthchecks / probes)
    path("healthz/", healthz, name="api-healthz"),

    # Auth (sessions)
    path("csrf/",   csrf,       name="api-csrf"),
    path("login/",  login_view, name="api-login"),
    path("logout/", logout_view, name="api-logout"),
    path("whoami/",     name="api-whoami"),
]

# --- SimpleJWT endpoints ---
from rest_framework_simplejwt.views import (
    TokenObtainPairView, TokenRefreshView, TokenVerifyView
)

urlpatterns += [
    path('auth/jwt/create/',  TokenObtainPairView.as_view(),  name='jwt-create'),
    path('auth/jwt/refresh/', TokenRefreshView.as_view(),     name='jwt-refresh'),
    path('auth/jwt/verify/',  TokenVerifyView.as_view(),      name='jwt-verify'),
]

# --- JWT whoami ---
from api.views_jwt_whoami import jwt_whoami
urlpatterns += [
    path("auth/whoami/", jwt_whoami, name="jwt-whoami"),
]

urlpatterns += [ path('whoami/', jwt_whoami, name='api-whoami') ]
