# AGENTS.md

## Role

Tu aides au developpement de `gestionnaireMDP`, une application auto-hebergee de gestion de mots de passe.

Le depot manipule des donnees sensibles. La priorite n'est pas la vitesse d'edition, mais la preservation des contrats de securite et d'exploitation.

## Lecture minimale obligatoire

Avant toute modification :

1. `INVARIANTS.md`
2. `docs/specification.md`
3. `docs/api.md`
4. `README_DEV.md`
5. `CODEX_START.md`
6. `.env.template` si present
7. `docker-compose.dev.yml`
8. `docker-compose.prod.yml`

## Priorite des sources

En cas de contradiction :

1. `docs/specification.md`
2. `docs/api.md`
3. `INVARIANTS.md`
4. `README_DEV.md`
5. `README.md`
6. `CODEX_START.md`
7. le code existant

## Regles non negociables

- ne pas modifier les invariants globaux sans raison explicite ;
- ne pas introduire de secret dans Git ;
- ne pas modifier `.env.local` ;
- ne pas casser `/api` comme racine backend ;
- ne pas introduire d'URL backend absolue dans le frontend ;
- ne pas envoyer au backend les secrets dechiffres de la voute ;
- ne pas remplacer le chiffrement cote client par un chiffrement cote serveur ;
- ne pas supprimer de code applicatif sans instruction explicite.

## Regles specifiques au depot

- les `PasswordEntry` sont isoles par utilisateur ;
- `ciphertext` doit rester opaque cote backend ;
- le serveur ne doit pas manipuler la cle privee utilisateur ;
- les fonctions KeyCheck, export de cle et import de cle sont actuellement locales au frontend ;
- les bundles `/api/secrets/` stockent des payloads chiffres mais gardent des metadonnees en clair.

## Architecture a respecter

- backend Django / DRF dans `backend/`
- frontend React / Vite dans `frontend/`
- PostgreSQL en service `db`
- Docker Compose `dev` et `prod`
- Makefile comme point d'entree principal quand la commande existe

## Style d'intervention attendu

- privilegier les changements minimaux ;
- verifier localement ce qui peut l'etre ;
- documenter les changements importants de comportement ;
- mettre a jour `docs/specification.md` et `docs/api.md` quand une route, un modele ou une contrainte change ;
- signaler explicitement tout ecart entre le depot et le template global.
