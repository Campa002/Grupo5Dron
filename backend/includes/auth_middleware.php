<?php
/**
 * Middleware de autenticación — Grupo 5: Control de Sistemas y Dron
 * 
 * Verifica la identidad del usuario o del ESP32 en cada petición
 * a endpoints protegidos.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/helpers.php';

/**
 * Verifica que el usuario esté autenticado mediante JWT.
 * Si la autenticación falla, responde con error 401 y termina.
 *
 * @param array $rolesPermitidos Roles que pueden acceder (vacío = cualquier rol autenticado)
 * @return array Datos del usuario autenticado (id, nombre, email, rol)
 */
function verificarAutenticacion(array $rolesPermitidos = []): array
{
    $config = obtenerConfig();
    $secreto = $config['seguridad']['jwt_secreto'];

    // Obtener token del header Authorization: Bearer <token>
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (empty($authHeader) && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (empty($authHeader)) {
        responderError('No se proporcionó token de autenticación.', 401);
    }

    // Extraer el token
    if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        $token = $matches[1];
    } else {
        responderError('Formato de token inválido. Usar: Bearer <token>', 401);
        return []; // Nunca llega acá pero satisface el análisis estático
    }

    // Verificar JWT
    $payload = verificarJwt($token, $secreto);
    if (!$payload) {
        responderError('Token inválido o expirado. Iniciá sesión nuevamente.', 401);
    }

    // Verificar que el usuario exista y esté activo
    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare('SELECT id, nombre, email, rol, activo, debe_cambiar_password FROM usuarios WHERE id = ?');
        $stmt->execute([$payload['usuario_id']]);
        $usuario = $stmt->fetch();
    } catch (Exception $e) {
        registrarLog('Error verificando usuario: ' . $e->getMessage(), 'ERROR');
        responderError('Error interno del servidor.', 500);
        return [];
    }

    if (!$usuario || !$usuario['activo']) {
        responderError('Usuario inactivo o eliminado.', 403);
    }

    // Verificar rol
    if (!empty($rolesPermitidos) && !in_array($usuario['rol'], $rolesPermitidos, true)) {
        responderError('No tenés permisos para realizar esta acción.', 403);
    }

    return $usuario;
}

/**
 * Verifica la autenticación del ESP32 mediante token de dispositivo.
 * El token se envía en el header X-ESP32-Token.
 *
 * @return bool true si la autenticación es válida
 */
function verificarAutenticacionEsp32(): bool
{
    $config = obtenerConfig();
    $tokenEsperado = $config['seguridad']['esp32_token'];

    $tokenRecibido = $_SERVER['HTTP_X_ESP32_TOKEN'] ?? '';
    if (empty($tokenRecibido) && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $tokenRecibido = $headers['X-ESP32-Token'] ?? $headers['x-esp32-token'] ?? '';
    }

    if (empty($tokenRecibido)) {
        responderError('Token del ESP32 no proporcionado.', 401);
        return false;
    }

    if (!hash_equals($tokenEsperado, $tokenRecibido)) {
        responderError('Token del ESP32 inválido.', 401);
        return false;
    }

    return true;
}

/**
 * Verifica que el usuario sea administrador.
 * Atajo para verificarAutenticacion(['admin']).
 *
 * @return array Datos del usuario admin
 */
function verificarAdmin(): array
{
    return verificarAutenticacion(['admin']);
}

/**
 * Verifica que el usuario sea al menos docente (admin o docente).
 *
 * @return array Datos del usuario
 */
function verificarDocente(): array
{
    return verificarAutenticacion(['admin', 'docente']);
}
