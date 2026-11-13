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
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Control de los equipos del aula por infrarrojo — Proyecto escolar EEST N° 1 de Vicente López">
    <meta name="theme-color" content="#0a1628">

    <title>Grupo 5 — Aula</title>

    <link rel="manifest" href="manifest.json">
    <link rel="icon" type="image/png" sizes="192x192" href="img/icon-192.png">
    <link rel="apple-touch-icon" href="img/icon-192.png">
    <link rel="shortcut icon" href="favicon.ico">

    <link rel="stylesheet" href="css/app.css">
</head>
<body>
    <!-- Barra de navegación superior -->
    <header id="header-principal" class="header">
        <div class="header__contenido">
            <button id="btn-menu" class="header__btn-menu" aria-label="Menú">
                <span class="header__menu-icono"></span>
            </button>
            <h1 class="header__titulo">
                <span class="header__titulo-icono"><span class="ico ico--aula" aria-hidden="true"></span></span>
                <span class="header__titulo-texto">Control del Aula</span>
            </h1>
            <div class="header__acciones">
                <span id="indicador-esp32" class="indicador indicador--offline" title="ESP32 desconectado">
                    <span class="indicador__punto"></span>
                    <span class="indicador__texto">ESP32</span>
                </span>
                <button id="btn-usuario" class="header__btn-usuario" aria-label="Usuario">
                    <span class="header__usuario-icono"><span class="ico ico--usuario" aria-hidden="true"></span></span>
                </button>
            </div>
        </div>
    </header>

    <!-- Menú lateral -->
    <nav id="menu-lateral" class="menu-lateral">
        <div class="menu-lateral__overlay" id="menu-overlay"></div>
        <div class="menu-lateral__contenido">
            <div class="menu-lateral__header">
                <span class="menu-lateral__logo"><span class="ico ico--aula" aria-hidden="true"></span></span>
                <span class="menu-lateral__nombre">Grupo 5 · Aula</span>
            </div>
            <ul class="menu-lateral__lista">
                <li><a href="#/aula" class="menu-lateral__enlace" data-pagina="aula"><span class="ico ico--aula" aria-hidden="true"></span> Control del Aula</a></li>
                <li><a href="#/admin" class="menu-lateral__enlace menu-lateral__enlace--admin" data-pagina="admin"><span class="ico ico--engranaje" aria-hidden="true"></span> Administración</a></li>
                <li class="menu-lateral__separador"></li>
                <li><a href="#/cambiar-password" class="menu-lateral__enlace" data-pagina="cambiar-password"><span class="ico ico--llave" aria-hidden="true"></span> Cambiar contraseña</a></li>
                <li><a href="#" class="menu-lateral__enlace" id="btn-cerrar-sesion"><span class="ico ico--salir" aria-hidden="true"></span> Cerrar sesión</a></li>
            </ul>
        </div>
    </nav>

    <!-- Contenedor principal -->
    <main id="app-contenido" class="contenido-principal">
        <div class="cargando">
            <div class="cargando__spinner"></div>
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
