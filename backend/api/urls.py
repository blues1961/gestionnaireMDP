from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, PasswordViewSet
from .views_auth import csrf, login_view, logout_view, whoami

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'passwords', PasswordViewSet, basename='password')

urlpatterns = [
    # ⚠️ Pas de 'api/' ici, le préfixe 'api/' est déjà ajouté au niveau du projet
    path('', include(router.urls)),

    # Auth (sessions) — exposées sous /api/login/, /api/logout/, /api/whoami/
    path('csrf/', csrf, name='api-csrf'),
    path('login/', login_view, name='api-login'),
    path('logout/', logout_view, name='api-logout'),
    path('whoami/', whoami, name='api-whoami'),
]
