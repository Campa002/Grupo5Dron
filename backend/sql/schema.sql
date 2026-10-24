-- ============================================================
-- Grupo 5: Control de Sistemas y Dron
-- EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
-- Esquema de base de datos — MySQL / MariaDB
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. USUARIOS
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `usuarios`;
CREATE TABLE `usuarios` (
    `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `nombre`          VARCHAR(100)    NOT NULL,
    `email`           VARCHAR(150)    NOT NULL,
    `password_hash`   VARCHAR(255)    NOT NULL,
    `rol`             ENUM('admin','docente','usuario') NOT NULL DEFAULT 'usuario',
    `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
    `debe_cambiar_password` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 si debe cambiar clave al primer ingreso',
    `intentos_login`  INT UNSIGNED    NOT NULL DEFAULT 0,
    `bloqueado_hasta` DATETIME        NULL DEFAULT NULL,
    `creado_en`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. DISPOSITIVOS DEL AULA
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `dispositivos`;
CREATE TABLE `dispositivos` (
    `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `nombre`      VARCHAR(100)    NOT NULL,
    `tipo`        VARCHAR(50)     NOT NULL COMMENT 'luz, ventilador, aire, proyector, otro',
    `icono`       VARCHAR(50)     NULL DEFAULT 'dispositivo',
    `orden`       INT UNSIGNED    NOT NULL DEFAULT 0,
    `activo`      TINYINT(1)      NOT NULL DEFAULT 1,
    `creado_en`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_tipo` (`tipo`),
    INDEX `idx_orden` (`orden`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. BOTONES / ACCIONES POR DISPOSITIVO
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `botones`;
CREATE TABLE `botones` (
    `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `dispositivo_id`  INT UNSIGNED    NOT NULL,
    `nombre`          VARCHAR(100)    NOT NULL COMMENT 'Ej: Encender, Apagar, Subir temp.',
    `icono`           VARCHAR(50)     NULL DEFAULT 'boton',
    `orden`           INT UNSIGNED    NOT NULL DEFAULT 0,
    `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
    `creado_en`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_dispositivo` (`dispositivo_id`),
    CONSTRAINT `fk_botones_dispositivo`
        FOREIGN KEY (`dispositivo_id`) REFERENCES `dispositivos` (`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. CÓDIGOS IR ASOCIADOS A BOTONES
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `codigos_ir`;
CREATE TABLE `codigos_ir` (
    `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `boton_id`      INT UNSIGNED    NOT NULL,
    `protocolo`     VARCHAR(30)     NOT NULL DEFAULT 'DESCONOCIDO' COMMENT 'NEC, SONY, RC5, RAW, etc.',
    `codigo`        VARCHAR(20)     NULL COMMENT 'Código hexadecimal decodificado',
    `bits`          INT UNSIGNED    NULL COMMENT 'Cantidad de bits del código',
    `raw_data`      TEXT            NULL COMMENT 'Array raw (JSON) para protocolos desconocidos',
    `frecuencia`    INT UNSIGNED    NOT NULL DEFAULT 38000 COMMENT 'Frecuencia portadora en Hz',
    `descripcion`   VARCHAR(200)    NULL,
    `creado_en`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_boton` (`boton_id`),
    CONSTRAINT `fk_codigos_boton`
        FOREIGN KEY (`boton_id`) REFERENCES `botones` (`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. COLA DE COMANDOS (ESP32 polling)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `cola_comandos`;
CREATE TABLE `cola_comandos` (
    `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `boton_id`        INT UNSIGNED    NULL COMMENT 'NULL si es comando de relé u otro tipo',
    `tipo`            ENUM('ir','rele','aprendizaje','config') NOT NULL DEFAULT 'ir',
    `parametros`      JSON            NULL COMMENT 'Datos adicionales en JSON',
    `estado`          ENUM('pendiente','enviado','ejecutado','error') NOT NULL DEFAULT 'pendiente',
    `resultado`       VARCHAR(255)    NULL,
    `usuario_id`      INT UNSIGNED    NULL,
    `creado_en`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `enviado_en`      DATETIME        NULL,
    `ejecutado_en`    DATETIME        NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_estado` (`estado`),
    INDEX `idx_creado` (`creado_en`),
    CONSTRAINT `fk_comandos_boton`
        FOREIGN KEY (`boton_id`) REFERENCES `botones` (`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_comandos_usuario`
        FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. HISTORIAL DE COMANDOS EJECUTADOS
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `historial`;
CREATE TABLE `historial` (
    `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `comando_id`      INT UNSIGNED    NULL,
    `dispositivo`     VARCHAR(100)    NULL,
    `boton`           VARCHAR(100)    NULL,
    `tipo`            VARCHAR(30)     NULL,
    `estado`          VARCHAR(30)     NOT NULL,
    `resultado`       VARCHAR(255)    NULL,
    `usuario_nombre`  VARCHAR(100)    NULL,
    `ejecutado_en`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_ejecutado` (`ejecutado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. ESTADO DEL ESP32 (heartbeat)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `estado_esp32`;
CREATE TABLE `estado_esp32` (
    `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `dispositivo_id`  VARCHAR(50)     NOT NULL DEFAULT 'esp32-principal',
    `en_linea`        TINYINT(1)      NOT NULL DEFAULT 0,
    `ip_local`        VARCHAR(45)     NULL,
    `rssi`            INT             NULL COMMENT 'Señal WiFi en dBm',
    `version_fw`      VARCHAR(20)     NULL,
    `modo_aprendizaje` TINYINT(1)     NOT NULL DEFAULT 0,
    `ultimo_heartbeat` DATETIME       NULL,
    `ultimo_comando`   DATETIME       NULL,
    `creado_en`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_dispositivo` (`dispositivo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. PERFILES DE DRON
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `perfiles_dron`;
CREATE TABLE `perfiles_dron` (
    `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `nombre`          VARCHAR(100)    NOT NULL,
    `tipo_adaptador`  VARCHAR(30)     NOT NULL DEFAULT 'simulador' COMMENT 'tello, http, udp_tcp, simulador',
    `ip`              VARCHAR(45)     NOT NULL DEFAULT '192.168.10.1',
    `puerto_comando`  INT UNSIGNED    NOT NULL DEFAULT 8889,
    `puerto_video`    INT UNSIGNED    NULL DEFAULT 11111,
    `protocolo`       VARCHAR(10)     NOT NULL DEFAULT 'UDP' COMMENT 'UDP, TCP, HTTP',
    `url_video`       VARCHAR(255)    NULL,
    `formato_video`   VARCHAR(20)     NULL DEFAULT 'MJPEG' COMMENT 'MJPEG, H264, RTSP',
    `plantilla_comandos` JSON         NULL COMMENT 'Mapeo de acciones a comandos específicos',
    `configuracion`   JSON            NULL COMMENT 'Opciones adicionales',
    `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
    `creado_en`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. CONFIGURACIÓN GENERAL (clave-valor)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `configuracion`;
CREATE TABLE `configuracion` (
    `clave`       VARCHAR(100)    NOT NULL,
    `valor`       TEXT            NULL,
    `descripcion` VARCHAR(255)    NULL,
    `actualizado_en` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- DATOS DE EJEMPLO (SEED)
-- ============================================================

-- Usuarios iniciales de ejemplo (Contraseña temporal: Admin1234!)
-- Hash generado con password_hash('Admin1234!', PASSWORD_DEFAULT)
-- ⚠️ ADVERTENCIA DE SEGURIDAD: Todos los usuarios iniciales tienen
-- `debe_cambiar_password` = 1 para forzar el cambio de clave en el primer
-- inicio de sesión. Cambiá estas credenciales inmediatamente antes de
-- desplegar el sistema en un entorno de producción o aula real.
INSERT INTO `usuarios` (`nombre`, `email`, `password_hash`, `rol`, `debe_cambiar_password`) VALUES
('Administrador', 'admin@grupo5dron.local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 1),
('Profesor Piris', 'piris@grupo5dron.local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'docente', 1),
('Demian Barreto', 'demian@grupo5dron.local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'usuario', 1),
('Luciano Campanelli', 'luciano@grupo5dron.local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'usuario', 1);

-- Dispositivos del aula de ejemplo
INSERT INTO `dispositivos` (`nombre`, `tipo`, `icono`, `orden`) VALUES
('Luz principal', 'luz', 'lightbulb', 1),
('Ventilador de techo', 'ventilador', 'fan', 2),
('Aire acondicionado', 'aire', 'snowflake', 3),
('Proyector Epson', 'proyector', 'projector', 4),
('Equipo de audio', 'otro', 'speaker', 5);

-- Botones para cada dispositivo
INSERT INTO `botones` (`dispositivo_id`, `nombre`, `icono`, `orden`) VALUES
-- Luz principal
(1, 'Encender', 'power-on', 1),
(1, 'Apagar', 'power-off', 2),
-- Ventilador
(2, 'Encender', 'power-on', 1),
(2, 'Apagar', 'power-off', 2),
(2, 'Velocidad +', 'speed-up', 3),
(2, 'Velocidad -', 'speed-down', 4),
-- Aire acondicionado
(3, 'Encender', 'power-on', 1),
(3, 'Apagar', 'power-off', 2),
(3, 'Subir temperatura', 'temp-up', 3),
(3, 'Bajar temperatura', 'temp-down', 4),
(3, 'Modo frío', 'cold', 5),
(3, 'Modo calor', 'hot', 6),
(3, 'Modo ventilador', 'fan', 7),
-- Proyector
(4, 'Encender', 'power-on', 1),
(4, 'Apagar', 'power-off', 2),
(4, 'Fuente HDMI', 'hdmi', 3),
(4, 'Fuente VGA', 'vga', 4),
-- Equipo de audio
(5, 'Encender', 'power-on', 1),
(5, 'Apagar', 'power-off', 2),
(5, 'Volumen +', 'volume-up', 3),
(5, 'Volumen -', 'volume-down', 4),
(5, 'Mute', 'mute', 5);

-- Códigos IR de ejemplo (valores ficticios, se capturan con modo aprendizaje)
INSERT INTO `codigos_ir` (`boton_id`, `protocolo`, `codigo`, `bits`, `frecuencia`, `descripcion`) VALUES
(1, 'NEC', '0x00FF00FF', 32, 38000, 'Luz principal - Encender (ejemplo)'),
(2, 'NEC', '0x00FF807F', 32, 38000, 'Luz principal - Apagar (ejemplo)');

-- Estado ESP32 inicial
INSERT INTO `estado_esp32` (`dispositivo_id`, `en_linea`, `version_fw`) VALUES
('esp32-principal', 0, '1.0.0');

-- Perfiles de dron
INSERT INTO `perfiles_dron` (`nombre`, `tipo_adaptador`, `ip`, `puerto_comando`, `puerto_video`, `protocolo`, `url_video`, `formato_video`, `plantilla_comandos`) VALUES
('DJI Tello (referencia)', 'tello', '192.168.10.1', 8889, 11111, 'UDP', NULL, 'H264',
 '{"conectar":"command","despegar":"takeoff","aterrizar":"land","emergencia":"emergency","arriba":"up {dist}","abajo":"down {dist}","izquierda":"left {dist}","derecha":"right {dist}","adelante":"forward {dist}","atras":"back {dist}","rotar_izq":"ccw {deg}","rotar_der":"cw {deg}","velocidad":"speed {vel}","bateria":"battery?","estado":"state?"}'),
('Dron HTTP genérico', 'http', '192.168.1.100', 80, 0, 'HTTP', 'http://192.168.1.100:8080/video', 'MJPEG',
 '{"conectar":"/api/connect","despegar":"/api/takeoff","aterrizar":"/api/land","emergencia":"/api/emergency","mover":"/api/move"}'),
('Simulador de prueba', 'simulador', '127.0.0.1', 0, 0, 'UDP', NULL, NULL, NULL);

-- Configuración general
INSERT INTO `configuracion` (`clave`, `valor`, `descripcion`) VALUES
('rele_habilitado', '0', 'Control de relé 220V habilitado (0=no, 1=sí). REQUIERE SUPERVISIÓN DOCENTE.'),
('polling_intervalo_ms', '1000', 'Intervalo de polling del ESP32 en milisegundos'),
('heartbeat_timeout_seg', '30', 'Segundos sin heartbeat para marcar ESP32 como desconectado'),
('giroscopio_zona_muerta', '5', 'Zona muerta del giroscopio en grados'),
('giroscopio_sensibilidad', '50', 'Sensibilidad del giroscopio (1-100)'),
('seguimiento_velocidad_max', '30', 'Velocidad máxima del seguimiento automático (1-100)'),
('nombre_proyecto', 'Grupo 5: Control de Sistemas y Dron', 'Nombre del proyecto'),
('escuela', 'EEST N° 1 de Vicente López "Eduardo Ader"', 'Nombre de la escuela');
