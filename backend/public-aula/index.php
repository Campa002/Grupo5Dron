<?php
/**
 * Punto de entrada de la app del AULA — Grupo 5: Control de Sistemas y Dron
 *
 * Web y APK separados de los del dron (Etapa A). Usan la misma API (/api) y la misma base de datos.
 * Las rutas son relativas: en el hosting esta carpeta puede ir en una subcarpeta (por ejemplo /aula/).
 */

date_default_timezone_set('America/Argentina/Buenos_Aires');
?>
<!DOCTYPE html>
<html lang="es" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Control de los equipos del aula por infrarrojo — Proyecto escolar EEST N° 1 de Vicente López">
    <meta name="theme-color" content="#0b1220">

    <title>Grupo 5 — Aula</title>

    <link rel="manifest" href="manifest.json">
    <link rel="icon" type="image/png" sizes="192x192" href="img/icon-192.png">
    <link rel="apple-touch-icon" href="img/icon-192.png">
    <link rel="shortcut icon" href="favicon.ico">

    <!-- Bootstrap 5.3 y Bootstrap Icons, locales (sin CDN) -->
    <link rel="stylesheet" href="libs/bootstrap/bootstrap.min.css">
    <link rel="stylesheet" href="libs/bootstrap/bootstrap-icons.min.css">
    <link rel="stylesheet" href="css/app.css">
</head>
<body>
    <!-- Barra superior -->
    <header id="header-principal" class="navbar border-bottom px-3 py-2">
        <button id="btn-menu" class="btn btn-link text-body px-2" aria-label="Menú"><i class="bi bi-list fs-4" aria-hidden="true"></i></button>
        <span class="navbar-brand me-auto ms-2 fs-6 fw-semibold text-uppercase">Grupo 5 · Aula</span>
        <span id="indicador-esp32" class="indicador indicador--offline me-2" title="ESP32 desconectado">
            <span class="indicador__punto"></span>
            <span class="indicador__texto">ESP32</span>
        </span>
        <button id="btn-usuario" class="btn btn-link text-body px-2" aria-label="Usuario"><i class="bi bi-person-circle fs-4" aria-hidden="true"></i></button>
    </header>

    <!-- Menú lateral (lo abre y lo cierra app.js) -->
    <nav id="menu-lateral" class="menu-lateral" aria-label="Menú">
        <div class="offcanvas-backdrop" id="menu-overlay"></div>
        <div class="offcanvas offcanvas-start">
            <div class="offcanvas-header border-bottom">
                <span class="offcanvas-title fw-semibold text-uppercase">Grupo 5 · Aula</span>
            </div>
            <div class="offcanvas-body p-0">
                <div class="list-group list-group-flush">
                    <a href="#/aula" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="aula">Control del aula</a>
                    <a href="#/admin" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="admin">Administración</a>
                    <a href="#/cambiar-password" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" data-pagina="cambiar-password">Cambiar contraseña</a>
                    <a href="#" class="list-group-item list-group-item-action py-3 menu-lateral__enlace" id="btn-cerrar-sesion">Cerrar sesión</a>
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

    <!-- Avisos -->
    <div id="toast-contenedor" class="toast-contenedor"></div>

    <script src="js/api.js"></script>
    <script src="js/auth.js"></script>
    <script src="js/aula.js"></script>
    <script src="js/admin.js"></script>
    <script src="js/app.js"></script>
</body>
</html>
