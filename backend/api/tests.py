from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import Category, PasswordEntry


class PasswordCategoryOwnershipTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(username="owner", password="owner-pass")
        self.other = user_model.objects.create_user(username="other", password="other-pass")
        self.owner_category = Category.objects.create(owner=self.owner, name="Owner Category")
        self.other_category = Category.objects.create(owner=self.other, name="Other Category")

    def test_create_password_accepts_owned_category(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            "/api/passwords/",
            {
                "title": "Owned entry",
                "url": "https://example.com",
                "category": self.owner_category.id,
                "ciphertext": {
                    "iv": "iv",
                    "salt": "salt",
                    "data": "data",
                    "key": "key",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        entry = PasswordEntry.objects.get()
        self.assertEqual(entry.owner, self.owner)
        self.assertEqual(entry.category, self.owner_category)

    def test_create_password_rejects_foreign_category(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            "/api/passwords/",
            {
                "title": "Foreign entry",
                "url": "https://example.com",
                "category": self.other_category.id,
                "ciphertext": {
                    "iv": "iv",
                    "salt": "salt",
                    "data": "data",
                    "key": "key",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category", response.data)
        self.assertEqual(PasswordEntry.objects.count(), 0)

    def test_update_password_rejects_foreign_category(self):
        entry = PasswordEntry.objects.create(
            owner=self.owner,
            title="Existing entry",
            url="https://example.com",
            category=self.owner_category,
            ciphertext={"iv": "iv", "salt": "salt", "data": "data", "key": "key"},
        )
        self.client.force_authenticate(user=self.owner)

        response = self.client.patch(
            f"/api/passwords/{entry.id}/",
            {"category": self.other_category.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category", response.data)
        entry.refresh_from_db()
        self.assertEqual(entry.category, self.owner_category)
