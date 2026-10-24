<?php
/**
 * API de Configuración General — Grupo 5: Control de Sistemas y Dron
 * 
 * Endpoints:
 *   GET  ?action=obtener             — Obtener todas las configuraciones
 *   GET  ?action=obtener&clave=X     — Obtener una configuración específica
 *   PUT  ?action=actualizar          — Actualizar configuración (admin)
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/helpers.php';
require_once __DIR__ . '/../includes/security.php';
require_once __DIR__ . '/../includes/auth_middleware.php';

establecerCabecerasSeguridad();
configurarCors();

$action = obtenerParam('action', 'obtener');

switch ($action) {
    case 'obtener':
        obtenerConfiguracion();
        break;
    case 'actualizar':
        actualizarConfiguracion();
        break;
    default:
        responderError('Acción no válida.', 400);
}

/**
 * Obtiene las configuraciones (todas o una específica por clave).
 */
function obtenerConfiguracion(): void
{
    validarMetodo(['GET']);
    verificarAutenticacion();

    $clave = obtenerParam('clave');

    try {
        $pdo = obtenerConexion();

        if ($clave) {
            $stmt = $pdo->prepare('SELECT * FROM configuracion WHERE clave = ?');
            $stmt->execute([$clave]);
            $config = $stmt->fetch();

            if (!$config) {
                responderError('Configuración no encontrada.', 404);
            }

            responderJson(['error' => false, 'configuracion' => $config]);
        } else {
            $stmt = $pdo->query('SELECT * FROM configuracion ORDER BY clave ASC');
            $configs = $stmt->fetchAll();

            // Convertir a objeto clave-valor para facilitar el uso
            $mapa = [];
            foreach ($configs as $c) {
                $mapa[$c['clave']] = $c['valor'];
            }

            responderJson([
                'error'          => false,
                'configuracion'  => $configs,
                'valores'        => $mapa,
            ]);
        }
    } catch (Exception $e) {
        registrarLog('Error obteniendo configuración: ' . $e->getMessage(), 'ERROR');
        responderError('Error al obtener configuración.', 500);
    }
}

/**
 * Actualiza una o más configuraciones (solo admin).
 */
function actualizarConfiguracion(): void
{
    validarMetodo(['PUT']);
    verificarAdmin();

    $datos = obtenerBodyJson();

    if (empty($datos)) {
        responderError('No se proporcionaron datos.', 400);
    }

    try {
        $pdo = obtenerConexion();

        $stmt = $pdo->prepare(
            'UPDATE configuracion SET valor = ? WHERE clave = ?'
        );

        $actualizados = 0;
        foreach ($datos as $clave => $valor) {
            $stmt->execute([sanear((string) $valor), sanear($clave)]);
            $actualizados += $stmt->rowCount();
        }

        responderExito("Se actualizaron $actualizados configuraciones.");
    } catch (Exception $e) {
        registrarLog('Error actualizando configuración: ' . $e->getMessage(), 'ERROR');
        responderError('Error al actualizar configuración.', 500);
    }
}
