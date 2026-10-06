# GestionnaireMDP — Extension Autofill Firefox

Cette extension WebExtension (manifest v2) permet de récupérer vos identifiants chiffrés depuis l’API GestionnaireMDP, de les déchiffrer localement via votre clé privée (`vault-key.json`) puis de remplir automatiquement les formulaires de connexion dans Firefox.

> 💡 L’ancien POC basé sur un host natif (`contrib/native/`) reste disponible pour dépannage mais n’est plus nécessaire dans le flux standard décrit ci-dessous.

---

## 1. Pré-requis

- Firefox 118+ (Edition Desktop).
- Instance GestionnaireMDP fonctionnelle (API accessible depuis votre poste).
- Export `vault-key.json` généré depuis l’interface web + passphrase d’export.
- Identifiants de connexion (username / mot de passe) pour l’API.

---

## 2. Chargement temporaire de l’extension

1. Ouvrir `about:debugging#/runtime/this-firefox`.
2. Cliquer **“Charger un module complémentaire temporaire”**.
3. Sélectionner `contrib/firefox-extension/manifest.json`.

> Pour un empaquetage `.xpi`, comprimer le contenu du dossier `contrib/firefox-extension/` puis charger l’archive via la même interface.

---

## 3. Configuration initiale

Après le chargement, ouvrez le popup de l’extension puis cliquez sur **“Options”** (ou rendez-vous sur `about:addons` > Extension > **Options**).

1. **Serveur / API**
   - Renseignez l’URL complète de l’API (ex : `https://vault.exemple.tld/api/`) et enregistrez.
2. **Authentification**
   - Indiquez le nom d’utilisateur et le mot de passe, puis cliquez sur *Se connecter*.
   - L’extension stocke les jetons JWT dans `browser.storage.local`.
3. **Clé privée**
   - Importez votre `vault-key.json` et saisissez la passphrase définie lors de l’export.
   - La clé privée (JWK) est conservée côté extension et n’est jamais envoyée au serveur.

Une fois ces trois voyants au vert, l’extension peut synchroniser et autofill.

---

## 4. Utilisation

- Lorsqu’un onglet contient un formulaire de connexion, le content script détecte les champs et demande des identifiants au background.
- Le background récupère la liste chiffrée via `/api/passwords/`, déchiffre localement (WebCrypto + `crypto.js`) puis renvoie les meilleures correspondances.
- Le formulaire est rempli automatiquement. Le popup affiche la liste des entrées correspondantes (top 5) et l’état de l’extension.

> 🛠️ Bouton **“Rafraîchir”** dans le popup ou les options pour invalider le cache et re-synchroniser immédiatement.

---

## 5. Dépannage

- **“config_missing” / “not_authenticated” / “key_missing”** : au moins un des trois pré-requis (API, JWT, clé privée) est absent. Vérifiez la page d’options.
- **401 API** : jeton expiré. Cliquez sur *Se connecter* dans la page d’options pour renouveler les jetons.
- **Import de clé** : si la passphrase est incorrecte, l’extension retourne `Import du keybundle échoué`. Réexportez le keybundle si nécessaire.
- **Matching** : si une URL n’est pas renseignée dans l’entrée du coffre, ajoutez-la dans l’application web pour améliorer la détection. Des règles spécifiques peuvent être codées dans `site_rules.js`.

---

## 6. Scripts & structure

| Fichier | Rôle |
| -- | -- |
| `background.js` | Authentification JWT, récupération depuis l’API, déchiffrement et scoring des entrées. |
| `content_script.js` | Détection des champs `login/password`, communication avec le background, remplissage et heuristiques DOM. |
| `popup.html/js` | Tableau de bord rapide (état, correspondances, actions). |
| `options.html/js` | Interface de configuration (API, login, keybundle, refresh). |
| `crypto.js` | Utilitaires WebCrypto (import keybundle, déchiffrement AES-GCM + RSA-OAEP). |

---

## 7. Legacy (host natif)

Pour des scénarios hors navigateur (ex : tests rapides sans API), le host natif reste disponible :

1. Installer le script Python : voir `contrib/native/monmdp-host.py` et `contrib/README.txt`.
2. Charger l’ancienne extension MV2 dans `contrib/extension/`.

Cependant, le flux recommandé est désormais l’extension Firefox autonome décrite dans ce document.

---

Bon autofill !

## Limite avec la nouvelle gestion de clé

Le client web utilise désormais une enveloppe chiffrée de compte v2 et une paire déchiffrée uniquement en mémoire. Les lecteurs historiques de ce dossier restent v1 et ne sont pas intégrés à ce parcours ; ne pas présumer de la compatibilité des nouveaux exports v2 ni de la conformité de leur stockage aux nouvelles règles du client web. Voir [migration et limites](../docs/gestion-cle-chiffree.md). La reprise de l’autofill est un chantier distinct.
