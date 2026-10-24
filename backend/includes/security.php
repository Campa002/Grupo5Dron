<?php
/**
 * Módulo de seguridad — Grupo 5: Control de Sistemas y Dron
 * 
 * Cabeceras de seguridad HTTP, protección CSRF, rate limiting
 * y configuración CORS.
 */

require_once __DIR__ . '/../config/database.php';

/**
 * Establece las cabeceras de seguridad HTTP.
 * Llamar al inicio de cada petición a la API.
 */
function establecerCabecerasSeguridad(): void
{
    // Prevenir clickjacking
    header('X-Frame-Options: DENY');
    // Prevenir MIME sniffing
    header('X-Content-Type-Options: nosniff');
    // Activar filtro XSS del navegador
    header('X-XSS-Protection: 1; mode=block');
    // Política de referrer
    header('Referrer-Policy: strict-origin-when-cross-origin');
    // No cachear respuestas de API
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
}

/**
 * Configura CORS (Cross-Origin Resource Sharing).
 * Permite peticiones desde los orígenes configurados.
 */
function configurarCors(): void
{
    $config = obtenerConfig();
    $origenesPermitidos = $config['seguridad']['cors_origenes'] ?? [];

    $origen = $_SERVER['HTTP_ORIGIN'] ?? '';

    // En desarrollo, permitir localhost
    if (($config['app']['debug'] ?? false)) {
        $origenesPermitidos[] = 'http://localhost';
        $origenesPermitidos[] = 'http://localhost:8080';
        $origenesPermitidos[] = 'http://127.0.0.1';
    }

    if (in_array($origen, $origenesPermitidos, true)) {
        header("Access-Control-Allow-Origin: $origen");
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token, X-ESP32-Token');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');

    // Responder preflight OPTIONS
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Genera un token CSRF y lo guarda en la sesión.
 *
 * @return string Token CSRF
 */
function generarTokenCsrf(): string
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    $token = bin2hex(random_bytes(32));
    $_SESSION['csrf_token'] = $token;
    return $token;
}

/**
 * Verifica que el token CSRF enviado sea válido.
 * Solo para peticiones desde formularios web (no para API REST con JWT).
 *
 * @param string $token Token recibido
 * @return bool
 */
function verificarTokenCsrf(string $token): bool
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    return isset($_SESSION['csrf_token']) && hash_equals($_SESSION['csrf_token'], $token);
}

/**
 * Verifica la limitación de intentos de login para una IP.
 * Bloquea temporalmente si se superan los intentos máximos.
 *
 * @param string $email Email del intento
 * @return bool true si el login está permitido, false si está bloqueado
 */
function verificarRateLimit(string $email): bool
{
    $config = obtenerConfig();
    $maxIntentos = $config['seguridad']['max_intentos_login'] ?? 5;
    $bloqueoMinutos = $config['seguridad']['bloqueo_minutos'] ?? 15;

    try {
        $pdo = obtenerConexion();

        // Verificar si el usuario está bloqueado
        $stmt = $pdo->prepare(
            'SELECT intentos_login, bloqueado_hasta FROM usuarios WHERE email = ?'
        );
        $stmt->execute([$email]);
        $usuario = $stmt->fetch();

        if (!$usuario) {
            return true; // El usuario no existe, dejamos que el login falle normalmente
        }

        // Si está bloqueado, verificar si ya pasó el tiempo
        if ($usuario['bloqueado_hasta']) {
            $bloqueadoHasta = new DateTime($usuario['bloqueado_hasta']);
            $ahora = new DateTime();
            if ($ahora < $bloqueadoHasta) {
                return false; // Todavía bloqueado
            }
            // Ya pasó el bloqueo, resetear
            $stmt = $pdo->prepare(
                'UPDATE usuarios SET intentos_login = 0, bloqueado_hasta = NULL WHERE email = ?'
            );
            $stmt->execute([$email]);
        }

        return $usuario['intentos_login'] < $maxIntentos;
    } catch (Exception $e) {
        registrarLog('Error en rate limit: ' . $e->getMessage(), 'ERROR');
        return true; // En caso de error, permitir (no bloquear por fallo técnico)
    }
}

/**
 * Registra un intento de login fallido.
 *
 * @param string $email Email del intento
 */
function registrarIntentoFallido(string $email): void
{
    $config = obtenerConfig();
    $maxIntentos = $config['seguridad']['max_intentos_login'] ?? 5;
    $bloqueoMinutos = $config['seguridad']['bloqueo_minutos'] ?? 15;

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'UPDATE usuarios SET intentos_login = intentos_login + 1 WHERE email = ?'
        );
        $stmt->execute([$email]);

        // Verificar si hay que bloquear
        $stmt = $pdo->prepare('SELECT intentos_login FROM usuarios WHERE email = ?');
        $stmt->execute([$email]);
        $usuario = $stmt->fetch();

        if ($usuario && $usuario['intentos_login'] >= $maxIntentos) {
            $bloqueoHasta = (new DateTime())->modify("+{$bloqueoMinutos} minutes")->format('Y-m-d H:i:s');
            $stmt = $pdo->prepare(
                'UPDATE usuarios SET bloqueado_hasta = ? WHERE email = ?'
            );
            $stmt->execute([$bloqueoHasta, $email]);
        }
    } catch (Exception $e) {
        registrarLog('Error registrando intento fallido: ' . $e->getMessage(), 'ERROR');
    }
}

/**
 * Resetea los intentos de login tras un login exitoso.
 *
 * @param string $email Email del usuario
 */
function resetearIntentosLogin(string $email): void
{
    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'UPDATE usuarios SET intentos_login = 0, bloqueado_hasta = NULL WHERE email = ?'
        );
        $stmt->execute([$email]);
    } catch (Exception $e) {
        registrarLog('Error reseteando intentos: ' . $e->getMessage(), 'ERROR');
    }
}
