<?php
/**
 * Portada del servidor — Grupo 5: Control de Sistemas y Dron
 *
 * Va en la raíz del hosting. Lleva a las dos webs (aula/ y dron/) y a la descarga de los dos APK (apk/).
 * Todo con rutas relativas: funciona en la raíz del dominio o dentro de una subcarpeta.
 * Reusa Bootstrap y los estilos de la web del aula (no hay internet garantizado: nada de CDN).
 */
$apks = [
    'aula' => 'apk/grupo5-aula.apk',
    'dron' => 'apk/grupo5-dron.apk',
];
/** Botón de descarga, o el aviso de que el APK todavía no se subió. */
function botonApk(string $ruta, string $nombre): string
{
    if (is_file(__DIR__ . '/' . $ruta)) {
        $mb = number_format(filesize(__DIR__ . '/' . $ruta) / 1048576, 1, ',', '.');
        return '<a class="btn btn-outline-secondary w-100" href="' . $ruta . '" download>Descargar APK del ' . $nombre . ' (' . $mb . ' MB)</a>';
    }
    return '<p class="small text-body-secondary mb-0">El APK del ' . $nombre . ' todavía no está subido.</p>';
}
?>
<!DOCTYPE html>
<html lang="es" data-bs-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Control de Sistemas y Dron — Proyecto escolar EEST N° 1 de Vicente López">
    <meta name="theme-color" content="#0b1220">
    <title>Grupo 5 — Control de Sistemas y Dron</title>
    <link rel="icon" type="image/png" sizes="192x192" href="aula/img/icon-192.png">
    <link rel="stylesheet" href="aula/libs/bootstrap/bootstrap.min.css">
    <link rel="stylesheet" href="aula/css/app.css">
</head>
<body>
    <main class="container py-4" style="max-width: 40rem;">
        <header class="mb-4">
            <p class="etiqueta">Grupo 5 · EEST N° 1 "Eduardo Ader" · 7° 2°</p>
            <h1 class="h3 fw-bold text-uppercase">Control de sistemas y dron</h1>
            <p class="text-body-secondary mb-0">La web se abre en el navegador; el APK se instala en el celular. El dron real solo se maneja con el APK: la web usa un simulador.</p>
        </header>

        <div class="list-group mb-4">
            <section class="list-group-item py-3">
                <p class="etiqueta">01 — Aula</p>
                <p class="small text-body-secondary">Luces, proyector y aire acondicionado del aula. Pide usuario y contraseña.</p>
                <div class="d-grid gap-2">
                    <a class="btn btn-primary" href="aula/">Abrir web del aula</a>
                    <?= botonApk($apks['aula'], 'aula') ?>
                </div>
            </section>

            <section class="list-group-item py-3">
                <p class="etiqueta">02 — Dron</p>
                <p class="small text-body-secondary">Cabina del dron Tello: mando, inclinación del celular, video y seguimiento. No pide cuenta.</p>
                <div class="d-grid gap-2">
                    <a class="btn btn-primary" href="dron/">Abrir web del dron (simulador)</a>
                    <?= botonApk($apks['dron'], 'dron') ?>
                </div>
            </section>
        </div>

        <footer class="small text-body-secondary">
            <p class="mb-1">Demian Barreto, Luciano Campanelli, Ramiro Caballero y Owen Olea.</p>
            <p class="mb-0">Proyecto de Desarrollo de Software para Plataformas Móviles. Profesores: Piris Eduardo y Figueroa.</p>
        </footer>
    </main>
</body>
</html>
