from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("api", "0004_secretbundle"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.CreateModel(
        name="KeyEnvelope",
        fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("envelope", models.JSONField()),
            ("revision", models.PositiveBigIntegerField(default=1)),
            ("updated_at", models.DateTimeField(auto_now=True)),
            ("owner", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="key_envelope", to=settings.AUTH_USER_MODEL)),
        ],
    )]
