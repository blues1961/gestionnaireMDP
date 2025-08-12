from django.conf import settings

class DisableCSRFMiddleware:
    """
    Désactive l'enforcement CSRF pour les endpoints /api/* en mode DEBUG.
    N'affecte pas /admin/ ni le reste lorsque DEBUG=False (prod).
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.DEBUG and request.path.startswith("/api/"):
            # Indique au CsrfViewMiddleware de ne pas vérifier ce request
            setattr(request, "_dont_enforce_csrf_checks", True)
        return self.get_response(request)
