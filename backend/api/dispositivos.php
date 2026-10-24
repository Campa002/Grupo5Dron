<?php
/**
 * API de Dispositivos del Aula — Grupo 5: Control de Sistemas y Dron
 * 
 * Endpoints:
 *   GET    ?action=listar           — Listar todos los dispositivos
 *   GET    ?action=obtener&id=X     — Obtener un dispositivo con sus botones
 *   POST   ?action=crear            — Crear dispositivo (admin/docente)
 *   PUT    ?action=actualizar&id=X  — Actualizar dispositivo (admin/docente)
 *   DELETE ?action=eliminar&id=X    — Eliminar dispositivo (admin)
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
        listarDispositivos();
        break;
    case 'obtener':
        obtenerDispositivo();
        break;
    case 'crear':
        crearDispositivo();
        break;
    case 'actualizar':
        actualizarDispositivo();
        break;
    case 'eliminar':
        eliminarDispositivo();
        break;
    default:
        responderError('Acción no válida.', 400);
}

/**
 * Lista todos los dispositivos activos con sus botones y estado de código IR.
 */
function listarDispositivos(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    try {
        $pdo = obtenerConexion();

        // Obtener dispositivos ordenados
        $stmt = $pdo->query(
            'SELECT id, nombre, tipo, icono, orden, activo, creado_en 
             FROM dispositivos 
             ORDER BY orden ASC, nombre ASC'
        );
        $dispositivos = $stmt->fetchAll();

        // Para cada dispositivo, obtener sus botones con estado de código IR
        foreach ($dispositivos as &$disp) {
            $stmtBotones = $pdo->prepare(
                'SELECT b.id, b.nombre, b.icono, b.orden, b.activo,
                        CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END AS tiene_codigo_ir,
                        c.protocolo
                 FROM botones b
                 LEFT JOIN codigos_ir c ON c.boton_id = b.id
                 WHERE b.dispositivo_id = ?
                 ORDER BY b.orden ASC'
            );
            $stmtBotones->execute([$disp['id']]);
            $disp['botones'] = $stmtBotones->fetchAll();
            $disp['id'] = (int) $disp['id'];
            $disp['activo'] = (bool) $disp['activo'];
        }

        responderJson(['error' => false, 'dispositivos' => $dispositivos]);
    } catch (Exception $e) {
        registrarLog('Error listando dispositivos: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener dispositivos.', 500);
    }
}

/**
 * Obtiene un dispositivo específico con sus botones y códigos IR.
 */
function obtenerDispositivo(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de dispositivo requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();

        $stmt = $pdo->prepare('SELECT * FROM dispositivos WHERE id = ?');
        $stmt->execute([$id]);
        $dispositivo = $stmt->fetch();

        if (!$dispositivo) {
            responderError('Dispositivo no encontrado.', 404);
        }

        // Obtener botones con códigos IR completos
        $stmtBotones = $pdo->prepare(
            'SELECT b.*, c.id AS codigo_ir_id, c.protocolo, c.codigo, c.bits, 
                    c.raw_data, c.frecuencia, c.descripcion AS codigo_descripcion
             FROM botones b
             LEFT JOIN codigos_ir c ON c.boton_id = b.id
             WHERE b.dispositivo_id = ?
             ORDER BY b.orden ASC'
        );
        $stmtBotones->execute([$id]);
        $dispositivo['botones'] = $stmtBotones->fetchAll();

        responderJson(['error' => false, 'dispositivo' => $dispositivo]);
    } catch (Exception $e) {
        registrarLog('Error obteniendo dispositivo: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener el dispositivo.', 500);
    }
}

/**
 * Crea un nuevo dispositivo (solo admin/docente).
 */
function crearDispositivo(): void
{
    validarMetodo(['POST']);
    verificarDocente();

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['nombre', 'tipo']);

    $nombre = sanear($datos['nombre']);
    $tipo = sanear($datos['tipo']);
    $icono = sanear($datos['icono'] ?? 'dispositivo');
    $orden = (int) ($datos['orden'] ?? 0);

    // Validar tipo
    $tiposValidos = ['luz', 'ventilador', 'aire', 'proyector', 'otro'];
    if (!in_array($tipo, $tiposValidos, true)) {
        responderError('Tipo no válido. Usar: ' . implode(', ', $tiposValidos), 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'INSERT INTO dispositivos (nombre, tipo, icono, orden) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$nombre, $tipo, $icono, $orden]);

        responderExito('Dispositivo creado exitosamente.', [
            'dispositivo_id' => (int) $pdo->lastInsertId(),
        ], 201);
    } catch (Exception $e) {
        registrarLog('Error creando dispositivo: ' . $e->getMessage(), 'ERROR');
        responderError('Error al crear el dispositivo.', 500);
    }
}

/**
 * Actualiza un dispositivo existente (solo admin/docente).
 */
function actualizarDispositivo(): void
{
    validarMetodo(['PUT']);
    verificarDocente();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de dispositivo requerido.', 400);
    }

    $datos = obtenerBodyJson();
    if (empty($datos)) {
        responderError('No se proporcionaron datos para actualizar.', 400);
    }

    try {
        $pdo = obtenerConexion();

        // Verificar que existe
        $stmt = $pdo->prepare('SELECT id FROM dispositivos WHERE id = ?');
        $stmt->execute([$id]);
        if (!$stmt->fetch()) {
            responderError('Dispositivo no encontrado.', 404);
        }

        // Construir UPDATE dinámico
        $campos = [];
        $valores = [];
        $permitidos = ['nombre', 'tipo', 'icono', 'orden', 'activo'];

        foreach ($permitidos as $campo) {
            if (isset($datos[$campo])) {
                $campos[] = "$campo = ?";
                $valores[] = $campo === 'activo' ? (int) $datos[$campo] : sanear((string) $datos[$campo]);
            }
        }

        if (empty($campos)) {
            responderError('No se proporcionaron campos válidos.', 400);
        }

        $valores[] = $id;
        $sql = 'UPDATE dispositivos SET ' . implode(', ', $campos) . ' WHERE id = ?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($valores);

        responderExito('Dispositivo actualizado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error actualizando dispositivo: ' . $e->getMessage(), 'ERROR');
        responderError('Error al actualizar el dispositivo.', 500);
    }
}

/**
 * Elimina un dispositivo (solo admin). Elimina en cascada botones y códigos IR.
 */
function eliminarDispositivo(): void
{
    validarMetodo(['DELETE']);
    verificarAdmin();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de dispositivo requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare('DELETE FROM dispositivos WHERE id = ?');
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            responderError('Dispositivo no encontrado.', 404);
        }

        responderExito('Dispositivo eliminado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error eliminando dispositivo: ' . $e->getMessage(), 'ERROR');
        responderError('Error al eliminar el dispositivo.', 500);
    }
}
