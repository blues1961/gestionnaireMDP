from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, PasswordViewSet

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'passwords', PasswordViewSet, basename='password')

urlpatterns = [ path('', include(router.urls)) ]
