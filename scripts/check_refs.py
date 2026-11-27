#!/usr/bin/env python3
"""
Script de verificación de referencias de recursos — Grupo 5: Control de Sistemas y Dron
Revisa las dos apps: la del dron (backend/public) y la del aula (backend/public-aula). En cada una verifica que:
 1. Cada <script src> y <link href> local de index.php exista.
 2. Cada ruta de RECURSOS_ESTATICOS de sw.js exista (si la app tiene service worker).
 3. Cada página de las rutas de app.js (constantes RUTAS_...) exista en pages/ como .php.
 4. No quede ningún .html en pages/, y avisa si una página trae código PHP (en el APK se quita).
"""
import os
import re
import sys

# Asegurar codificación utf-8 para la consola de Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
APPS = {
    'dron': os.path.join(RAIZ, 'backend', 'public'),
    'aula': os.path.join(RAIZ, 'backend', 'public-aula'),
}

faltantes = []
verificados = 0


def verificar_archivo(base, app, ruta_rel, origen):
    """Las rutas pueden ser absolutas (/js/app.js, app del dron) o relativas (js/app.js, app del aula)."""
    global verificados
    verificados += 1
    limpia = ruta_rel.split('?')[0].lstrip('/') or 'index.php'
    ruta_disco = os.path.join(base, limpia)
    if not os.path.exists(ruta_disco):
        faltantes.append(f"[{app}: {origen}] Falta: {ruta_rel} (ruta calculada: {ruta_disco})")


def leer(ruta):
    with open(ruta, 'r', encoding='utf-8') as f:
        return f.read()


def revisar(app, base):
    # 1. index.php
    index = leer(os.path.join(base, 'index.php'))
    for s in re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', index):
        if not s.startswith(('http', '//')):
            verificar_archivo(base, app, s, 'index.php <script src>')
    for h in re.findall(r'<link[^>]+href=["\']([^"\']+)["\']', index):
        if not h.startswith(('http', '//', '#')):
            verificar_archivo(base, app, h, 'index.php <link href>')

    # 2. sw.js (solo la app del dron tiene service worker)
    sw_path = os.path.join(base, 'sw.js')
    if os.path.exists(sw_path):
        m = re.search(r'const\s+RECURSOS_ESTATICOS\s*=\s*\[(.*?)\];', leer(sw_path), re.DOTALL)
        if m:
            for r in re.findall(r'["\']([^"\']+)["\']', m.group(1)):
                verificar_archivo(base, app, r, 'sw.js RECURSOS_ESTATICOS')
        else:
            faltantes.append(f"[{app}] sw.js: no se encontró RECURSOS_ESTATICOS")

    # 3. Páginas de las rutas de app.js (constantes RUTAS_...; las que suman otras con "..." se resuelven solas)
    app_js = leer(os.path.join(base, 'js', 'app.js'))
    paginas = set()
    for lista in re.findall(r'const\s+RUTAS_\w+\s*=\s*\[(.*?)\];', app_js, re.S):
        paginas.update(re.findall(r'["\']([^"\']+)["\']', lista))
    if not paginas:
        # Sin esto, un cambio de nombre en app.js haría que no se revisen las páginas sin avisar
        faltantes.append(f"[{app}] app.js: no se encontraron las rutas (constantes RUTAS_...)")
    for p in sorted(paginas):
        verificar_archivo(base, app, f"pages/{p}.php", 'app.js rutas')

    # 4. Las páginas son .php pero no pueden depender de PHP (en el APK no hay PHP)
    dir_paginas = os.path.join(base, 'pages')
    for nombre in sorted(os.listdir(dir_paginas)):
        if nombre.lower().endswith('.html'):
            faltantes.append(f"[{app}] pages/{nombre} (las páginas tienen que ser .php)")
        elif nombre.endswith('.php') and re.search(r'<\?(php|=)', leer(os.path.join(dir_paginas, nombre))):
            print(f"[AVISO] {app}: pages/{nombre} tiene código PHP: en el APK se quita (las páginas no pueden depender de PHP).")


for nombre_app, carpeta in APPS.items():
    revisar(nombre_app, carpeta)

print("=== REVISION DE REFERENCIAS ESTATICAS (dron y aula) ===")
print(f"Total de referencias verificadas: {verificados}")
if faltantes:
    print(f"[X] SE ENCONTRARON {len(faltantes)} RECURSOS FALTANTES:")
    for f in faltantes:
        print("  - " + f)
    sys.exit(1)
print(f"[OK] TODAS las referencias ({verificados}) existen correctamente en backend/public y backend/public-aula.")
sys.exit(0)
