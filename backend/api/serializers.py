from rest_framework import serializers
from .models import Category, PasswordEntry, SecretBundle

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id","name","description"]

class PasswordSerializer(serializers.ModelSerializer):
    class Meta:
        model = PasswordEntry
        fields = ["id","title","url","category","ciphertext","created_at","updated_at"]


class SecretBundleSerializer(serializers.ModelSerializer):
    class Meta:
        model = SecretBundle
        fields = ["id", "app", "environment", "payload", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
