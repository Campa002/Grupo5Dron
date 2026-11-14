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
-- 2. APARATOS DEL AULA QUE SE MANEJAN POR INFRARROJO
--    Solo dos: el proyector y el aire acondicionado. Las luces van por el relé
--    (comandos de tipo 'rele'), no son un aparato de esta tabla.
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `dispositivos`;
CREATE TABLE `dispositivos` (
    `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `nombre`      VARCHAR(100)    NOT NULL,
    `tipo`        VARCHAR(50)     NOT NULL COMMENT 'proyector o aire',
    `icono`       VARCHAR(50)     NULL DEFAULT 'dispositivo',
    `orden`       INT UNSIGNED    NOT NULL DEFAULT 0,
    `activo`      TINYINT(1)      NOT NULL DEFAULT 1,
    `creado_en`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tipo` (`tipo`),
    INDEX `idx_orden` (`orden`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. ACCIONES DE CADA APARATO (cada una con su código IR aprendido)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `botones`;
CREATE TABLE `botones` (
    `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `dispositivo_id`  INT UNSIGNED    NOT NULL,
    `accion`          VARCHAR(30)     NOT NULL COMMENT 'encender, apagar, subir_temp, bajar_temp',
    `nombre`          VARCHAR(100)    NOT NULL COMMENT 'Ej: Encender, Apagar, Subir temperatura',
    `icono`           VARCHAR(50)     NULL DEFAULT 'boton',
    `orden`           INT UNSIGNED    NOT NULL DEFAULT 0,
    `activo`          TINYINT(1)      NOT NULL DEFAULT 1,
    `creado_en`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_dispositivo_accion` (`dispositivo_id`, `accion`),
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
    `protocolo`     VARCHAR(30)     NOT NULL DEFAULT 'DESCONOCIDO' COMMENT 'NEC, SONY, SAMSUNG, DAIKIN, COOLIX, UNKNOWN, etc. (nombres de IRremoteESP8266)',
    `codigo`        VARCHAR(255)    NULL COMMENT 'Hexadecimal; en los aires, el estado completo (hasta 53 bytes)',
    `bits`          INT UNSIGNED    NULL COMMENT 'Cantidad de bits del código',
    `raw_data`      MEDIUMTEXT      NULL COMMENT 'Trama cruda completa (JSON, microsegundos): respaldo si el protocolo no se conoce',
    `frecuencia`    INT UNSIGNED    NOT NULL DEFAULT 38000 COMMENT 'Frecuencia portadora en Hz',
    `descripcion`   VARCHAR(200)    NULL,
    `creado_en`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en` DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Último aprendizaje',
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
    `tipo_adaptador`  ENUM('tello', 'simulador') NOT NULL DEFAULT 'tello' COMMENT 'tello, simulador',
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

-- Usuarios iniciales de ejemplo (contraseña temporal de todos: password)
-- El hash corresponde a 'password'. La app obliga a cambiarla en el primer inicio de sesión.
-- AVISO: ADVERTENCIA DE SEGURIDAD: Todos los usuarios iniciales tienen
-- `debe_cambiar_password` = 1 para forzar el cambio de clave en el primer
-- inicio de sesión. Cambiá estas credenciales inmediatamente antes de
-- desplegar el sistema en un entorno de producción o aula real.
INSERT INTO `usuarios` (`nombre`, `email`, `password_hash`, `rol`, `debe_cambiar_password`) VALUES
('Administrador', 'admin@grupo5dron.local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 1),
('Profesor Piris', 'piris@grupo5dron.local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'docente', 1),
('Demian Barreto', 'demian@grupo5dron.local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'usuario', 1),
('Luciano Campanelli', 'luciano@grupo5dron.local', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'usuario', 1);

-- Los dos aparatos del aula que se manejan por infrarrojo (las luces van por el relé)
INSERT INTO `dispositivos` (`id`, `nombre`, `tipo`, `icono`, `orden`) VALUES
(1, 'Proyector', 'proyector', 'proyector', 1),
(2, 'Aire acondicionado', 'aire', 'copo', 2);

-- Sus acciones. Los códigos se aprenden con el control remoto de cada aula ("Aprender código").
INSERT INTO `botones` (`dispositivo_id`, `accion`, `nombre`, `icono`, `orden`) VALUES
(1, 'encender', 'Encender', 'power-on', 1),
(1, 'apagar', 'Apagar', 'power-off', 2),
(2, 'encender', 'Encender', 'power-on', 1),
(2, 'apagar', 'Apagar', 'power-off', 2),
(2, 'subir_temp', 'Subir temperatura', 'temp-up', 3),
(2, 'bajar_temp', 'Bajar temperatura', 'temp-down', 4);

-- Estado ESP32 inicial
INSERT INTO `estado_esp32` (`dispositivo_id`, `en_linea`, `version_fw`) VALUES
('esp32-principal', 0, '1.1.0');

-- Perfiles de dron (Exclusivo: tello | simulador)
INSERT INTO `perfiles_dron` (`nombre`, `tipo_adaptador`, `ip`, `puerto_comando`, `puerto_video`, `protocolo`, `url_video`, `formato_video`, `plantilla_comandos`) VALUES
('DJI Tello (referencia)', 'tello', '192.168.10.1', 8889, 11111, 'UDP', NULL, 'H264',
 '{"conectar":"command","despegar":"takeoff","aterrizar":"land","emergencia":"emergency","arriba":"up {dist}","abajo":"down {dist}","izquierda":"left {dist}","derecha":"right {dist}","adelante":"forward {dist}","atras":"back {dist}","rotar_izq":"ccw {deg}","rotar_der":"cw {deg}","velocidad":"speed {vel}","bateria":"battery?","estado":"state?"}'),
('Simulador de prueba', 'simulador', '127.0.0.1', 0, 0, 'UDP', NULL, NULL, NULL);

-- Configuración general
INSERT INTO `configuracion` (`clave`, `valor`, `descripcion`) VALUES
('rele_habilitado', '0', 'Control de relé 220V habilitado (0=no, 1=sí). REQUIERE SUPERVISIÓN DOCENTE.'),
('nombre_proyecto', 'Grupo 5: Control de Sistemas y Dron', 'Nombre del proyecto'),
('escuela', 'EEST N° 1 de Vicente López "Eduardo Ader"', 'Nombre de la escuela');
