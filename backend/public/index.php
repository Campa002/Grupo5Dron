<?php
/**
 * Punto de entrada de la app del DRON — Grupo 5: Control de Sistemas y Dron
 *
 * Sirve la aplicación PWA (HTML principal). La app del dron no tiene login ni usa la API:
 * funciona sin internet. El aula es otra app (backend/public-aula).
 */

// Configurar timezone
date_default_timezone_set('America/Argentina/Buenos_Aires');
?>
<!DOCTYPE html>
<html lang="es" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="description" content="Control del dron Tello desde el celular — Proyecto escolar EEST N° 1 de Vicente López">
    <meta name="theme-color" content="#0b1220">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

    <title>Grupo 5 — Dron</title>

    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/png" sizes="192x192" href="/img/icon-192.png">
    <link rel="apple-touch-icon" href="/img/icon-192.png">
    <link rel="shortcut icon" href="/favicon.ico">

    <!-- Bootstrap 5.3 y Bootstrap Icons, locales (en el WiFi del Tello no hay internet) -->
    <link rel="stylesheet" href="/libs/bootstrap/bootstrap.min.css">
    <link rel="stylesheet" href="/libs/bootstrap/bootstrap-icons.min.css">
    <link rel="stylesheet" href="/css/app.css">
</head>
<body>
    <!-- Barra superior -->
    <header id="header-principal" class="navbar border-bottom px-3 py-2">
        <button id="btn-menu" class="btn btn-link text-body px-2" aria-label="Menú"><i class="bi bi-list fs-4" aria-hidden="true"></i></button>
        <span class="navbar-brand me-auto ms-2 fs-6 fw-semibold text-uppercase">Grupo 5 · Dron</span>
    </header>

    <!-- Menú lateral (lo abre y lo cierra app.js) -->
    <nav id="menu-lateral" class="menu-lateral" aria-label="Menú">
        <div class="offcanvas-backdrop" id="menu-overlay"></div>
        <div class="offcanvas offcanvas-start">
            <div class="offcanvas-header border-bottom">
                <span class="offcanvas-title fw-semibold text-uppercase">Grupo 5 · Dron</span>
            </div>
            <div class="offcanvas-body p-0">
                <div class="list-group list-group-flush">
                    <a href="#/inicio" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="inicio">Inicio</a>
                    <a href="#/dron" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="dron">Cabina</a>
                    <a href="#/seguimiento" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="seguimiento">Seguimiento</a>
                    <a href="#/prueba-tello" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="prueba-tello">Prueba Tello</a>
                    <a href="#/sensores" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="sensores">Sensores</a>
                    <a href="#/objetos" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="objetos">Mis objetos</a>
                    <a href="#/config-dron" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="config-dron">Config. Dron</a>
                </div>
            </div>
        </div>
    </nav>

    <!-- Contenedor principal (las páginas se cargan acá) -->
    <main id="app-contenido" class="container py-4">
        <div class="text-center py-5 text-body-secondary">
            <div class="spinner-border mb-3" role="status" aria-hidden="true"></div>
            <p>Cargando...</p>
        </div>
    </main>

    <!-- Toast / notificaciones -->
    <div id="toast-contenedor" class="toast-contenedor"></div>

    <!-- Módulo del dron, sensores y configuración -->
    <script src="/js/dron-adaptadores.js"></script>
    <script src="/js/dron-joystick.js"></script>
    <script src="/js/dron-giroscopio.js"></script>
    <!-- ML Local para Seguimiento Visual Autónomo (COCO-SSD) -->
    <script src="/libs/tfjs/tf.min.js"></script>
    <script src="/libs/coco-ssd/coco-ssd.min.js"></script>
    <script src="/js/dron-caras.js"></script>
    <script src="/js/dron-seguimiento.js"></script>
    <script src="/js/dron-seguimiento-ui.js"></script>
    <script src="/js/dron-objetos.js"></script>
    <script src="/js/dron-video.js"></script>
    <script src="/js/config-dron.js"></script>
    <script src="/js/sensores.js"></script>
    <script src="/js/dron.js"></script>
    <script src="/js/app.js"></script>

    <!-- Service Worker: solo en el navegador. En el APK los archivos ya son locales. -->
    <script>
        if ('serviceWorker' in navigator) {
            const enApk = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
            if (enApk) {
                // Por si quedó registrado uno de una versión anterior
                navigator.serviceWorker.getRegistrations()
                    .then(registros => registros.forEach(r => r.unregister()))
                    .catch(() => {});
            } else {
                navigator.serviceWorker.register('/sw.js')
                    .catch(err => console.warn('No se pudo registrar el service worker:', err));
            }
        }
    </script>
</body>
</html>
