#!/usr/bin/env python3
import json, sys, base64, os
from pathlib import Path

KEYFILE = Path(os.path.expanduser("~/.config/gestionnaireMDP/vault-key.json"))

def ensure_cryptography():
    try:
        import cryptography
    except Exception:
        print("Le paquet 'cryptography' n'est pas installé. Installe avec : python3 -m pip install --user cryptography")
        sys.exit(3)

ensure_cryptography()
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

if not KEYFILE.exists():
    print(f"Fichier keybundle introuvable : {KEYFILE}")
    sys.exit(2)

try:
    jb = json.loads(KEYFILE.read_text(encoding='utf-8'))
except Exception as e:
    print("Impossible de lire/parse le JSON du keybundle :", e)
    sys.exit(4)

# Affiche métadonnées sûres
fmt = jb.get("format")
kdf = jb.get("kdf", {})
enc = jb.get("enc", {})
pub = jb.get("pub", "")
print("=== Keybundle metadata ===")
print("format:", fmt)
print("kdf:", kdf.get("name"), "| hash:", kdf.get("hash"), "| iterations:", kdf.get("iterations"))
print("enc:", enc.get("name"), "| iv present?:", "iv" in enc)
print("pub (truncated):", (pub[:80] + "...") if isinstance(pub, str) and len(pub)>80 else pub)
print("==========================\n")

# attempt decrypt private key (safe: we will NOT print the private key)
salt_b64 = kdf.get("salt")
iv_b64 = enc.get("iv")
data_b64 = jb.get("data")

if not (salt_b64 and iv_b64 and data_b64):
    print("Clés manquantes dans le bundle : 'salt'/'iv'/'data' nécessaires pour déchiffrer.")
    sys.exit(5)

try:
    salt = base64.b64decode(salt_b64)
    iv = base64.b64decode(iv_b64)
    ciphertext = base64.b64decode(data_b64)
except Exception as e:
    print("Erreur decoding base64 des champs salt/iv/data :", e)
    sys.exit(6)

# derive key from passphrase prompt (we will not echo)
import getpass
passwd = getpass.getpass("Saisis ta passphrase (ne sera pas affichée) : ")

# derive via PBKDF2 (assume SHA-256)
iterations = int(kdf.get("iterations", 200000))
kdfobj = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations)
try:
    key = kdfobj.derive(passwd.encode('utf-8'))
except Exception as e:
    print("Erreur lors de la dérivation de la clé :", e)
    sys.exit(7)

# decrypt AES-GCM
try:
    aes = AESGCM(key)
    plain = aes.decrypt(iv, ciphertext, None)
except Exception as e:
    print("Échec du décryptage AES-GCM : passphrase incorrecte ou paramètres incompatibles. (", e, ")")
    sys.exit(8)

# detect format of private key (safe diagnostics)
detected = "unknown"
try:
    s = plain.decode('utf-8', errors='ignore')
    if "-----BEGIN " in s and "PRIVATE KEY" in s:
        detected = "PEM private key (PEM text / RSA or EC)"
    else:
        # check ASN.1 DER header (0x30)
        if len(plain) > 0 and plain[0] == 0x30:
            detected = f"DER ASN.1 ({len(plain)} bytes) - likely RSA/EC private key in DER"
        else:
            detected = f"Raw key bytes ({len(plain)} bytes) - possibly curve25519/ed25519 raw private key"
except Exception:
    detected = f"Raw bytes ({len(plain)} bytes)"

print("\nDECRYPTION OK  — diagnostic non-sensible :")
print("  - private key format guess:", detected)
print("  - private key length (bytes):", len(plain))
print("  - public key (truncated):", (pub[:120] + "...") if isinstance(pub, str) and len(pub)>120 else pub)
print("\nSi le résultat indique 'PEM' ou 'DER', on utilisera la clé privée déchiffrée (format standard) pour unwrap 'key' dans les enregistrements.")
print("Si le résultat indique 'Raw key bytes 32', il s'agit probablement d'une clé symétrique/Curve-25519 et le déwrap suivra une autre procédure.\n")
