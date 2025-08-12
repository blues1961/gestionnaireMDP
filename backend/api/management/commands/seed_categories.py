from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from api.models import Category

DEFAULTS = [
    ("Matériel","Équipements, routeurs, etc."),
    ("Documents","PDF/Docs importants"),
    ("Abonnements","Services payants (SaaS, médias)"),
    ("Login Web","Sites et apps web"),
    ("Banque & Finance","Banques, cartes, etc."),
    ("Email & Messagerie","Gmail, Outlook, Slack…"),
    ("Travail / Pro","Comptes liés au travail"),
    ("Administratif","Impôts, énergie, opérateurs"),
    ("Développement","GitHub, CI/CD, clés…"),
    ("Wi-Fi & Réseaux","SSID/PSK, routeurs"),
    ("Jeux & Loisirs","Gaming, médias"),
    ("Santé","Mutuelles, portails santé"),
    ("Clés & Certificats","Django SECRET_KEY, SSH, etc."),
    ("Tests / Temporaire","Éléments temporaires"),
]

class Command(BaseCommand):
    help = "Crée les catégories par défaut pour le superutilisateur"

    def handle(self, *args, **opts):
        U = get_user_model()
        owner = U.objects.filter(is_superuser=True).first()
        if not owner:
            self.stdout.write("Aucun superutilisateur. Crée-le avant: manage.py createsuperuser")
            return
        created = 0
        for name, desc in DEFAULTS:
            obj, was = Category.objects.get_or_create(name=name, owner=owner, defaults={"description": desc})
            created += int(was)
            self.stdout.write(("[OK] Créée  " if was else "[=] Existe ") + f"{obj.name}")
        self.stdout.write(f"Terminé. {created} nouvelles catégories.")
