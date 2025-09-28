#!/usr/bin/env python3
import json, sys, base64, os, subprocess
from pathlib import Path

# Config — adaptée à ton arborescence / docker-compose
DB_SERVICE = "db"
DB_USER = "mdp_pg_user"
DB_NAME = "mdp_pg_db"
TABLE = "api_passwordentry"
RECORD_ID = 63 # id du record à tester (tel que fourni)

KEYBUNDLE_PATH = Path.home() / ".config" / "gestionnaireMDP" / "vault-key.json"
if not KEYBUNDLE_PATH.exists():
    print("Fichier keybundle introuvable:", KEYBUNDLE_PATH); sys.exit(2)

# ensure cryptography
try:
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.asymmetric import rsa, ec
    from cryptography.hazmat.backends import default_backend
except Exception:
    print("Le paquet 'cryptography' n'est pas installé. Installe avec : python3 -m pip install --user cryptography")
    sys.exit(3)

# 1) fetch ciphertext JSON for the record via docker compose psql
psql_cmd = (
    f"docker compose -f docker-compose.dev.yml exec -T {DB_SERVICE} "
    f"psql -U {DB_USER} -d {DB_NAME} -Atc \"SELECT ciphertext FROM {TABLE} WHERE id={RECORD_ID};\""
)
try:
    raw = subprocess.check_output(psql_cmd, shell=True, stderr=subprocess.STDOUT, text=True)
except subprocess.CalledProcessError as e:
    print("Erreur en interrogeant la base :", e.output or e); sys.exit(4)

raw = raw.strip()
if not raw:
    print("Aucun ciphertext récupéré pour id=", RECORD_ID); sys.exit(5)

# Attempt to parse as JSON (some DBs may return with extra quoting)
try:
    cjson = json.loads(raw)
except Exception:
    # try to unescape if needed
    try:
        cjson = json.loads(raw.replace("''","'"))
    except Exception as e:
        print("Impossible de parser le ciphertext JSON récupéré :", e)
        print("Contenu brut:", raw[:400])
        sys.exit(6)

print("Ciphertext JSON keys:", list(cjson.keys()))

# Expecting fields like: iv, key, data, salt
iv_b64 = cjson.get("iv")
key_b64 = cjson.get("key")
data_b64 = cjson.get("data")
salt_b64 = cjson.get("salt")  # maybe unused for record unwrap

if not (iv_b64 and key_b64 and data_b64):
    print("Le ciphertext ne contient pas les champs iv/key/data attendus. Champs présents:", list(cjson.keys()))
    sys.exit(7)

# 2) load and decrypt keybundle (ask passphrase)
kb = json.loads(KEYBUNDLE_PATH.read_text(encoding='utf-8'))
salt_bundle = kb.get("kdf",{}).get("salt")
iv_bundle = kb.get("enc",{}).get("iv")
data_bundle = kb.get("data")
if not (salt_bundle and iv_bundle and data_bundle):
    print("Keybundle incomplet (salt/iv/data manquants)."); sys.exit(8)

import getpass
passwd = getpass.getpass("Saisis ta passphrase pour déverrouiller le keybundle : ")

# derive key from passphrase (PBKDF2 SHA-256)
iterations = int(kb.get("kdf",{}).get("iterations", 200000))
salt = base64.b64decode(salt_bundle)
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations, backend=default_backend())
try:
    passkey = kdf.derive(passwd.encode('utf-8'))
except Exception as e:
    print("Échec dérivation clé (passphrase incorrecte ?):", e); sys.exit(9)

# decrypt keybundle data with AES-GCM
try:
    aes = AESGCM(passkey)
    iv_b = base64.b64decode(iv_bundle)
    ct_b = base64.b64decode(data_bundle)
    plain_bundle = aes.decrypt(iv_b, ct_b, None)
except Exception as e:
    print("Échec décryptage du keybundle (AES-GCM) — passphrase invalide ou paramètres incompatibles:", e); sys.exit(10)

# detect private key type and load it
priv_bytes = plain_bundle
from cryptography.hazmat.primitives import serialization
priv_key = None
try:
    # try DER first
    priv_key = serialization.load_der_private_key(priv_bytes, password=None, backend=default_backend())
    key_type = type(priv_key).__name__
except Exception as e:
    # try PEM decode fallback
    try:
        priv_text = priv_bytes.decode('utf-8', errors='ignore')
        if "-----BEGIN" in priv_text:
            priv_key = serialization.load_pem_private_key(priv_bytes, password=None, backend=default_backend())
            key_type = type(priv_key).__name__
        else:
            key_type = "raw_bytes"
    except Exception:
        key_type = "raw_bytes"

print("Private key loaded type:", key_type)

# 3) attempt unwrap: try RSA OAEP SHA-256 then PKCS1v15
enc_key_bytes = base64.b64decode(key_b64)
sym_key = None
from cryptography.hazmat.primitives.asymmetric import padding as asympadding
from cryptography.hazmat.primitives import hashes as asymhashes

if key_type.startswith("RSAPrivateKey") or key_type.startswith("RSAPrivateKeyImpl") or "RSA" in key_type:
    try:
        sym_key = priv_key.decrypt(
            enc_key_bytes,
            asympadding.OAEP(mgf=asympadding.MGF1(algorithm=asymhashes.SHA256()), algorithm=asymhashes.SHA256(), label=None)
        )
        print("Unwrap OK with RSA-OAEP-SHA256.")
    except Exception as e_oaep:
        print("RSA OAEP failed:", e_oaep)
        try:
            sym_key = priv_key.decrypt(enc_key_bytes, asympadding.PKCS1v15())
            print("Unwrap OK with RSA PKCS1v15.")
        except Exception as e_pkcs:
            print("RSA PKCS1v15 failed:", e_pkcs)
else:
    print("Private key is not RSA; key_type:", key_type)
    # If EC / other, we may need another unwrap method; we try no unwrap

if sym_key is None:
    print("Impossible d'obtenir la clé symétrique en unwrap. Nous pouvons tenter d'autres méthodes si tu me le demandes.")
    sys.exit(11)

# 4) decrypt data with AES-GCM using sym_key and iv
try:
    aes2 = AESGCM(sym_key)
    iv_rec = base64.b64decode(iv_b64)
    data_ct = base64.b64decode(data_b64)
    pt = aes2.decrypt(iv_rec, data_ct, None)
    print("\nDECRYPT RECORD OK — plaintext (raw):\n")
    try:
        txt = pt.decode('utf-8')
        print(txt)
    except Exception:
        print(pt)
except Exception as e:
    print("Échec décryptage AES-GCM avec la clé unwrapée:", e)
    sys.exit(12)

