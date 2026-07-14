# Déploiement — gestionnaireMDP

<!--
Document généré en aperçu par project-assistant.
Le contenu doit être validé avant son intégration.
-->

## Prérequis

- Docker et le plugin Docker Compose doivent être installés.
- Le reverse proxy Traefik doit être opérationnel.
- Le réseau Docker externe `edge` doit exister.
- Le fichier de configuration `.env.dev` doit être présent.
- Le fichier secret `.env.local` doit être présent localement.
- Le fichier de configuration `.env.prod` doit être présent.
- Pour un déploiement de production, le lien `.env` doit pointer vers `.env.prod`.

## Environnements

Le projet distingue les environnements de développement et de production.

- Environnement actif détecté au moment de l’analyse : `dev`.
- Cible actuelle du lien `.env` : `.env.dev`.
- `make dev` fait pointer `.env` vers `.env.dev`.
- `make prod` fait pointer `.env` vers `.env.prod`.
- Fichiers Compose : `docker-compose.dev.yml`, `docker-compose.prod.yml`.
- Fichiers d’environnement requis : `.env.dev`, `.env.local`, `.env.prod`.

## Déploiement

Les services Docker détectés sont : `backend`, `db`, `frontend`.

Sélectionner l’environnement de production :

```bash
make prod
```

Démarrer ou reconstruire la stack :

```bash
make up
```

Traefik fournit le point d’entrée HTTP/HTTPS en production.
Le réseau Docker externe utilisé est `edge`.

## Migrations

Appliquer les migrations Django après le démarrage de la stack :

```bash
make migrate
```

## Retour arrière

### Restauration de la base de données

`make restore` est l’alias standard de restauration de la base de données.

```bash
make restore
```

Un fichier précis peut être fourni avec `FILE=` :

```bash
make restore FILE=backup/mdp_db-<timestamp>.sql.gz
```

La cible `restore-db` accepte également la variable `BACKUP=` et prend le dernier fichier compatible lorsqu’aucun fichier n’est fourni.

Formats détectés : `.sql.gz`, `.sql` et `.dump`.

### Restauration des secrets

`make restore-env` est un alias vers `pull-secret`. Cette commande restaure les secrets d’environnement; elle ne restaure ni le code ni la base de données.

```bash
make restore-env
```

## Validation après déploiement

Vérifier les invariants du projet :

```bash
make check
```

Vérifier l’état des conteneurs :

```bash
make ps
```

Consulter les journaux si nécessaire :

```bash
make logs
```

Exécuter la suite de tests principale :

```bash
make test
```

Volumes nommés détectés : `node_modules`, `pgdata`.
