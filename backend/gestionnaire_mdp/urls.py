from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from api.views_logout import api_logout

@ensure_csrf_cookie
def csrf_view(request):
    return HttpResponse(status=204)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/logout/', api_logout, name='api-logout'),
    path('api/csrf/', csrf_view, name='api-csrf'),
    path('api/', include('api.urls')),
]
