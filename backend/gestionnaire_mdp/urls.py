from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import (
    TokenObtainPairView, TokenRefreshView, TokenVerifyView
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # routes applicatives existantes (garde ton module si différent)
    path('api/', include('api.urls')),

    # Endpoints JWT à la racine (compatibles avec le ProxyPass /api/)
    path('auth/jwt/create/',  TokenObtainPairView.as_view(), name='jwt-create'),
    path('auth/jwt/refresh/', TokenRefreshView.as_view(),   name='jwt-refresh'),
    path('auth/jwt/verify/',  TokenVerifyView.as_view(),    name='jwt-verify'),
]
