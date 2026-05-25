# Threat Model - Gestionnaire MDP

## 1. Objet

Ce document formalise le modele de menace courant de `gestionnaireMDP`.

Il decrit :

- ce que l'application protege effectivement ;
- ce qu'elle ne protege pas ;
- les hypotheses de confiance necessaires ;
- les consequences techniques et operationnelles pour les developpeurs et les exploitants.

Il ne remplace pas `INVARIANTS.md`, `specification.md` ou `api.md`.

## 2. Actifs a proteger

Actifs les plus sensibles :

- les secrets dechiffres de la voute : `login`, `password`, `notes`
- la cle privee locale utilisee pour dechiffrer la voute
- les bundles de secrets exportes par l'utilisateur
- les tokens JWT `access` et `refresh`
- les secrets d'exploitation presents dans `.env.local`

Actifs moins sensibles mais encore importants :

- les metadonnees de la voute : `title`, `url`, `category`
- les metadonnees des bundles : `app`, `environment`
- l'integrite des enregistrements stockes en base

## 3. Frontieres de confiance

Le modele courant suppose plusieurs zones distinctes.

### 3.1 Navigateur de l'utilisateur

Le navigateur est le lieu de confiance principal pour le chiffrement applicatif.

Le frontend y :

- genere ou recharge la paire de cles
- chiffre et dechiffre les secrets
- stocke la cle privee en `IndexedDB`
- stocke les JWT en `localStorage`

Si ce contexte est compromis, le modele de protection de la voute est largement rompu.

### 3.2 Backend Django + PostgreSQL

Le backend est considere comme non autorise a lire les secrets dechiffres de la voute, mais il reste en mesure de :

- lire les metadonnees non chiffrees
- lire les blobs chiffres stockes en base
- supprimer ou corrompre des donnees
- voir les JWT recus dans les requetes

Le backend n'est donc pas un tiers de confiance complet. Il est plutot un serveur de stockage et de controle d'acces.

### 3.3 Poste local et stockage utilisateur

Le poste de l'utilisateur et ses sauvegardes locales font partie du modele.

Un export JSON/CSV en clair ou un bundle de cle mal protege sort du perimetre applicatif et devient un risque operationnel direct.

## 4. Ce que l'application protege raisonnablement

Protections actuellement plausibles si le navigateur de l'utilisateur n'est pas compromis :

- un administrateur base de donnees ne peut pas lire directement `login`, `password`, `notes` sans la cle privee locale ;
- une fuite de base ne revele pas directement le contenu dechiffre de `PasswordEntry.ciphertext` ;
- un refresh token peut etre invalide au logout JWT ;
- un utilisateur ne peut pas referencer la categorie d'un autre utilisateur dans une entree de mot de passe ;
- la cle locale n'est plus laissee en clair dans `localStorage`, ce qui reduit l'exposition triviale a certaines lectures opportunistes ;
- les URL utilisateur ouvertes depuis la voute sont limitees aux protocoles `http` et `https` ;
- la production ajoute une politique CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` et `Permissions-Policy` via Nginx.

## 5. Ce que l'application ne protege pas

Le modele courant ne protege pas correctement contre :

- un XSS dans le frontend ;
- une extension navigateur malveillante ;
- un navigateur ou poste utilisateur compromis ;
- un export de voute en clair conserve dans un emplacement non maitrise ;
- une capture d'ecran, un keylogger ou un malware local ;
- un backend malveillant qui altere silencieusement les donnees ou sert du JavaScript modifie ;
- l'analyse des metadonnees de la voute cote serveur ;
- l'usage d'une mauvaise cle importee par l'utilisateur.

En particulier :

- la cle privee reste accessible au contexte JavaScript local ;
- les JWT restent accessibles au JavaScript local ;
- les metadonnees `title`, `url`, `category`, `app`, `environment` restent en clair ;
- l'application n'assure pas une verification d'integrite du code frontend distribue a l'utilisateur face a un serveur compromis.

## 6. Menaces principales

### 6.1 Fuite de base ou lecture serveur passive

Impact :

- l'attaquant lit les metadonnees ;
- il recupere les blobs chiffres ;
- il ne recupere pas directement les secrets dechiffres si la cle locale n'est pas egalement compromise.

### 6.2 Compromission du navigateur ou XSS

Impact :

- la cle privee locale peut etre lue ou utilisee ;
- les JWT peuvent etre lus ;
- les secrets peuvent etre dechiffres a la volee ;
- le modele "zero-knowledge partiel" cesse d'etre pertinent.

C'est aujourd'hui l'une des limites structurantes du projet.

### 6.3 Vol du poste ou du profil navigateur

Impact :

- acces possible a `IndexedDB`, au `localStorage` et aux exports locaux ;
- risque tres eleve si la session OS ou navigateur est deja ouverte.

### 6.4 Erreur utilisateur sur les exports

Impact :

- perte de confidentialite immediate si export JSON/CSV en clair ;
- perte d'acces aux anciennes donnees si la mauvaise cle est importee ou si la bonne cle est perdue.

### 6.5 Backend ou chaine de deploiement compromise

Impact :

- l'attaquant peut distribuer un frontend modifie pour exfiltrer la cle ou les secrets ;
- il peut supprimer, substituer ou corrompre les donnees stockees ;
- il peut collecter les metadonnees non chiffrees.

## 7. Hypotheses de confiance minimales

Le modele ne tient que si les hypotheses suivantes restent vraies :

- le navigateur executant l'application n'est pas activement compromis ;
- le frontend servi a l'utilisateur correspond bien au code attendu ;
- l'utilisateur protege ses exports de cle et de voute ;
- `.env.local` reste hors Git et hors exposition publique ;
- les developpeurs ne reintroduisent pas de stockage clair de la cle privee dans `localStorage`.

## 8. Consequences pour l'architecture

Implications directes :

- ne pas presenter l'application comme "zero-knowledge complet" ;
- eviter d'ajouter des metadonnees sensibles non chiffrees supplementaires ;
- considerer tout code frontend comme partie du perimetre de securite ;
- traiter les exports comme des operations risquees devant rester explicites et locales ;
- maintenir la separation nette entre auth JWT, stockage de cle locale et secrets d'exploitation.

## 9. Recommandations pratiques

### 9.1 Pour les developpeurs

- privilegier les correctifs qui reduisent l'exposition au JavaScript arbitraire ;
- ne pas introduire de dependance frontend non necessaire sur des donnees secretes ;
- documenter toute evolution touchant au chiffrement, a `IndexedDB`, aux exports ou aux JWT ;
- ajouter des tests sur les migrations de stockage de cle et les flux auth critiques.

### 9.2 Pour l'exploitation

- proteger strictement le serveur qui sert le frontend ;
- limiter la surface d'administration ;
- surveiller toute modification inattendue du code servi ;
- conserver les sauvegardes de base et les exports de cle dans des emplacements distincts et maitrises ;
- ne jamais committer `.env.local` ni un export de cle.

### 9.3 Pour les utilisateurs

- utiliser un poste et un navigateur de confiance ;
- exporter la cle avec une passphrase forte ;
- tester l'import de la cle avant d'en dependre ;
- manipuler l'export JSON/CSV de la voute comme une fuite potentielle de tous les secrets.

## 10. Pistes d'amelioration

Ameliorations realistes pour plus tard :

- minimiser encore les metadonnees laissees en clair ;
- mieux encadrer les exports clairs ;
- ajouter davantage de tests e2e sur les flux critiques ;
- etudier un stockage local encore plus durci si le navigateur cible et l'ergonomie le permettent.

## 11. Resume

`gestionnaireMDP` protege surtout contre la lecture passive des secrets en base ou cote serveur, tant que le navigateur de l'utilisateur reste sain.

Il ne protege pas correctement contre un frontend compromis, un XSS, un poste local hostile ou un mauvais usage des exports.

Le terme exact pour l'etat courant est donc :

- chiffrement cote client utile ;
- zero-knowledge partiel ;
- threat model centre sur un navigateur de confiance, pas sur un environnement hostile.
