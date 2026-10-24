<?php
/**
 * API de Botones / Acciones IR — Grupo 5: Control de Sistemas y Dron
 * 
 * Endpoints:
 *   GET    ?action=listar&dispositivo_id=X   — Listar botones de un dispositivo
 *   POST   ?action=crear                      — Crear botón (admin/docente)
 *   PUT    ?action=actualizar&id=X            — Actualizar botón
 *   DELETE ?action=eliminar&id=X              — Eliminar botón (admin)
 *   POST   ?action=guardar_codigo_ir          — Guardar código IR capturado
 *   DELETE ?action=eliminar_codigo_ir&id=X    — Eliminar código IR de un botón
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
        listarBotones();
        break;
    case 'crear':
        crearBoton();
        break;
    case 'actualizar':
        actualizarBoton();
        break;
    case 'eliminar':
        eliminarBoton();
        break;
    case 'guardar_codigo_ir':
        guardarCodigoIr();
        break;
    case 'eliminar_codigo_ir':
        eliminarCodigoIr();
        break;
    default:
        responderError('Acción no válida.', 400);
}

/**
 * Lista los botones de un dispositivo con su código IR asociado.
 */
function listarBotones(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    $dispositivoId = (int) obtenerParam('dispositivo_id', 0);
    if ($dispositivoId <= 0) {
        responderError('Se requiere dispositivo_id.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'SELECT b.*, c.id AS codigo_ir_id, c.protocolo, c.codigo, c.bits,
                    c.raw_data, c.frecuencia, c.descripcion AS codigo_descripcion
             FROM botones b
             LEFT JOIN codigos_ir c ON c.boton_id = b.id
             WHERE b.dispositivo_id = ?
             ORDER BY b.orden ASC'
        );
        $stmt->execute([$dispositivoId]);
        $botones = $stmt->fetchAll();

        responderJson(['error' => false, 'botones' => $botones]);
    } catch (Exception $e) {
        registrarLog('Error listando botones: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener botones.', 500);
    }
}

/**
 * Crea un nuevo botón para un dispositivo (admin/docente).
 */
function crearBoton(): void
{
    validarMetodo(['POST']);
    verificarDocente();

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['dispositivo_id', 'nombre']);

    $dispositivoId = (int) $datos['dispositivo_id'];
    $nombre = sanear($datos['nombre']);
    $icono = sanear($datos['icono'] ?? 'boton');
    $orden = (int) ($datos['orden'] ?? 0);

    try {
        $pdo = obtenerConexion();

        // Verificar que el dispositivo exista
        $stmt = $pdo->prepare('SELECT id FROM dispositivos WHERE id = ?');
        $stmt->execute([$dispositivoId]);
        if (!$stmt->fetch()) {
            responderError('Dispositivo no encontrado.', 404);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO botones (dispositivo_id, nombre, icono, orden) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$dispositivoId, $nombre, $icono, $orden]);

        responderExito('Botón creado exitosamente.', [
            'boton_id' => (int) $pdo->lastInsertId(),
        ], 201);
    } catch (Exception $e) {
        registrarLog('Error creando botón: ' . $e->getMessage(), 'ERROR');
        responderError('Error al crear el botón.', 500);
    }
}

/**
 * Actualiza un botón existente (admin/docente).
 */
function actualizarBoton(): void
{
    validarMetodo(['PUT']);
    verificarDocente();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de botón requerido.', 400);
    }

    $datos = obtenerBodyJson();

    try {
        $pdo = obtenerConexion();

        $campos = [];
        $valores = [];
        $permitidos = ['nombre', 'icono', 'orden', 'activo'];

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
        $stmt = $pdo->prepare('UPDATE botones SET ' . implode(', ', $campos) . ' WHERE id = ?');
        $stmt->execute($valores);

        if ($stmt->rowCount() === 0) {
            responderError('Botón no encontrado.', 404);
        }

        responderExito('Botón actualizado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error actualizando botón: ' . $e->getMessage(), 'ERROR');
        responderError('Error al actualizar el botón.', 500);
    }
}

/**
 * Elimina un botón y su código IR asociado (admin).
 */
function eliminarBoton(): void
{
    validarMetodo(['DELETE']);
    verificarAdmin();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de botón requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare('DELETE FROM botones WHERE id = ?');
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            responderError('Botón no encontrado.', 404);
        }

        responderExito('Botón eliminado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error eliminando botón: ' . $e->getMessage(), 'ERROR');
        responderError('Error al eliminar el botón.', 500);
    }
}

/**
 * Guarda un código IR capturado y lo asocia a un botón.
 * Puede ser llamado desde la app (admin) o desde el ESP32 tras captura.
 */
function guardarCodigoIr(): void
{
    validarMetodo(['POST']);

    // Verificar si es el ESP32 o un admin
    $esEsp32 = !empty($_SERVER['HTTP_X_ESP32_TOKEN']);
    if ($esEsp32) {
        verificarAutenticacionEsp32();
    } else {
        verificarDocente();
    }

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['boton_id', 'protocolo']);

    $botonId = (int) $datos['boton_id'];
    $protocolo = strtoupper(sanear($datos['protocolo']));
    $codigo = isset($datos['codigo']) ? sanear($datos['codigo']) : null;
    $bits = isset($datos['bits']) ? (int) $datos['bits'] : null;
    $rawData = isset($datos['raw_data']) ? $datos['raw_data'] : null;
    $frecuencia = (int) ($datos['frecuencia'] ?? 38000);
    $descripcion = isset($datos['descripcion']) ? sanear($datos['descripcion']) : null;

    // Si es raw, guardar como JSON
    if (is_array($rawData)) {
        $rawData = json_encode($rawData);
    }

    try {
        $pdo = obtenerConexion();

        // Verificar que el botón exista
        $stmt = $pdo->prepare('SELECT id FROM botones WHERE id = ?');
        $stmt->execute([$botonId]);
        if (!$stmt->fetch()) {
            responderError('Botón no encontrado.', 404);
        }

        // Insertar o actualizar (un botón tiene un solo código IR)
        $stmt = $pdo->prepare(
            'INSERT INTO codigos_ir (boton_id, protocolo, codigo, bits, raw_data, frecuencia, descripcion)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                protocolo = VALUES(protocolo),
                codigo = VALUES(codigo),
                bits = VALUES(bits),
                raw_data = VALUES(raw_data),
                frecuencia = VALUES(frecuencia),
                descripcion = VALUES(descripcion)'
        );
        $stmt->execute([$botonId, $protocolo, $codigo, $bits, $rawData, $frecuencia, $descripcion]);

        responderExito('Código IR guardado exitosamente.', [
            'codigo_ir_id' => (int) $pdo->lastInsertId(),
        ]);
    } catch (Exception $e) {
        registrarLog('Error guardando código IR: ' . $e->getMessage(), 'ERROR');
        responderError('Error al guardar el código IR.', 500);
    }
}

/**
 * Elimina un código IR de un botón (admin/docente).
 */
function eliminarCodigoIr(): void
{
    validarMetodo(['DELETE']);
    verificarDocente();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de código IR requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare('DELETE FROM codigos_ir WHERE id = ?');
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            responderError('Código IR no encontrado.', 404);
        }

        responderExito('Código IR eliminado exitosamente.');
    } catch (Exception $e) {
        registrarLog('Error eliminando código IR: ' . $e->getMessage(), 'ERROR');
        responderError('Error al eliminar el código IR.', 500);
    }
}
