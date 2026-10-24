<?php
/**
 * Funciones auxiliares — Grupo 5: Control de Sistemas y Dron
 * 
 * Utilidades comunes para la API: respuestas JSON, validación,
 * manejo de errores, JWT y funciones de conveniencia.
 */

/**
 * Envía una respuesta JSON al cliente y termina la ejecución.
 *
 * @param mixed $datos   Datos a enviar
 * @param int   $codigo  Código HTTP (200, 400, 401, 403, 404, 500)
 */
function responderJson($datos, int $codigo = 200): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Responde con un error JSON estandarizado.
 *
 * @param string $mensaje Mensaje de error
 * @param int    $codigo  Código HTTP
 */
function responderError(string $mensaje, int $codigo = 400): void
{
    responderJson(['error' => true, 'mensaje' => $mensaje], $codigo);
}

/**
 * Responde con éxito y datos opcionales.
 *
 * @param string $mensaje Mensaje de éxito
 * @param array  $datos   Datos adicionales
 * @param int    $codigo  Código HTTP
 */
function responderExito(string $mensaje, array $datos = [], int $codigo = 200): void
{
    $respuesta = ['error' => false, 'mensaje' => $mensaje];
    if (!empty($datos)) {
        $respuesta = array_merge($respuesta, $datos);
    }
    responderJson($respuesta, $codigo);
}

/**
 * Obtiene el cuerpo de la petición parseado como JSON.
 *
 * @return array Datos del body
 */
function obtenerBodyJson(): array
{
    $body = file_get_contents('php://input');
    if (empty($body)) {
        return [];
    }
    $datos = json_decode($body, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        responderError('El cuerpo de la petición no es JSON válido.', 400);
    }
    return $datos ?? [];
}

/**
 * Obtiene un parámetro GET saneado.
 *
 * @param string $nombre  Nombre del parámetro
 * @param mixed  $defecto Valor por defecto
 * @return mixed
 */
function obtenerParam(string $nombre, $defecto = null)
{
    return isset($_GET[$nombre]) ? trim(strip_tags($_GET[$nombre])) : $defecto;
}

/**
 * Valida que los campos requeridos estén presentes en los datos.
 *
 * @param array $datos    Datos a validar
 * @param array $campos   Lista de nombres de campos requeridos
 */
function validarCamposRequeridos(array $datos, array $campos): void
{
    $faltantes = [];
    foreach ($campos as $campo) {
        if (!isset($datos[$campo]) || (is_string($datos[$campo]) && trim($datos[$campo]) === '')) {
            $faltantes[] = $campo;
        }
    }
    if (!empty($faltantes)) {
        responderError('Campos requeridos faltantes: ' . implode(', ', $faltantes), 400);
    }
}

/**
 * Valida que el método HTTP sea uno de los permitidos.
 *
 * @param array $metodos Lista de métodos permitidos (GET, POST, PUT, DELETE)
 */
function validarMetodo(array $metodos): void
{
    if (!in_array($_SERVER['REQUEST_METHOD'], $metodos, true)) {
        responderError('Método no permitido. Usar: ' . implode(', ', $metodos), 405);
    }
}

// ============================================================
// JWT (JSON Web Token) — Implementación simple sin librerías
// ============================================================

/**
 * Genera un JWT con los datos del usuario.
 *
 * @param array  $payload Datos a incluir en el token
 * @param string $secreto Clave secreta para firmar
 * @param int    $duracion Duración en segundos
 * @return string Token JWT
 */
function generarJwt(array $payload, string $secreto, int $duracion = 28800): string
{
    $header = base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));

    $payload['iat'] = time();
    $payload['exp'] = time() + $duracion;
    $payloadEncoded = base64UrlEncode(json_encode($payload));

    $firma = base64UrlEncode(
        hash_hmac('sha256', "$header.$payloadEncoded", $secreto, true)
    );

    return "$header.$payloadEncoded.$firma";
}

/**
 * Verifica y decodifica un JWT.
 *
 * @param string $token   Token JWT
 * @param string $secreto Clave secreta
 * @return array|null Payload decodificado o null si es inválido
 */
function verificarJwt(string $token, string $secreto): ?array
{
    $partes = explode('.', $token);
    if (count($partes) !== 3) {
        return null;
    }

    [$header, $payload, $firma] = $partes;

    // Verificar firma
    $firmaEsperada = base64UrlEncode(
        hash_hmac('sha256', "$header.$payload", $secreto, true)
    );

    if (!hash_equals($firmaEsperada, $firma)) {
        return null;
    }

    // Decodificar payload
    $datos = json_decode(base64UrlDecode($payload), true);
    if (!$datos) {
        return null;
    }

    // Verificar expiración
    if (isset($datos['exp']) && $datos['exp'] < time()) {
        return null;
    }

    return $datos;
}

/**
 * Codifica en Base64 URL-safe.
 */
function base64UrlEncode(string $datos): string
{
    return rtrim(strtr(base64_encode($datos), '+/', '-_'), '=');
}

/**
 * Decodifica desde Base64 URL-safe.
 */
function base64UrlDecode(string $datos): string
{
    return base64_decode(strtr($datos, '-_', '+/'));
}

/**
 * Sanea una cadena para prevenir XSS.
 *
 * @param string $texto Texto a sanear
 * @return string Texto saneado
 */
function sanear(string $texto): string
{
    return htmlspecialchars(trim($texto), ENT_QUOTES, 'UTF-8');
}

/**
 * Registra un evento en el log del servidor (para debug).
 *
 * @param string $mensaje Mensaje a registrar
 * @param string $nivel   Nivel: INFO, WARNING, ERROR
 */
function registrarLog(string $mensaje, string $nivel = 'INFO'): void
{
    $config = obtenerConfig();
    if (!($config['app']['debug'] ?? false) && $nivel === 'INFO') {
        return; // En producción solo loguear warnings y errores
    }
    error_log("[Grupo5Dron][$nivel] $mensaje");
}
