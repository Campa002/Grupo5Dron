/**
 * Script de Build para empaquetado del frontend estático en capacitor/www/
 * Grupo 5: Control de Sistemas y Dron
 *
 * En el APK no hay PHP: Capacitor solo sirve archivos. Por eso:
 *  - index.php se convierte en index.html sin sus bloques PHP;
 *  - las páginas (pages/*.php) se copian con el mismo nombre (la app las pide como .php)
 *    pero sin ningún bloque PHP. Las páginas no pueden depender de PHP para funcionar.
 */
const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const pubDir = path.join(baseDir, 'backend', 'public');
const wwwDir = path.join(baseDir, 'capacitor', 'www');

// <?php ... ?> y <?= ... ?>; un bloque sin cerrar (permitido al final de un archivo PHP) llega hasta el final
const BLOQUE_PHP = /<\?(?:php|=)[\s\S]*?(?:\?>|$)/g;

function quitarPhp(texto) {
    return texto.replace(BLOQUE_PHP, '');
}

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
['css', 'js', 'img', 'pages', 'libs'].forEach(d => {
    const s = path.join(pubDir, d);
    if (fs.existsSync(s)) copiarDirectorioRecursivo(s, path.join(wwwDir, d));
});

['manifest.json', 'sw.js', 'favicon.ico'].forEach(f => {
    const s = path.join(pubDir, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(wwwDir, f));
});

// Generar index.html estático sin bloques PHP
const phpSrc = fs.readFileSync(path.join(pubDir, 'index.php'), 'utf8');
fs.writeFileSync(path.join(wwwDir, 'index.html'), quitarPhp(phpSrc), 'utf8');

// Páginas: mismo nombre (.php), sin bloques PHP
const paginasDir = path.join(wwwDir, 'pages');
const paginas = fs.existsSync(paginasDir) ? fs.readdirSync(paginasDir).filter(n => n.endsWith('.php')) : [];
for (const nombre of paginas) {
    const ruta = path.join(paginasDir, nombre);
    const original = fs.readFileSync(ruta, 'utf8');
    const limpio = quitarPhp(original);
    if (limpio !== original) {
        console.log(`  pages/${nombre}: se quitaron bloques PHP (en el APK no hay PHP)`);
        fs.writeFileSync(ruta, limpio, 'utf8');
    }
}

// Control final: no puede quedar código PHP en lo que sirve Capacitor
const conPhp = ['index.html', ...paginas.map(n => `pages/${n}`)]
    .filter(r => /<\?(?:php|=)/.test(fs.readFileSync(path.join(wwwDir, r), 'utf8')));
if (conPhp.length) {
    console.error(`ERROR: quedó código PHP en www/: ${conPhp.join(', ')}`);
    process.exit(1);
}

console.log(`capacitor/www/ generado con éxito (index.html y ${paginas.length} páginas .php sin PHP).`);
