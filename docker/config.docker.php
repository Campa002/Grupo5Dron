<?php
/**
 * Configuración para el servidor con Docker — Grupo 5: Control de Sistemas y Dron
 *
 * Se copia como config/config.php dentro de ./sitio. No tiene ninguna clave: todas llegan
 * por variables de entorno desde el archivo .env del servidor (ver docker/env.example).
 */
$entorno = static function (string $nombre, string $porDefecto = ''): string {
    $valor = getenv($nombre);
    return ($valor === false || $valor === '') ? $porDefecto : $valor;
};

// Sin claves largas no se arranca: evita quedar funcionando con valores de ejemplo
foreach (['DB_PASSWORD' => 16, 'JWT_SECRETO' => 32, 'ESP32_TOKEN' => 32] as $nombre => $minimo) {
    if (strlen($entorno($nombre)) < $minimo) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        exit(json_encode(['ok' => false, 'error' => 'Falta configurar el servidor.']));
    }
}

return [
    'db' => [
        'host'     => $entorno('DB_HOST', 'db'),
        'nombre'   => $entorno('DB_NAME', 'grupo5dron_db'),
        'usuario'  => $entorno('DB_USER', 'grupo5'),
        'password' => $entorno('DB_PASSWORD'),
        'charset'  => 'utf8mb4',
        'puerto'   => 3306,
    ],
    'seguridad' => [
        'jwt_secreto'        => $entorno('JWT_SECRETO'),
        'jwt_duracion'       => 28800,
        'esp32_token'        => $entorno('ESP32_TOKEN'),
        'max_intentos_login' => 5,
        'bloqueo_minutos'    => 15,
        // El dominio del sitio y https://localhost (el origen del APK)
        'cors_origenes'      => array_values(array_filter(array_map('trim', explode(',', $entorno('CORS_ORIGENES', 'https://localhost'))))),
    ],
    'app' => [
        'nombre'   => 'Grupo 5: Control de Sistemas y Dron',
        'url_base' => $entorno('URL_BASE'),
        'debug'    => false,
        'timezone' => 'America/Argentina/Buenos_Aires',
    ],
    'esp32' => [
        'heartbeat_timeout' => 30,
        'max_comandos_poll' => 5,
    ],
];
