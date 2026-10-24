<?php
/**
 * API para el ESP32 — Grupo 5: Control de Sistemas y Dron
 * 
 * Endpoints dedicados al ESP32 (autenticación por token de dispositivo):
 *   GET  ?action=poll          — Obtener comandos pendientes
 *   POST ?action=heartbeat     — Enviar latido (en línea)
 *   POST ?action=resultado     — Reportar resultado de un comando
 *   POST ?action=codigo_ir     — Enviar código IR capturado en modo aprendizaje
 *   GET  ?action=estado        — Obtener estado general del ESP32
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/auth_middleware.php';

establecerCabecerasSeguridad();
configurarCors();

$action = obtenerParam('action', '');

// El endpoint de estado puede ser consultado por usuarios autenticados
if ($action === 'estado') {
    obtenerEstadoEsp32();
} else {
    // Todos los demás requieren token del ESP32
    verificarAutenticacionEsp32();

    switch ($action) {
        case 'poll':
            pollComandos();
            break;
        case 'heartbeat':
            registrarHeartbeat();
            break;
        case 'resultado':
            reportarResultado();
            break;
        case 'codigo_ir':
            recibirCodigoIr();
            break;
        default:
            responderError('Acción no válida. Usar: poll, heartbeat, resultado, codigo_ir, estado.', 400);
    }
}

/**
 * El ESP32 solicita comandos pendientes (polling).
 * Devuelve hasta N comandos y los marca como "enviado".
 */
function pollComandos(): void
{
    validarMetodo(['GET']);

    $config = obtenerConfig();
    $maxComandos = $config['esp32']['max_comandos_poll'] ?? 5;

    try {
        $pdo = obtenerConexion();

        // Obtener comandos pendientes con datos del código IR
        $stmt = $pdo->prepare(
            'SELECT cc.id, cc.boton_id, cc.tipo, cc.parametros,
                    c.protocolo, c.codigo, c.bits, c.raw_data, c.frecuencia
             FROM cola_comandos cc
             LEFT JOIN codigos_ir c ON c.boton_id = cc.boton_id
             WHERE cc.estado = "pendiente"
             ORDER BY cc.creado_en ASC
             LIMIT ?'
        );
        $stmt->bindValue(1, $maxComandos, PDO::PARAM_INT);
        $stmt->execute();
        $comandos = $stmt->fetchAll();

        // Marcar como enviados
        if (!empty($comandos)) {
            $ids = array_column($comandos, 'id');
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $pdo->prepare(
                "UPDATE cola_comandos SET estado = 'enviado', enviado_en = NOW() 
                 WHERE id IN ($placeholders)"
            );
            $stmt->execute($ids);
        }

        // Parsear raw_data JSON si existe
        foreach ($comandos as &$cmd) {
            if ($cmd['raw_data']) {
                $cmd['raw_data'] = json_decode($cmd['raw_data'], true);
            }
            if ($cmd['parametros']) {
                $cmd['parametros'] = json_decode($cmd['parametros'], true);
            }
        }

        responderJson([
            'error'    => false,
            'comandos' => $comandos,
            'cantidad' => count($comandos),
        ]);
    } catch (Exception $e) {
        registrarLog('Error en poll: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener comandos.', 500);
    }
}

/**
 * Registra el heartbeat del ESP32 (indica que está en línea).
 */
function registrarHeartbeat(): void
{
    validarMetodo(['POST']);

    $datos = obtenerBodyJson();
    $dispositivoId = $datos['dispositivo_id'] ?? 'esp32-principal';
    $ipLocal = $datos['ip_local'] ?? null;
    $rssi = isset($datos['rssi']) ? (int) $datos['rssi'] : null;
    $versionFw = $datos['version_fw'] ?? null;
    $modoAprendizaje = isset($datos['modo_aprendizaje']) ? (int) $datos['modo_aprendizaje'] : 0;

    try {
        $pdo = obtenerConexion();

        $stmt = $pdo->prepare(
            'INSERT INTO estado_esp32 (dispositivo_id, en_linea, ip_local, rssi, version_fw, modo_aprendizaje, ultimo_heartbeat)
             VALUES (?, 1, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                en_linea = 1,
                ip_local = VALUES(ip_local),
                rssi = VALUES(rssi),
                version_fw = VALUES(version_fw),
                modo_aprendizaje = VALUES(modo_aprendizaje),
                ultimo_heartbeat = NOW()'
        );
        $stmt->execute([$dispositivoId, $ipLocal, $rssi, $versionFw, $modoAprendizaje]);

        responderExito('Heartbeat registrado.');
    } catch (Exception $e) {
        registrarLog('Error en heartbeat: ' . $e->getMessage(), 'ERROR');
        responderError('Error al registrar heartbeat.', 500);
    }
}

/**
 * El ESP32 reporta el resultado de un comando ejecutado.
 */
function reportarResultado(): void
{
    validarMetodo(['POST']);

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['comando_id', 'estado']);

    $comandoId = (int) $datos['comando_id'];
    $estado = $datos['estado']; // ejecutado o error
    $resultado = $datos['resultado'] ?? null;

    if (!in_array($estado, ['ejecutado', 'error'], true)) {
        responderError('Estado no válido. Usar: ejecutado, error.', 400);
    }

    try {
        $pdo = obtenerConexion();

        // Actualizar el comando en la cola
        $stmt = $pdo->prepare(
            'UPDATE cola_comandos SET estado = ?, resultado = ?, ejecutado_en = NOW() WHERE id = ?'
        );
        $stmt->execute([$estado, $resultado, $comandoId]);

        if ($stmt->rowCount() === 0) {
            responderError('Comando no encontrado.', 404);
            return;
        }

        // Registrar en el historial
        $stmtInfo = $pdo->prepare(
            'SELECT cc.tipo, b.nombre AS boton_nombre, d.nombre AS dispositivo_nombre, u.nombre AS usuario_nombre
             FROM cola_comandos cc
             LEFT JOIN botones b ON cc.boton_id = b.id
             LEFT JOIN dispositivos d ON b.dispositivo_id = d.id
             LEFT JOIN usuarios u ON cc.usuario_id = u.id
             WHERE cc.id = ?'
        );
        $stmtInfo->execute([$comandoId]);
        $info = $stmtInfo->fetch();

        $stmtHistorial = $pdo->prepare(
            'INSERT INTO historial (comando_id, dispositivo, boton, tipo, estado, resultado, usuario_nombre)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmtHistorial->execute([
            $comandoId,
            $info['dispositivo_nombre'] ?? 'Desconocido',
            $info['boton_nombre'] ?? 'Desconocido',
            $info['tipo'] ?? 'ir',
            $estado,
            $resultado,
            $info['usuario_nombre'] ?? 'Sistema',
        ]);

        // Actualizar último comando del ESP32
        $pdo->exec("UPDATE estado_esp32 SET ultimo_comando = NOW() WHERE dispositivo_id = 'esp32-principal'");

        responderExito('Resultado registrado.');
    } catch (Exception $e) {
        registrarLog('Error reportando resultado: ' . $e->getMessage(), 'ERROR');
        responderError('Error al reportar resultado.', 500);
    }
}

/**
 * Recibe un código IR capturado por el ESP32 en modo aprendizaje.
 */
function recibirCodigoIr(): void
{
    validarMetodo(['POST']);

    $datos = obtenerBodyJson();
    validarCamposRequeridos($datos, ['boton_id', 'protocolo']);

    // Reutilizar la función de guardar código IR del endpoint de botones
    require_once __DIR__ . '/botones.php';
    // La función ya fue incluida, manejar directamente
    $botonId = (int) $datos['boton_id'];
    $protocolo = strtoupper(sanear($datos['protocolo']));
    $codigo = isset($datos['codigo']) ? sanear($datos['codigo']) : null;
    $bits = isset($datos['bits']) ? (int) $datos['bits'] : null;
    $rawData = isset($datos['raw_data']) ? $datos['raw_data'] : null;
    $frecuencia = (int) ($datos['frecuencia'] ?? 38000);

    if (is_array($rawData)) {
        $rawData = json_encode($rawData);
    }

    try {
        $pdo = obtenerConexion();

        $stmt = $pdo->prepare(
            'INSERT INTO codigos_ir (boton_id, protocolo, codigo, bits, raw_data, frecuencia, descripcion)
             VALUES (?, ?, ?, ?, ?, ?, "Capturado por ESP32")
             ON DUPLICATE KEY UPDATE
                protocolo = VALUES(protocolo),
                codigo = VALUES(codigo),
                bits = VALUES(bits),
                raw_data = VALUES(raw_data),
                frecuencia = VALUES(frecuencia),
                descripcion = "Capturado por ESP32"'
        );
        $stmt->execute([$botonId, $protocolo, $codigo, $bits, $rawData, $frecuencia]);

        responderExito('Código IR capturado y guardado.', [
            'protocolo' => $protocolo,
            'codigo'    => $codigo,
            'bits'      => $bits,
        ]);
    } catch (Exception $e) {
        registrarLog('Error guardando código IR del ESP32: ' . $e->getMessage(), 'ERROR');
        responderError('Error al guardar el código IR.', 500);
    }
}

/**
 * Obtiene el estado del ESP32 (disponible para usuarios autenticados).
 */
function obtenerEstadoEsp32(): void
{
    validarMetodo(['GET']);

    // Permitir consulta con JWT de usuario O con token ESP32
    $esEsp32 = !empty($_SERVER['HTTP_X_ESP32_TOKEN']);
    if ($esEsp32) {
        verificarAutenticacionEsp32();
    } else {
        verificarAutenticacion();
    }

    try {
        $pdo = obtenerConexion();
        $config = obtenerConfig();
        $timeout = $config['esp32']['heartbeat_timeout'] ?? 30;

        // Obtener estado
        $stmt = $pdo->query('SELECT * FROM estado_esp32 LIMIT 1');
        $estado = $stmt->fetch();

        if ($estado) {
            // Verificar si está realmente en línea (heartbeat reciente)
            if ($estado['ultimo_heartbeat']) {
                $ultimoHb = new DateTime($estado['ultimo_heartbeat']);
                $ahora = new DateTime();
                $diferencia = $ahora->getTimestamp() - $ultimoHb->getTimestamp();
                $estado['en_linea'] = $diferencia <= $timeout;

                // Actualizar BD si cambió
                if (!$estado['en_linea']) {
                    $pdo->prepare(
                        'UPDATE estado_esp32 SET en_linea = 0 WHERE dispositivo_id = ?'
                    )->execute([$estado['dispositivo_id']]);
                }
            }

            $estado['en_linea'] = (bool) $estado['en_linea'];
            $estado['modo_aprendizaje'] = (bool) $estado['modo_aprendizaje'];
        }

        // Contar comandos pendientes
        $stmtPend = $pdo->query(
            "SELECT COUNT(*) as total FROM cola_comandos WHERE estado IN ('pendiente', 'enviado')"
        );
        $pendientes = $stmtPend->fetch();

        responderJson([
            'error'               => false,
            'estado'              => $estado,
            'comandos_pendientes' => (int) ($pendientes['total'] ?? 0),
        ]);
    } catch (Exception $e) {
        registrarLog('Error obteniendo estado ESP32: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener estado del ESP32.', 500);
    }
}
