# backend/api/views_auth.py
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect
from django.views.decorators.http import require_POST, require_GET
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
import json
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

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


class JWTLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = str(request.data.get("refresh", "")).strip()
        if not refresh:
            return Response({"detail": "'refresh' is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = RefreshToken(refresh)
            token.blacklist()
        except TokenError:
            return Response({"detail": "Invalid refresh token."}, status=status.HTTP_400_BAD_REQUEST)

        return Response(status=status.HTTP_204_NO_CONTENT)

@require_GET
def whoami(request):
    if request.user.is_authenticated:
        return JsonResponse({"username": request.user.get_username()}, status=200)
    return JsonResponse({"detail": "unauthenticated"}, status=401)
