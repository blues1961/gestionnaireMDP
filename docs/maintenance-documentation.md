# Maintenance de la documentation

## Responsabilité de Codex

Pour toute nouvelle fonctionnalité implémentée par Codex dans `gestionnaireMDP`, la documentation technique concernée doit être mise à jour **dans le même changement que le code**. Mettre à jour au minimum les fichiers pertinents de `docs/` et, lorsque nécessaire, `README.md`, `README_DEV.md`, `CODEX_START.md`, `AGENTS.md` ou `INVARIANTS.md`.

- Comportement et architecture : `docs/specification.md`.
- Routes, payloads, permissions et modèles exposés : `docs/api.md`.
- Chiffrement, authentification, stockage local et hypothèses de confiance : `docs/threat-model.md`.
- Exploitation : guide pertinent de `docs/`, puis README ou README_DEV si le parcours change.
- Instructions aux agents et contrats globaux : CODEX_START, AGENTS ou INVARIANTS si concernés.

La revue du changement vérifie l’accord entre code, documentation et validations réellement effectuées. Distinguer les propositions de l’état implémenté et signaler les vérifications restant à faire. Ne jamais inclure de secrets réels.

## Répartition avec Obsidian

Le dépôt est la source de vérité des commandes, formats, API, modèles, invariants et procédures techniques. Obsidian conserve la note principale, les idées transversales, les décisions et la conception de haut niveau. Mettre à jour Obsidian seulement lorsque le changement affecte le suivi, une décision ou l’architecture générale, sans recopier le contrat technique.

La gestion du fichier de clé chiffré est implémentée dans le dépôt : voir `specification.md`, `api.md`, `threat-model.md` et `gestion-cle-chiffree.md`. Les validations sur appareils réels et PostgreSQL doivent être distinguées des tests automatisés en environnement isolé. Obsidian conserve uniquement le statut et les décisions générales.
