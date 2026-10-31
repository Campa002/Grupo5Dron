/**
 * Script de Build para empaquetado del frontend estático en capacitor/www/
 * Grupo 5: Control de Sistemas y Dron
 */
const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const pubDir = path.join(baseDir, 'backend', 'public');
const wwwDir = path.join(baseDir, 'capacitor', 'www');

function copiarDirectorioRecursivo(origen, destino) {
    if (!fs.existsSync(destino)) fs.mkdirSync(destino, { recursive: true });
    const entradas = fs.readdirSync(origen, { withFileTypes: true });
    for (const entrada of entradas) {
        const srcPath = path.join(origen, entrada.name);
        const dstPath = path.join(destino, entrada.name);
        if (entrada.isDirectory()) {
            copiarDirectorioRecursivo(srcPath, dstPath);
        } else {
            fs.copyFileSync(srcPath, dstPath);
        }
    }
}

console.log('Generando www/ estático para Capacitor...');
if (fs.existsSync(wwwDir)) {
    fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

// Copiar recursos
['css', 'js', 'img', 'pages', 'vendor'].forEach(d => {
    const s = path.join(pubDir, d);
    if (fs.existsSync(s)) copiarDirectorioRecursivo(s, path.join(wwwDir, d));
});

['manifest.json', 'sw.js', 'favicon.ico'].forEach(f => {
    const s = path.join(pubDir, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(wwwDir, f));
});

// Generar index.html estático sin bloques PHP
const phpSrc = fs.readFileSync(path.join(pubDir, 'index.php'), 'utf8');
const htmlClean = phpSrc.replace(/<\?php[\s\S]*?\?>/g, '');
fs.writeFileSync(path.join(wwwDir, 'index.html'), htmlClean, 'utf8');

console.log('✅ capacitor/www/ generado con éxito.');

