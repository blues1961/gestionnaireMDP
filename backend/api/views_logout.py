import os
from django.http import HttpResponse
from django.contrib.auth import logout as django_logout
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

FRONT_ORIGIN = os.getenv("FRONT_ORIGIN", "https://mdp.mon-site.ca")

def _add_cors(resp, origin=FRONT_ORIGIN):
    # Pour cookies, il faut une origine explicite (pas "*")
    resp["Access-Control-Allow-Origin"] = origin
    resp["Vary"] = "Origin"
    resp["Access-Control-Allow-Credentials"] = "true"
    resp["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp["Access-Control-Allow-Headers"] = "Content-Type, X-CSRFToken, X-Requested-With"
    return resp

def _wipe_cookies(resp):
    for name in ("sessionid", "csrftoken"):
        resp.delete_cookie(name, path="/")

@csrf_exempt
@require_http_methods(["GET", "POST", "OPTIONS"])
def api_logout(request):
    if request.method == "OPTIONS":
        return _add_cors(HttpResponse(status=204))
    django_logout(request)
    resp = HttpResponse(status=204)
    _wipe_cookies(resp)
    return _add_cors(resp)
