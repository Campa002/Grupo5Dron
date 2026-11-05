import os, shutil, re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB_DIR = os.path.join(BASE_DIR, 'backend', 'public')
WWW_DIR = os.path.join(BASE_DIR, 'capacitor', 'www')

if os.path.exists(WWW_DIR):
    shutil.rmtree(WWW_DIR)
os.makedirs(WWW_DIR, exist_ok=True)

# 1. Copiar carpetas estáticas
for d in ['css', 'js', 'img', 'pages', 'vendor']:
    src = os.path.join(PUB_DIR, d)
    dst = os.path.join(WWW_DIR, d)
    if os.path.exists(src):
        shutil.copytree(src, dst)

# 2. Copiar archivos raíz de la PWA
for f in ['manifest.json', 'sw.js', 'favicon.ico']:
    src = os.path.join(PUB_DIR, f)
    dst = os.path.join(WWW_DIR, f)
    if os.path.exists(src):
        shutil.copy2(src, dst)

# 3. Generar index.html estático a partir de index.php
with open(os.path.join(PUB_DIR, 'index.php'), 'r', encoding='utf-8') as f:
    php_content = f.read()

# Eliminar tags PHP de sesión o lógica de backend
html_content = re.sub(r'<\?php.*?\?>', '', php_content, flags=re.DOTALL)

with open(os.path.join(WWW_DIR, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(html_content)

print(f"Build completado: capacitor/www/ generado con exito ({len(os.listdir(WWW_DIR))} elementos).")

