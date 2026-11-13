/**
 * Service Worker de la app del DRON — Grupo 5: Control de Sistemas y Dron
 *
 * Solo se usa en el navegador (en el APK los archivos ya son locales y no se registra).
 * Estrategia: PRIMERO LA RED para la app del dron (así nunca se ven versiones viejas estando online)
 * y la copia en caché si no hay conexión o la red tarda más de 3 s.
 * Solo atiende los archivos del dron: la API (/api/) y la web del aula (otra carpeta del mismo hosting,
 * por ejemplo /aula/) quedan fuera y van siempre directo a la red.
 */

// Subir este número cuando cambie la lista de recursos precacheados
const CACHE_NAME = 'grupo5dron-v13';

// Si la red tarda más que esto y hay copia en caché, se usa la copia (la red sigue actualizando en segundo plano)
const ESPERA_RED_MS = 3000;

// Recursos estáticos confirmados para precaché inicial
const RECURSOS_ESTATICOS = [
    '/',
    '/manifest.json',
    '/favicon.ico',
    '/css/app.css',
    '/js/app.js',
    '/js/dron-adaptadores.js',
    '/js/dron-joystick.js',
    '/js/dron-giroscopio.js',
    '/libs/tfjs/tf.min.js',
    '/libs/coco-ssd/coco-ssd.min.js',
    '/libs/coco-ssd/model.json',
    '/libs/coco-ssd/group1-shard1of3.bin',
    '/libs/coco-ssd/group1-shard2of3.bin',
    '/libs/coco-ssd/group1-shard3of3.bin',
    '/libs/blazeface/model.json',
    '/libs/blazeface/group1-shard1of1.bin',
    '/js/dron-caras.js',
    '/js/dron-seguimiento.js',
    '/js/dron-seguimiento-ui.js',
    '/js/dron-objetos.js',
    '/libs/mobilenet/model.json',
    '/libs/mobilenet/group1-shard1of1.bin',
    '/js/dron-video.js',
    '/js/config-dron.js',
    '/js/sensores.js',
    '/js/dron.js',
    '/img/icon-192.png',
    '/img/icon-512.png',
    '/img/prueba-persona.jpg',
    '/pages/inicio.php',
    '/pages/dron.php',
    '/pages/seguimiento.php',
    '/pages/sensores.php',
    '/pages/objetos.php',
    '/pages/prueba-tello.php',
    '/pages/config-dron.php',
];

/** true si el pedido es de la app del dron: la raíz o sus carpetas de archivos. */
function esDeLaAppDelDron(pathname) {
    return pathname === '/' || pathname === '/index.php' || RECURSOS_ESTATICOS.includes(pathname)
        || /^\/(js|css|pages|libs|img)\//.test(pathname);
}

// Instalación: cachear recursos de a uno para que un fallo no frene a los demás
self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(CACHE_NAME).then((cache) => Promise.allSettled(
            RECURSOS_ESTATICOS.map(async (url) => {
                try {
                    const respuesta = await fetch(url, { cache: 'reload' });
                    if (respuesta.ok) {
                        await cache.put(url, respuesta);
                    } else {
                        console.warn(`[SW] No se pudo precachear ${url}: HTTP ${respuesta.status}`);
                    }
                } catch (error) {
                    console.warn(`[SW] Error al precachear ${url}:`, error);
                }
            })
        ))
    );
    self.skipWaiting();
});

// Activación: borrar cachés de versiones anteriores
self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys().then((nombres) => Promise.all(
            nombres.filter((nombre) => nombre !== CACHE_NAME).map((nombre) => caches.delete(nombre))
        ))
    );
    self.clients.claim();
});

/** Pide a la red revalidando con el servidor (sin usar la caché HTTP del navegador sin preguntar). */
function pedirARed(request) {
    // Las navegaciones no admiten opciones extra en fetch()
    return request.mode === 'navigate' ? fetch(request) : fetch(request, { cache: 'no-cache' });
}

async function primeroLaRed(evento) {
    const request = evento.request;
    const cache = await caches.open(CACHE_NAME);

    const red = pedirARed(request).then((respuesta) => {
        if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
            evento.waitUntil(cache.put(request, respuesta.clone()));
        }
        return respuesta;
    });

    const copia = await cache.match(request, { ignoreSearch: true })
        || (request.mode === 'navigate' ? await cache.match('/') : undefined);

    if (!copia) {
        // Sin copia: solo queda la red (si falla, el navegador muestra el error)
        return red;
    }
    // Con copia: la red tiene ESPERA_RED_MS para responder; si falla o tarda, se usa la copia
    const tiempoAgotado = new Promise((resolver) => setTimeout(() => resolver(null), ESPERA_RED_MS));
    try {
        const respuesta = await Promise.race([red, tiempoAgotado]);
        if (respuesta && respuesta.ok) return respuesta;
    } catch (_) {
        // Sin conexión
    }
    red.catch(() => {}); // si sigue en curso, que no quede un rechazo sin atender
    return copia;
}

self.addEventListener('fetch', (evento) => {
    const request = evento.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // La API y todo lo que no es del dron (por ejemplo, la web del aula) van directo a la red
    if (!esDeLaAppDelDron(url.pathname)) return;

    // Páginas y archivos del dron: primero la red, la caché si no hay conexión
    evento.respondWith(primeroLaRed(evento));
});
