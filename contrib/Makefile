# Makefile pour contrib (autofill POC)
HOST_BIN=/usr/local/bin/monmdp-host
NATIVE_MANIFEST=~/.mozilla/native-messaging-hosts/com.monapp.nativehost.json
REPO_ROOT=\$(CURDIR)

.PHONY: install-host install-manifest install uninstall test

install-host:
	sudo cp $(pwd)/contrib/native/monmdp-host.py \$(HOST_BIN)
	sudo chmod 755 \$(HOST_BIN)

install-manifest:
	mkdir -p ~/.mozilla/native-messaging-hosts
	cp $(pwd)/contrib/native/com.monapp.nativehost.json \$(NATIVE_MANIFEST)

install: install-host install-manifest
	@echo "Host installé. Charge l'extension temporaire depuis about:debugging."

uninstall:
	-sudo rm -f \$(HOST_BIN)
	-rm -f \$(NATIVE_MANIFEST)
	@echo "Host et manifeste supprimés (si existants)."

test:
	@echo "Serveur test: cd contrib/test && python3 -m http.server 8000"
