/**
 * Service Worker — Grupo 5: Control de Sistemas y Dron
 *
 * Solo se usa en el navegador (en el APK los archivos ya son locales y no se registra).
 * Estrategia:
 *  - API (/api/): siempre por red; sin conexión responde un JSON de error.
 *  - Páginas, JS, CSS e imágenes: PRIMERO LA RED (así nunca se ven versiones viejas estando online)
 *    y la copia en caché si no hay conexión o la red tarda más de 3 s.
 */

// Subir este número cuando cambie la lista de recursos precacheados
const CACHE_NAME = 'grupo5dron-v11';

// Si la red tarda más que esto y hay copia en caché, se usa la copia (la red sigue actualizando en segundo plano)
const ESPERA_RED_MS = 3000;

// Recursos estáticos confirmados para precaché inicial
const RECURSOS_ESTATICOS = [
    '/',
    '/manifest.json',
    '/favicon.ico',
    '/css/app.css',
    '/js/api.js',
    '/js/auth.js',
    '/js/aula.js',
    '/js/admin.js',
    '/js/app.js',
    // Etapa 4: Módulo Dron, Sensores y Configuración
    '/js/dron-adaptadores.js',
    '/js/dron-joystick.js',
    '/js/dron-giroscopio.js',
    '/libs/tfjs/tf.min.js',
    '/libs/coco-ssd/coco-ssd.min.js',
    '/libs/coco-ssd/model.json',
    '/libs/coco-ssd/group1-shard1of3.bin',
    '/libs/coco-ssd/group1-shard2of3.bin',
    '/libs/coco-ssd/group1-shard3of3.bin',
    '/js/dron-seguimiento.js',
    '/js/dron-objetos.js',
    '/libs/mobilenet/model.json',
    '/libs/mobilenet/group1-shard1of1.bin',
    '/js/dron-video.js',
    '/js/config-dron.js',
    '/js/sensores.js',
    '/js/dron.js',
    '/img/icon-192.png',
    '/img/icon-512.png',
    '/pages/login.php',
    '/pages/inicio.php',
    '/pages/aula.php',
    '/pages/admin.php',
    '/pages/dron.php',
    '/pages/sensores.php',
    '/pages/objetos.php',
    '/pages/prueba-tello.php',
    '/pages/config-dron.php',
    '/pages/cambiar-password.php',
];

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

    // 1. API REST: siempre por red
    if (url.pathname.startsWith('/api/')) {
        evento.respondWith(
            fetch(request).catch(() => new Response(
                JSON.stringify({ error: true, mensaje: 'Sin conexión con el servidor. Verificá tu red WiFi.' }),
                { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
            ))
        );
        return;
    }

    // 2. Páginas y archivos estáticos: primero la red, la caché si no hay conexión
    evento.respondWith(primeroLaRed(evento));
});
