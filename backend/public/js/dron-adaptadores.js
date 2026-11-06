/**
 * Adaptadores de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Patrón Adapter: la cabina (dron.js) habla siempre con la misma interfaz y
 * cada adaptador traduce al protocolo concreto. Solo hay dos:
 *  - TelloAdapter:          DJI Ryze Tello por UDP (SDK 1.3) a través del plugin nativo DronNative.
 *  - SimulatorDroneAdapter: simulador en el navegador, para practicar sin dron.
 *
 * DronNativo centraliza el contrato con el plugin Java (DronNativePlugin.java).
 * Si cambiás un nombre de método o de evento, cambialo en los dos lados.
 */

// eslint-disable-next-line no-unused-vars
const DronAdaptadores = (() => {
    'use strict';

    // ============================================================
    // 0. CONTRATO CON EL PLUGIN NATIVO (fuente de verdad: DronNativePlugin.java)
    // ============================================================
    //  enviarComando({host, puerto, mensaje, timeoutMs}) -> {respuesta, error?}  (nunca rechaza: si no hay respuesta, respuesta = 'timeout')
    //  enviarSinRespuesta({host, puerto, mensaje})       -> {enviado}            (para rc y emergency)
    //  iniciarEscucha({puerto}) / detenerEscucha({puerto})
    //  vincularRedWifi() -> {vinculada, motivo}
    //  info() -> {version, sdkAndroid, redVinculada}
    //  Eventos: 'telemetria' {raw, puerto} y 'videoPaquete' {data (base64), tamano, paquetes}
    const DronNativo = {
        EVENTO_TELEMETRIA: 'telemetria',
        EVENTO_VIDEO: 'videoPaquete',

        disponible() {
            return !!(window.Capacitor?.Plugins?.DronNative);
        },

        _plugin() {
            const p = window.Capacitor?.Plugins?.DronNative;
            if (!p) throw new Error('Hace falta la app instalada en el celular para hablar con el dron.');
            return p;
        },

        /** Envía un comando y espera la respuesta. Devuelve {respuesta, error}. Nunca rechaza. */
        async enviarComando(host, puerto, mensaje, timeoutMs = 5000) {
            try {
                const r = await this._plugin().enviarComando({ host, puerto, mensaje, timeoutMs });
                const respuesta = String(r?.respuesta ?? '').trim();
                return { respuesta: respuesta || 'sin respuesta', error: r?.error || null };
            } catch (e) {
                return { respuesta: 'error', error: e?.message || String(e) };
            }
        },

        /** Envía sin esperar respuesta (rc, emergency). No bloquea. */
        enviarSinRespuesta(host, puerto, mensaje) {
            try {
                const p = this._plugin().enviarSinRespuesta({ host, puerto, mensaje });
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) { /* sin plugin: nada que hacer */ }
        },

        iniciarEscucha(puerto) {
            return this._plugin().iniciarEscucha({ puerto });
        },

        async detenerEscucha(puerto) {
            try { await this._plugin().detenerEscucha({ puerto }); } catch (_) { /* ya cerrada */ }
        },

        async vincularRedWifi() {
            try {
                return await this._plugin().vincularRedWifi();
            } catch (e) {
                return { vinculada: false, motivo: e?.message || String(e) };
            }
        },

        info() {
            return this._plugin().info();
        },

        /**
         * Registra un oyente de evento y devuelve un objeto con remove().
         * (En Capacitor 5 addListener devuelve el handle directo; se acepta también una Promise.)
         */
        escuchar(evento, callback) {
            const h = this._plugin().addListener(evento, callback);
            return {
                remove: async () => {
                    try { const handle = await h; await handle?.remove?.(); } catch (_) { /* nada */ }
                },
            };
        },
    };

    /** true si la respuesta del Tello es "ok". */
    function esOk(respuesta) {
        return String(respuesta ?? '').trim().toLowerCase() === 'ok';
    }

    /**
     * Unifica los nombres de campos que pueden venir de la API, de la caché o del perfil por defecto.
     */
    function normalizarPerfil(perfil) {
        if (!perfil) return {};
        const clon = { ...perfil };
        const entero = (v, def) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : def; };
        clon.ip = clon.ip || clon.ip_dron || '192.168.10.1';
        clon.ip_dron = clon.ip;
        clon.puerto_comando = entero(clon.puerto_comando ?? clon.puerto_cmd, 8889);
        clon.puerto_cmd = clon.puerto_comando;
        clon.puerto_estado = entero(clon.puerto_estado ?? clon.puerto_telemetria, 8890);
        clon.puerto_video = entero(clon.puerto_video, 11111);
        clon.tipo_adaptador = String(clon.tipo_adaptador || clon.tipo_protocolo || 'simulador').toLowerCase();
        clon.tipo_protocolo = clon.tipo_adaptador;
        return clon;
    }

    const esperar = ms => new Promise(r => setTimeout(r, ms));
    const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

    // ============================================================
    // 1. CLASE BASE
    // ============================================================
    class DroneAdapter {
        constructor(perfil) {
            this.perfil = normalizarPerfil(perfil);
            this.conectado = false;
            this.enVuelo = false;
            // null = todavía no llegó el dato (la cabina muestra "--")
            this.telemetria = {
                bateria: null,     // %
                altura: null,      // cm
                velocidad: null,   // cm/s
                tiempoVuelo: null, // s con motores encendidos
                estado: 'desconectado',
            };
            // Momento (ms) del último paquete de telemetría REAL. Lo usa el failsafe.
            this.ultimaTelemetriaTs = 0;
            this.oyentesTelemetria = [];
            this.intervaloBucleRC = null;
            this.rcPausado = false;
            // Failsafe: si es true no sale NINGÚN comando automático (ni rc ni keep-alive)
            this.enviosSuspendidos = false;
            // Se incrementa en cada emergencia: un despegue en curso no debe marcar "en vuelo" después
            this.generacionEmergencia = 0;
            // Ejes RC normalizados a -100..100 (formato del comando "rc a b c d")
            this.valoresRC = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
            this.frecuenciaRCHz = 15;
        }

        async conectar() { throw new Error('conectar() no implementado'); }
        async enviarComando() { throw new Error('enviarComando() no implementado'); }
        async despegar() { throw new Error('despegar() no implementado'); }
        async aterrizar() { throw new Error('aterrizar() no implementado'); }

        async desconectar() {
            this.detenerBucleRC();
            this.conectado = false;
            this.enVuelo = false;
            this.enviosSuspendidos = false;
            this.telemetria.estado = 'desconectado';
            this.notificarTelemetria();
        }

        /** Envía un comando y lanza un Error si la respuesta no es "ok". */
        async comandoOk(cmd, timeoutMs) {
            const resp = await this.enviarComando(cmd, timeoutMs);
            if (!esOk(resp)) {
                throw new Error(`El dron no pudo hacerlo (respondió "${resp}" a "${cmd}")`);
            }
            return resp;
        }

        async detenerEmergencia() {
            this.generacionEmergencia++;
            this.detenerRC();
            this.enVuelo = false;
            this.enviosSuspendidos = false;
            this.telemetria.estado = 'motores apagados';
            this.notificarTelemetria();
        }

        // ---- Movimientos por paso (el dron responde "ok" al terminar el movimiento) ----

        async moverPaso(direccion, cm = 30) {
            cm = limitar(parseInt(cm, 10) || 30, 20, 500);
            const mapa = { adelante: 'forward', atras: 'back', izquierda: 'left', derecha: 'right',
                           forward: 'forward', back: 'back', left: 'left', right: 'right' };
            const dir = mapa[direccion];
            if (!dir) throw new Error(`Dirección desconocida: ${direccion}`);
            return this.comandoOk(`${dir} ${cm}`, 15000);
        }

        async girarPaso(grados = 90) {
            grados = parseInt(grados, 10) || 90;
            const sentido = grados >= 0 ? 'cw' : 'ccw';
            return this.comandoOk(`${sentido} ${limitar(Math.abs(grados), 1, 360)}`, 15000);
        }

        async subirPaso(cm = 30) {
            return this.comandoOk(`up ${limitar(parseInt(cm, 10) || 30, 20, 500)}`, 15000);
        }

        async bajarPaso(cm = 30) {
            return this.comandoOk(`down ${limitar(parseInt(cm, 10) || 30, 20, 500)}`, 15000);
        }

        // ---- Control continuo (rc) ----

        /**
         * Actualiza SOLO los ejes recibidos, en [-1, 1]. Los demás quedan como estaban.
         * Así los dos joysticks (o giroscopio + joystick) no se pisan entre sí.
         * @param {{lr?: number, fb?: number, ud?: number, yaw?: number}} ejes
         */
        actualizarEjes(ejes = {}) {
            const a = v => limitar(Math.round((Number(v) || 0) * 100), -100, 100);
            if ('lr' in ejes)  this.valoresRC.roll     = a(ejes.lr);
            if ('fb' in ejes)  this.valoresRC.pitch    = a(ejes.fb);
            if ('ud' in ejes)  this.valoresRC.throttle = a(ejes.ud);
            if ('yaw' in ejes) this.valoresRC.yaw      = a(ejes.yaw);
        }

        /** Pone los cuatro ejes en cero. */
        detenerRC() {
            this.valoresRC = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
        }

        /** Freno: ejes en cero y "rc 0 0 0 0" inmediato, sin esperar respuesta. */
        frenar() {
            this.detenerRC();
        }

        /** Pausa el envío continuo de rc (mientras corre un paso o una misión). */
        pausarRC() {
            this.detenerRC();
            this.rcPausado = true;
        }

        reanudarRC() {
            this.detenerRC();
            this.rcPausado = false;
        }

        /**
         * Failsafe: deja de mandar todo comando automático (rc continuo y keep-alive).
         * Si el enlace está caído a medias, así el Tello activa su aterrizaje automático
         * (~15 s sin recibir comandos). Se levanta solo cuando el dron queda en tierra
         * (aterrizaje confirmado o emergencia) o al desconectar.
         */
        suspenderEnviosAutomaticos() {
            this.detenerRC();
            this.enviosSuspendidos = true;
        }

        iniciarBucleRC(callbackEnvio) {
            this.detenerBucleRC();
            const intervaloMs = Math.round(1000 / this.frecuenciaRCHz);
            this.intervaloBucleRC = setInterval(() => {
                if (this.conectado && this.enVuelo && !this.rcPausado && !this.enviosSuspendidos && callbackEnvio) {
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

        // ---- Video (lo implementa el Tello) ----
        tieneVideo() { return false; }
        async iniciarVideo() { return false; }

        // ---- Telemetría ----

        obtenerTelemetria() {
            return { ...this.telemetria };
        }

        agregarOyenteTelemetria(callback) {
            if (typeof callback === 'function') this.oyentesTelemetria.push(callback);
        }

        notificarTelemetria() {
            const copia = this.obtenerTelemetria();
            for (const cb of this.oyentesTelemetria) {
                try { cb(copia); } catch (e) { console.error(e); }
            }
        }
    }

    // ============================================================
    // 2. SIMULADOR (navegador)
    // ============================================================
    class SimulatorDroneAdapter extends DroneAdapter {
        constructor(perfil) {
            super(perfil);
            this.intervaloSimulador = null;
            // Para pruebas del failsafe: si es true, el simulador deja de "mandar" telemetría.
            this.pausarTelemetria = false;
        }

        async enviarComando(cmd) {
            cmd = String(cmd || '').trim().toLowerCase();
            const [accion, valorTxt] = cmd.split(/\s+/);
            const valor = parseInt(valorTxt, 10) || 0;
            const movimientos = ['forward', 'back', 'left', 'right', 'up', 'down', 'cw', 'ccw'];
            if (movimientos.includes(accion)) {
                if (!this.enVuelo) return 'error Not flying';
                // Duración aproximada del movimiento real
                await esperar(accion === 'cw' || accion === 'ccw' ? 300 + valor * 8 : 300 + valor * 10);
                if (accion === 'up') this.telemetria.altura = Math.min(1000, (this.telemetria.altura || 0) + valor);
                if (accion === 'down') this.telemetria.altura = Math.max(30, (this.telemetria.altura || 0) - valor);
                this.notificarTelemetria();
                return 'ok';
            }
            await esperar(100);
            if (accion === 'battery?') return String(Math.round(this.telemetria.bateria ?? 0));
            return 'ok';
        }

        async conectar() {
            await esperar(500);
            this.conectado = true;
            this.telemetria.bateria = 100;
            this.telemetria.altura = 0;
            this.telemetria.velocidad = 0;
            this.telemetria.tiempoVuelo = 0;
            this.telemetria.estado = 'en tierra';
            this.ultimaTelemetriaTs = Date.now();
            this.notificarTelemetria();

            // Física básica: el rc mueve la altura y la velocidad
            this.iniciarBucleRC((rc) => {
                const deltaCm = (rc.throttle / 100) * 8;
                this.telemetria.altura = limitar((this.telemetria.altura || 0) + deltaCm, 30, 1000);
                this.telemetria.velocidad = Math.round(Math.sqrt(rc.roll ** 2 + rc.pitch ** 2));
            });

            // "Paquete de telemetría" cada 500 ms
            this.intervaloSimulador = setInterval(() => {
                if (!this.conectado || this.pausarTelemetria) return;
                if (this.enVuelo) {
                    this.telemetria.bateria = Math.max(0, this.telemetria.bateria - 0.1);
                    this.telemetria.tiempoVuelo += 0.5;
                } else {
                    this.telemetria.velocidad = 0;
                }
                this.ultimaTelemetriaTs = Date.now();
                this.notificarTelemetria();
            }, 500);
            return true;
        }

        async desconectar() {
            if (this.intervaloSimulador) {
                clearInterval(this.intervaloSimulador);
                this.intervaloSimulador = null;
            }
            await super.desconectar();
        }

        async despegar() {
            if (!this.conectado) throw new Error('El simulador no está conectado.');
            const gen = this.generacionEmergencia;
            await esperar(800);
            if (gen !== this.generacionEmergencia) throw new Error('Despegue cancelado por emergencia.');
            this.enVuelo = true;
            this.telemetria.altura = 80;
            this.telemetria.estado = 'en vuelo';
            this.notificarTelemetria();
            return true;
        }

        async aterrizar() {
            this.detenerRC();
            await esperar(800);
            this.enVuelo = false;
            this.enviosSuspendidos = false;
            this.telemetria.altura = 0;
            this.telemetria.velocidad = 0;
            this.telemetria.estado = 'en tierra';
            this.notificarTelemetria();
            return true;
        }

        async detenerEmergencia() {
            await super.detenerEmergencia();
            this.telemetria.altura = 0;
            this.telemetria.velocidad = 0;
            this.notificarTelemetria();
            return true;
        }
    }

    // ============================================================
    // 3. DJI TELLO (UDP, SDK 1.3, vía plugin nativo)
    // ============================================================
    class TelloAdapter extends DroneAdapter {
        constructor(perfil) {
            super(perfil);
            this.ip = this.perfil.ip;
            this.puertoComando = this.perfil.puerto_comando;
            this.puertoEstado = this.perfil.puerto_estado;
            this.puertoVideo = this.perfil.puerto_video;
            this.intervaloKeepAlive = null;
            this.comandosEnCurso = 0;
            this.redVinculada = null;
            this.ultimaRespuestaCommand = null;
            this._oyentesNativos = [];   // handles con remove()
            this._escuchasAbiertas = new Set();
        }

        async enviarComando(cmd, timeoutMs = 8000) {
            this.comandosEnCurso++;
            try {
                const { respuesta } = await DronNativo.enviarComando(this.ip, this.puertoComando, cmd, timeoutMs);
                return respuesta;
            } finally {
                this.comandosEnCurso--;
            }
        }

        _enviarRC(rc) {
            DronNativo.enviarSinRespuesta(this.ip, this.puertoComando, `rc ${rc.roll} ${rc.pitch} ${rc.throttle} ${rc.yaw}`);
        }

        async _abrirEscucha(puerto) {
            await DronNativo.iniciarEscucha(puerto);
            this._escuchasAbiertas.add(puerto);
        }

        async _liberarRecursos() {
            if (this.intervaloKeepAlive) {
                clearInterval(this.intervaloKeepAlive);
                this.intervaloKeepAlive = null;
            }
            this.detenerBucleRC();
            const oyentes = this._oyentesNativos.splice(0);
            await Promise.all(oyentes.map(h => h.remove()));
            const puertos = [...this._escuchasAbiertas];
            this._escuchasAbiertas.clear();
            await Promise.all(puertos.map(p => DronNativo.detenerEscucha(p)));
        }

        async conectar() {
            if (!DronNativo.disponible()) {
                throw new Error('Para usar el dron real hace falta la app instalada en el celular. En la computadora elegí el perfil Simulador.');
            }
            await this._liberarRecursos();

            // 1. Forzar el uso del WiFi del Tello aunque no tenga internet
            const red = await DronNativo.vincularRedWifi();
            this.redVinculada = !!red?.vinculada;

            // 2. Escuchar telemetría ANTES de "command" para no perder los primeros paquetes
            this._oyentesNativos.push(DronNativo.escuchar(DronNativo.EVENTO_TELEMETRIA, (d) => this.procesarStringEstado(d?.raw)));
            await this._abrirEscucha(this.puertoEstado);

            // 3. Modo SDK: hasta 2 intentos
            let resp = '';
            for (let intento = 0; intento < 2 && !esOk(resp); intento++) {
                resp = await this.enviarComando('command', 3000);
            }
            this.ultimaRespuestaCommand = resp;
            if (!esOk(resp)) {
                await this._liberarRecursos();
                const motivoRed = this.redVinculada ? '' : ` La red WiFi no se pudo vincular (${red?.motivo || 'sin motivo'}).`;
                throw new Error(`El dron no respondió. ¿Está prendido y el celular conectado a su WiFi TELLO-XXXXXX? (respuesta: "${resp}")${motivoRed}`);
            }

            this.conectado = true;
            this.telemetria.estado = 'conectado';
            this.notificarTelemetria();

            // 4. Bucle rc continuo (15 Hz) — solo en vuelo y si no está pausado
            this.iniciarBucleRC(rc => this._enviarRC(rc));

            // 5. Keep-alive en tierra (el Tello sale del modo SDK si pasan ~15 s sin comandos).
            //    En vuelo lo mantiene vivo el rc o el comando del paso en curso.
            this.intervaloKeepAlive = setInterval(() => {
                if (this.conectado && !this.enVuelo && !this.enviosSuspendidos && this.comandosEnCurso === 0) {
                    this.enviarComando('command', 2000);
                }
            }, 8000);
            return true;
        }

        tieneVideo() { return true; }

        /**
         * Activa el video: abre la escucha en el puerto de video y manda "streamon".
         * @param {Function} onPaquete recibe {data, tamano, paquetes}
         * @returns {Promise<boolean>} true si el Tello respondió "ok" a streamon
         */
        async iniciarVideo(onPaquete) {
            if (!this.conectado) return false;
            this._oyentesNativos.push(DronNativo.escuchar(DronNativo.EVENTO_VIDEO, onPaquete));
            await this._abrirEscucha(this.puertoVideo);
            const resp = await this.enviarComando('streamon', 3000);
            return esOk(resp);
        }

        procesarStringEstado(str) {
            if (!str) return;
            const datos = {};
            for (const parte of String(str).split(';')) {
                const [k, v] = parte.split(':');
                if (!k || v === undefined) continue;
                const n = parseFloat(v);
                if (Number.isFinite(n)) datos[k.trim()] = n;
            }
            if ('bat' in datos) this.telemetria.bateria = datos.bat;
            if ('h' in datos) this.telemetria.altura = datos.h;                 // cm
            if ('time' in datos) this.telemetria.tiempoVuelo = datos.time;      // s con motores encendidos
            if ('vgx' in datos && 'vgy' in datos) {
                // El SDK no documenta la unidad de vgx/vgy; se asume dm/s (verificar en la prueba real).
                this.telemetria.velocidad = Math.round(Math.hypot(datos.vgx, datos.vgy) * 10);
            }
            this.ultimaTelemetriaTs = Date.now();
            this.notificarTelemetria();
        }

        async desconectar() {
            await this._liberarRecursos();
            await super.desconectar();
        }

        async despegar() {
            if (!this.conectado) throw new Error('El dron no está conectado.');
            this.detenerRC();
            const gen = this.generacionEmergencia;
            const resp = await this.enviarComando('takeoff', 20000);
            if (gen !== this.generacionEmergencia) throw new Error('Despegue cancelado por emergencia.');
            if (!esOk(resp)) {
                // Si la respuesta se perdió pero la telemetría dice que está en el aire, tratarlo como en vuelo
                if ((this.telemetria.altura || 0) >= 30 && Date.now() - this.ultimaTelemetriaTs < 2000) {
                    this.enVuelo = true;
                    this.telemetria.estado = 'en vuelo';
                    this.notificarTelemetria();
                    return true;
                }
                throw new Error(`El dron no avisó que despegó (respuesta: "${resp}").`);
            }
            this.enVuelo = true;
            this.telemetria.estado = 'en vuelo';
            this.notificarTelemetria();
            return true;
        }

        async aterrizar(timeoutMs = 20000) {
            // Sin rc mientras aterriza, para no interferir con "land"
            const estabaPausado = this.rcPausado;
            this.pausarRC();
            let resp;
            try {
                resp = await this.enviarComando('land', timeoutMs);
            } finally {
                this.rcPausado = estabaPausado;
            }
            if (!esOk(resp)) {
                if (this.telemetria.altura !== null && this.telemetria.altura < 10 && Date.now() - this.ultimaTelemetriaTs < 2000) {
                    this.enVuelo = false;
                    this.enviosSuspendidos = false;
                    this.telemetria.estado = 'en tierra';
                    this.notificarTelemetria();
                    return true;
                }
                throw new Error(`El dron no avisó que aterrizó (respuesta: "${resp}").`);
            }
            this.enVuelo = false;
            this.enviosSuspendidos = false;
            this.telemetria.estado = 'en tierra';
            this.notificarTelemetria();
            return true;
        }

        frenar() {
            super.frenar();
            // "stop" es del SDK 2.0 (Tello EDU): en el Tello común se frena con rc en cero.
            // Con el failsafe activo no se manda nada (para no reiniciar el aterrizaje automático del Tello).
            if (!this.enviosSuspendidos) this._enviarRC(this.valoresRC);
        }

        async detenerEmergencia() {
            // Inmediato y sin esperar: por el socket reutilizado del rc
            DronNativo.enviarSinRespuesta(this.ip, this.puertoComando, 'emergency');
            await super.detenerEmergencia();
            // Segundo envío con respuesta, solo para registro (no bloquea la interfaz)
            this.enviarComando('emergency', 1500);
            return true;
        }
    }

    // ============================================================
    // 4. FÁBRICA (solo DJI Tello y Simulador)
    // ============================================================
    function crearAdaptador(perfil) {
        const p = normalizarPerfil(perfil);
        return p.tipo_adaptador === 'tello' ? new TelloAdapter(p) : new SimulatorDroneAdapter(p);
    }

    return {
        crearAdaptador,
        normalizarPerfil,
        esOk,
        DronNativo,
        DroneAdapter,
        SimulatorDroneAdapter,
        TelloAdapter,
    };
})();
