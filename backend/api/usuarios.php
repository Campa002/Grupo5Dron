<?php
/**
 * API de Gestión de Usuarios — Grupo 5: Control de Sistemas y Dron
 * 
 * Endpoints (solo admin):
 *   GET    ?action=listar             — Listar todos los usuarios
 *   GET    ?action=obtener&id=X       — Obtener un usuario
 *   PUT    ?action=actualizar&id=X    — Actualizar usuario (nombre, rol, activo)
 *   DELETE ?action=eliminar&id=X      — Desactivar/eliminar usuario
 *   PUT    ?action=cambiar_password&id=X — Cambiar contraseña
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/auth_middleware.php';

establecerCabecerasSeguridad();
configurarCors();

$action = obtenerParam('action', 'listar');

switch ($action) {
    case 'listar':
        listarUsuarios();
        break;
    case 'obtener':
        obtenerUsuario();
        break;
    case 'actualizar':
        actualizarUsuario();
        break;
    case 'eliminar':
        eliminarUsuario();
        break;
    case 'cambiar_password':
        cambiarPassword();
        break;
    default:
        responderError('Acción no válida.', 400);
}

/**
 * Lista todos los usuarios (sin mostrar hashes de contraseña).
 */
function listarUsuarios(): void
{
    validarMetodo(['GET']);
    verificarAdmin();

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->query(
            'SELECT id, nombre, email, rol, activo, intentos_login, bloqueado_hasta, creado_en, actualizado_en
             FROM usuarios ORDER BY creado_en DESC'
        );
        $usuarios = $stmt->fetchAll();

        responderJson(['error' => false, 'usuarios' => $usuarios]);
    } catch (Exception $e) {
        registrarLog('Error listando usuarios: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener usuarios.', 500);
    }
}

/**
 * Obtiene un usuario específico.
 */
function obtenerUsuario(): void
{
    validarMetodo(['GET']);
    verificarAdmin();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de usuario requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'SELECT id, nombre, email, rol, activo, intentos_login, bloqueado_hasta, creado_en
             FROM usuarios WHERE id = ?'
        );
        $stmt->execute([$id]);
        $usuario = $stmt->fetch();

        if (!$usuario) {
            responderError('Usuario no encontrado.', 404);
        }

        responderJson(['error' => false, 'usuario' => $usuario]);
    } catch (Exception $e) {
        registrarLog('Error obteniendo usuario: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener el usuario.', 500);
    }
}

/**
 * Actualiza los datos de un usuario (nombre, rol, activo).
 */
function actualizarUsuario(): void
{
    validarMetodo(['PUT']);
    verificarAdmin();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de usuario requerido.', 400);
    }

    $datos = obtenerBodyJson();

    try {
        $pdo = obtenerConexion();

        $campos = [];
        $valores = [];

        if (isset($datos['nombre'])) {
            $campos[] = 'nombre = ?';
            $valores[] = sanear($datos['nombre']);
        }
        if (isset($datos['email'])) {
            $campos[] = 'email = ?';
            $valores[] = strtolower(trim($datos['email']));
        }
        if (isset($datos['rol'])) {
            $rolesValidos = ['admin', 'docente', 'usuario'];
            if (!in_array($datos['rol'], $rolesValidos, true)) {
                responderError('Rol no válido.', 400);
            }
            $campos[] = 'rol = ?';
            $valores[] = $datos['rol'];
        }
        if (isset($datos['activo'])) {
            $campos[] = 'activo = ?';
            $valores[] = (int) $datos['activo'];
        }

        if (empty($campos)) {
            responderError('No se proporcionaron campos válidos.', 400);
        }

        $valores[] = $id;
        $stmt = $pdo->prepare('UPDATE usuarios SET ' . implode(', ', $campos) . ' WHERE id = ?');
        $stmt->execute($valores);

        if ($stmt->rowCount() === 0) {
            responderError('Usuario no encontrado o sin cambios.', 404);
        }

        responderExito('Usuario actualizado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error actualizando usuario: ' . $e->getMessage(), 'ERROR');
        responderError('Error al actualizar el usuario.', 500);
    }
}

/**
 * Elimina (desactiva) un usuario.
 */
function eliminarUsuario(): void
{
    validarMetodo(['DELETE']);
    $admin = verificarAdmin();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de usuario requerido.', 400);
    }

    // No permitir que el admin se elimine a sí mismo
    if ($id === (int) $admin['id']) {
        responderError('No podés eliminar tu propia cuenta.', 400);
    }

    try {
        $pdo = obtenerConexion();
        // Desactivar en lugar de eliminar (preservar historial)
        $stmt = $pdo->prepare('UPDATE usuarios SET activo = 0 WHERE id = ?');
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            responderError('Usuario no encontrado.', 404);
        }

        responderExito('Usuario desactivado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error eliminando usuario: ' . $e->getMessage(), 'ERROR');
        responderError('Error al eliminar el usuario.', 500);
    }
}

/**
 * Cambia la contraseña de un usuario (admin).
 */
function cambiarPassword(): void
{
    validarMetodo(['PUT']);
    verificarAdmin();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de usuario requerido.', 400);
    }

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['password']);

    $password = $datos['password'];
    if (strlen($password) < 6) {
        responderError('La contraseña debe tener al menos 6 caracteres.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?');
        $stmt->execute([$hash, $id]);

        if ($stmt->rowCount() === 0) {
            responderError('Usuario no encontrado.', 404);
        }

        responderExito('Contraseña actualizada exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error cambiando contraseña: ' . $e->getMessage(), 'ERROR');
        responderError('Error al cambiar la contraseña.', 500);
    }
}
