from django.conf import settings
from django.db import models

class Category(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="categories")
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    class Meta:
        unique_together = ("owner","name")
        ordering = ["name"]
    def __str__(self): return self.name

class PasswordEntry(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="passwords")
    title = models.CharField(max_length=200)
    url = models.URLField(blank=True, default="")
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="passwords")
    ciphertext = models.JSONField()  # {iv, salt, data, ...}
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ["title","id"]
    def __str__(self): return self.title
