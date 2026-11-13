<?php
/**
 * API de las acciones de cada aparato (y sus códigos IR) — Grupo 5: Control de Sistemas y Dron
 *
 * El aula controla solo el proyector y el aire acondicionado por infrarrojo (las luces van por el relé).
 * Las acciones son fijas (schema.sql): encender, apagar y, en el aire, subir y bajar la temperatura.
 * Los códigos se aprenden con el ESP32 (comandos.php?action=enviar con tipo "aprendizaje"; el ESP32 los
 * sube con esp32.php?action=codigo_ir).
 *
 * Endpoints:
 *   GET    ?action=listar&dispositivo_id=X   — Acciones de un aparato, con su código IR (si tiene)
 *   DELETE ?action=eliminar_codigo_ir&id=X    — Borrar el código aprendido de una acción (docente o admin)
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
    case 'eliminar_codigo_ir':
        eliminarCodigoIr();
        break;
    default:
        responderError('Acción no válida. Usar: listar, eliminar_codigo_ir.', 400);
}

/**
 * Lista las acciones de un aparato con su código IR (sin la trama cruda, que puede ser larga).
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
            'SELECT b.id, b.dispositivo_id, b.accion, b.nombre, b.icono, b.orden,
                    c.id AS codigo_ir_id, c.protocolo, c.codigo, c.bits,
                    (c.raw_data IS NOT NULL) AS tiene_crudo, c.actualizado_en AS codigo_actualizado_en
             FROM botones b
             LEFT JOIN codigos_ir c ON c.boton_id = b.id
             WHERE b.dispositivo_id = ? AND b.activo = 1
             ORDER BY b.orden ASC'
        );
        $stmt->execute([$dispositivoId]);
        $botones = $stmt->fetchAll();

        responderJson(['error' => false, 'botones' => $botones]);
    } catch (Exception $e) {
        registrarLog('Error listando botones: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener las acciones.', 500);
    }
}

/**
 * Borra el código IR de una acción (docente o admin).
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

        responderExito('Código IR borrado.');
    } catch (Exception $e) {
        registrarLog('Error eliminando código IR: ' . $e->getMessage(), 'ERROR');
        responderError('Error al borrar el código IR.', 500);
    }
}
