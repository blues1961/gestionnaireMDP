from django.contrib import admin
from .models import Category, PasswordEntry, SecretBundle

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "owner")

@admin.register(PasswordEntry)
class PasswordEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "owner", "category", "created_at", "updated_at")


@admin.register(SecretBundle)
class SecretBundleAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "app", "environment", "created_at", "updated_at")
    search_fields = ("owner__username", "app", "environment")
