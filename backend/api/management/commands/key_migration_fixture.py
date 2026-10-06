"""Dev-only disposable identities for the HTTP key migration smoke test."""
import uuid
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Prepare or remove only the disposable accounts of a key migration test run."

    def add_arguments(self, parser):
        parser.add_argument("operation", choices=["prepare", "cleanup"])
        parser.add_argument("--run-id", required=True)

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("This fixture command is restricted to development (DEBUG).")
        try:
            run_id = str(uuid.UUID(options["run_id"]))
        except ValueError:
            raise CommandError("A UUID run-id is required.")
        names = [f"key-migration-{run_id}-{suffix}" for suffix in ("a", "b")]
        email = f"key-migration-{run_id}@example.invalid"
        user_model = get_user_model()
        with transaction.atomic():
            if options["operation"] == "prepare":
                if user_model.objects.filter(username__in=names).exists():
                    raise CommandError("Run identities already exist; refusing to overwrite them.")
                for name in names:
                    user_model.objects.create_user(username=name, email=email, password=f"fixture-login-{run_id}")
                self.stdout.write("Two disposable test accounts prepared.")
            else:
                existing = user_model.objects.filter(username__in=names)
                if existing.exclude(email=email).exists():
                    raise CommandError("Fixture identity marker mismatch; refusing deletion.")
                existing.filter(email=email).delete()
                self.stdout.write("Disposable test accounts and their own data removed.")
