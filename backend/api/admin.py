from django.contrib import admin
from .models import Category, PasswordEntry

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "owner")

@admin.register(PasswordEntry)
class PasswordEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "owner", "category", "created_at", "updated_at")
