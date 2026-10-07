# Déverrouillage temporaire de la voûte

Évolution locale du 2026-10-07, sans déploiement. La validation de restauration et des appareils de la gestion de clé chiffrée reste distincte.

## Contrat

La connexion JWT et le déverrouillage par phrase de passe de clé restent indépendants. L’application chargée conserve la paire déchiffrée **uniquement en mémoire**, tant que cette page existe, que la session de connexion reste valide et qu’aucun verrouillage manuel n’intervient. Aucun mot de passe de clé, clé ou secret déchiffré ajouté à localStorage, sessionStorage, IndexedDB, cookies, URL, serveur, logs, télémétrie ou cache. Les seuls signaux inter-onglets sont non sensibles ; les JWT et les anciennes copies en attente de migration suivent leurs contrats existants.

Changement d’onglet/fenêtre/application, navigation React, inactivité et suspension/reprise conservent le déverrouillage tant que la page et la session restent valides. Il n’existe aucun délai d’inactivité et les interactions utilisateur, requêtes et réponses asynchrones n’affectent pas la durée du déverrouillage.

Le verrouillage intervient au verrouillage manuel, à la déconnexion et au changement ou à l’invalidation de compte. Reload, fermeture/réouverture et destruction/éviction du document exigent une nouvelle saisie. Aucun événement `visibilitychange`, `blur`, `focus`, `pagehide`, `pageshow`, `freeze` ou `resume` ne verrouille ; si le navigateur conserve le document en BFCache, son état mémoire est conservé.

## Implémentation et reprise

- `utils/vaultSession.js` conserve état, génération et dernières interactions dans un module par document ; les composants `VaultGate` s’y abonnent et retrouvent l’état lors d’une navigation React. La paire active vit dans `utils/crypto.js`, sans restauration automatique.
- Chaque consultation de génération/état et chaque accès crypto contrôle encore la validité locale de l’authentification. La copie de valeurs React déjà déchiffrées et l’export clair possèdent aussi un garde explicite. Le chiffrement/déchiffrement recontrôle après les `await` et refuse un changement d’époque de clé.
- Les événements de cycle de vie du navigateur ne masquent, ne vérifient par le réseau et ne verrouillent pas la voûte. Au retour visible, seule la validité locale de la session est consultée. Les accès API continuent de traiter l’expiration/refresh JWT et tout `401` protégé verrouille la voûte.
- En cas d’échec réseau de reprise, verrouillage conservateur ; pas de fonctionnement hors ligne. Un 401 de route protégée verrouille avant refresh. Un refresh révoqué à la reprise purge la connexion (400 de blacklist ou 401 d’invalidité). Sans access ni refresh valides, la voûte se verrouille aussi sans requête.
- Chaque verrouillage incrémente une génération et abandonne la paire. CSS masque immédiatement, puis React démonte les composants sensibles et abandonne les champs/mots de passe saisis. Les opérations commencées avant le verrouillage ne peuvent ni activer une clé ni terminer un export clair tardivement.
- `BroadcastChannel('mdp-vault-lock')` et le signal localStorage `mdp.lock` propagent verrouillage manuel et invalidation. Ils ne partagent ni clé ni état déverrouillé. La propagation est conservatrice pour toute l’origine ; les autres comptes ouverts sur cette origine sont également verrouillés. Un changement JWT de compte/suppression recharge les autres onglets après verrouillage ; un refresh du même compte est accepté.

## Limites

JavaScript ne garantit aucun effacement physique immédiat de RAM/swap, aucune révocation d’une copie déjà remise au système et aucune suppression de capture d’écran. Les vignettes/snapshots du navigateur ou de l’OS peuvent conserver une image ancienne ; la recette physique doit vérifier la reprise sans image sensible fugitive. Sans délai d’inactivité, la clé reste utilisable par un XSS ou une extension hostile aussi longtemps que la page et la session restent ouvertes : navigateur, poste de confiance et verrouillage manuel du poste ou de la voûte deviennent des hypothèses fortes.

Il n’existe aucun push de révocation serveur. La reprise vérifie refresh/compte et les erreurs 401 verrouillent, mais une révocation distante ne peut être détectée instantanément pendant une utilisation purement locale sans échange réseau. Le backend SimpleJWT accepte un access déjà émis jusqu’à son expiration ; blacklister le refresh ne révoque pas rétroactivement cet access. Ce changement n’ajoute ni protocole de révocation ni endpoint.

Android peut tuer le document sans notification : une nouvelle instance démarre verrouillée. Une suspension ou un événement de cycle de vie ne verrouille pas volontairement la voûte si la page survit. Aucune certification physique Android ou suspension OS n’est apportée par les tests simulés.

## Vérification automatique

Vitest couvre état initial verrouillé malgré JWT, absences et reprises répétées, longue inactivité sans verrouillage, suspension/reprise simulée, signal manuel, navigation/BFCache, validation masquée, refresh d’access, échecs réseau/auth et résultats asynchrones tardifs. Le test React vérifie également la conservation lors d’un démontage/remontage de la porte et la disparition des secrets au verrouillage manuel. Les tests existants de clé/migration/export restent exécutés.

`frontend/tests/vault-session-browser.mjs` ouvre un contexte Chromium isolé sur le frontend dev 5174. Toutes les API sont interceptées avec des fixtures ; aucun compte réel ni base réelle. Il vérifie longue inactivité, navigation React, onglets indépendants, propagation manuelle/changement de compte, reload/navigation, vérification masquée/tardive, révocation, réseau, sommeil simulé et absence des marqueurs secrets fictifs dans requêtes/stockages. Commande dans [README_DEV](../README_DEV.md#recette-du-déverrouillage-temporaire).

## Recette manuelle avant production

Utiliser uniquement un compte et des secrets fictifs, sur une stack de développement. Consigner navigateur/version et appareil ; ne pas mélanger ces résultats avec la validation des restaurations de clé.

1. Déverrouiller, ouvrir un site externe dans un autre onglet, attendre réellement plusieurs minutes, revenir et révéler/copier. Répéter plusieurs allers-retours, fenêtre/application et vues React : la voûte doit rester déverrouillée.
2. Laisser la page longtemps sans interaction au premier plan, puis en arrière-plan : si la session est encore valide, la voûte doit rester déverrouillée après la vérification de reprise.
3. Suspendre physiquement appareil/ordinateur, puis reprendre : si le navigateur a conservé la page et que la session reste valide, la voûte doit rester déverrouillée ; si le navigateur a évincé ou recréé la page, elle doit être verrouillée.
4. Verrouiller manuellement et vérifier les autres onglets ; déconnecter pendant une requête lente puis changer de compte dans un autre onglet. Vérifier révocation du refresh, compte désactivé, absence réseau au retour et refresh normal du même compte.
5. Reload, fermeture/réouverture et éviction mobile : phrase de passe exigée. Pour une navigation externe puis retour, distinguer une page détruite (verrouillée) d’une page conservée en BFCache (déverrouillage mémoire conservé). Un nouvel onglet reste verrouillé et ne reçoit jamais la clé d’un onglet déjà déverrouillé.
6. Retarder déchiffrement/révélation/export et réponses HTTP, verrouiller pendant l’opération : aucun résultat clair ni réactivation tardive. Inspecter localStorage, sessionStorage, toutes les tables IndexedDB, cookies, URL, requêtes et logs/proxy sur ces fixtures ; ne pas confondre anciens stockages explicitement en attente de migration et nouvelles écritures interdites.

Aucun nouvel écart au template global : pas de changement de service, port canonique, environnement, API/modèle ou chiffrement serveur. Les écarts historiques d’exploitation restent ceux des invariants. Aucun invariant global modifié.

## Résultats locaux du 2026-10-07

- Avant modification : `npm test -- --run src/utils/vaultSession.test.js` dans `frontend/`, 2 tests réussis reproduisant le verrouillage immédiat à visibilité cachée et freeze.
- Après suppression de l’expiration par inactivité : la suite vérifie que l’arrière-plan, la longue inactivité et la suspension simulée ne verrouillent plus une page dont la session reste valide, tout en conservant les verrouillages manuels, de navigation et d’authentification.
- Backend : `PYTHONPATH=/tmp:/home/sylvain/projets/gestionnaireMDP/backend /tmp/mdp-test-venv/bin/python manage.py test --settings=mdp_test_settings` depuis `backend/`, **19 réussites et 1 ignoré** (20 découverts). Configuration temporaire avec SQLite en mémoire et valeurs fictives, sans lecture de `.env.local`. Le test PostgreSQL réellement concurrent reste à exécuter dans l’environnement autorisé.
- Chromium isolé : la recette complète avait réussi lors de l’implémentation initiale. Après la suppression de l’expiration, sa relance locale reste à faire : la dépendance Playwright temporaire `/tmp/mdp-playwright` n’était plus installée. Toutes les API de cette recette sont interceptées ; aucune base ni identité réelle n’est consultée.
- `make check`, `make test`, le build Vite et `git diff --check` réussis dans la stack Compose de développement. `make ps` confirme `db` sain et les services backend/frontend actifs.
- Aucun déploiement, aucune migration de schéma, aucune modification de `.env.local`, aucune utilisation de voûte réelle. Les durées réellement écoulées, suspension/éviction physiques, snapshots OS et journaux de la stack restent à vérifier selon la recette manuelle.
