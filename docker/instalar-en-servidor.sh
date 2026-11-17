#!/usr/bin/env bash
# Corre EN el servidor (lo llama docker/desplegar.sh). Instala o actualiza Grupo 5 con Docker.
set -euo pipefail
DOMINIO="${1:?Falta el dominio}"
cd "$(dirname "$0")"

# 1. Claves al azar, solo la primera vez. Quedan en este servidor y en ningún otro lado.
if [ ! -f .env ]; then
    # El umask va entre paréntesis: solo .env queda privado (los archivos del sitio los tiene que leer Apache)
    (
        umask 077
        echo "DB_PASSWORD=$(openssl rand -hex 24)"
        echo "JWT_SECRETO=$(openssl rand -hex 32)"
        echo "ESP32_TOKEN=$(openssl rand -hex 32)"
        echo "URL_BASE=https://$DOMINIO"
        echo "CORS_ORIGENES=https://$DOMINIO,https://localhost"
    ) > .env
    chmod 600 .env
    echo "Se creó .env con claves nuevas."
fi

# 2. Archivos del sitio (se reemplaza el contenido sin cambiar la carpeta: el contenedor la tiene montada)
rm -rf sitio.nuevo && mkdir -p sitio.nuevo sitio
python3 -m zipfile -e paquete-servidor.zip sitio.nuevo
cp config.docker.php sitio.nuevo/config/config.php
chmod -R u=rwX,go=rX sitio.nuevo
rsync -a --delete sitio.nuevo/ sitio/
rm -rf sitio.nuevo

# 3. Prender (o actualizar) los contenedores
docker compose up -d --build

# 4. Primera vez: contraseñas al azar para las cuentas iniciales (la de fábrica, "password", es pública)
set -a; . ./.env; set +a
sql() { docker exec -i -e MYSQL_PWD="$DB_PASSWORD" grupo5-db mariadb -ugrupo5 grupo5dron_db -N "$@"; }
if [ ! -f CLAVES-INICIALES.txt ]; then
    echo "Esperando la base de datos..."
    for _ in $(seq 1 40); do sql -e "SELECT 1 FROM usuarios LIMIT 1" >/dev/null 2>&1 && break; sleep 3; done
    : > CLAVES-INICIALES.txt.tmp
    chmod 600 CLAVES-INICIALES.txt.tmp
    for email in $(sql -e "SELECT email FROM usuarios"); do
        clave="$(openssl rand -base64 9)"
        hash="$(docker exec -e CLAVE="$clave" grupo5-web php -r 'echo password_hash(getenv("CLAVE"), PASSWORD_BCRYPT);')"
        echo "UPDATE usuarios SET password_hash='$hash', debe_cambiar_password=1 WHERE email='$email';" | sql
        echo "$email  $clave" >> CLAVES-INICIALES.txt.tmp
    done
    [ -s CLAVES-INICIALES.txt.tmp ] || { echo "ERROR: no se encontraron las cuentas iniciales (¿se importó la base?)"; exit 1; }
    mv CLAVES-INICIALES.txt.tmp CLAVES-INICIALES.txt
    echo "Contraseñas iniciales nuevas guardadas en $(pwd)/CLAVES-INICIALES.txt (solo en el servidor)."
fi

# 5. Comprobar desde adentro
sleep 2
ver() { docker exec grupo5-web curl -s -o /dev/null -w '%{http_code}' -H 'X-Forwarded-Proto: https' "http://localhost$1"; }
echo "portada $(ver /) | aula $(ver /aula/) | dron $(ver /dron/) | api sin sesión $(ver '/api/esp32.php?action=estado') | config cerrada $(ver /config/config.php)"
echo "Listo. Falta (una sola vez) el dominio en el proxy: $DOMINIO -> grupo5-web, puerto 80, con certificado SSL."
