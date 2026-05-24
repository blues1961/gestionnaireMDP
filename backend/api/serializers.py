from rest_framework import serializers
from .models import Category, PasswordEntry, SecretBundle

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id","name","description"]

class PasswordSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.none(),
        allow_null=True,
        required=False,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            self.fields["category"].queryset = Category.objects.filter(owner=request.user)
        else:
            self.fields["category"].queryset = Category.objects.all()

    class Meta:
        model = PasswordEntry
        fields = ["id","title","url","category","ciphertext","created_at","updated_at"]


class SecretBundleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SecretBundle
        fields = ["id", "app", "environment", "payload", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
