from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

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


class JWTLogoutTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="jwt-user", password="jwt-pass")

    def test_logout_blacklists_refresh_token(self):
        refresh = RefreshToken.for_user(self.user)
        access = str(refresh.access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        logout_response = self.client.post(
            "/api/auth/jwt/logout/",
            {"refresh": str(refresh)},
            format="json",
        )

        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)

        refresh_response = self.client.post(
            "/api/auth/jwt/refresh/",
            {"refresh": str(refresh)},
            format="json",
        )

        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_requires_refresh_token(self):
        refresh = RefreshToken.for_user(self.user)
        access = str(refresh.access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.post("/api/auth/jwt/logout/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "'refresh' is required.")


class LegacySessionCompatibilityTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(username="session-user", password="session-pass")

    def test_jwt_whoami_rejects_session_authentication(self):
        self.client.force_login(self.user)

        response = self.client.get("/api/whoami/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_legacy_session_whoami_accepts_session_authentication(self):
        self.client.force_login(self.user)

        response = self.client.get("/api/auth/session/whoami/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["username"], self.user.username)
        self.assertEqual(response["Deprecation"], "true")

    def test_legacy_csrf_alias_is_marked_deprecated(self):
        response = self.client.get("/api/csrf/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response["Deprecation"], "true")
        self.assertIn("/api/auth/jwt/", response["Warning"])


class KeyEnvelopeTests(APITestCase):
    def setUp(self):
        import base64
        self.owner = get_user_model().objects.create_user(username="envelope-owner", password="fixture-pass")
        self.other = get_user_model().objects.create_user(username="envelope-other", password="fixture-pass")
        b64 = lambda n: base64.b64encode(bytes(n)).decode()
        self.envelope = {
            "format": "zk-keybundle-v2",
            "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": b64(16)},
            "enc": {"name": "AES-GCM", "iv": b64(12)},
            "pub": b64(550), "data": b64(2400), "createdAt": "2026-10-05T00:00:00.000Z",
        }

    def put(self, revision=0, envelope=None, **extra):
        return self.client.put("/api/key-envelope/", {"envelope": envelope or self.envelope, "expected_revision": revision, **extra}, format="json")

    def test_auth_required_and_no_session_auth(self):
        self.assertEqual(self.client.get("/api/key-envelope/").status_code, 401)
        self.assertEqual(self.put().status_code, 401)
        self.client.force_login(self.owner)
        self.assertEqual(self.client.get("/api/key-envelope/").status_code, 401)

    def test_private_per_account_storage_and_no_delete(self):
        from .models import KeyEnvelope
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get("/api/key-envelope/").status_code, 404)
        response = self.put()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(KeyEnvelope.objects.get(owner=self.owner).envelope, self.envelope)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get("/api/key-envelope/").status_code, 404)
        self.assertEqual(self.put(owner=self.owner.pk).status_code, 400)
        self.assertEqual(self.put().status_code, 201)
        self.assertEqual(KeyEnvelope.objects.count(), 2)
        self.assertEqual(self.client.delete("/api/key-envelope/").status_code, 405)

    def test_create_and_replace_conflicts_preserve_original(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.put().status_code, 201)
        self.assertEqual(self.put().status_code, 409)
        changed = {**self.envelope, "createdAt": "2026-10-06T00:00:00Z"}
        self.assertEqual(self.put(1, changed).status_code, 200)
        self.assertEqual(self.put(1).status_code, 409)
        retrieved = self.client.get("/api/key-envelope/").data
        self.assertEqual(retrieved, {"envelope": changed, "revision": 2})

    def test_reject_rotation_and_plaintext_fields(self):
        import base64
        self.client.force_authenticate(self.owner)
        self.put()
        changed = {**self.envelope, "pub": base64.b64encode(b"x" * 550).decode()}
        self.assertEqual(self.put(1, changed).status_code, 400)
        self.assertEqual(self.put(1, password="fixture-encryption-password").status_code, 400)
        self.assertEqual(self.put(1, {**self.envelope, "privateKey": "fixture-private-key"}).status_code, 400)
        self.assertEqual(self.client.get("/api/key-envelope/").data["revision"], 1)

    def test_format_bounds_without_echoing_sensitive_input(self):
        self.client.force_authenticate(self.owner)
        invalid = [
            {**self.envelope, "format": "zk-keybundle-v1"},
            {**self.envelope, "kdf": {**self.envelope["kdf"], "iterations": 1000001}},
            {**self.envelope, "kdf": {**self.envelope["kdf"], "iterations": True}},
            {**self.envelope, "data": "fixture-cleartext-secret"},
            {**self.envelope, "enc": {"name": "AES-GCM", "iv": "AA=="}},
        ]
        for envelope in invalid:
            response = self.put(envelope=envelope)
            self.assertEqual(response.status_code, 400)
            self.assertNotIn("fixture-cleartext-secret", str(response.data))
        self.assertEqual(self.client.put("/api/key-envelope/", b" " * 32769, content_type="application/json").status_code, 400)
        self.assertEqual(self.client.put("/api/key-envelope/", b"{", content_type="application/json").status_code, 400)
        self.assertEqual(self.client.get("/api/key-envelope/").status_code, 404)

    def test_roundtrip_fixture_database_dump_and_restore(self):
        import io
        from django.core import serializers
        from .models import KeyEnvelope
        self.client.force_authenticate(self.owner)
        self.put()
        dump = serializers.serialize("json", KeyEnvelope.objects.all())
        KeyEnvelope.objects.all().delete()
        for item in serializers.deserialize("json", io.StringIO(dump)):
            item.save()
        self.assertEqual(self.client.get("/api/key-envelope/").data, {"envelope": self.envelope, "revision": 1})


from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from django.db import connection, close_old_connections
from django.test import TransactionTestCase
from rest_framework.test import APIClient


@skipUnless(connection.vendor == "postgresql", "Real concurrent row-lock test requires PostgreSQL")
class KeyEnvelopeConcurrencyTests(TransactionTestCase):
    def test_two_devices_create_then_replace_without_lost_update(self):
        import base64
        user = get_user_model().objects.create_user(username="race-fixture", password="fixture")
        b64 = lambda n: base64.b64encode(bytes(n)).decode()
        envelope = {
            "format": "zk-keybundle-v2",
            "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": b64(16)},
            "enc": {"name": "AES-GCM", "iv": b64(12)},
            "pub": b64(550), "data": b64(2400), "createdAt": "2026-10-05T00:00:00Z",
        }
        for expected_revision, success in [(0, 201), (1, 200)]:
            barrier = Barrier(2)

            def write():
                close_old_connections()
                try:
                    client = APIClient()
                    client.force_authenticate(user=user)
                    barrier.wait(timeout=10)
                    return client.put("/api/key-envelope/", {"envelope": envelope, "expected_revision": expected_revision}, format="json").status_code
                finally:
                    close_old_connections()

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: write(), range(2)))
            self.assertEqual(sorted(results), sorted([success, 409]))


from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
import uuid


@override_settings(DEBUG=True)
class KeyMigrationFixtureCommandTests(APITestCase):
    def setUp(self):
        self.run_id = str(uuid.uuid4())
        self.names = [f"key-migration-{self.run_id}-{suffix}" for suffix in ("a", "b")]

    def test_prepare_and_cleanup_leave_existing_accounts_untouched(self):
        import io
        user_model = get_user_model()
        existing = user_model.objects.create_user(username="existing-fixture", password="fixture")
        call_command("key_migration_fixture", "prepare", run_id=self.run_id, stdout=io.StringIO())
        self.assertEqual(user_model.objects.filter(username__in=self.names).count(), 2)
        call_command("key_migration_fixture", "cleanup", run_id=self.run_id, stdout=io.StringIO())
        self.assertFalse(user_model.objects.filter(username__in=self.names).exists())
        self.assertTrue(user_model.objects.filter(pk=existing.pk).exists())

    def test_collision_and_marker_mismatch_refuse_overwrite_or_cleanup(self):
        user_model = get_user_model()
        existing = user_model.objects.create_user(username=self.names[0], email="existing@example.invalid", password="fixture")
        with self.assertRaises(CommandError):
            call_command("key_migration_fixture", "prepare", run_id=self.run_id)
        with self.assertRaises(CommandError):
            call_command("key_migration_fixture", "cleanup", run_id=self.run_id)
        self.assertTrue(user_model.objects.filter(pk=existing.pk).exists())
        self.assertFalse(user_model.objects.filter(username=self.names[1]).exists())

    @override_settings(DEBUG=False)
    def test_disabled_outside_debug(self):
        with self.assertRaises(CommandError):
            call_command("key_migration_fixture", "prepare", run_id=self.run_id)

    def test_invalid_identifier_is_refused(self):
        with self.assertRaises(CommandError):
            call_command("key_migration_fixture", "cleanup", run_id="invalid")
