import json
from django.http import JsonResponse
from django.contrib.auth import authenticate, login as django_login
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

@csrf_exempt
@require_POST
def api_login(request):
    try:
        data = json.loads(request.body or "{}")
    except Exception:
        data = request.POST
    username = data.get("username") or data.get("email")
    password = data.get("password")
    if not username or not password:
        return JsonResponse({"detail": "Missing credentials"}, status=400)
    user = authenticate(request, username=username, password=password)
    if not user:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)
    django_login(request, user)
    return JsonResponse({"ok": True}, status=200)
