from rest_framework import viewsets, permissions, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, PasswordEntry, SecretBundle
from .serializers import CategorySerializer, PasswordSerializer, SecretBundleSerializer
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


class SecretsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        app = (request.query_params.get("app") or "").strip()
        env_name = (request.query_params.get("env") or "").strip()

        if app and env_name:
            try:
                bundle = SecretBundle.objects.get(
                    owner=request.user,
                    app=app,
                    environment=env_name,
                )
            except SecretBundle.DoesNotExist:
                return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

            response = Response(bundle.payload, status=status.HTTP_200_OK)
            response["Cache-Control"] = "no-store"
            return response

        queryset = SecretBundle.objects.filter(owner=request.user)
        serializer = SecretBundleSerializer(queryset, many=True)

        # Do not leak payload when listing all bundles.
        items = [
            {
                "id": item["id"],
                "app": item["app"],
                "environment": item["environment"],
                "created_at": item["created_at"],
                "updated_at": item["updated_at"],
            }
            for item in serializer.data
        ]
        response = Response(items, status=status.HTTP_200_OK)
        response["Cache-Control"] = "no-store"
        return response

    def post(self, request):
        app = str(request.data.get("app", "")).strip()
        env_name = str(request.data.get("env", request.data.get("environment", ""))).strip()
        payload = request.data.get("payload")

        if not app or not env_name:
            return Response(
                {"detail": "Both 'app' and 'env' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(payload, dict):
            return Response(
                {"detail": "'payload' must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bundle, created = SecretBundle.objects.update_or_create(
            owner=request.user,
            app=app,
            environment=env_name,
            defaults={"payload": payload},
        )
        response = Response(
            {
                "detail": "Stored",
                "app": bundle.app,
                "environment": bundle.environment,
                "updated_at": bundle.updated_at,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
        response["Cache-Control"] = "no-store"
        return response

    def put(self, request):
        return self.post(request)

    def delete(self, request):
        app = (request.query_params.get("app") or "").strip()
        env_name = (request.query_params.get("env") or "").strip()

        if not app or not env_name:
            return Response(
                {"detail": "Both query params 'app' and 'env' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted, _ = SecretBundle.objects.filter(
            owner=request.user,
            app=app,
            environment=env_name,
        ).delete()

        if not deleted:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        response = Response(status=status.HTTP_204_NO_CONTENT)
        response["Cache-Control"] = "no-store"
        return response


def healthz(_request):
    return JsonResponse({"status": "ok"})
