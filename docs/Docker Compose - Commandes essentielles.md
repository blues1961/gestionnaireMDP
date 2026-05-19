
## Rôle

Cette note sert de référence rapide pour les commandes `docker compose` les plus utilisées dans les projets personnels.

Elle couvre les commandes de base pour démarrer, arrêter, reconstruire, inspecter et diagnostiquer un projet Docker Compose.

## Convention utilisée

Dans les projets personnels, utiliser la syntaxe moderne :

```bash
docker compose
```

Éviter l’ancienne syntaxe :

```bash
docker-compose
```

## Convention des fichiers d’environnement

Pour les projets personnels, les commandes doivent généralement inclure les fichiers d’environnement.

### Développement

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml ...
```

### Production

```bash
docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml ...
```

Le fichier `.env.local` contient les secrets partagés entre les environnements et ne doit pas être commité.

## Démarrer un projet en développement

Au premier plan :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml up
```

En arrière-plan :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml up -d
```

## Démarrer un projet en production

```bash
docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml up -d
```

En production, utiliser généralement `-d` pour lancer les conteneurs en arrière-plan.

## Arrêter un projet

Développement :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml down
```

Production :

```bash
docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml down
```

Cette commande arrête et supprime les conteneurs du projet, mais ne supprime pas les volumes par défaut.

## Voir l’état des services

Développement :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml ps
```

Production :

```bash
docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml ps
```

## Lire les logs

Tous les services :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml logs -f
```

Un service précis :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml logs -f backend
```

Exemples de services fréquents :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml logs -f db

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml logs -f backend

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml logs -f frontend
```

## Reconstruire les images

Reconstruire toutes les images :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml build
```

Reconstruire sans utiliser le cache :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml build --no-cache
```

Reconstruire un service précis :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml build backend
```

## Démarrer après reconstruction

Commande fréquente après modification d’un `Dockerfile`, d’un `requirements.txt` ou d’un `package.json` :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml up --build
```

En arrière-plan :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml up -d --build
```

## Redémarrer un service

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml restart backend
```

Autres exemples :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml restart frontend

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml restart db
```

## Exécuter une commande dans un service

Format général :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml exec service commande
```

Exemple avec le backend Django :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml exec backend python manage.py migrate
```

Exemple avec PostgreSQL :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## Ouvrir un shell dans un conteneur

Backend :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml exec backend bash
```

Si `bash` n’est pas disponible :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml exec backend sh
```

Base de données :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml exec db sh
```

## Lancer une commande ponctuelle

`run` crée un conteneur temporaire pour exécuter une commande.

Exemple :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml run --rm backend python manage.py createsuperuser
```

Utiliser `--rm` pour supprimer le conteneur temporaire après exécution.

## Voir la configuration finale

Cette commande affiche la configuration Compose après résolution des variables d’environnement :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml config
```

Très utile pour diagnostiquer :

- une variable manquante ;
    
- un port incorrect ;
    
- un volume mal configuré ;
    
- un label Traefik mal interprété.
    

## Vérifier les variables d’environnement utilisées

Afficher la configuration résolue :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml config
```

Chercher une variable ou un port :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml config | grep DEV_API_PORT
```

## Supprimer les conteneurs arrêtés du projet

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml rm
```

Avec confirmation automatique :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml rm -f
```

## Arrêter sans supprimer les conteneurs

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml stop
```

Redémarrer après un `stop` :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml start
```

## Supprimer les volumes

Attention : cette commande peut supprimer les données persistantes du projet.

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml down -v
```

Ne pas utiliser sur un projet contenant une base PostgreSQL sans sauvegarde.

## Voir les images utilisées

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml images
```

## Voir les processus dans les conteneurs

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml top
```

## Télécharger les images distantes

```bash
docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml pull
```

Utile en production si certains services utilisent des images publiées.

## Exemple de séquence de démarrage en développement

```bash
cd ~/projets/nom_du_projet

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml config

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml up --build
```

## Exemple de séquence de diagnostic

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml ps

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml logs -f

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml config
```

## Exemple de séquence après modification backend

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml restart backend

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml logs -f backend
```

Si les dépendances Python ont changé :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml up --build backend
```

## Exemple de séquence après modification frontend

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml restart frontend

docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml logs -f frontend
```

Si les dépendances Node ont changé :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml up --build frontend
```

## Exemple de séquence de production

```bash
cd /srv/nom_du_projet

docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml config

docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml up -d --build

docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml ps

docker compose --env-file .env.prod --env-file .env.local -f docker-compose.prod.yml logs --tail=100
```

## Erreurs fréquentes

### Mauvais fichier Compose

Symptôme : le projet démarre avec les mauvais ports ou les mauvais services.

Vérifier que la commande utilise le bon fichier :

```bash
-f docker-compose.dev.yml
```

ou :

```bash
-f docker-compose.prod.yml
```

### Fichier `.env.local` oublié

Symptôme : variables secrètes manquantes, erreurs de mot de passe ou de clé secrète.

Toujours inclure :

```bash
--env-file .env.local
```

### Port déjà utilisé

Symptôme : erreur de bind ou de port indisponible.

Vérifier les ports ouverts :

```bash
ss -ltnp
```

### Service introuvable

Symptôme : `no such service`.

Lister les services :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml config --services
```

### Variable non définie

Symptôme : avertissement indiquant qu’une variable est vide ou non définie.

Vérifier la configuration résolue :

```bash
docker compose --env-file .env.dev --env-file .env.local -f docker-compose.dev.yml config
```

## Bonnes pratiques

1. Toujours préciser le fichier Compose avec `-f`.
    
2. Toujours inclure les fichiers `--env-file` nécessaires.
    
3. Utiliser `.env.dev` en développement.
    
4. Utiliser `.env.prod` en production.
    
5. Utiliser `.env.local` pour les secrets non commités.
    
6. Vérifier `config` avant un déploiement important.
    
7. Lire les logs après un démarrage ou une reconstruction.
    
8. Éviter `down -v` sans sauvegarde.
    
9. Utiliser `exec` pour agir dans un conteneur existant.
    
10. Utiliser `run --rm` pour une commande temporaire.
    

## Notes liées

- [[Docker - Vue d’ensemble]]
    
- [[Docker - Images, conteneurs et volumes]]
    
- [[Docker - Réseaux]]
    
- [[Docker - Logs et diagnostic]]
    
- [[Docker - Nettoyage]]
    
- [[Démarrer un projet avec Docker Compose]]
    
- [[Arrêter un projet Docker proprement]]