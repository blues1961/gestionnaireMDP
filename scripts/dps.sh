#!/usr/bin/env bash
# Affiche les conteneurs Docker avec le service Compose associé

docker ps \
  --format "table {{.ID}}\t{{.Names}}\t{{.Label \"com.docker.compose.service\"}}\t{{.Status}}\t{{.Ports}}"
