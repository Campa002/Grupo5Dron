#!/usr/bin/env python3
"""
Script de verificación de referencias de recursos — Grupo 5: Control de Sistemas y Dron
Verifica que:
 1. Cada <script src> y <link href> local en index.php exista en backend/public.
 2. Cada ruta en RECURSOS_ESTATICOS de sw.js exista en backend/public.
 3. Cada vista/página referenciada en app.js exista en backend/public/pages/ (como .php).
 4. No quede ningún .html en pages/ y avisa si una página trae código PHP (en el APK se quita).
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

BASE_PUB = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend', 'public'))

faltantes = []
verificados = 0

def verificar_archivo(ruta_rel, origen):
    global verificados
    verificados += 1
    # Limpiar barra inicial
    limpia = ruta_rel.lstrip('/')
    if not limpia:
        # Ruta raiz '/' -> index.php
        limpia = 'index.php'
    
    # Remover query strings si tuviera (ej: ?v=123)
    limpia = limpia.split('?')[0]
    
    ruta_disco = os.path.join(BASE_PUB, limpia)
    if not os.path.exists(ruta_disco):
        faltantes.append(f"[{origen}] Falta: {ruta_rel} (ruta calculada: {ruta_disco})")
        return False
    return True

# 1. Verificar index.php
index_path = os.path.join(BASE_PUB, 'index.php')
with open(index_path, 'r', encoding='utf-8') as f:
    index_content = f.read()

# Scripts y links
srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', index_content)
hrefs = re.findall(r'<link[^>]+href=["\']([^"\']+)["\']', index_content)

for s in srcs:
    if not s.startswith('http') and not s.startswith('//'):
        verificar_archivo(s, 'index.php <script src>')

for h in hrefs:
    if not h.startswith('http') and not h.startswith('//') and not h.startswith('#'):
        verificar_archivo(h, 'index.php <link href>')

# 2. Verificar sw.js
sw_path = os.path.join(BASE_PUB, 'sw.js')
with open(sw_path, 'r', encoding='utf-8') as f:
    sw_content = f.read()

m_recursos = re.search(r'const\s+RECURSOS_ESTATICOS\s*=\s*\[(.*?)\];', sw_content, re.DOTALL)
if m_recursos:
    rutas_sw = re.findall(r'["\']([^"\']+)["\']', m_recursos.group(1))
    for r in rutas_sw:
        verificar_archivo(r, 'sw.js RECURSOS_ESTATICOS')

# 3. Verificar páginas en app.js
app_path = os.path.join(BASE_PUB, 'js', 'app.js')
with open(app_path, 'r', encoding='utf-8') as f:
    app_content = f.read()

# Las rutas están en RUTAS_DRON, RUTAS_SIN_CUENTA y RUTAS_VALIDAS (las dos últimas suman las anteriores con "...")
paginas = set()
for nombre in ('RUTAS_DRON', 'RUTAS_SIN_CUENTA', 'RUTAS_VALIDAS'):
    m_rutas = re.search(r'const\s+' + nombre + r'\s*=\s*\[(.*?)\];', app_content, re.S)
    if m_rutas:
        paginas.update(re.findall(r'["\']([^"\']+)["\']', m_rutas.group(1)))
if not paginas:
    # Sin esto, un cambio de nombre en app.js haría que no se revisen las páginas sin avisar
    faltantes.append("app.js: no se encontraron las rutas (RUTAS_DRON / RUTAS_SIN_CUENTA / RUTAS_VALIDAS)")
for p in sorted(paginas):
    verificar_archivo(f"/pages/{p}.php", 'app.js rutas')

# 4. Las páginas son .php pero no pueden depender de PHP (en el APK no hay PHP).
#    No tiene que quedar ningún .html en pages/, y si una página trae bloques PHP se avisa:
#    build-apk.js los quita al generar www/, así que en el APK no van a estar.
dir_paginas = os.path.join(BASE_PUB, 'pages')
for nombre in sorted(os.listdir(dir_paginas)):
    ruta = os.path.join(dir_paginas, nombre)
    if nombre.lower().endswith('.html'):
        faltantes.append(f"pages/{nombre} (las páginas tienen que ser .php)")
    elif nombre.endswith('.php'):
        with open(ruta, 'r', encoding='utf-8') as f:
            if re.search(r'<\?(php|=)', f.read()):
                print(f"[AVISO] pages/{nombre} tiene código PHP: en el APK se quita (las páginas no pueden depender de PHP).")

print(f"=== REVISION DE REFERENCIAS ESTATICAS ===")
print(f"Total de referencias verificadas: {verificados}")
if faltantes:
    print(f"[X] SE ENCONTRARON {len(faltantes)} RECURSOS FALTANTES:")
    for f in faltantes:
        print("  - " + f)
    sys.exit(1)
else:
    print(f"[OK] TODAS las referencias ({verificados}) existen correctamente en backend/public.")
    sys.exit(0)
