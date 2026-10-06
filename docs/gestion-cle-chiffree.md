# Clé chiffrée : migration, validation et déploiement

Implémentation locale du 2026-10-05. Aucun déploiement, aucune ouverture ou modification de la voûte réelle dans ce changement.

## Décisions

- Une enveloppe v2 privée par compte en PostgreSQL ; API JWT, limites de format/taille, création et remplacement atomiques sous contrôle de révision. Pas de fichier public, pas de suppression ni rotation de paire.
- AES-GCM avec AAD pour les paramètres et la clé publique ; PBKDF2/SHA-256 à 600 000 itérations pour les nouvelles enveloppes. Compatibilité locale des exports v1, convertis v2 avant envoi. Paramètres détaillés dans [API](api.md#7-enveloppe-de-clé-chiffrée).
- Pas de cache persistant supplémentaire ni mode hors ligne. Clé déchiffrée en mémoire ; mot de passe demandé à chaque nouveau chargement/déverrouillage, séparé de l’authentification.
- Verrouillage après cinq minutes sans interaction et immédiatement à l’arrière-plan, donc avant la suspension Android dès que le navigateur signale celle-ci. BroadcastChannel avec signal localStorage de secours pour verrouiller les autres onglets. Un onglet ne transmet jamais une clé à un autre.
- Challenge aléatoire pour vérifier la cohérence de la paire même sans entrées ; toutes les entrées existantes sont vérifiées avant activation. Une confirmation de provenance est nécessaire pour une voûte vide ; aucune preuve d’appartenance historique d’un fichier à un compte vide n’est revendiquée.
- Aucune migration automatique de la paire globale historique `active`. Elle peut appartenir à un autre compte. Une migration de cette paire vers une voûte vide sans enveloppe est refusée : utiliser un fichier identifié. La nouvelle création est explicite et refusée si entrées, enveloppe ou bundles existent.
- La version protège les conflits usuels, pas le rollback d’un serveur malveillant. Aucun mécanisme d’ancrage externe n’est implémenté ; limite décrite dans [modèle de menace](threat-model.md).

## Migration utilisateur sans rotation

1. Conserver la sauvegarde actuelle de clé et une sauvegarde de base. Ne pas effacer le profil du navigateur avant migration, ni ajouter un export dans Git ou Obsidian.
2. Après connexion, si aucune enveloppe n’existe, sélectionner le fichier existant et saisir son mot de passe de clé. Sinon, choisir explicitement l’ancienne paire locale encore disponible et une nouvelle phrase de passe forte (16 caractères minimum pour un nouvel export).
3. Le client valide le format et ses bornes, vérifie la paire privée/publique puis déchiffre toutes les entrées. Tout échec reste verrouillé et bloque le téléversement ; aucune nouvelle paire ne remplace une paire existante.
4. Le client prépare une enveloppe v2 de **la même paire**, effectue un aller-retour de déchiffrement et propose son téléchargement. Télécharger, conserver hors serveur, puis confirmer que sauvegarde et phrase de passe sont protégées séparément.
5. « Enregistrer et vérifier la récupération » envoie uniquement l’enveloppe et la révision attendue. Le client relit l’enveloppe serveur, compare contenu/révision, redéchiffre et vérifie à nouveau les entrées.
6. Seulement après ces étapes, inspecter séparément IndexedDB et localStorage et retirer uniquement les enregistrements dont la paire cohérente correspond à la paire migrée. Une copie différente ou illisible est conservée et signalée. Une ancienne paire d’un autre compte reste conservée et doit être migrée avec ce compte. Une erreur de nettoyage ne retire pas l’accès serveur ; reprendre la procédure de finalisation.
7. Verrouiller, saisir de nouveau le mot de passe, puis tester un nouvel appareil. Vérifier séparément la sauvegarde indépendante, la lecture d’une entrée et les nouvelles créations sur une voûte de test avant de généraliser.

Les exports v1 de moins de 16 caractères restent déchiffrables : saisir leur ancien mot de passe dans le premier champ et une nouvelle phrase forte dans les deux champs de nouvelle phrase de passe avant de préparer l’enveloppe. Le fichier source et sa phrase initiale restent inchangés ; le nouvel export et le serveur utilisent la nouvelle phrase. Ne jamais générer une nouvelle paire pour contourner une erreur. Les anciens exports restent sensibles après changement de phrase de passe.

## Reprise après interruption

| Interruption | État et reprise |
| --- | --- |
| Avant PUT | Aucun changement serveur ; ancienne paire locale et fichier conservés. Recommencer. |
| PUT accepté, réponse perdue | Recharger : GET retrouve l’enveloppe. Déverrouiller avec la phrase choisie ; ne pas refaire un PUT aveugle. |
| Relecture/déchiffrement interrompu | L’ancienne paire n’est pas supprimée. GET et déverrouillage peuvent reprendre. |
| Après validation, avant nettoyage | L’enveloppe et l’export suffisent. Pour finaliser le nettoyage, réimporter le fichier sauvegardé, confirmer une sauvegarde et refaire la procédure contrôlée ; la même clé publique est imposée. |
| Conflit 409 | Aucune écriture de cette tentative. Recharger, vérifier la version courante et refaire une action explicite. |
| Serveur indisponible | Ne pas présenter l’erreur comme un mauvais mot de passe. Conserver les sauvegardes. Le mode hors ligne n’est pas pris en charge. |

Le retrait de l’ancienne paire est indépendant de la suppression du fichier de sauvegarde : **ne jamais supprimer la sauvegarde indépendante** après migration. Le nettoyage concerne uniquement les emplacements historiques identifiés, pas les téléchargements utilisateur.

## Export, secours et changement de phrase de passe

- « Sauvegarde clé » produit une enveloppe v2 locale de la paire active. L’export seul ne change pas le mot de passe serveur.
- Après téléchargement et confirmation de sauvegarde, l’action de remplacement utilise la révision lue à l’ouverture de la page. Elle vérifie à nouveau la paire et les entrées, remplace atomiquement, puis relit et déchiffre l’enveloppe serveur. Un conflit exige une nouvelle ouverture de la page.
- Au déverrouillage, « Fichier existant ou import de secours » permet de remettre une sauvegarde compatible. Il ne remplace pas une identité publique différente. Pour une enveloppe absente après restauration, le fichier compatible avec les entrées peut être réassocié au compte.
- Si les métadonnées/clé publique serveur sont corrompues, restaurer une sauvegarde de base compatible en environnement contrôlé : aucun bouton ne force une substitution de paire. La phrase de passe oubliée n’est pas récupérable par une réinitialisation du compte.
- Restauration utilisable : base (entrées + enveloppe compatibles), phrase de passe et export indépendant testé. Inclure `api_keyenvelope` dans les dumps complets ; protéger les copies hors serveur. Voir [sauvegarde/restauration](sauvegarde-restauration.md).

## Déploiement Linode à effectuer volontairement

Ne pas exécuter cette procédure dans le cadre de la présente livraison.

1. Identifier le checkout et l’environnement de production actuels, les versions/images précédentes et le navigateur réellement utilisé sur chaque appareil. Faire une sauvegarde PostgreSQL via `make backup`, un export chiffré indépendant par compte et tester une restauration **sur une stack isolée** avant mise à jour. Protéger les sauvegardes et leur copie hors serveur ; ne pas les placer dans les répertoires servis.
2. Faire passer `make check`, `make test` et le build sur une stack de recette PostgreSQL avec des fixtures. Tester deux PUT simultanés à la création et au remplacement : un seul succès et un 409. Tester le roundtrip dump/restauration et l’import indépendant. Valider les appareils ci-dessous avant migration réelle.
3. Déployer backend et frontend ensemble dans une fenêtre de maintenance, avec les clients/anciens onglets fermés. Dans le checkout prod vérifié : `make prod`, `make up` puis `make migrate`. `api/0005_keyenvelope` ajoute une table seulement et n’effectue aucune conversion de clé utilisateur. Ne pas lancer `make init-secret`, ne pas modifier `.env.local`, ne pas supprimer de volumes ni régénérer les clés.
4. Vérifier HTTPS, CSP, `/api/healthz/`, whoami et les codes 401/404/201/409 de l’API sur un compte de recette. Vérifier qu’aucun proxy/APM/debug ne journalise corps de requête, Authorization ou secrets ; ne pas utiliser de fixtures de production pour les captures.
5. Effectuer la migration utilisateur manuellement selon la procédure ci-dessus, compte par compte et navigateur par navigateur, sans utiliser une paire locale globale par défaut. Garder les sauvegardes jusqu’aux validations multi-appareils et de restauration.
6. Retour arrière : arrêter les écritures et conserver la base/enveloppes et leurs sauvegardes. Privilégier une correction du client ou un build de secours conservant la gestion en mémoire. **Ne pas remettre l’ancien frontend à disposition** : il recharge/persiste la clé déchiffrée et peut générer une nouvelle paire. La table additive peut rester présente ; ne pas la supprimer pour revenir à une ancienne image. Restaurer une base antérieure entraîne une perte des écritures postérieures et exige une décision opérateur explicite, hors de cette demande.

Écart au template global : aucun nouveau service/volume public n’est nécessaire ; les écarts historiques de scripts et guides décrits dans `INVARIANTS.md` restent présents. Cette fonctionnalité ajoute un modèle métier privé, sans modifier `/api`, la séparation dev/prod, les ports ni les variables d’environnement.

## Vérifications de la livraison initiale (2026-10-05)

Les suites backend Django et frontend Vitest utilisent des fixtures fictives. La configuration temporaire des tests backend remplace la base par SQLite en mémoire et ne lit aucun `.env.local`. À cette date, Docker et PostgreSQL ne sont pas accessibles depuis l’environnement d’édition : les tests de révision successifs passent, mais le verrou `select_for_update` et la course réellement simultanée doivent être validés sur PostgreSQL avant déploiement. Le test de dump/restauration automatisé concerne les objets de fixture, **pas** une restauration complète `pg_dump`/`pg_restore` Linode.

Tests couverts : auth JWT et refus de session legacy, isolation de comptes, création/remplacement versionnés, absence de suppression/rotation, format/taille/paramètres, absence de champs de secrets dans PUT, export/import v1/v2, incohérence privée/publique et clé étrangère, conservation des entrées, migration interrompue et reprise, sauvegarde avant nettoyage, réouverture verrouillée avec JWT, inactivité/arrière-plan et signal entre onglets, refus des résultats asynchrones tardifs. Les tests de composants React utilisent un DOM simulé et le chiffrement réel ; ils ne remplacent pas une inspection réseau et stockage sur navigateur/appareil réel.

| Appareil | Validations réelles restant à effectuer |
| --- | --- |
| Android | Navigateur/version, HTTPS/Web Crypto, temps PBKDF2, saisie et téléchargement, suspension/reprise, suppression du cache, verrouillage multi-onglets |
| ThinkPad | Profil normal/privé, redémarrage, récupération sans fichier et import indépendant |
| Lemur | Effacement stockage, deux comptes successifs, conflit réellement simultané avec autre appareil |
| Thelio | Inactivité, verrouillage explicite, export et restauration testée d’une base isolée |

Aucun de ces quatre appareils n’a été validé physiquement ici. Mesurer le temps PBKDF2 sans journaliser la phrase de passe. Inspecter requêtes, console, logs du proxy/backend, IndexedDB, localStorage, sessionStorage et base sur des fixtures ; seule l’enveloppe chiffrée doit persister, hormis les anciennes copies explicitement en attente de migration. Un cache de clé ou un mode hors ligne reste une évolution séparée. Les limites XSS, serveur hostile, effacement physique de mémoire et presse-papiers sont décrites dans le modèle de menace.

Résultats de vérification locale : 14 tests backend réussis, 1 test PostgreSQL réellement concurrent explicitement ignoré sur SQLite ; 30 tests frontend réussis, build Vite réussi et aucune migration non déclarée. `make test` et `make check` ne peuvent pas s’exécuter via Compose ici (`docker` absent) ; tests exécutés avec les mêmes dépendances dans des environnements temporaires. `npm ci` a signalé 17 vulnérabilités dans l’arbre de dépendances préexistant (dont 2 critiques) ; aucun changement de lockfile/dépendances n’est inclus dans cette fonctionnalité. Ces alertes doivent être qualifiées et traitées avant mise en production, sans supposer que toutes concernent le bundle servi.

L’outillage autofill historique sous `contrib/` reste hors de ce parcours : ses lecteurs sont actuellement v1 et ses politiques de stockage de clé ne sont pas celles du nouveau client web. Ne pas y importer les nouveaux exports v2 en supposant cette compatibilité. L’intégration et le durcissement de cet outillage restent un chantier séparé ; les fichiers v1 existants ne sont pas modifiés par cette livraison.

## Recette de développement réelle (2026-10-06)

Le test `frontend/tests/key-migration-live.mjs` a été exécuté contre l’API de développement du Lemur via son proxy Vite et PostgreSQL réels, avec les fonctions WebCrypto du frontend. Six groupes de vérification ont réussi : fichier v1 vers v2 avec même paire/entrées ; récupération après interruption ; créations concurrentes 201/409 ; mauvais mot de passe/corruption/isolation/substitution refusés ; changement de phrase et remplacements concurrents 200/409 ; sauvegarde indépendante et secours lisibles, verrouillage effectif. Aucun secret de clé ni secret de voûte n’est inclus dans les requêtes applicatives du test. Les deux comptes temporaires ont ensuite été supprimés, avec leurs propres données seulement. Aucun compte existant n’a été réinitialisé, aucune sauvegarde réelle en clair utilisée.

Le socket Docker reste inaccessible à la session Codex, même hors sandbox, et sudo exige un mot de passe. La recette réelle a donc utilisé les ports publiés de la stack Docker, avec un environnement Python temporaire pour préparer/nettoyer les fixtures ; elle n’a pas été lancée par `docker exec`. La cible reproductible `make test-key-migration` permet de faire le même test depuis un terminal autorisé à accéder à Docker. Elle refuse la production et n’applique pas automatiquement les migrations. Le nettoyage après un arrêt brutal se fait avec `make cleanup-key-migration RUN_ID=<uuid>` ; la commande ne touche que les deux identités exactes marquées pour ce test.

Ce test HTTP est complété par `frontend/tests/key-migration-browser.mjs`, une recette Chromium 153.0.8010.12 avec contexte isolé, exécutée sur la même stack de développement. Import réel du fichier v1, mauvais mot de passe, téléchargement de sauvegarde, interruption après PUT, reprise, conservation de l’ancienne clé tant que la finalisation n’est pas complète, nettoyage tardif d’IndexedDB et réouverture avec JWT mais sans fichier ont réussi. Les entrées de fixture sont restées identiques et les requêtes applicatives/localStorage/sessionStorage inspectés ne contenaient pas les secrets fictifs ; IndexedDB ne contenait plus la clé déchiffrée après finalisation. La recette a révélé puis permis de corriger une comparaison JSON sensible à l’ordre des champs JSONB, dans la migration et le remplacement de phrase de passe. Les tests de composants reproduisent désormais ce réordonnancement.

La cible `make test-key-migration-browser` prépare/nettoie les comptes via Compose et utilise un Playwright externe sur l’hôte ; voir `README_DEV.md`. Son script navigateur a été exécuté ici avec préparation/nettoyage via le port PostgreSQL publié, faute d’accès au socket Docker. La migration du fichier réel de l’utilisateur et la recette physique Android/ThinkPad/Lemur/Thelio restent distinctes. Les comptes réels, leurs clés et la sauvegarde JSON en clair ne sont pas nécessaires pour ces tests. L’inspection complète des journaux Docker/proxy et la restauration `pg_dump`/`pg_restore` restent à faire : aucun accès aux journaux conteneurs depuis cette session.

La suite Django a également passé ses **19 tests sur PostgreSQL**, sans test ignoré, dans une base de test isolée à nom aléatoire, créée puis supprimée. Elle inclut la course simultanée et les protections de préparation/nettoyage des fixtures. Les **31 tests frontend** et le build Vite passent après correction. La vérification des migrations de la base de développement a réussi sans appliquer de modification de schéma.
