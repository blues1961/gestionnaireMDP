from django.contrib import admin
from django.urls import path, include
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import JsonResponse

@ensure_csrf_cookie
def csrf_ok(request):
    return JsonResponse({"detail": "ok"})

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("api.urls")),
    path("api/csrf/", csrf_ok),  # optionnel (utile si on remet la vérif CSRF)
]
