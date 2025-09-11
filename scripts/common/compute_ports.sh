#!/usr/bin/env bash
# Calcule DEV_API_PORT / DEV_VITE_PORT / DEV_DB_PORT à partir de APP_NO si non fournis

APP_NO="${APP_NO:-1}"

# API : 8000 + 2*N  (N=1 => 8002)
: "${DEV_API_PORT:=$((8000 + 2*APP_NO))}"

# Vite : 5172 + 2*N (N=1 => 5174)
: "${DEV_VITE_PORT:=$((5172 + 2*APP_NO))}"

# DB : 5432 + N (N=1 => 5433)
: "${DEV_DB_PORT:=$((5432 + APP_NO))}"

export DEV_API_PORT DEV_VITE_PORT DEV_DB_PORT
