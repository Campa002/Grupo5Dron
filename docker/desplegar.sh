#!/usr/bin/env bash
# Sube y prende Grupo 5 en el servidor con Docker — Grupo 5: Control de Sistemas y Dron
#
# Uso (desde la carpeta del proyecto, con acceso por SSH al servidor):
#   bash docker/desplegar.sh usuario@servidor dominio
#   ejemplo: bash docker/desplegar.sh ubuntu@1.2.3.4 grupo5.1-2-3-4.sslip.io
#
# Sirve para instalar y para actualizar. No guarda ni manda ninguna clave: las crea el servidor
# la primera vez y quedan solo allá (server/grupo5/.env y CLAVES-INICIALES.txt).
set -euo pipefail

DESTINO="${1:?Falta usuario@servidor}"
DOMINIO="${2:?Falta el dominio (sin https://)}"
CARPETA="server/grupo5"

cd "$(dirname "$0")/.."
python scripts/armar-paquete-servidor.py

ssh "$DESTINO" "mkdir -p $CARPETA"
scp -q dist/paquete-servidor.zip dist/base-de-datos.sql \
    docker/Dockerfile docker/docker-compose.yml docker/config.docker.php docker/instalar-en-servidor.sh \
    "$DESTINO:$CARPETA/"
ssh "$DESTINO" "cd $CARPETA && bash instalar-en-servidor.sh '$DOMINIO'"
