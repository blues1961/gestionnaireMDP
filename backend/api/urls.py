from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, PasswordEntryViewSet

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"passwords", PasswordEntryViewSet, basename="password")

urlpatterns = [
    path("", include(router.urls)),
]
