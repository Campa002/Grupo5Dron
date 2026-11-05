/**
 * Adaptadores de Dron Genéricos — Posibles Implementaciones
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 Eduardo Ader
 *
 * Implementaciones de referencia para drones controlados vía:
 *  1. HttpDroneAdapter: Cámaras ESP32-CAM / API REST (stream MJPEG y comandos JSON)
 *  2. UdpTcpAdapter: Protocolos de texto planos o binarios sobre sockets UDP/TCP configurables
 *
 * Movido desde dron-adaptadores.js para enfocar la app en DJI Tello y Simulador.
 */

// ============================================================
// 1. ADAPTADOR: Dron HTTP Genérico (Cámaras ESP32-CAM / API REST)
// ============================================================
class HttpDroneAdapter extends DronAdaptadores.DroneAdapter {
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
        return this.perfil.url_video || `${this.baseUrl}:8080/video`;
    }
}

// ============================================================
// 2. ADAPTADOR: UDP / TCP con Plantillas Configurables
// ============================================================
class UdpTcpAdapter extends DronAdaptadores.DroneAdapter {
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
        if (window.Capacitor?.Plugins?.DronNative && window.Capacitor.Plugins.DronNative.enviarSinRespuesta) {
            return await window.Capacitor.Plugins.DronNative.enviarSinRespuesta({
                host: this.ip,
                puerto: this.puerto,
                mensaje: comandoStr,
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

