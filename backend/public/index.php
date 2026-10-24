<?php
/**
 * Punto de entrada principal — Grupo 5: Control de Sistemas y Dron
 * 
 * Sirve la aplicación PWA (HTML principal) para todas las rutas
 * que no sean de la API ni archivos estáticos.
 */

// Configurar timezone
date_default_timezone_set('America/Argentina/Buenos_Aires');
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="description" content="Control de dispositivos del aula y dron WiFi — Proyecto escolar EEST N° 1 de Vicente López">
    <meta name="theme-color" content="#0a1628">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

    <title>Grupo 5 — Control de Sistemas y Dron</title>

    <!-- PWA Manifest & Favicon -->
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/png" sizes="192x192" href="/img/icon-192.png">
    <link rel="apple-touch-icon" href="/img/icon-192.png">
    <link rel="shortcut icon" href="/favicon.ico">

    <!-- Fuente tipográfica -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

    <!-- Estilos -->
    <link rel="stylesheet" href="/css/app.css">
</head>
<body>
    <!-- Barra de navegación superior -->
    <header id="header-principal" class="header">
        <div class="header__contenido">
            <button id="btn-menu" class="header__btn-menu" aria-label="Menú">
                <span class="header__menu-icono"></span>
            </button>
            <h1 class="header__titulo">
                <span class="header__titulo-icono">⚡</span>
                Control de Sistemas y Dron
            </h1>
            <div class="header__acciones">
                <span id="indicador-esp32" class="indicador indicador--offline" title="ESP32 desconectado">
                    <span class="indicador__punto"></span>
                    <span class="indicador__texto">ESP32</span>
                </span>
                <button id="btn-usuario" class="header__btn-usuario" aria-label="Usuario">
                    <span class="header__usuario-icono">👤</span>
                </button>
            </div>
        </div>
    </header>

    <!-- Menú lateral -->
    <nav id="menu-lateral" class="menu-lateral">
        <div class="menu-lateral__overlay" id="menu-overlay"></div>
        <div class="menu-lateral__contenido">
            <div class="menu-lateral__header">
                <span class="menu-lateral__logo">⚡</span>
                <span class="menu-lateral__nombre">Grupo 5</span>
            </div>
            <ul class="menu-lateral__lista">
                <li><a href="#/inicio" class="menu-lateral__enlace" data-pagina="inicio">🏠 Inicio</a></li>
                <li><a href="#/aula" class="menu-lateral__enlace" data-pagina="aula">🎛️ Control del Aula</a></li>
                <li><a href="#/dron" class="menu-lateral__enlace" data-pagina="dron">🚁 Control del Dron</a></li>
                <li><a href="#/sensores" class="menu-lateral__enlace" data-pagina="sensores">📡 Diagnóstico Sensores</a></li>
                <li class="menu-lateral__separador"></li>
                <li><a href="#/admin" class="menu-lateral__enlace menu-lateral__enlace--admin" data-pagina="admin">⚙️ Administración</a></li>
                <li><a href="#/config-dron" class="menu-lateral__enlace" data-pagina="config-dron">🔧 Config. Dron</a></li>
                <li class="menu-lateral__separador"></li>
                <li><a href="#/acerca" class="menu-lateral__enlace" data-pagina="acerca">ℹ️ Acerca de</a></li>
                <li><a href="#" class="menu-lateral__enlace" id="btn-cerrar-sesion">🚪 Cerrar sesión</a></li>
            </ul>
        </div>
    </nav>

    <!-- Contenedor principal (SPA) -->
    <main id="app-contenido" class="contenido-principal">
        <!-- Las páginas se cargan dinámicamente aquí -->
        <div class="cargando">
            <div class="cargando__spinner"></div>
            <p>Cargando...</p>
        </div>
    </main>

    <!-- Toast / notificaciones -->
    <div id="toast-contenedor" class="toast-contenedor"></div>

    <!-- Scripts activos (Etapas 1, 2 y 4) -->
    <script src="/js/api.js"></script>
    <script src="/js/auth.js"></script>
    <script src="/js/aula.js"></script>
    <script src="/js/admin.js"></script>
    <!-- Etapa 4: Módulo Dron, Sensores y Configuración -->
    <script src="/js/dron-adaptadores.js"></script>
    <script src="/js/dron-joystick.js"></script>
    <script src="/js/dron-giroscopio.js"></script>
    <script src="/js/dron-seguimiento.js"></script>
    <script src="/js/config-dron.js"></script>
    <script src="/js/sensores.js"></script>
    <script src="/js/dron.js"></script>
    <script src="/js/app.js"></script>

    <!-- Service Worker -->
    <script>
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registrado:', reg.scope))
                .catch(err => console.warn('Error registrando SW:', err));
        }
    </script>
</body>
</html>
