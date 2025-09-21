#!/usr/bin/env python3
# monmdp-host.py  -- POC native messaging host
import sys, json, struct, os, traceback

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

def main():
    # Exemple : on peut initialiser ici la connexion à la DB chiffrée
    try:
        while True:
            msg = read_message()
            if msg is None:
                break
            # Debug : log dans stderr (visible via journal ou processus parent)
            print("DEBUG host received:", msg, file=sys.stderr)
            action = msg.get('action')
            if action == 'getLogins':
                origin = msg.get('origin')
                # >>> ICI : faire lookup sécurisé dans ta DB chiffrée
                # POC : renvoie un login factice si origin contient "example"
                # Remplace par ta logique (vérifier origine, policy, déverrouillage, etc.)
                # Exemple de réponse :
                resp = {
                    "status": "ok",
                    "logins": [
                        {"username": "sylvain", "password": "motdepasse_exemple"}
                    ]
                }
                send_message(resp)
            else:
                send_message({"status": "error", "reason": "unknown action"})
    except Exception as e:
        tb = traceback.format_exc()
        print("Host exception: " + str(e) + "\n" + tb, file=sys.stderr)
        try:
            send_message({"status":"error","reason":str(e)})
        except:
            pass

if __name__ == '__main__':
    main()
