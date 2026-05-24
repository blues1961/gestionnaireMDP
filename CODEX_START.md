# CODEX_START.md

## Mandat

Tu travailles dans `gestionnaireMDP`, une application auto-hebergee de gestion de mots de passe.

Ton objectif est d'ameliorer le depot sans casser :

- les routes `/api` ;
- l'isolation par utilisateur ;
- le chiffrement cote client des champs sensibles ;
- la convention `VITE_API_BASE=/api` ;
- la separation `dev` / `prod`.

## Ordre de lecture recommande

Avant toute modification, lis dans cet ordre :

1. `AGENTS.md`
2. `INVARIANTS.md`
3. `docs/specification.md`
4. `docs/api.md`
5. `README_DEV.md`
6. `README.md`
7. `.env.template` si present
8. `Makefile`
9. `docker-compose.dev.yml`
10. `docker-compose.prod.yml`
11. `backend/gestionnaire_mdp/settings.py`
12. `backend/api/urls.py`
13. `backend/api/views.py`
14. `backend/api/models.py`
15. `frontend/src/api.js`
16. `frontend/src/utils/crypto.js`
17. `frontend/src/App.jsx`

## Regles a respecter avant de coder

- ne pas modifier `.env.local` ;
- ne jamais afficher ni committer de secrets ;
- ne pas casser `APP_SLUG`, `APP_DEPOT`, `APP_NO` ou la derive des ports sans demande explicite ;
- ne pas introduire d'URL absolue vers le backend dans le frontend ;
- ne pas faire recevoir au backend les champs dechiffres de la voute ;
- ne pas renommer arbitrairement les routes existantes ;
- ne pas supprimer de code applicatif sans demande explicite ;
- privilegier les modifications minimales et verifiables.

## Fichiers critiques

- `backend/api/models.py` : contrat de donnees de la voute et des bundles de secrets.
- `backend/api/views.py` : filtrage par utilisateur et endpoints `/api/secrets/`.
- `backend/api/urls.py` : surface API reelle.
- `frontend/src/api.js` : base URL relative et wrappers Axios.
- `frontend/src/utils/crypto.js` : chiffrement, dechiffrement et export/import de cle.
- `docker-compose.dev.yml` : stack dev standardisee autour de `db`, `backend`, `frontend`.
- `Makefile` : interface d'exploitation principale du depot.

## Commandes de verification

Verification minimale :

```bash
make ps
make migrate
make token-test
make test
curl http://localhost:8002/api/healthz/
```

Verification elargie :

```bash
bash scripts/verifier-invariants.sh
```

Verification Docker ponctuelle :

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml config
docker compose --env-file .env.prod -f docker-compose.prod.yml config
```

## Erreurs a eviter

- supposer que le depot suit deja strictement `app-template` ;
- documenter comme "zero-knowledge complet" une implementation qui laisse des metadonnees en clair ;
- ajouter de nouveaux scripts paralleles alors qu'une cible `make` existe deja ;
- laisser croire qu'il existe un endpoint backend d'import/export de cle alors que la fonctionnalite est locale au frontend ;
- ajouter des migrations automatiques supplementaires au demarrage des conteneurs.

## Quand tu modifies le chiffrement ou l'auth

Si tu touches :

- `frontend/src/utils/crypto.js`
- `frontend/src/api.js`
- `backend/api/views.py`
- `backend/api/urls.py`
- `backend/gestionnaire_mdp/settings.py`

alors mets a jour aussi :

- `docs/specification.md`
- `docs/api.md`
- `README.md` ou `README_DEV.md` si le workflow change.

Point d'attention chiffrement :

- ne pas reintroduire de stockage de cle privee en clair dans `localStorage` ;
- si tu modifies `frontend/src/utils/crypto.js`, preserve la migration legacy vers `IndexedDB` ou documente explicitement sa suppression ;
- ne pas presenter un durcissement de stockage local comme une protection contre un XSS deja present dans la page.
