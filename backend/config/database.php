<?php
/**
 * Conexión a la base de datos — PDO MySQL
 * Grupo 5: Control de Sistemas y Dron
 * 
 * Este archivo carga la configuración desde config.php y devuelve
 * una instancia de PDO lista para usar con consultas preparadas.
 */

/**
 * Obtiene una instancia PDO con la conexión a MySQL.
 * Usa patrón singleton para reutilizar la conexión.
 *
 * @return PDO Instancia de conexión PDO
 * @throws Exception Si no se encuentra el archivo de configuración
 */
function obtenerConexion(): PDO
{
    static $pdo = null;

    if ($pdo !== null) {
        return $pdo;
    }

    // Buscar config.php (fuera de la carpeta pública por seguridad)
    $rutaConfig = __DIR__ . '/config.php';

    if (!file_exists($rutaConfig)) {
        // Intentar con la ruta ejemplo para dar un error descriptivo
        throw new Exception(
            'No se encontró el archivo de configuración. ' .
            'Copiá config.example.php como config.php y completá los datos reales.'
        );
    }

    $config = require $rutaConfig;
    $db = $config['db'];

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        $db['puerto'],
        $db['nombre'],
        $db['charset']
    );

    $opciones = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$db['charset']}",
    ];

    $pdo = new PDO($dsn, $db['usuario'], $db['password'], $opciones);

    return $pdo;
}

/**
 * Carga y devuelve la configuración completa del proyecto.
 *
 * @return array Arreglo asociativo con toda la configuración
 */
function obtenerConfig(): array
{
    static $config = null;

    if ($config !== null) {
        return $config;
    }

    $rutaConfig = __DIR__ . '/config.php';

    if (!file_exists($rutaConfig)) {
        throw new Exception('Archivo de configuración no encontrado.');
    }

    $config = require $rutaConfig;
    return $config;
}
