<?php
/**
 * Configuración del proyecto — Grupo 5: Control de Sistemas y Dron
 * 
 * INSTRUCCIONES:
 * 1. Copiá este archivo como "config.php" en la misma carpeta.
 * 2. Completá los valores reales (base de datos, claves, etc.).
 * 3. NUNCA subas config.php al repositorio (está en .gitignore).
 */

return [
    // --- Base de datos ---
    'db' => [
        'host'     => 'localhost',
        'nombre'   => 'grupo5dron_db',
        'usuario'  => 'grupo5dron_user',
        'password' => 'CAMBIAR_ESTA_CONTRASEÑA',
        'charset'  => 'utf8mb4',
        'puerto'   => 3306,
    ],

    // --- Seguridad ---
    'seguridad' => [
        // Clave secreta para firmar tokens JWT (generá una aleatoria larga)
        'jwt_secreto'          => 'CAMBIAR_POR_UNA_CLAVE_SECRETA_LARGA_Y_ALEATORIA',
        // Duración del token en segundos (8 horas)
        'jwt_duracion'         => 28800,
        // Token de autenticación del ESP32 (debe coincidir con config.h del firmware)
        'esp32_token'          => 'CAMBIAR_TOKEN_ESP32_SECRETO',
        // Máximo de intentos de login antes de bloquear
        'max_intentos_login'   => 5,
        // Minutos de bloqueo tras superar intentos
        'bloqueo_minutos'      => 15,
        // Orígenes CORS permitidos (ajustar al dominio real)
        'cors_origenes'        => ['https://tu-dominio.com'],
    ],

    // --- Aplicación ---
    'app' => [
        'nombre'    => 'Grupo 5: Control de Sistemas y Dron',
        'url_base'  => 'https://tu-dominio.com',
        'debug'     => false, // Poner en true solo para desarrollo
        'timezone'  => 'America/Argentina/Buenos_Aires',
    ],

    // --- ESP32 ---
    'esp32' => [
        // Segundos sin heartbeat para considerar desconectado
        'heartbeat_timeout' => 30,
        // Máximo de comandos por polling
        'max_comandos_poll' => 5,
    ],
];
