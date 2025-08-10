from rest_framework import viewsets, permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Category, PasswordEntry
from .serializers import CategorySerializer, PasswordEntrySerializer

class BaseOwnerViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def get_queryset(self):
        return self.queryset.filter(owner=self.request.user)

class CategoryViewSet(BaseOwnerViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

class PasswordEntryViewSet(BaseOwnerViewSet):
    queryset = PasswordEntry.objects.all()
    serializer_class = PasswordEntrySerializer

    @action(detail=False, methods=["get"])
    def search(self, request):
        q = request.query_params.get("q", "").strip()
        qs = self.get_queryset().filter(title__icontains=q)
        return Response(self.serializer_class(qs, many=True).data)
