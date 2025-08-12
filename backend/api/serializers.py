from rest_framework import serializers
from .models import Category, PasswordEntry

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id","name","description"]

class PasswordSerializer(serializers.ModelSerializer):
    class Meta:
        model = PasswordEntry
        fields = ["id","title","url","category","ciphertext","created_at","updated_at"]
