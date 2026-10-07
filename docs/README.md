# Documentation annexe

Ce dossier contient des guides operatoires et des notes complementaires pour `gestionnaireMDP`.

## Source de verite

Pour le contrat courant du depot, lire d'abord :

1. `../README.md`
2. `../README_DEV.md`
3. `../INVARIANTS.md`
4. `specification.md`
5. `api.md`

Les autres fichiers de `docs/` sont des annexes de travail. Ils peuvent decrire :

- des procedures de deploiement ;
- des operations de rotation de secrets ;
- des notes de transition entre anciennes et nouvelles conventions.

Ils ne doivent pas contredire les fichiers racine ci-dessus.

## Etat actuel a retenir

- services Compose standardises : `db`, `backend`, `frontend`
- backend sous `/api`
- auth applicative principale : JWT SimpleJWT
- logout JWT : `POST /api/auth/jwt/logout/`
- compat session legacy isolee sous `/api/auth/session/*`
- `VITE_API_BASE=/api`
- secrets reels uniquement dans `.env.local`
- enveloppe chiffrée privée associée au compte ; paire déchiffrée uniquement en mémoire, migration explicite des anciennes copies

## Fichiers annexes utiles

- `create-env.md` : workflow `.env.template` -> `.env.dev` / `.env.prod`
- `threat-model.md` : hypothese de confiance, actifs proteges et limites reelles du chiffrement
- `Guide de deploiement.md` : procedure de deploiement et de mise a jour
- `BOOTSTRAP_PULL_SECRET_PUBLIC.md` : bootstrap public sans secrets
- `auth-separation-all-apps.txt` : note operative sur la separation des comptes Django

## Note de maintenance

Si un guide annexe diverge du contrat courant :

- corriger ou marquer explicitement la divergence ;
- ne pas utiliser l'annexe comme justification pour reintroduire un ancien invariant ;
- preferer une note courte pointant vers les fichiers racine plutot qu'un second contrat complet.

## Maintenance et continuité

- [Maintenance documentaire](maintenance-documentation.md) : responsabilité de Codex dans le même changement que toute fonctionnalité et répartition avec Obsidian.
- [Sauvegarde et restauration](sauvegarde-restauration.md) : exigences de validation et conservation de la clé, reprises de la consolidation Obsidian.

- [Gestion de la clé chiffrée, migration et déploiement Linode](gestion-cle-chiffree.md).

- [Déverrouillage temporaire](deverrouillage-temporaire.md) : contrat mémoire lié à la page/session, multi-onglets, reprise et recette avant production.
