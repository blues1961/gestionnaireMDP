# MonMDP — Autofill (quick install & ops)

## But
Petit guide pour installer, déverrouiller, tester et verrouiller le host natif used by the Firefox extension.

## Installer le host (déjà fait dans ce repo)
Le host a été installé sous `/usr/local/bin/monmdp-host`. Si besoin :
```bash
# depuis la racine du repo (si tu dois réinstaller le host)
sudo cp contrib/native/monmdp-host.py /usr/local/bin/monmdp-host
sudo chmod 755 /usr/local/bin/monmdp-host

