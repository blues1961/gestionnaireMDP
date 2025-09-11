from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.http import HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from api.views_logout import api_logout
from api.views_login import api_login

@ensure_csrf_cookie
def csrf_view(request):
    return HttpResponse(status=204)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/logout/', api_logout, name='api-logout'),
    path('api/login/', api_login, name='api-login'),
    path('api/csrf/', csrf_view, name='api-csrf'),
    path('api/', include('api.urls')),

    path('api/auth/jwt/create/', TokenObtainPairView.as_view(), name='jwt-create'),
    path('api/auth/jwt/refresh/', TokenRefreshView.as_view(), name='jwt-refresh'),]
