#!/usr/bin/env python3
# monmdp-host.py - Native messaging host with docker-compose path detection
import sys, json, struct, os, base64, traceback, time, subprocess, re, getpass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import constant_time
from cryptography.hazmat.backends import default_backend
import secrets

STORE_PATH = Path(__file__).resolve().parent / "store.json"
_session_key_path = Path.home() / ".local" / "share" / "monmdp" / "session_privkey.b64"

# In-memory master key (None if locked) - not used for wrap; we use session key file
_master_key: Optional[bytes] = None
_unlocked_at = None
UNLOCK_TIMEOUT = 60 * 30

KDF_ITERATIONS = 300_000
KDF_SALT_LEN = 16
AES_KEY_LEN = 32

def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        return None
    msg_len = struct.unpack('<I', raw_len)[0]
    data = sys.stdin.buffer.read(msg_len)
    return json.loads(data.decode('utf-8'))

def send_message(obj):
    encoded = json.dumps(obj).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def load_store():
    if not STORE_PATH.exists():
        return []
    with STORE_PATH.open("r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return []

# NEW: try to find docker-compose.dev.yml in likely locations and return absolute path or None
def find_docker_compose_file():
    candidates = []
    # 1) relative to current working dir
    candidates.append(Path("docker-compose.dev.yml"))
    # 2) relative to script location parent hierarchy (if contrib/native is inside the repo)
    try:
        repo_root_guess = Path(__file__).resolve().parents[2]  # ../../../contrib/native -> repo root
        candidates.append(repo_root_guess / "docker-compose.dev.yml")
    except Exception:
        pass
    # 3) user's home default path used in this session
    candidates.append(Path.home() / "projets" / "gestionnaireMDP" / "docker-compose.dev.yml")
    # 4) explicit env override
    envp = os.environ.get("MONMDP_DOCKER_COMPOSE")
    if envp:
        candidates.insert(0, Path(envp))
    for p in candidates:
        try:
            if p and p.exists():
                return str(p)
        except Exception:
            continue
    return None

# fetch ciphertext rows; use absolute compose file when possible
def fetch_all_ciphertexts():
    compose_file = find_docker_compose_file()
    if not compose_file:
        print("DB query skipped: docker-compose.dev.yml not found in known locations", file=sys.stderr)
        return []
    # Build command using the absolute compose file path
    cmd = (
        f"docker compose -f {compose_file} exec -T db "
        f'psql -U mdp_pg_user -d mdp_pg_db -Atc "SELECT id, title, url, created_at, ciphertext FROM api_passwordentry;"'
    )
    try:
        out = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT, text=True)
    except subprocess.CalledProcessError as e:
        print("DB query failed (cmd):", cmd, file=sys.stderr)
        print("DB output:", e.output, file=sys.stderr)
        return []
    rows = []
    for line in out.splitlines():
        if not line.strip():
            continue
        parts = line.split("|", 4)
        if len(parts) != 5:
            continue
        id_s, title, url, created_at, ctext = parts
        try:
            cjson = json.loads(ctext)
        except Exception:
            try:
                cjson = json.loads(ctext.replace("''", "'"))
            except Exception:
                cjson = None
        rows.append({
            "id": int(id_s),
            "title": title,
            "url": url,
            "created_at": created_at,
            "ciphertext": cjson
        })
    return rows

def load_session_privkey():
    """
    Source de vérité (dans l'ordre) :
    1) MONMDP_KEY_PATH (par défaut: ~/.config/gestionnaireMDP/vault-key.json)
       - si .json : chercher des champs clé (b64 ou PEM)
       - sinon : traiter le fichier comme PEM ou Base64 direct
    2) Fallback legacy: ~/.local/share/monmdp/session_privkey.b64 (Base64)
    Retourne des bytes (DER ou PEM), ou None si introuvable.
    """
    try:
        from pathlib import Path
        import os, json, base64
    except Exception:
        return None

    # 1) Chemin priorité: env ou défaut JSON
    key_path = os.environ.get(
        "MONMDP_KEY_PATH",
        str(Path.home() / ".config" / "gestionnaireMDP" / "vault-key.json")
    )
    p = Path(os.path.expanduser(key_path))

    def _maybe_decode(s: str):
        s = (s or "").strip()
        if not s:
            return None
        if s.startswith("-----BEGIN"):
            # PEM en clair
            return s.encode("utf-8")
        # sinon tenter Base64 -> bytes (DER)
        try:
            return base64.b64decode(s)
        except Exception:
            return None

    # 1a) Si le fichier spécifié existe
    if p.exists():
        if p.suffix.lower() == ".json":
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                data = None
            if isinstance(data, dict):
                # Priorité des champs (surchargeable via env)
                field_list = os.environ.get(
                    "MONMDP_KEY_JSON_FIELD",
                    "private_key_b64,private_key,session_privkey_b64,session_privkey,key_b64,key"
                )
                for field in [f.strip() for f in field_list.split(",") if f.strip()]:
                    v = data.get(field)
                    if not v:
                        continue
                    b = _maybe_decode(str(v))
                    if b:
                        return b
        else:
            # Fichier non-JSON → PEM ou Base64 direct
            try:
                s = p.read_text(encoding="utf-8")
            except Exception:
                s = None
            b = _maybe_decode(s or "")
            if b:
                return b

    # 2) Fallback legacy (~/.local/share/monmdp/session_privkey.b64)
    legacy = Path.home() / ".local" / "share" / "monmdp" / "session_privkey.b64"
    if legacy.exists():
        try:
            s = legacy.read_text(encoding="utf-8").strip()
            b = _maybe_decode(s)
            if b:
                return b
        except Exception:
            pass

    return None


# attempt unwrap and decrypt one record given private key bytes
def decrypt_record_with_privkey(priv_bytes, record):
    try:
        from cryptography.hazmat.primitives import serialization, hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.backends import default_backend
    except Exception as e:
        print("cryptography import failed:", e, file=sys.stderr)
        return None
    # load private key (DER or PEM)
    try:
        priv_key = serialization.load_der_private_key(priv_bytes, password=None, backend=default_backend())
    except Exception:
        try:
            priv_key = serialization.load_pem_private_key(priv_bytes, password=None, backend=default_backend())
        except Exception:
            return None
    cjson = record.get("ciphertext") or {}
    iv_b64 = cjson.get("iv")
    key_b64 = cjson.get("key")
    data_b64 = cjson.get("data")
    if not (iv_b64 and key_b64 and data_b64):
        return None
    try:
        enc_key = base64.b64decode(key_b64)
        # RSA OAEP SHA-256 unwrap
        try:
            sym_key = priv_key.decrypt(enc_key, padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
        except Exception:
            try:
                sym_key = priv_key.decrypt(enc_key, padding.PKCS1v15())
            except Exception:
                return None
        iv = base64.b64decode(iv_b64)
        ct = base64.b64decode(data_b64)
        aes = AESGCM(sym_key)
        pt = aes.decrypt(iv, ct, None)
        try:
            pdata = json.loads(pt.decode('utf-8'))
        except Exception:
            pdata = {"_raw": pt}
        return pdata
    except Exception:
        return None

def normalize_origin_from_url(url_value):
    if not url_value or not isinstance(url_value, str):
        return None
    candidate = url_value.strip()
    if not candidate:
        return None
    if '://' not in candidate:
        candidate = f"https://{candidate}"
    try:
        parsed = urlparse(candidate)
    except Exception:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _hostname_from_url(url_value):
    if not url_value or not isinstance(url_value, str):
        return None
    candidate = url_value.strip()
    if not candidate:
        return None
    if '://' not in candidate:
        candidate = f"https://{candidate}"
    try:
        parsed = urlparse(candidate)
    except Exception:
        return None
    host = parsed.hostname or parsed.netloc
    if not host:
        return None
    return host.lower()


COMMON_SECOND_LEVEL_TLDS = {
    "co.uk", "org.uk", "gov.uk", "ac.uk",
    "co.jp", "ne.jp", "or.jp", "go.jp",
    "com.au", "net.au", "org.au", "edu.au",
    "com.br", "com.ar", "com.mx", "com.cn",
    "com.hk", "com.sg", "com.tr", "com.sa",
    "com.pl", "com.ru", "com.za", "co.za",
}


GENERIC_TOKEN_PARTS = {
    "www", "web", "login", "logins", "signin", "sign", "auth", "secure", "sso",
    "account", "accounts", "client", "clients", "customer", "customers",
    "portal", "portail", "portals", "portails", "service", "services",
    "app", "apps", "prod", "stage", "staging", "test", "uat", "dev", "beta",
    "mobile", "online", "secure2", "connect", "connexion", "identity",
    "default", "home", "my", "mon", "the", "id", "ids",
    "fr", "en", "ca", "us", "qc", "uk", "br", "mx", "cn",
    "com", "net", "org", "gov", "edu", "info", "biz", "io",
    "bank", "banks", "banque", "banques", "compte", "comptes",
    "group", "groupe", "cloud", "api", "apis", "static", "cdn"
}


GENERIC_TOKEN_PREFIXES = {
    "secure", "login", "signin", "auth", "sso", "www", "portal", "portail",
    "service", "services", "client", "customer", "app", "apps", "prod", "stage",
    "staging", "test", "uat", "beta", "dev", "mobile", "my", "mon", "the",
    "api", "cdn"
}


GENERIC_TOKEN_SUFFIXES = {
    "secure", "login", "signin", "auth", "sso", "portal", "portail", "service",
    "services", "client", "clients", "customer", "customers", "app", "apps",
    "prod", "stage", "staging", "test", "uat", "beta", "dev", "mobile",
    "online", "connect", "connexion", "account", "accounts", "compte", "comptes",
    "bank", "banks", "banque", "banques", "group", "groupe"
}


def _registrable_domain(hostname):
    if not hostname:
        return None
    host = hostname.split(':', 1)[0]
    if not host:
        return None
    labels = host.split('.')
    if len(labels) < 2:
        return host
    last_two = '.'.join(labels[-2:])
    if last_two in COMMON_SECOND_LEVEL_TLDS and len(labels) >= 3:
        return '.'.join(labels[-3:])
    return last_two


def _origin_tokens(origin):
    host = _hostname_from_url(origin)
    if not host:
        return []
    collected = set()

    def _expand_token(raw):
        out = set()
        if not raw or not isinstance(raw, str):
            return out
        cleaned = raw.lower().strip().strip('-_.')
        if not cleaned:
            return out
        cleaned = re.sub(r"[^a-z0-9]", "", cleaned)
        if not cleaned or cleaned.isdigit() or len(cleaned) < 3:
            return out

        segments = re.findall(r"[a-z0-9]+", cleaned)
        for seg in segments:
            if seg.isdigit() or len(seg) < 3:
                continue
            out.add(seg)

        def _strip_generic(value):
            if not value:
                return value
            changed = True
            result = value
            while changed and result:
                changed = False
                for prefix in GENERIC_TOKEN_PREFIXES:
                    if result.startswith(prefix) and len(result) - len(prefix) >= 3:
                        result = result[len(prefix):]
                        changed = True
                for suffix in GENERIC_TOKEN_SUFFIXES:
                    if result.endswith(suffix) and len(result) - len(suffix) >= 3:
                        result = result[:-len(suffix)]
                        changed = True
            return result

        stripped = _strip_generic(cleaned)
        if stripped and len(stripped) >= 3:
            out.add(stripped)

        final = set()
        for candidate in out:
            if not candidate or len(candidate) < 3:
                continue
            if candidate.isdigit():
                continue
            if candidate in GENERIC_TOKEN_PARTS:
                continue
            final.add(candidate)
        return final

    for part in re.split(r"[.\-_/]+", host):
        for token in _expand_token(part):
            collected.add(token)

    return sorted(collected)


def native_loop():
    priv_bytes = load_session_privkey()
    if priv_bytes is None:
        msg = read_message()
        if not msg:
            return
        send_message({"status":"locked", "reason":"session_not_unlocked"})
        return
    # ready to serve requests
    while True:
        msg = read_message()
        if msg is None:
            break
        action = msg.get("action")
        if action == "getLogins":
            origin = msg.get("origin", "")
            rows = fetch_all_ciphertexts()
            results = []
            for rec in rows:
                dec = decrypt_record_with_privkey(priv_bytes, rec)
                if dec is None:
                    continue
                username = dec.get("login") or dec.get("username") or dec.get("user")
                password = dec.get("password") or dec.get("pass") or dec.get("secret")
                url_field = (
                    dec.get("url") or dec.get("website") or dec.get("site") or dec.get("uri")
                    or rec.get("url")
                )
                entry_origin = normalize_origin_from_url(url_field)
                origin_host = _hostname_from_url(origin)
                entry_host = _hostname_from_url(entry_origin or url_field)
                origin_domain = _registrable_domain(origin_host)
                entry_domain = _registrable_domain(entry_host)
                origin_tokens = _origin_tokens(origin)

                same_origin = False
                same_host = False
                host_overlap = False
                same_domain = False
                token_match = False

                score = 0
                if origin:
                    sorigin = origin.lower()
                    if entry_origin:
                        if entry_origin == sorigin:
                            score += 50
                            same_origin = True
                        elif entry_origin in sorigin or sorigin in entry_origin:
                            score += 15
                    if origin_host and entry_host:
                        if origin_host == entry_host:
                            score += 40
                            same_host = True
                        elif origin_host.endswith(f".{entry_host}") or entry_host.endswith(f".{origin_host}"):
                            score += 20
                            host_overlap = True
                    if origin_domain and entry_domain and origin_domain == entry_domain:
                        score += 35
                        same_domain = True
                    if origin_tokens:
                        seen_tokens = set()
                        candidate_strings = []
                        title = rec.get("title")
                        if isinstance(title, str):
                            candidate_strings.append(title.lower())
                        if isinstance(url_field, str):
                            candidate_strings.append(url_field.lower())
                        alt_url = rec.get("url")
                        if isinstance(alt_url, str):
                            candidate_strings.append(alt_url.lower())
                        for v in dec.values():
                            if isinstance(v, str):
                                candidate_strings.append(v.lower())
                        for token in origin_tokens:
                            if token in seen_tokens:
                                continue
                            token_hit = False
                            if entry_host and token in entry_host:
                                token_hit = True
                            elif entry_domain and token in entry_domain:
                                token_hit = True
                            else:
                                for cand in candidate_strings:
                                    if token in cand:
                                        token_hit = True
                                        break
                            if token_hit:
                                seen_tokens.add(token)
                                score += 8
                                token_match = True
                    for v in dec.values():
                        try:
                            if isinstance(v, str) and sorigin in v.lower():
                                score += 2
                        except Exception:
                            pass
                if username and isinstance(username, str):
                    uname = username.strip().lower()
                    if uname in {"user", "username", "utilisateur", "default", "admin"}:
                        score -= 5

                results.append((score, {
                    "id": rec.get("id"),
                    "title": rec.get("title"),
                    "username": username,
                    "password": password,
                    "created_at": rec.get("created_at"),
                    "url": url_field,
                    "origin": entry_origin,
                    "score": score,
                    "match_flags": {
                        "same_origin": same_origin,
                        "same_host": same_host,
                        "host_overlap": host_overlap,
                        "same_domain": same_domain,
                        "token_match": token_match
                    }
                }))
            results_sorted = [r for s,r in sorted(results, key=lambda x: x[0], reverse=True)]
            if origin:
                prioritized = None
                for key in ("same_origin", "same_host", "same_domain", "token_match", "host_overlap"):
                    subset = [r for r in results_sorted if r.get("match_flags", {}).get(key)]
                    if subset:
                        prioritized = subset
                        break
                if prioritized is not None:
                    results_sorted = prioritized
            for r in results_sorted:
                r.pop("match_flags", None)
            send_message({"status":"ok", "logins": results_sorted})
        else:
            send_message({"status":"error","reason":"unknown action"})
    return

# CLI unlock (unchanged, minimal)
def cli_unlock():
    try:
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except Exception:
        print("Missing 'cryptography' module. Install: python3 -m pip install --user cryptography", file=sys.stderr)
        return 3
    KEYBUNDLE = Path.home() / ".config" / "gestionnaireMDP" / "vault-key.json"
    if not KEYBUNDLE.exists():
        print("Keybundle not found:", KEYBUNDLE, file=sys.stderr)
        return 2
    jb = json.loads(KEYBUNDLE.read_text(encoding='utf-8'))
    kdf = jb.get("kdf", {})
    enc = jb.get("enc", {})
    salt_b64 = kdf.get("salt")
    iv_b64 = enc.get("iv")
    data_b64 = jb.get("data")
    iterations = int(kdf.get("iterations", 200000))
    if not (salt_b64 and iv_b64 and data_b64):
        print("Keybundle missing required fields (salt/iv/data).", file=sys.stderr)
        return 3
    passwd = getpass.getpass("Saisis ta passphrase pour déverrouiller le keybundle : ")
    salt = base64.b64decode(salt_b64)
    iv = base64.b64decode(iv_b64)
    ct = base64.b64decode(data_b64)
    PBKDF2HMAC_local = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations, backend=default_backend())
    try:
        key = PBKDF2HMAC_local.derive(passwd.encode('utf-8'))
    except Exception as e:
        print("Derivation failed:", e, file=sys.stderr); return 4
    AESGCM_local = AESGCM(key)
    try:
        priv = AESGCM_local.decrypt(iv, ct, None)
    except Exception as e:
        print("Decrypt keybundle failed (bad passphrase or incompatible params):", e, file=sys.stderr); return 5
    SESSION_DIR = Path.home() / ".local" / "share" / "monmdp"
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    SESSION_FILE = SESSION_DIR / "session_privkey.b64"
    SESSION_FILE.write_text(base64.b64encode(priv).decode('ascii'), encoding='utf-8')
    os.chmod(SESSION_FILE, 0o600)
    print("Unlocked and stored session key at", SESSION_FILE, file=sys.stderr)
    return 0

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--unlock":
        return cli_unlock()
    try:
        native_loop()
    except Exception as e:
        tb = traceback.format_exc()
        print("Host exception: " + str(e) + "\n" + tb, file=sys.stderr)
        try:
            send_message({"status":"error","reason":str(e)})
        except:
            pass

if __name__ == '__main__':
    main()
