from rest_framework import viewsets, permissions
from .models import Category, PasswordEntry
from .serializers import CategorySerializer, PasswordSerializer
from django.http import JsonResponse

class IsOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return getattr(obj, "owner_id", None) == request.user.id
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsOwner]
    def get_queryset(self):
        return Category.objects.filter(owner=self.request.user)
    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

class PasswordViewSet(viewsets.ModelViewSet):
    serializer_class = PasswordSerializer
    permission_classes = [IsOwner]
    def get_queryset(self):
        return PasswordEntry.objects.filter(owner=self.request.user)
    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
# backend/api/views.py


def healthz(_request):
    return JsonResponse({"status": "ok"})
