# backend/api/views_auth.py
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect
from django.views.decorators.http import require_POST, require_GET
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
import json

@ensure_csrf_cookie
def csrf(request):
    return JsonResponse({}, status=204)

@require_POST
@csrf_protect
def login_view(request):
    try:
        data = json.loads(request.body.decode())
    except Exception:
        return JsonResponse({"detail": "Invalid JSON"}, status=400)

    username = data.get("username")
    password = data.get("password")

    user = authenticate(request, username=username, password=password)
    if user is None or not user.is_active:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)

    login(request, user)
    return JsonResponse({"username": user.get_username()}, status=200)

@require_POST
@csrf_protect
def logout_view(request):
    logout(request)
    return JsonResponse({}, status=204)

@require_GET
def whoami(request):
    if request.user.is_authenticated:
        return JsonResponse({"username": request.user.get_username()}, status=200)
    return JsonResponse({"detail": "unauthenticated"}, status=401)
