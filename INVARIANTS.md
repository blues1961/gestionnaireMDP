# INVARIANTS.md

<!--
Document généré en aperçu par DocForge.
Ce document local complète les invariants globaux.
Il ne peut pas contredire app-template/INVARIANTS.md.
Son application exige l’autorisation explicite du propriétaire.
-->

## Autorité

`app-template/INVARIANTS.md` constitue la source canonique des invariants globaux des applications auto-hébergées.

Le présent document définit uniquement les contraintes locales du projet `gestionnaireMDP`.

Ordre d’autorité :

1. `app-template/INVARIANTS.md`;
2. le présent fichier `INVARIANTS.md`;
3. `CODEX_START.md`;
4. `AGENTS.md`;
5. la documentation technique;
6. le code existant.

Aucun agent ne doit modifier, supprimer, assouplir ou contourner un invariant sans autorisation explicite du propriétaire.

## Portée

Ces invariants locaux s’appliquent à l’ensemble du dépôt `gestionnaireMDP`, notamment au code, aux fichiers Docker Compose, aux environnements, aux scripts, à la documentation et aux interventions automatisées.

## Identité du projet

- Nom détecté : `gestionnaireMDP`.
- Racine détectée : la racine du dépôt (`.`).
- Langages : `CSS`, `HTML`, `JSON`, `JavaScript`, `Markdown`, `Python`, `Shell`, `YAML`.
- Frameworks : `Django`, `React`, `Vite`.
- Technologies : `Django`, `Docker Compose`, `PostgreSQL`, `React`, `Traefik`, `Vite`.

Les valeurs canoniques `APP_NAME`, `APP_SLUG`, `APP_DEPOT`, `APP_NO` et `APP_ENV` doivent rester définies dans les fichiers d’environnement appropriés.

## Invariants d’environnement

- `.env.dev` contient la configuration non secrète du développement;
- `.env.prod` contient la configuration non secrète de la production;
- `.env.local` contient exclusivement les secrets locaux;
- `.env.local` ne doit jamais être versionné, lu ou affiché par DocForge;
- `.env` est un lien symbolique vers `.env.dev` ou `.env.prod`;
- `.env` ne doit jamais être modifié directement;
- les changements d’environnement passent par les scripts ou cibles Makefile prévus.

État actuellement détecté : `.env` → `.env.dev`.

## Invariants de sécurité

- aucun secret dans Git;
- aucun secret dans les fichiers Markdown;
- aucun secret dans `.env.dev` ou `.env.prod`;
- aucun secret dans les journaux applicatifs ou Docker;
- aucun contenu de `.env.local` ne doit être inclus dans un rapport;
- toute donnée privée doit être isolée selon les règles métier du projet;
- toute route privée doit utiliser le mécanisme d’authentification prévu;

## Invariants d’architecture

- Services Docker détectés : `backend`, `db`, `frontend`.
- Fichiers Compose : `docker-compose.dev.yml`, `docker-compose.prod.yml`.
- Réseaux : `appnet`, `edge`.
- Réseaux externes : `edge`.
- Volumes nommés : `node_modules`, `pgdata`.

- les services standards restent nommés `backend`, `frontend` et `db`;
- leur responsabilité doit rester séparée;
- Traefik demeure le point d’entrée HTTP/HTTPS de production;
- PostgreSQL demeure la base relationnelle canonique;
- aucun service, réseau, volume ou port ne doit être inventé;
- toute modification structurelle doit être justifiée et documentée.

## Invariants Docker Compose

- utiliser la commande `docker compose`, jamais `docker-compose`;
- conserver des fichiers Compose distincts pour le développement et la production;
- utiliser les fichiers d’environnement prévus par le projet;
- ne pas exposer publiquement un port applicatif sans justification;
- ne pas créer une stack parallèle contournant le Makefile ou les scripts standards.

## Invariants Makefile et scripts

- Cibles Makefile détectées : `backup`, `backup-db`, `backup-dir`, `backup-env`, `check`, `clean`, `create-env`, `createsuperuser`, `dev`, `down`, `env-check`, `env-check-base`, `env-check-local`, `exec-backend`, `exec-db`, `exec-frontend`, `exec-vite`, `generate-env`, `help`, `init`, `init-dev`, `init-root-secret`, `init-secret`, `logs`, `logs-backend`, `logs-db`, `logs-frontend`, `logs-vite`, `migrate`, `prod`, `ps`, `ps-ports`, `psql`, `pull-prod-backup`, `pull-secret`, `pull-secret-all-remote`, `pull-secret-single`, `push-secret`, `push-secret-all-remote`, `push-secret-single`, `rebuild`, `require-dev-env`, `reseed`, `reset-dev-db`, `restart`, `restart-backend`, `restart-db`, `restart-frontend`, `restart-vite`, `restore`, `restore-db`, `restore-env`, `seed-dev`, `sh`, `start`, `stop`, `stop-backend`, `stop-db`, `stop-frontend`, `stop-vite`, `test`, `test-backend`, `test-frontend`, `token-test`, `tree`, `up`, `up-backend`, `up-db`, `up-frontend`, `up-vite`, `update`, `whoami`.

- les cibles canoniques ne doivent pas être renommées arbitrairement;
- une nouvelle cible ne doit pas dupliquer une cible existante;
- les scripts standards ne doivent pas être remplacés par des variantes parallèles;
- les commandes sensibles doivent échouer explicitement lorsque leur environnement est invalide;

## Invariants de documentation

- la documentation doit refléter l’état réel du dépôt;
- les faits techniques déterministes prévalent sur les descriptions inventées;
- les documents générés restent dans `.docforge/preview` jusqu’à validation;
- `docforge apply` ne doit pas intégrer `INVARIANTS.md` sans approbation explicite;
- toute règle locale doit être placée dans la section réservée;
- toute dérogation doit être placée dans la section des dérogations approuvées.

## Règles locales du projet

<!-- project-assistant:local-invariants:start -->

### API et authentification

- toutes les routes applicatives backend restent sous `/api`;
- le frontend utilise une base API relative via `VITE_API_BASE=/api`;
- aucune URL backend absolue ne doit être codée en dur dans le frontend;
- JWT reste le mécanisme d’authentification applicatif principal;
- aucune inscription publique ne doit être ajoutée;
- le backend reste la source de vérité pour l’isolation des données par utilisateur.

### Données privées et chiffrement

- le backend ne reçoit ni mot de passe maître ni donnée de coffre déchiffrée;
- `PasswordEntry.ciphertext` reste opaque côté backend;
- les champs sensibles restent chiffrés côté client avant stockage;
- aucune journalisation ni export clair ne peut être automatique;
- toute exportation claire exige une action locale explicite et un avertissement;
- les URL ouvertes par le frontend sont limitées aux schémas `http` et `https`.

### Limites de sécurité documentées

- le serveur ne stocke pas la clé privée utilisateur, mais certaines métadonnées restent lisibles;
- la clé privée locale ne doit jamais être réintroduite en clair dans `localStorage`;
- le chiffrement actuel ne doit pas être présenté comme un modèle zero-knowledge complet;
- les hypothèses et limites de sécurité doivent rester cohérentes avec `docs/threat-model.md`.

### Écarts existants

- les scripts d’exploitation hors nomenclature app-template restent des écarts à ne pas étendre;
- les endpoints de session Django legacy restent isolés sous `/api/auth/session/` et les alias historiques demeurent dépréciés;

- tout changement d’exploitation, d’authentification ou de chiffrement doit mettre à jour la documentation concernée.
_Ces règles peuvent renforcer les invariants globaux, mais jamais les contredire._

<!-- project-assistant:local-invariants:end -->

## Dérogations explicitement approuvées

Une dérogation n’est valide que si elle a été explicitement autorisée par le propriétaire et si elle documente sa justification, sa portée, ses risques et son plan de suppression ou de migration.

<!-- project-assistant:approved-deviations:start -->

_Aucune dérogation approuvée._

<!-- project-assistant:approved-deviations:end -->

## Validation obligatoire

Avant toute livraison ou modification structurante :

1. exécuter `make check`;
2. exécuter `make test`;
3. exécuter `make test-backend`;
4. exécuter `make test-frontend`;
5. exécuter `make ps`;

Toujours vérifier :

- `git status`;
- `git diff`;
- l’absence de secrets;
- la cohérence avec `app-template`;
- la documentation affectée;
- l’approbation explicite de toute évolution d’invariant.

## Règle finale

Le projet doit s’adapter aux invariants. Les invariants ne doivent jamais être adaptés automatiquement pour justifier le projet.

## Contrats spécifiques au gestionnaire de mots de passe

## 8. Interface de commande

Quand le `Makefile` expose une commande, il doit etre prefere.

Commandes actuelles de reference :

```bash
make init
make generate-env
make dev
make prod
make check
make up
make down
make restart
make rebuild
make ps
make logs
make migrate
make update
make backup
make restore
make createsuperuser
make backup-db
make restore-db
```

Etat actuel du depot :

- l'interface principale existe et expose désormais les noms standards du template ;
- `generate-env.sh`, `generate-secrets.sh`, `init.sh`, `check-invariants.sh`, `update.sh`, `rebuild.sh` et les autres scripts standards existent sous les noms attendus ;
- le depot conserve aussi quelques scripts supplementaires propres a son exploitation.

## 9. Regles de securite specifiques au gestionnaire de mots de passe

Regles non negociables :

- le backend ne doit jamais recevoir de mot de passe maitre ;
- le backend ne doit jamais dechiffrer `PasswordEntry.ciphertext` ;
- les champs sensibles d'une entree de voute doivent rester chiffres cote serveur ;
- aucune journalisation ne doit inclure des secrets en clair ;
- aucune exportation claire ne doit etre automatique ;
- toute fonctionnalite d'export clair doit etre explicite, locale et accompagnee d'un avertissement.
- les URL utilisateur ouvertes dans un nouvel onglet doivent etre limitees a `http` et `https`.

Pour le depot actuel :

- `login`, `password` et `notes` sont chiffres cote client ;
- le titre, l'URL, la categorie et certaines metadonnees restent en clair ;
- la clé déchiffrée est utilisée uniquement en mémoire ; l’enveloppe chiffrée est privée, associée au compte en PostgreSQL et exportable indépendamment ;
- les anciennes paires IndexedDB/localStorage ne sont lues que pour une migration explicite ; les retirer seulement après sauvegarde confirmée, téléversement, récupération et vérification locale de la même paire et de la voûte ;
- le fichier d'export de cle est lui-meme sensible et ne doit jamais etre committe ni place dans un stockage non maitrise.
- le frontend prod sert des en-tetes de securite via Nginx, dont une CSP restrictive.
- le detail du modele de menace courant est formalise dans `docs/threat-model.md`.

## 10. Zero-knowledge

Le terme "zero-knowledge" doit etre utilise avec precision.

Dans ce depot, la garantie actuelle est partielle :

- le serveur stocke des blobs chiffres pour les secrets ;
- le serveur stocke seulement une enveloppe de clé privée chiffrée, jamais la clé déchiffrée ni son mot de passe ;
- le serveur peut toutefois lire certaines metadonnees non chiffrees.

Ne pas presenter l'application comme "zero-knowledge complet" tant que :

- les metadonnees restent visibles ;
- la gestion de cle reste accessible au contexte JavaScript du navigateur, meme si elle n'est plus laissee en clair dans `localStorage` ;
- le threat model formalise decrit encore un navigateur local de confiance comme hypothese forte.

## 11. Ecarts connus a ne pas aggraver

Les ecarts suivants existent deja et doivent etre traites comme temporaires :

- presence de scripts d'exploitation hors nomenclature standard du template ;
- certains guides annexes du depot n'ont pas encore tous ete re-alignes sur les invariants courants ;

Tant qu'ils ne sont pas corriges :

- ne pas etendre ces ecarts a de nouveaux fichiers ;
- ne pas dupliquer de nouvelles conventions paralleles ;
- documenter tout changement qui touche l'exploitation, l'auth ou le chiffrement.
