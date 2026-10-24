<?php
/**
 * API de Perfiles de Dron — Grupo 5: Control de Sistemas y Dron
 * 
 * Endpoints:
 *   GET    ?action=listar           — Listar perfiles de dron
 *   GET    ?action=obtener&id=X     — Obtener un perfil
 *   POST   ?action=crear            — Crear perfil (admin/docente)
 *   PUT    ?action=actualizar&id=X  — Actualizar perfil
 *   DELETE ?action=eliminar&id=X    — Eliminar perfil (admin)
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
        listarPerfiles();
        break;
    case 'obtener':
        obtenerPerfil();
        break;
    case 'crear':
        crearPerfil();
        break;
    case 'actualizar':
        actualizarPerfil();
        break;
    case 'eliminar':
        eliminarPerfil();
        break;
    default:
        responderError('Acción no válida.', 400);
}

/**
 * Lista todos los perfiles de dron.
 */
function listarPerfiles(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->query('SELECT * FROM perfiles_dron ORDER BY nombre ASC');
        $perfiles = $stmt->fetchAll();

        // Parsear campos JSON
        foreach ($perfiles as &$perfil) {
            if ($perfil['plantilla_comandos']) {
                $perfil['plantilla_comandos'] = json_decode($perfil['plantilla_comandos'], true);
            }
            if ($perfil['configuracion']) {
                $perfil['configuracion'] = json_decode($perfil['configuracion'], true);
            }
        }

        responderJson(['error' => false, 'perfiles' => $perfiles]);
    } catch (Exception $e) {
        registrarLog('Error listando perfiles: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener perfiles.', 500);
    }
}

/**
 * Obtiene un perfil específico.
 */
function obtenerPerfil(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de perfil requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare('SELECT * FROM perfiles_dron WHERE id = ?');
        $stmt->execute([$id]);
        $perfil = $stmt->fetch();

        if (!$perfil) {
            responderError('Perfil no encontrado.', 404);
        }

        if ($perfil['plantilla_comandos']) {
            $perfil['plantilla_comandos'] = json_decode($perfil['plantilla_comandos'], true);
        }
        if ($perfil['configuracion']) {
            $perfil['configuracion'] = json_decode($perfil['configuracion'], true);
        }

        responderJson(['error' => false, 'perfil' => $perfil]);
    } catch (Exception $e) {
        registrarLog('Error obteniendo perfil: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener el perfil.', 500);
    }
}

/**
 * Crea un nuevo perfil de dron (admin/docente).
 */
function crearPerfil(): void
{
    validarMetodo(['POST']);
    verificarDocente();

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['nombre', 'tipo_adaptador', 'ip']);

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'INSERT INTO perfiles_dron (nombre, tipo_adaptador, ip, puerto_comando, puerto_video, 
             protocolo, url_video, formato_video, plantilla_comandos, configuracion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            sanear($datos['nombre']),
            sanear($datos['tipo_adaptador']),
            sanear($datos['ip']),
            (int) ($datos['puerto_comando'] ?? 8889),
            isset($datos['puerto_video']) ? (int) $datos['puerto_video'] : null,
            sanear($datos['protocolo'] ?? 'UDP'),
            isset($datos['url_video']) ? sanear($datos['url_video']) : null,
            isset($datos['formato_video']) ? sanear($datos['formato_video']) : null,
            isset($datos['plantilla_comandos']) ? json_encode($datos['plantilla_comandos']) : null,
            isset($datos['configuracion']) ? json_encode($datos['configuracion']) : null,
        ]);

        responderExito('Perfil de dron creado.', [
            'perfil_id' => (int) $pdo->lastInsertId(),
        ], 201);
    } catch (Exception $e) {
        registrarLog('Error creando perfil: ' . $e->getMessage(), 'ERROR');
        responderError('Error al crear el perfil.', 500);
    }
}

/**
 * Actualiza un perfil de dron (admin/docente).
 */
function actualizarPerfil(): void
{
    validarMetodo(['PUT']);
    verificarDocente();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de perfil requerido.', 400);
    }

    $datos = obtenerBodyJson();

    try {
        $pdo = obtenerConexion();

        $campos = [];
        $valores = [];
        $permitidos = ['nombre', 'tipo_adaptador', 'ip', 'puerto_comando', 'puerto_video',
                        'protocolo', 'url_video', 'formato_video', 'activo'];
        $camposJson = ['plantilla_comandos', 'configuracion'];

        foreach ($permitidos as $campo) {
            if (isset($datos[$campo])) {
                $campos[] = "$campo = ?";
                if (in_array($campo, ['puerto_comando', 'puerto_video', 'activo'])) {
                    $valores[] = (int) $datos[$campo];
                } else {
                    $valores[] = sanear((string) $datos[$campo]);
                }
            }
        }

        foreach ($camposJson as $campo) {
            if (isset($datos[$campo])) {
                $campos[] = "$campo = ?";
                $valores[] = json_encode($datos[$campo]);
            }
        }

        if (empty($campos)) {
            responderError('No se proporcionaron campos válidos.', 400);
        }

        $valores[] = $id;
        $stmt = $pdo->prepare('UPDATE perfiles_dron SET ' . implode(', ', $campos) . ' WHERE id = ?');
        $stmt->execute($valores);

        responderExito('Perfil actualizado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error actualizando perfil: ' . $e->getMessage(), 'ERROR');
        responderError('Error al actualizar el perfil.', 500);
    }
}

/**
 * Elimina un perfil de dron (solo admin).
 */
function eliminarPerfil(): void
{
    validarMetodo(['DELETE']);
    verificarAdmin();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de perfil requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare('DELETE FROM perfiles_dron WHERE id = ?');
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            responderError('Perfil no encontrado.', 404);
        }

        responderExito('Perfil eliminado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error eliminando perfil: ' . $e->getMessage(), 'ERROR');
        responderError('Error al eliminar el perfil.', 500);
    }
}
