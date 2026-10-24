/**
 * Adaptadores de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 * 
 * Implementa el patrón Adapter para desacoplar la interfaz de vuelo
 * de los protocolos concretos de cada dron (DJI Tello, HTTP, UDP/TCP y Simulador).
 */

// eslint-disable-next-line no-unused-vars
const DronAdaptadores = (() => {
    'use strict';

    /**
     * Utilidad para normalizar plantilla_comandos si viene como string JSON o como objeto.
     * @param {string|Object} plantilla
     * @returns {Object}
     */
    function normalizarPlantilla(plantilla) {
        if (!plantilla) return {};
        if (typeof plantilla === 'string') {
            try {
                return JSON.parse(plantilla);
            } catch (e) {
                console.warn('[Adaptador] Error parseando plantilla_comandos JSON:', e);
                return {};
            }
        }
        return plantilla;
    }

    // ============================================================
    // 1. CLASE BASE: DroneAdapter
    // ============================================================
    class DroneAdapter {
        constructor(perfil) {
            this.perfil = perfil || {};
            this.plantilla = normalizarPlantilla(this.perfil.plantilla_comandos);
            this.conectado = false;
            this.enVuelo = false;
            this.telemetria = {
                bateria: 100,
                altura: 0,
                velocidad: 0,
                pitch: 0,
                roll: 0,
                yaw: 0,
                rssi: -50,
                estado: 'desconectado',
            };
            this.oyentesTelemetria = [];
            this.intervaloBucleRC = null;

            // Valores de control analógico normalizados (-100 a +100)
            this.valoresRC = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
            this.frecuenciaRCHz = 15; // 15 Hz = cada ~66 ms (frecuencia recomendada)
        }

        async conectar() {
            throw new Error('Método conectar() no implementado en el adaptador base');
        }

        async desconectar() {
            this.detenerBucleRC();
            this.conectado = false;
            this.enVuelo = false;
            this.telemetria.estado = 'desconectado';
            this.notificarTelemetria();
        }

        async despegar() {
            throw new Error('Método despegar() no implementado');
        }

        async aterrizar() {
            throw new Error('Método aterrizar() no implementado');
        }

        async detenerEmergencia() {
            this.valoresRC = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
            this.enVuelo = false;
            this.telemetria.estado = 'emergencia';
            this.notificarTelemetria();
        }

        /**
         * Actualiza los valores de control RC.
         * El envío real se realiza a frecuencia regulada en el bucle RC (10–15 Hz).
         * @param {number} roll
         * @param {number} pitch
         * @param {number} yaw
         * @param {number} throttle
         */
        mover(roll, pitch, yaw, throttle) {
            this.valoresRC.roll     = Math.max(-100, Math.min(100, Math.round(roll     * 100)));
            this.valoresRC.pitch    = Math.max(-100, Math.min(100, Math.round(pitch    * 100)));
            this.valoresRC.yaw      = Math.max(-100, Math.min(100, Math.round(yaw      * 100)));
            this.valoresRC.throttle = Math.max(-100, Math.min(100, Math.round(throttle * 100)));
        }

        /**
         * API unificada para dron.js: acepta {lr, fb, ud, yaw} normalizados [-1, 1].
         * Traduce al formato interno de mover().
         * @param {{ lr: number, fb: number, ud: number, yaw: number }} ejes
         */
        moverRC({ lr = 0, fb = 0, ud = 0, yaw = 0 } = {}) {
            this.mover(lr, fb, yaw, ud);
        }

        iniciarBucleRC(callbackEnvio) {
            this.detenerBucleRC();
            const intervaloMs = Math.round(1000 / this.frecuenciaRCHz);
            this.intervaloBucleRC = setInterval(() => {
                if (this.conectado && this.enVuelo && callbackEnvio) {
                    callbackEnvio(this.valoresRC);
                }
            }, intervaloMs);
        }

        detenerBucleRC() {
            if (this.intervaloBucleRC) {
                clearInterval(this.intervaloBucleRC);
                this.intervaloBucleRC = null;
            }
        }

        obtenerTelemetria() {
            return { ...this.telemetria };
        }

        obtenerVideoUrl() {
            return this.perfil.url_video || null;
        }

        /**
         * Registra un callback de telemetría.
         * @param {Function} callback
         */
        onTelemetria(callback) {
            if (typeof callback === 'function') {
                this.oyentesTelemetria.push(callback);
            }
        }

        /**
         * Alias de onTelemetria() para compatibilidad con dron.js.
         * @param {Function} callback
         */
        agregarOyenteTelemetria(callback) {
            this.onTelemetria(callback);
        }

        notificarTelemetria() {
            const copia = this.obtenerTelemetria();
            for (const cb of this.oyentesTelemetria) {
                try { cb(copia); } catch (e) { console.error(e); }
            }
        }
    }

    // ============================================================
    // 2. ADAPTADOR: Simulador Virtual en Navegador
    // ============================================================
    class SimulatorDroneAdapter extends DroneAdapter {
        constructor(perfil) {
            super(perfil);
            this.intervaloSimulador = null;
            this.posicionVirtual = { x: 0, y: 0, z: 0 };
        }

        async conectar() {
            await new Promise(r => setTimeout(r, 600));
            this.conectado = true;
            this.telemetria.bateria = 100;
            this.telemetria.altura = 0;
            this.telemetria.estado = 'en tierra';
            this.notificarTelemetria();

            this.iniciarBucleRC(() => {
                // Física básica del simulador
                if (this.enVuelo) {
                    this.telemetria.roll = this.valoresRC.roll * 0.35;
                    this.telemetria.pitch = this.valoresRC.pitch * 0.35;
                    this.telemetria.yaw = (this.telemetria.yaw + this.valoresRC.yaw * 0.05) % 360;
                    if (this.telemetria.yaw < 0) this.telemetria.yaw += 360;

                    // Altura afectada por throttle
                    const deltaZ = (this.valoresRC.throttle / 100) * 0.08;
                    this.telemetria.altura = Math.max(0.3, Math.min(15.0, this.telemetria.altura + deltaZ));
                    this.telemetria.velocidad = Math.round(
                        Math.sqrt(this.valoresRC.roll ** 2 + this.valoresRC.pitch ** 2) * 0.1
                    );
                }
            });

            // Simulación de descarga de batería
            this.intervaloSimulador = setInterval(() => {
                if (this.conectado) {
                    if (this.enVuelo && this.telemetria.bateria > 0) {
                        this.telemetria.bateria = Math.max(0, this.telemetria.bateria - 0.2);
                    }
                    this.notificarTelemetria();
                }
            }, 1000);

            console.log('[Simulador] Conectado al simulador de vuelo virtual.');
            return true;
        }

        async desconectar() {
            if (this.intervaloSimulador) {
                clearInterval(this.intervaloSimulador);
                this.intervaloSimulador = null;
            }
            await super.desconectar();
            console.log('[Simulador] Desconectado.');
        }

        async despegar() {
            if (!this.conectado) throw new Error('El dron simulado no está conectado');
            await new Promise(r => setTimeout(r, 800));
            this.enVuelo = true;
            this.telemetria.altura = 1.2;
            this.telemetria.estado = 'volando';
            this.notificarTelemetria();
            console.log('[Simulador] Despegue completado a 1.2m.');
            return true;
        }

        async aterrizar() {
            await new Promise(r => setTimeout(r, 800));
            this.enVuelo = false;
            this.telemetria.altura = 0;
            this.telemetria.velocidad = 0;
            this.telemetria.roll = 0;
            this.telemetria.pitch = 0;
            this.telemetria.estado = 'en tierra';
            this.valoresRC = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
            this.notificarTelemetria();
            console.log('[Simulador] Aterrizaje completado.');
            return true;
        }

        async detenerEmergencia() {
            await super.detenerEmergencia();
            this.telemetria.altura = 0;
            this.telemetria.velocidad = 0;
            this.telemetria.estado = 'motores apagados';
            this.notificarTelemetria();
            console.warn('[Simulador] 🛑 PARADA DE EMERGENCIA EJECUTADA.');
            return true;
        }

        obtenerVideoUrl() {
            // Devuelve un lienzo sintético simulado si no hay URL configurada
            return 'simulador://canvas';
        }
    }

    // ============================================================
    // 3. ADAPTADOR: DJI Tello (UDP SDK Oficial)
    // ============================================================
    class TelloAdapter extends DroneAdapter {
        constructor(perfil) {
            super(perfil);
            this.ip = perfil.ip || '192.168.10.1';
            this.puertoComando = perfil.puerto_comando || 8889;
            this.puertoEstado = 8890;
            this.puertoVideo = perfil.puerto_video || 11111;
        }

        tienePluginNativo() {
            return !!(window.Capacitor?.Plugins?.DronNative);
        }

        async enviarUdp(comando) {
            if (this.tienePluginNativo()) {
                const plugin = window.Capacitor.Plugins.DronNative;
                return await plugin.sendUdpPacket({
                    ip: this.ip,
                    port: this.puertoComando,
                    message: comando,
                });
            } else {
                console.log(`[Tello Web-Emulado] UDP -> ${this.ip}:${this.puertoComando} : "${comando}"`);
                return { success: true, emulado: true };
            }
        }

        async conectar() {
            console.log(`[Tello] Conectando a DJI Tello en ${this.ip}:${this.puertoComando}...`);

            // 1. Inicializar modo SDK
            await this.enviarUdp('command');
            this.conectado = true;
            this.telemetria.estado = 'conectado (modo comando)';
            this.notificarTelemetria();

            // 2. Iniciar escucha de telemetría UDP (puerto 8890) si hay soporte nativo
            if (this.tienePluginNativo()) {
                const plugin = window.Capacitor.Plugins.DronNative;
                await plugin.startUdpListener({ port: this.puertoEstado });
                plugin.addListener('telloState', (data) => {
                    this.procesarStringEstado(data.raw);
                });
            }

            // 3. Iniciar bucle de control analógico a 15 Hz
            this.iniciarBucleRC((rc) => {
                const cmd = `rc ${rc.roll} ${rc.pitch} ${rc.throttle} ${rc.yaw}`;
                this.enviarUdp(cmd);
            });

            return true;
        }

        procesarStringEstado(str) {
            if (!str) return;
            // Tello envía formato clave:valor;
            // Ej: "pitch:0;roll:0;yaw:0;vgx:0;vgy:0;vgz:0;templ:55;temph:58;tof:10;h:0;bat:88;baro:155.5;\r\n"
            const partes = str.split(';');
            for (const parte of partes) {
                const [k, v] = parte.split(':');
                if (!k || v === undefined) continue;
                const clave = k.trim();
                const valor = parseFloat(v.trim());
                if (clave === 'bat') this.telemetria.bateria = valor;
                if (clave === 'h')   this.telemetria.altura = valor / 100.0; // cm a m
                if (clave === 'pitch') this.telemetria.pitch = valor;
                if (clave === 'roll')  this.telemetria.roll = valor;
                if (clave === 'yaw')   this.telemetria.yaw = valor;
            }
            this.notificarTelemetria();
        }

        async desconectar() {
            if (this.tienePluginNativo()) {
                try {
                    await window.Capacitor.Plugins.DronNative.stopUdpListener({ port: this.puertoEstado });
                } catch (e) {
                    // Ignorar error al cerrar socket
                }
            }
            await super.desconectar();
        }

        async despegar() {
            console.log('[Tello] Enviando orden de despegue...');
            await this.enviarUdp('takeoff');
            this.enVuelo = true;
            this.telemetria.estado = 'en vuelo';
            this.notificarTelemetria();
            return true;
        }

        async aterrizar() {
            console.log('[Tello] Enviando orden de aterrizaje...');
            await this.enviarUdp('land');
            this.enVuelo = false;
            this.telemetria.estado = 'aterrizando';
            this.notificarTelemetria();
            return true;
        }

        async detenerEmergencia() {
            console.warn('[Tello] 🛑 ENVIANDO COMANDO DE EMERGENCIA!');
            await this.enviarUdp('emergency');
            await super.detenerEmergencia();
            return true;
        }

        obtenerVideoUrl() {
            // Nota técnica documentada:
            // Tello transmite video crudo H.264 sobre UDP (puerto 11111) tras enviar "streamon".
            // En un navegador estándar no es posible decodificar H.264 crudo UDP directamente.
            // Punto de extensión: en el APK de Capacitor se decodifica con SurfaceView / WebCodecs.
            return 'udp://127.0.0.1:11111 (requiere validación con el dron real en APK nativo)';
        }
    }

    // ============================================================
    // 4. ADAPTADOR: Dron HTTP Genérico (Cámaras ESP32-CAM / API REST)
    // ============================================================
    class HttpDroneAdapter extends DroneAdapter {
        constructor(perfil) {
            super(perfil);
            this.baseUrl = `http://${perfil.ip || '192.168.1.100'}:${perfil.puerto_comando || 80}`;
        }

        async peticion(accion, params = {}) {
            const endpoint = this.plantilla[accion] || `/api/${accion}`;
            const url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(params),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);
                return await resp.json().catch(() => ({}));
            } catch (e) {
                clearTimeout(timeoutId);
                throw new Error(`Fallo HTTP en dron (${url}): ${e.message}`);
            }
        }

        async conectar() {
            await this.peticion('conectar');
            this.conectado = true;
            this.telemetria.estado = 'conectado (HTTP)';
            this.notificarTelemetria();

            this.iniciarBucleRC((rc) => {
                this.peticion('mover', rc).catch(() => {});
            });
            return true;
        }

        async despegar() {
            await this.peticion('despegar');
            this.enVuelo = true;
            this.telemetria.estado = 'en vuelo';
            this.notificarTelemetria();
            return true;
        }

        async aterrizar() {
            await this.peticion('aterrizar');
            this.enVuelo = false;
            this.telemetria.estado = 'aterrizado';
            this.notificarTelemetria();
            return true;
        }

        async detenerEmergencia() {
            try {
                await this.peticion('emergencia');
            } catch (e) {
                console.error('[HTTP] Error enviando emergencia:', e);
            }
            await super.detenerEmergencia();
            return true;
        }

        obtenerVideoUrl() {
            // El stream MJPEG sobre HTTP es soportado de forma nativa por elementos <img>
            return this.perfil.url_video || `${this.baseUrl}:8080/video`;
        }
    }

    // ============================================================
    // 5. ADAPTADOR: UDP / TCP con Plantillas Configurables
    // ============================================================
    class UdpTcpAdapter extends DroneAdapter {
        constructor(perfil) {
            super(perfil);
            this.ip = perfil.ip;
            this.puerto = perfil.puerto_comando;
            this.protocolo = (perfil.protocolo || 'UDP').toUpperCase();
        }

        interpolar(plantillaStr, variables = {}) {
            if (!plantillaStr) return '';
            let resultado = plantillaStr;
            for (const [k, v] of Object.entries(variables)) {
                resultado = resultado.replaceAll(`{${k}}`, String(v));
            }
            return resultado;
        }

        async enviarTrama(comandoStr) {
            if (window.Capacitor?.Plugins?.DronNative) {
                return await window.Capacitor.Plugins.DronNative.sendUdpPacket({
                    ip: this.ip,
                    port: this.puerto,
                    message: comandoStr,
                });
            } else {
                console.log(`[${this.protocolo} Genérico] -> ${this.ip}:${this.puerto} : "${comandoStr}"`);
                return { success: true };
            }
        }

        async conectar() {
            const cmd = this.interpolar(this.plantilla.conectar || 'connect');
            await this.enviarTrama(cmd);
            this.conectado = true;
            this.telemetria.estado = `conectado (${this.protocolo})`;
            this.notificarTelemetria();

            this.iniciarBucleRC((rc) => {
                const cmdRC = this.interpolar(this.plantilla.mover || 'rc {roll} {pitch} {throttle} {yaw}', rc);
                this.enviarTrama(cmdRC);
            });
            return true;
        }

        async despegar() {
            const cmd = this.interpolar(this.plantilla.despegar || 'takeoff');
            await this.enviarTrama(cmd);
            this.enVuelo = true;
            this.telemetria.estado = 'en vuelo';
            this.notificarTelemetria();
            return true;
        }

        async aterrizar() {
            const cmd = this.interpolar(this.plantilla.aterrizar || 'land');
            await this.enviarTrama(cmd);
            this.enVuelo = false;
            this.telemetria.estado = 'aterrizando';
            this.notificarTelemetria();
            return true;
        }

        async detenerEmergencia() {
            const cmd = this.interpolar(this.plantilla.emergencia || 'emergency');
            await this.enviarTrama(cmd);
            await super.detenerEmergencia();
            return true;
        }
    }

    // ============================================================
    // 6. FACTORY
    // ============================================================
    function crearAdaptador(perfil) {
        if (!perfil) {
            return new SimulatorDroneAdapter({ nombre: 'Simulador por defecto' });
        }

        // Acepta tanto tipo_adaptador (campo interno) como tipo_protocolo (campo de BD/UI)
        const tipo = ((perfil.tipo_adaptador || perfil.tipo_protocolo || 'simulador')).toLowerCase();

        switch (tipo) {
            case 'tello':
                return new TelloAdapter(perfil);
            case 'http':
                return new HttpDroneAdapter(perfil);
            case 'udp_tcp':
            case 'udp':
            case 'tcp':
                return new UdpTcpAdapter(perfil);
            case 'simulador':
            default:
                return new SimulatorDroneAdapter(perfil);
        }
    }

    return {
        crearAdaptador,
        DroneAdapter,
        SimulatorDroneAdapter,
        TelloAdapter,
        HttpDroneAdapter,
        UdpTcpAdapter,
        normalizarPlantilla,
    };
})();
