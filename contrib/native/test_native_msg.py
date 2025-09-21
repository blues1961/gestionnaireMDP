#!/usr/bin/env python3
import subprocess, struct, json, sys, shutil, os

HOST = "/usr/local/bin/monmdp-host"

if not os.path.exists(HOST):
    print("Host introuvable:", HOST, file=sys.stderr)
    sys.exit(2)

# message à envoyer; leave origin empty to request all logins
msg = {"action": "getLogins", "origin": ""}

# start host as subprocess and communicate via stdin/stdout
proc = subprocess.Popen([HOST], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

# frame message (4-byte little-endian length + utf8 json)
payload = json.dumps(msg, ensure_ascii=False).encode("utf-8")
proc.stdin.write(struct.pack('<I', len(payload)))
proc.stdin.write(payload)
proc.stdin.flush()

# read response length
raw_len = proc.stdout.read(4)
if not raw_len:
    stderr = proc.stderr.read().decode('utf-8', errors='ignore')
    print("Aucune réponse du host. stderr:\n", stderr)
    proc.kill()
    sys.exit(3)
resp_len = struct.unpack('<I', raw_len)[0]
resp = proc.stdout.read(resp_len).decode('utf-8', errors='ignore')

# try pretty print
try:
    j = json.loads(resp)
    print(json.dumps(j, indent=2, ensure_ascii=False))
except Exception:
    print("Réponse brute:", resp)

# cleanup
proc.stdin.close()
proc.stdout.close()
proc.stderr.close()
proc.terminate()
