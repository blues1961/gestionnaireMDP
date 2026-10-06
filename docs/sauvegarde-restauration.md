# Sauvegarde et restauration — exigences de validation

Cette note reprend les exigences utiles des anciennes notes Obsidian. Elle complète le [guide de déploiement](Guide%20de%20deploiement.md), le [workflow développeur](../README_DEV.md) et le [modèle de menace](threat-model.md) ; elle ne certifie pas une restauration déjà testée.

## Périmètre courant

Une restauration lisible nécessite une sauvegarde PostgreSQL et la bonne clé utilisateur. La clé déchiffrée reste en mémoire ; son enveloppe chiffrée associée au compte est incluse dans la base et reste exportable indépendamment. La sauvegarde de base ne remplace pas cet export indépendant. Aucun modèle serveur KeyCheck ne fait partie du contrat actuel : la vérification se fait dans le frontend.

Protéger séparément les sauvegardes de base, les exports de clé et la configuration d’exploitation non versionnée nécessaire au redéploiement. Exclure de Git les données réelles, exports, cookies et fichiers temporaires sensibles. Les sauvegardes de base contiennent des métadonnées lisibles et doivent être protégées même si les secrets de voûte sont chiffrés.

## Procédure et preuve attendue

Utiliser les cibles Make existantes et vérifier leur aide et leurs scripts avant exécution : `make backup` / `make restore` et `make backup-db` / `make restore-db` existent, mais leurs chemins et arguments ne doivent pas être supposés interchangeables. Le Makefile de `backup-db` utilise `backup/`, contrairement au `backups/` de certaines anciennes notes.

Avant migration ou restauration, sauvegarder l’état courant et identifier l’environnement et le fichier exact. Restaurer d’abord dans un environnement isolé avec des données fictives ; valider migrations, connexion, catégories et entrées, puis déchiffrement avec la bonne clé et échec avec une mauvaise clé. Contrôler les journaux sans afficher de secrets. Conserver la preuve de validation et le point de retour arrière avant toute opération en production.

Une sauvegarde doit être datée, créée sans erreur, de taille plausible et accessible avec des droits restrictifs ; une copie hors serveur doit être protégée. Rotation, compression, chiffrement des sauvegardes, surveillance de l’espace et notification des échecs sont des objectifs d’exploitation à définir, pas une automatisation attestée ici. Sauvegarder `.env.local` de façon sécurisée sans copier ses valeurs dans la documentation.

## Garde-fous des commandes Make

`make pull-prod-backup` exige `.env -> .env.dev` localement et vérifie que le lien distant `.env` pointe vers `.env.prod`, crée un dump dans un sous-dossier distant unique `backup/pull-*`, puis copie précisément ce fichier (pas le dernier fichier trouvé). Les copies ont des permissions `600` et leur intégrité gzip est vérifiée ; gzip compresse, mais ne chiffre pas la sauvegarde complète.

`make restore-db BACKUP=backup/<fichier.sql.gz>` vérifie le fichier non vide, son extension et l’intégrité gzip (ou le catalogue `pg_restore` pour `.dump`) avant de supprimer le schéma. `psql` utilise `ON_ERROR_STOP=1` et ignore `.psqlrc` ; `pg_restore` utilise `--exit-on-error`. Une erreur arrête la commande, mais la restauration n’est pas atomique : le schéma peut être partiellement restauré. Toujours sauvegarder la base cible, arrêter les écritures et préciser `BACKUP` plutôt que compter sur la sélection automatique. Appliquer ensuite volontairement `make migrate`.

Le dump historique de production peut ne pas contenir `api_keyenvelope` : les migrations ajoutent la table, mais ne recréent aucune clé. Importer localement une sauvegarde de clé compatible reste nécessaire dans ce cas.

## Enveloppe de clé chiffrée

Inclure `api_keyenvelope` dans les sauvegardes de base tout en gardant un export chiffré indépendant. Tester ensemble données, version d’enveloppe et phrase de passe. Ne jamais ajouter la clé déchiffrée ou la phrase de passe aux sauvegardes serveur. La réinitialisation du compte ne doit pas promettre de récupération de la phrase de passe de chiffrement.

Voir [migration, reprise et déploiement Linode](gestion-cle-chiffree.md). Le test automatisé de sérialisation/restauration de fixtures ne certifie pas une restauration PostgreSQL complète en production.
