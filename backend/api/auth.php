<?php
/**
 * API de Autenticación — Grupo 5: Control de Sistemas y Dron
 * 
 * Endpoints:
 *   POST ?action=login      — Iniciar sesión
 *   POST ?action=registro   — Registrar usuario (solo admin)
 *   GET  ?action=sesion      — Obtener datos de la sesión actual
 *   POST ?action=logout      — Cerrar sesión (invalidar token en cliente)
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/auth_middleware.php';

// Cabeceras de seguridad y CORS
establecerCabecerasSeguridad();
configurarCors();

$action = obtenerParam('action', '');

switch ($action) {
    case 'login':
        loginUsuario();
        break;
    case 'registro':
        registrarUsuario();
        break;
    case 'sesion':
        obtenerSesion();
        break;
    case 'logout':
        cerrarSesion();
        break;
    default:
        responderError('Acción no válida. Usar: login, registro, sesion, logout.', 400);
}

/**
 * Inicia sesión y devuelve un JWT.
 */
function loginUsuario(): void
{
    validarMetodo(['POST']);
    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['email', 'password']);

    $email = strtolower(trim($datos['email']));
    $password = $datos['password'];

    // Verificar rate limit
    if (!verificarRateLimit($email)) {
        responderError('Demasiados intentos fallidos. Intentá de nuevo en unos minutos.', 429);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'SELECT id, nombre, email, password_hash, rol, activo, debe_cambiar_password FROM usuarios WHERE email = ?'
        );
        $stmt->execute([$email]);
        $usuario = $stmt->fetch();

        // Verificar credenciales
        if (!$usuario || !password_verify($password, $usuario['password_hash'])) {
            if ($usuario) {
                registrarIntentoFallido($email);
            }
            responderError('Email o contraseña incorrectos.', 401);
            return;
        }

        // Verificar que esté activo
        if (!$usuario['activo']) {
            responderError('Tu cuenta está desactivada. Contactá al administrador.', 403);
            return;
        }

        // Login exitoso: resetear intentos y generar JWT
        resetearIntentosLogin($email);

        $config = obtenerConfig();
        $token = generarJwt(
            [
                'usuario_id' => $usuario['id'],
                'email'      => $usuario['email'],
                'rol'        => $usuario['rol'],
            ],
            $config['seguridad']['jwt_secreto'],
            $config['seguridad']['jwt_duracion']
        );

        responderExito('Inicio de sesión exitoso.', [
            'token' => $token,
            'usuario' => [
                'id'                    => (int) $usuario['id'],
                'nombre'                => $usuario['nombre'],
                'email'                 => $usuario['email'],
                'rol'                   => $usuario['rol'],
                'debe_cambiar_password' => (bool) ($usuario['debe_cambiar_password'] ?? false),
            ],
        ]);
    } catch (Exception $e) {
        registrarLog('Error en login: ' . $e->getMessage(), 'ERROR');
        responderError('Error interno del servidor.', 500);
    }
}

/**
 * Registra un nuevo usuario (solo administradores).
 */
function registrarUsuario(): void
{
    validarMetodo(['POST']);
    $admin = verificarAdmin();

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['nombre', 'email', 'password']);

    $nombre = sanear($datos['nombre']);
    $email = strtolower(trim($datos['email']));
    $password = $datos['password'];
    $rol = $datos['rol'] ?? 'usuario';

    // Validar email
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        responderError('El email no tiene un formato válido.', 400);
    }

    // Validar contraseña (mínimo 6 caracteres)
    if (strlen($password) < 6) {
        responderError('La contraseña debe tener al menos 6 caracteres.', 400);
    }

    // Validar rol
    $rolesValidos = ['admin', 'docente', 'usuario'];
    if (!in_array($rol, $rolesValidos, true)) {
        responderError('Rol no válido. Usar: ' . implode(', ', $rolesValidos), 400);
    }

    try {
        $pdo = obtenerConexion();

        // Verificar que el email no exista
        $stmt = $pdo->prepare('SELECT id FROM usuarios WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            responderError('Ya existe un usuario con ese email.', 409);
        }

        // Crear usuario
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare(
            'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$nombre, $email, $hash, $rol]);

        responderExito('Usuario creado exitosamente.', [
            'usuario_id' => (int) $pdo->lastInsertId(),
        ], 201);
    } catch (Exception $e) {
        registrarLog('Error en registro: ' . $e->getMessage(), 'ERROR');
        responderError('Error interno del servidor.', 500);
    }
}

/**
 * Devuelve los datos de la sesión actual (verificando el JWT).
 */
function obtenerSesion(): void
{
    validarMetodo(['GET']);
    $usuario = verificarAutenticacion();

    responderExito('Sesión activa.', [
        'usuario' => [
            'id'                    => (int) $usuario['id'],
            'nombre'                => $usuario['nombre'],
            'email'                 => $usuario['email'],
            'rol'                   => $usuario['rol'],
            'debe_cambiar_password' => (bool) ($usuario['debe_cambiar_password'] ?? false),
        ],
    ]);
}

/**
 * Cierra sesión (el token se invalida en el cliente).
 */
function cerrarSesion(): void
{
    validarMetodo(['POST']);
    // JWT es stateless: el cliente elimina el token
    responderExito('Sesión cerrada exitosamente.');
}
