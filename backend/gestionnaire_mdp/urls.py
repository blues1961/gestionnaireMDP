from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.middleware.csrf import get_token

def csrf_view(request):
    return JsonResponse({"csrfToken": get_token(request)})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),   # ← toute l'API sous /api/
    path('api/csrf/', csrf_view),        # ← endpoint pour déposer le cookie CSRF
]
