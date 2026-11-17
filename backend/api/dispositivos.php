<?php
/**
 * API de los aparatos del aula — Grupo 5: Control de Sistemas y Dron
 *
 * El aula controla solo dos aparatos por infrarrojo: el proyector y el aire acondicionado (las luces
 * van por el relé). Son fijos (schema.sql): no se crean ni se borran desde la app.
 *
 * Endpoints:
 *   GET ?action=listar          — Los aparatos con sus acciones y si tienen código aprendido
 *   GET ?action=obtener&id=X    — Un aparato con sus acciones
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
    default:
        responderError('Acción no válida. Usar: listar, obtener.', 400);
}

/** Acciones de un aparato con el resumen de su código IR. */
function accionesDe(PDO $pdo, int $dispositivoId): array
{
    $stmt = $pdo->prepare(
        'SELECT b.id, b.accion, b.nombre, b.icono, b.orden,
                CASE WHEN c.id IS NOT NULL THEN 1 ELSE 0 END AS tiene_codigo_ir,
                c.id AS codigo_ir_id, c.protocolo, c.bits, c.actualizado_en AS codigo_actualizado_en
         FROM botones b
         LEFT JOIN codigos_ir c ON c.boton_id = b.id
         WHERE b.dispositivo_id = ? AND b.activo = 1
         ORDER BY b.orden ASC'
    );
    $stmt->execute([$dispositivoId]);
    $botones = $stmt->fetchAll();
    foreach ($botones as &$b) {
        $b['id'] = (int) $b['id'];
        $b['tiene_codigo_ir'] = (bool) $b['tiene_codigo_ir'];
        $b['bits'] = $b['bits'] === null ? null : (int) $b['bits'];
    }
    return $botones;
}

function listarDispositivos(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->query(
            'SELECT id, nombre, tipo, icono, orden
             FROM dispositivos
             WHERE activo = 1
             ORDER BY orden ASC, nombre ASC'
        );
        $dispositivos = $stmt->fetchAll();
        foreach ($dispositivos as &$disp) {
            $disp['id'] = (int) $disp['id'];
            $disp['botones'] = accionesDe($pdo, $disp['id']);
        }

        responderJson(['error' => false, 'dispositivos' => $dispositivos]);
    } catch (Exception $e) {
        registrarLog('Error listando dispositivos: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener los aparatos.', 500);
    }
}

function obtenerDispositivo(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de aparato requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare('SELECT id, nombre, tipo, icono, orden FROM dispositivos WHERE id = ? AND activo = 1');
        $stmt->execute([$id]);
        $dispositivo = $stmt->fetch();
        if (!$dispositivo) {
            responderError('Aparato no encontrado.', 404);
        }
        $dispositivo['id'] = (int) $dispositivo['id'];
        $dispositivo['botones'] = accionesDe($pdo, $dispositivo['id']);

        responderJson(['error' => false, 'dispositivo' => $dispositivo]);
    } catch (Exception $e) {
        registrarLog('Error obteniendo dispositivo: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener el aparato.', 500);
    }
}
