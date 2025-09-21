MonMDP Autofill POC
===================

Contenu de l'archive:
- monmdp-autofill/extension/manifest.json
- monmdp-autofill/extension/background.js
- monmdp-autofill/extension/content_script.js
- monmdp-autofill/native/com.monapp.nativehost.json
- monmdp-autofill/native/monmdp-host.py

Instructions rapides d'installation (Ubuntu)
1) Copier le host dans /usr/local/bin et rendre exécutable:
   sudo cp monmdp-autofill/native/monmdp-host.py /usr/local/bin/monmdp-host
   sudo chmod +x /usr/local/bin/monmdp-host

2) Installer le manifeste natif pour l'utilisateur:
   mkdir -p ~/.mozilla/native-messaging-hosts
   cp monmdp-autofill/native/com.monapp.nativehost.json ~/.mozilla/native-messaging-hosts/

   (ou pour installer pour tout le système, utiliser /usr/lib/mozilla/native-messaging-hosts/ en sudo)

3) Charger l'extension temporairement dans Firefox:
   - Ouvrir about:debugging#/runtime/this-firefox
   - Cliquer "Load Temporary Add-on"
   - Sélectionner monmdp-autofill/extension/manifest.json

4) Tester:
   - Ouvrir une page contenant un champ password. Le content_script devrait remplir le champ avec 'motdepasse_exemple'.

Exemples de commande pour extraire l'archive dans ton répertoire de projet:
   # depuis le dossier où tu as téléchargé le tar.gz:
   tar -xzf monmdp-autofill-poc.tar.gz

   # pour extraire directement dans ~/projets/gestionnaire_mdp (adapter le chemin si nécessaire)
   tar -xzf monmdp-autofill-poc.tar.gz -C ~/projets/gestionnaire_mdp

Notes:
- Ce POC renvoie un mot de passe en clair. NE PAS l'utiliser tel quel en production.
- Voir README et la conversation ChatGPT pour les étapes de sécurisation (chiffrement local, déverrouillage, keyring).
