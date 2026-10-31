/**
 * Service Worker — Grupo 5: Control de Sistemas y Dron
 * 
 * Estrategia de caché resiliente para funcionamiento offline parcial
 * y actualización en segundo plano.
 */

const CACHE_NAME = 'grupo5dron-v3';

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
    '/vendor/tfjs/tf.min.js',
    '/vendor/coco-ssd/coco-ssd.min.js',
    '/vendor/coco-ssd/model.json',
    '/vendor/coco-ssd/group1-shard1of5',
    '/vendor/coco-ssd/group1-shard2of5',
    '/vendor/coco-ssd/group1-shard3of5',
    '/vendor/coco-ssd/group1-shard4of5',
    '/vendor/coco-ssd/group1-shard5of5',
    '/js/dron-seguimiento.js',
    '/js/dron-video.js',
    '/js/config-dron.js',
    '/js/sensores.js',
    '/js/dron.js',
    '/img/icon-192.png',
    '/img/icon-512.png',
    '/pages/login.html',
    '/pages/inicio.html',
    '/pages/aula.html',
    '/pages/admin.html',
    '/pages/acerca.html',
    '/pages/dron.html',
    '/pages/sensores.html',
    '/pages/prueba-tello.html',
    '/pages/config-dron.html',
];

// Instalación: cachear recursos individualmente para evitar fallos en bloque
self.addEventListener('install', (evento) => {
    evento.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[SW] Cacheando recursos estáticos de forma resiliente');
            await Promise.allSettled(
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
            );
        })
    );
    // Activar inmediatamente
    self.skipWaiting();
});

// Activación: purgar cachés anteriores
self.addEventListener('activate', (evento) => {
    evento.waitUntil(
        caches.keys().then((nombres) => {
            return Promise.all(
                nombres.map((nombre) => {
                    if (nombre !== CACHE_NAME) {
                        console.log('[SW] Eliminando caché antigua:', nombre);
                        return caches.delete(nombre);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch: red prioritaria para la API, caché dinámica en runtime para estáticos
self.addEventListener('fetch', (evento) => {
    const url = new URL(evento.request.url);

    // 1. Peticiones hacia la API REST -> Siempre por Red (Network Only)
    if (url.pathname.startsWith('/api/')) {
        evento.respondWith(
            fetch(evento.request).catch(() => {
                return new Response(
                    JSON.stringify({
                        error: true,
                        mensaje: 'Sin conexión con el servidor. Verificá tu red WiFi.',
                    }),
                    {
                        status: 503,
                        headers: { 'Content-Type': 'application/json; charset=utf-8' },
                    }
                );
            })
        );
        return;
    }

    // 2. Recursos estáticos y páginas -> Cache First con actualización en segundo plano
    evento.respondWith(
        caches.match(evento.request).then((recursoEnCache) => {
            const peticionRed = fetch(evento.request)
                .then((respuestaRed) => {
                    if (respuestaRed && respuestaRed.status === 200 && respuestaRed.type === 'basic') {
                        const copia = respuestaRed.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(evento.request, copia);
                        });
                    }
                    return respuestaRed;
                })
                .catch(() => {
                    // Si falla la red y no estaba en caché, fallback a inicio si es navegación
                    if (evento.request.mode === 'navigate') {
                        return caches.match('/');
                    }
                    return null;
                });

            return recursoEnCache || peticionRed;
        })
    );
});
