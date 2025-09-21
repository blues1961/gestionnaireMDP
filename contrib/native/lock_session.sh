#!/usr/bin/env bash
# Supprime le fichier de session (lock)
set -e
S="$HOME/.local/share/monmdp/session_privkey.b64"
if [ -f "$S" ]; then
  rm -f "$S"
  echo "Session supprimée : $S"
else
  echo "Aucune session à supprimer ($S introuvable)."
fi
