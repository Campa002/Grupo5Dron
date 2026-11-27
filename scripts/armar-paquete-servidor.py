#!/usr/bin/env python3
"""
Arma el paquete para subir al servidor — Grupo 5: Control de Sistemas y Dron

Uso (desde cualquier carpeta):
    python scripts/armar-paquete-servidor.py

Deja en dist/ (ignorada por git):
    dist/paquete-servidor/      la carpeta tal cual queda en el servidor
    dist/paquete-servidor.zip   lo mismo, comprimido, para subir y descomprimir en el hosting
    dist/base-de-datos.sql      la base para importar en phpMyAdmin (NO se sube a la carpeta web)

Estructura del paquete (rutas relativas: sirve en la raíz del dominio o en una subcarpeta):
    index.php    portada
    aula/        web del aula          dron/      web del dron (simulador)
    api/         API PHP               includes/  config/   internas (cerradas con .htaccess)
    apk/         grupo5-aula.apk y grupo5-dron.apk, si están en la carpeta apk/ del repo

No entran: tests, docs, firmware, carcasa, scripts ni secretos (config.php se crea en el servidor).
"""
import os
import shutil
import sys
import zipfile

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DIST = os.path.join(RAIZ, 'dist')
PAQUETE = os.path.join(DIST, 'paquete-servidor')

# destino en el servidor -> carpeta del repo
CARPETAS = {
    '': os.path.join('backend', 'public-portada'),
    'dron': os.path.join('backend', 'public'),
    'aula': os.path.join('backend', 'public-aula'),
    'api': os.path.join('backend', 'api'),
    'includes': os.path.join('backend', 'includes'),
    'config': os.path.join('backend', 'config'),
}
APKS = ['grupo5-aula.apk', 'grupo5-dron.apk']
# Nunca van al servidor: la configuración real se crea allá, a mano
PROHIBIDOS = {'config.php', 'config.h'}
EXTENSIONES_PROHIBIDAS = ('.keystore', '.jks', '.b64', '.log', '.sql', '.md')


def copiar(origen, destino):
    for carpeta, _, archivos in os.walk(origen):
        rel = os.path.relpath(carpeta, origen)
        os.makedirs(os.path.join(destino, rel), exist_ok=True)
        for nombre in archivos:
            if nombre in PROHIBIDOS or nombre.lower().endswith(EXTENSIONES_PROHIBIDAS):
                continue
            shutil.copy2(os.path.join(carpeta, nombre), os.path.join(destino, rel, nombre))


def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(PAQUETE)

    for destino, origen in CARPETAS.items():
        ruta = os.path.join(RAIZ, origen)
        if not os.path.isdir(ruta):
            sys.exit(f'ERROR: falta la carpeta {origen}')
        copiar(ruta, os.path.join(PAQUETE, destino))

    # Las carpetas internas tienen que quedar cerradas
    for interna in ('includes', 'config'):
        if not os.path.isfile(os.path.join(PAQUETE, interna, '.htaccess')):
            sys.exit(f'ERROR: {interna}/ quedó sin .htaccess (cualquiera podría leerla desde el navegador)')

    # APK: los que estén en apk/ (se bajan del CI; no van al repo)
    os.makedirs(os.path.join(PAQUETE, 'apk'))
    faltan = []
    for apk in APKS:
        origen = os.path.join(RAIZ, 'apk', apk)
        if os.path.isfile(origen):
            shutil.copy2(origen, os.path.join(PAQUETE, 'apk', apk))
        else:
            faltan.append(apk)

    shutil.copy2(os.path.join(RAIZ, 'backend', 'sql', 'schema.sql'), os.path.join(DIST, 'base-de-datos.sql'))

    # Control: ningún secreto ni archivo de más
    for carpeta, _, archivos in os.walk(PAQUETE):
        for nombre in archivos:
            if nombre in PROHIBIDOS or nombre.lower().endswith(EXTENSIONES_PROHIBIDAS):
                sys.exit(f'ERROR: {os.path.join(carpeta, nombre)} no puede ir al servidor')

    ruta_zip = os.path.join(DIST, 'paquete-servidor.zip')
    cantidad = 0
    with zipfile.ZipFile(ruta_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        for carpeta, _, archivos in os.walk(PAQUETE):
            for nombre in archivos:
                completa = os.path.join(carpeta, nombre)
                z.write(completa, os.path.relpath(completa, PAQUETE).replace(os.sep, '/'))
                cantidad += 1

    mb = os.path.getsize(ruta_zip) / 1048576
    print(f'Listo: dist/paquete-servidor.zip ({cantidad} archivos, {mb:.1f} MB) y dist/base-de-datos.sql')
    for apk in faltan:
        print(f'AVISO: falta apk/{apk}: la portada va a decir que ese APK todavía no está subido.')
    print('Pasos para subirlo: docs/despliegue-hosting.md')


if __name__ == '__main__':
    main()
