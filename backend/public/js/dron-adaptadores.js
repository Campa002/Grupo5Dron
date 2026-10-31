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
        function normalizarPerfil(perfil) {
        if (!perfil) return {};
        const clon = { ...perfil };
        clon.ip = clon.ip || clon.ip_dron || '192.168.10.1';
        clon.ip_dron = clon.ip;
        clon.puerto_comando = parseInt(clon.puerto_comando || clon.puerto_cmd || 8889, 10);
        clon.puerto_cmd = clon.puerto_comando;
        clon.puerto_estado = parseInt(clon.puerto_estado || clon.puerto_telemetria || 8890, 10);
        clon.puerto_video = parseInt(clon.puerto_video !== undefined && clon.puerto_video !== null ? clon.puerto_video : 11111, 10);
        clon.tipo_adaptador = (clon.tipo_adaptador || clon.tipo_protocolo || 'simulador').toLowerCase();
        clon.tipo_protocolo = clon.tipo_adaptador;
        return clon;
    }

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
            this.perfil = normalizarPerfil(perfil);
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

                async enviarComando(cmd, timeoutMs = 4000) {
            await new Promise(r => setTimeout(r, 300));
            cmd = (cmd || '').trim().toLowerCase();
            if (cmd === 'command') return 'ok';
            if (cmd === 'battery?') return String(Math.round(this.telemetria.bateria));
            if (cmd === 'streamon') return 'ok';
            if (cmd === 'streamoff') return 'ok';
            if (cmd.startsWith('forward') || cmd.startsWith('back') || cmd.startsWith('left') || cmd.startsWith('right')) {
                return 'ok';
            }
            if (cmd.startsWith('up')) {
                const parts = cmd.split(' ');
                const delta = (parseInt(parts[1], 10) || 20) / 100.0;
                this.telemetria.altura = Math.min(15.0, this.telemetria.altura + delta);
                this.notificarTelemetria();
                return 'ok';
            }
            if (cmd.startsWith('down')) {
                const parts = cmd.split(' ');
                const delta = (parseInt(parts[1], 10) || 20) / 100.0;
                this.telemetria.altura = Math.max(0.3, this.telemetria.altura - delta);
                this.notificarTelemetria();
                return 'ok';
            }
            if (cmd.startsWith('cw') || cmd.startsWith('ccw')) {
                return 'ok';
            }
            return 'ok';
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
                async enviarComando(cmd, timeoutMs = 8000) {
            console.log(`[Adapter] Ejecutando comando: "${cmd}"`);
            return 'ok';
        }

        async moverPaso(direccion, cm = 30) {
            cm = Math.max(20, Math.min(500, parseInt(cm, 10) || 30));
            const mapa = {
                'adelante': 'forward', 'forward': 'forward',
                'atras': 'back', 'back': 'back',
                'izquierda': 'left', 'left': 'left',
                'derecha': 'right', 'right': 'right'
            };
            const dir = mapa[direccion] || 'forward';
            return await this.enviarComando(`${dir} ${cm}`);
        }

        async girarPaso(grados = 90) {
            grados = parseInt(grados, 10) || 90;
            const sentido = grados >= 0 ? 'cw' : 'ccw';
            const deg = Math.max(1, Math.min(360, Math.abs(grados)));
            return await this.enviarComando(`${sentido} ${deg}`);
        }

        async subirPaso(cm = 30) {
            cm = Math.max(20, Math.min(500, parseInt(cm, 10) || 30));
            return await this.enviarComando(`up ${cm}`);
        }

        async bajarPaso(cm = 30) {
            cm = Math.max(20, Math.min(500, parseInt(cm, 10) || 30));
            return await this.enviarComando(`down ${cm}`);
        }

        async consultarBateria() {
            return await this.enviarComando('battery?');
        }

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
            this.ip = this.perfil.ip || '192.168.10.1';
            this.puertoComando = this.perfil.puerto_comando || 8889;
            this.puertoEstado = this.perfil.puerto_estado || 8890;
            this.puertoVideo = this.perfil.puerto_video || 11111;
            this.intervaloKeepAlive = null;
            this.esModoEmulado = false;
        }

        tienePluginNativo() {
            return !!(window.Capacitor?.Plugins?.DronNative);
        }

        async enviarComando(cmd, timeoutMs = 8000) {
            if (this.tienePluginNativo()) {
                const plugin = window.Capacitor.Plugins.DronNative;
                try {
                    // Invocar enviarComando nativo con timeout y respuesta
                    if (plugin.enviarComando) {
                        const res = await plugin.enviarComando({
                            host: this.ip,
                            puerto: this.puertoComando,
                            mensaje: cmd,
                            timeoutMs: timeoutMs
                        });
                        return res?.respuesta || 'ok';
                    } else if (plugin.sendUdpPacket) {
                        await plugin.sendUdpPacket({
                            ip: this.ip,
                            port: this.puertoComando,
                            message: cmd
                        });
                        return 'ok';
                    }
                } catch (e) {
                    console.error('[Tello Native Error]', e);
                    throw e;
                }
            } else {
                console.warn(`[Tello Web-Simulador] ${this.ip}:${this.puertoComando} -> "${cmd}"`);
                await new Promise(r => setTimeout(r, 200));
                if (cmd === 'battery?') return '85';
                return 'ok';
            }
        }

        async enviarUdp(comando) {
            return await this.enviarComando(comando, 3000);
        }

        async conectar() {
            console.log(`[Tello] Conectando a DJI Tello en ${this.ip}:${this.puertoComando}...`);

            if (!this.tienePluginNativo()) {
                this.esModoEmulado = true;
                this.telemetria.estado = 'MODO SIMULADOR: el dron real NO está conectado';
                this.notificarTelemetria();
                if (window.App?.mostrarToast) {
                    window.App.mostrarToast('MODO SIMULADOR: el dron real NO está conectado (falta plugin nativo)', 'advertencia', 6000);
                }
            } else {
                this.esModoEmulado = false;
            }

            // 1. Vincular proceso a la red Wi-Fi si existe la función nativa
            if (this.tienePluginNativo() && window.Capacitor.Plugins.DronNative.vincularRedWifi) {
                try {
                    await window.Capacitor.Plugins.DronNative.vincularRedWifi();
                } catch (e) {
                    console.warn('[Tello] No se pudo vincular la red WiFi:', e);
                }
            }

            // 2. Inicializar modo SDK
            try {
                const resp = await this.enviarComando('command', 4000);
                console.log('[Tello] Respuesta modo command:', resp);
            } catch (err) {
                console.warn('[Tello] Sin respuesta a "command":', err);
            }

            // 3. Iniciar video stream
            try {
                await this.enviarComando('streamon', 3000);
            } catch (err) {
                console.warn('[Tello] streamon error:', err);
            }

            this.conectado = true;
            if (!this.esModoEmulado) {
                this.telemetria.estado = 'conectado (Tello)';
            }
            this.notificarTelemetria();

            // 4. Iniciar escucha de telemetría y video nativo
            if (this.tienePluginNativo()) {
                const plugin = window.Capacitor.Plugins.DronNative;
                try {
                    if (plugin.iniciarEscucha) {
                        await plugin.iniciarEscucha({ puerto: this.puertoEstado });
                    } else if (plugin.startUdpListener) {
                        await plugin.startUdpListener({ port: this.puertoEstado });
                    }
                    plugin.addListener('telemetria', (data) => {
                        this.procesarStringEstado(data.raw || data.mensaje);
                    });
                    plugin.addListener('telloState', (data) => {
                        this.procesarStringEstado(data.raw || data.message);
                    });
                } catch (e) {
                    console.error('[Tello Listener Error]', e);
                }
            }

            // 5. Iniciar bucle RC continuo (15 Hz)
            this.iniciarBucleRC((rc) => {
                const cmd = `rc ${rc.roll} ${rc.pitch} ${rc.throttle} ${rc.yaw}`;
                if (this.tienePluginNativo() && window.Capacitor.Plugins.DronNative.sendUdpPacket) {
                    window.Capacitor.Plugins.DronNative.sendUdpPacket({
                        ip: this.ip,
                        port: this.puertoComando,
                        message: cmd
                    });
                } else {
                    // En modo emulado no spamear console
                }
            });

            // 6. Keep-alive cada 8 segundos (Tello aterriza si no recibe comandos en ~15s)
            this.intervaloKeepAlive = setInterval(() => {
                if (this.conectado && !this.enVuelo) {
                    this.enviarComando('command', 2000).catch(() => {});
                }
            }, 8000);

            return true;
        }

        procesarStringEstado(str) {
            if (!str) return;
            const partes = str.split(';');
            for (const parte of partes) {
                const [k, v] = parte.split(':');
                if (!k || v === undefined) continue;
                const clave = k.trim();
                const valor = parseFloat(v.trim());
                if (clave === 'bat') this.telemetria.bateria = valor;
                if (clave === 'h')   this.telemetria.altura = valor / 100.0;
                if (clave === 'pitch') this.telemetria.pitch = valor;
                if (clave === 'roll')  this.telemetria.roll = valor;
                if (clave === 'yaw')   this.telemetria.yaw = valor;
            }
            this.notificarTelemetria();
        }

        async desconectar() {
            if (this.intervaloKeepAlive) {
                clearInterval(this.intervaloKeepAlive);
                this.intervaloKeepAlive = null;
            }
            if (this.tienePluginNativo()) {
                try {
                    const plugin = window.Capacitor.Plugins.DronNative;
                    if (plugin.detenerEscucha) {
                        await plugin.detenerEscucha({ puerto: this.puertoEstado });
                    } else if (plugin.stopUdpListener) {
                        await plugin.stopUdpListener({ port: this.puertoEstado });
                    }
                } catch (e) {}
            }
            await super.desconectar();
        }

        async despegar() {
            console.log('[Tello] Despegando...');
            await this.enviarComando('takeoff', 10000);
            this.enVuelo = true;
            this.telemetria.estado = 'en vuelo';
            this.notificarTelemetria();
            return true;
        }

        async aterrizar() {
            console.log('[Tello] Aterrizando...');
            await this.enviarComando('land', 10000);
            this.enVuelo = false;
            this.telemetria.estado = 'aterrizando';
            this.notificarTelemetria();
            return true;
        }

        async detenerEmergencia() {
            console.warn('[Tello] 🛑 EMERGENCIA Tello!');
            await this.enviarComando('emergency', 3000);
            await super.detenerEmergencia();
            return true;
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
        perfil = normalizarPerfil(perfil);

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
        normalizarPerfil,
        DroneAdapter,
        SimulatorDroneAdapter,
        TelloAdapter,
        HttpDroneAdapter,
        UdpTcpAdapter,
        normalizarPlantilla,
    };
})();
