<?php
/**
 * API de Cola de Comandos — Grupo 5: Control de Sistemas y Dron
 * 
 * Endpoints:
 *   POST ?action=enviar            — Enviar un comando (ir, rele, aprendizaje)
 *   GET  ?action=estado&id=X       — Consultar estado de un comando
 *   GET  ?action=historial         — Ver historial de comandos
 *   GET  ?action=pendientes        — Ver comandos pendientes
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/auth_middleware.php';

establecerCabecerasSeguridad();
configurarCors();

$action = obtenerParam('action', '');

switch ($action) {
    case 'enviar':
        enviarComando();
        break;
    case 'estado':
        obtenerEstadoComando();
        break;
    case 'historial':
        obtenerHistorial();
        break;
    case 'pendientes':
        obtenerPendientes();
        break;
    default:
        responderError('Acción no válida. Usar: enviar, estado, historial, pendientes.', 400);
}

/**
 * Envía un nuevo comando a la cola para que el ESP32 lo ejecute.
 */
function enviarComando(): void
{
    validarMetodo(['POST']);
    $usuario = verificarAutenticacion();

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['tipo']);

    $tipo = $datos['tipo']; // ir, rele, aprendizaje, config
    $botonId = isset($datos['boton_id']) ? (int) $datos['boton_id'] : null;
    $parametros = $datos['parametros'] ?? null;

    // Validar tipo
    $tiposValidos = ['ir', 'rele', 'aprendizaje', 'config'];
    if (!in_array($tipo, $tiposValidos, true)) {
        responderError('Tipo de comando no válido. Usar: ' . implode(', ', $tiposValidos), 400);
    }

    // Si es comando IR, verificar que el botón tenga código IR
    if ($tipo === 'ir') {
        if (!$botonId) {
            responderError('Se requiere boton_id para comandos IR.', 400);
        }

        try {
            $pdo = obtenerConexion();
            $stmt = $pdo->prepare(
                'SELECT c.id FROM codigos_ir c WHERE c.boton_id = ?'
            );
            $stmt->execute([$botonId]);
            if (!$stmt->fetch()) {
                responderError('El botón no tiene un código IR asignado. Usá el modo aprendizaje primero.', 400);
            }
        } catch (Exception $e) {
            registrarLog('Error verificando código IR: ' . $e->getMessage(), 'ERROR');
            responderError('Error interno.', 500);
        }
    }

    // Si es comando de relé, verificar que esté habilitado
    if ($tipo === 'rele') {
        try {
            $pdo = obtenerConexion();
            $stmt = $pdo->prepare("SELECT valor FROM configuracion WHERE clave = 'rele_habilitado'");
            $stmt->execute();
            $config = $stmt->fetch();
            if (!$config || $config['valor'] !== '1') {
                responderError(
                    'El control de relé está desactivado. ' .
                    'Activalo desde el panel de administración (requiere supervisión docente).',
                    403
                );
            }
        } catch (Exception $e) {
            registrarLog('Error verificando config relé: ' . $e->getMessage(), 'ERROR');
        }
    }

    try {
        $pdo = obtenerConexion();

        $stmt = $pdo->prepare(
            'INSERT INTO cola_comandos (boton_id, tipo, parametros, estado, usuario_id)
             VALUES (?, ?, ?, "pendiente", ?)'
        );
        $stmt->execute([
            $botonId,
            $tipo,
            $parametros ? json_encode($parametros) : null,
            $usuario['id'],
        ]);

        $comandoId = (int) $pdo->lastInsertId();

        responderExito('Comando enviado a la cola.', [
            'comando_id' => $comandoId,
            'estado'     => 'pendiente',
        ], 201);
    } catch (Exception $e) {
        registrarLog('Error enviando comando: ' . $e->getMessage(), 'ERROR');
        responderError('Error al enviar el comando.', 500);
    }
}

/**
 * Consulta el estado actual de un comando.
 */
function obtenerEstadoComando(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    $id = (int) obtenerParam('id', 0);
    if ($id <= 0) {
        responderError('ID de comando requerido.', 400);
    }

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'SELECT cc.*, b.nombre AS boton_nombre, d.nombre AS dispositivo_nombre
             FROM cola_comandos cc
             LEFT JOIN botones b ON cc.boton_id = b.id
             LEFT JOIN dispositivos d ON b.dispositivo_id = d.id
             WHERE cc.id = ?'
        );
        $stmt->execute([$id]);
        $comando = $stmt->fetch();

        if (!$comando) {
            responderError('Comando no encontrado.', 404);
        }

        responderJson(['error' => false, 'comando' => $comando]);
    } catch (Exception $e) {
        registrarLog('Error obteniendo estado: ' . $e->getMessage(), 'ERROR');
        responderError('Error al consultar el estado.', 500);
    }
}

/**
 * Devuelve el historial de comandos ejecutados (últimos 50).
 */
function obtenerHistorial(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    $limite = min((int) obtenerParam('limite', 50), 200);

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->prepare(
            'SELECT * FROM historial ORDER BY ejecutado_en DESC LIMIT ?'
        );
        $stmt->bindValue(1, $limite, PDO::PARAM_INT);
        $stmt->execute();
        $historial = $stmt->fetchAll();

        responderJson(['error' => false, 'historial' => $historial]);
    } catch (Exception $e) {
        registrarLog('Error obteniendo historial: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener el historial.', 500);
    }
}

/**
 * Devuelve los comandos pendientes (para monitoreo desde la app).
 */
function obtenerPendientes(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    try {
        $pdo = obtenerConexion();
        $stmt = $pdo->query(
            'SELECT cc.*, b.nombre AS boton_nombre, d.nombre AS dispositivo_nombre
             FROM cola_comandos cc
             LEFT JOIN botones b ON cc.boton_id = b.id
             LEFT JOIN dispositivos d ON b.dispositivo_id = d.id
             WHERE cc.estado IN ("pendiente", "enviado")
             ORDER BY cc.creado_en ASC
             LIMIT 20'
        );
        $pendientes = $stmt->fetchAll();

        responderJson(['error' => false, 'pendientes' => $pendientes]);
    } catch (Exception $e) {
        registrarLog('Error obteniendo pendientes: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener comandos pendientes.', 500);
    }
}
