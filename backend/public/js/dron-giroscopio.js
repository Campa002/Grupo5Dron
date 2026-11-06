/**
 * Módulo Giroscopio — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Gestiona el sensor DeviceOrientation del teléfono para traducir la
 * inclinación física en comandos de vuelo (pitch / roll).
 *
 * Características:
 *  - Solicitud de permiso explícito en iOS 13+ (DeviceOrientationEvent.requestPermission)
 *  - Calibración: la primera lectura después de activar (o de calibrar()) es el "centro"
 *  - Zona muerta (no envía si el movimiento es menor al umbral)
 *  - Suavizado exponencial (EMA) para reducir ruido
 *  - Límite máximo de ángulo de inclinación
 *  - Al desactivar, emite pitch y roll en 0
 *
 * Uso:
 *   const giro = new DronGiroscopio({ onChange: ({pitch, roll}) => { ... } });
 *   await giro.activar();
 *   giro.desactivar();
 */

// eslint-disable-next-line no-unused-vars
class DronGiroscopio {
    /**
     * @param {Object} config
     * @param {Function} [config.onChange]       - Callback ({ pitch, roll }) en [-1, 1].
     * @param {number}   [config.zonaMuerta]     - Ángulo mínimo (grados) para enviar valor. Default: 3.
     * @param {number}   [config.limiteAngulo]   - Ángulo máximo mapeado a 1.0. Default: 30.
     * @param {number}   [config.sensibilidad]   - Multiplicador [0.1, 2.0]. Default: 1.0.
     * @param {number}   [config.suavizado]      - Factor EMA [0, 1]. 0 = sin suavizado. Default: 0.3.
     */
    constructor({
        onChange = null,
        zonaMuerta = 3,
        limiteAngulo = 30,
        sensibilidad = 1.0,
        suavizado = 0.3,
    } = {}) {
        this.onChange     = onChange;
        this.zonaMuerta   = zonaMuerta;
        this.limiteAngulo = limiteAngulo;
        this.sensibilidad = sensibilidad;
        this.suavizado    = suavizado;

        this.activo     = false;
        this.permiso    = false; // true si el usuario otorgó permiso

        // Orientación de calibración (capturada en la primera lectura)
        this._baseBeta  = null;
        this._baseGamma = null;

        // Valores suavizados actuales
        this._pitchSuav = 0;
        this._rollSuav  = 0;

        // Valores exportados actuales
        this.pitch = 0;
        this.roll  = 0;

        // Handler enlazado para poder removerlo
        this._handler = this._procesarEvento.bind(this);
    }

    // ----------------------------------------------------------------
    // Activación / desactivación
    // ----------------------------------------------------------------

    /**
     * Activa el giroscopio. Solicita permiso si es necesario (iOS 13+).
     * @returns {Promise<{ ok: boolean, motivo?: string }>}
     */
    async activar() {
        if (this.activo) return { ok: true };

        // iOS 13+ requiere permiso explícito
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const resultado = await DeviceOrientationEvent.requestPermission();
                if (resultado !== 'granted') {
                    console.warn('[Giroscopio] Permiso denegado por el usuario.');
                    return { ok: false, motivo: 'permiso_denegado' };
                }
            } catch (err) {
                console.warn('[Giroscopio] Error al solicitar permiso:', err);
                return { ok: false, motivo: 'error_permiso' };
            }
        } else if (typeof DeviceOrientationEvent === 'undefined') {
            console.warn('[Giroscopio] DeviceOrientationEvent no disponible en este dispositivo.');
            return { ok: false, motivo: 'no_disponible' };
        }

        // Resetear calibración
        this._baseBeta  = null;
        this._baseGamma = null;
        this._pitchSuav = 0;
        this._rollSuav  = 0;
        this.pitch = 0;
        this.roll  = 0;
        this.permiso = true;

        window.addEventListener('deviceorientation', this._handler, true);
        this.activo = true;
        return { ok: true };
    }

    /**
     * Desactiva el giroscopio y emite valores 0.
     */
    desactivar() {
        if (!this.activo) return;
        window.removeEventListener('deviceorientation', this._handler, true);
        this.activo = false;
        this.pitch  = 0;
        this.roll   = 0;
        this._pitchSuav = 0;
        this._rollSuav  = 0;
        if (typeof this.onChange === 'function') {
            this.onChange({ pitch: 0, roll: 0 });
        }
    }

    /**
     * Recalibra: guarda la orientación actual como base.
     */
    calibrar() {
        this._baseBeta  = null;
        this._baseGamma = null;
    }

    // ----------------------------------------------------------------
    // Procesamiento interno
    // ----------------------------------------------------------------

    _procesarEvento(evento) {
        // beta  ≈ inclinación adelante/atrás  → Pitch
        // gamma ≈ inclinación izquierda/derecha → Roll
        const beta  = evento.beta  ?? 0;
        const gamma = evento.gamma ?? 0;

        // Primera lectura → guardar como calibración base
        if (this._baseBeta === null) {
            this._baseBeta  = beta;
            this._baseGamma = gamma;
            return; // La primera lectura sólo calibra
        }

        let deltaBeta  = beta  - this._baseBeta;
        let deltaGamma = gamma - this._baseGamma;

        // Zona muerta
        if (Math.abs(deltaBeta)  < this.zonaMuerta) deltaBeta  = 0;
        if (Math.abs(deltaGamma) < this.zonaMuerta) deltaGamma = 0;

        // Normalizar al rango [-1, 1] con límite de ángulo y sensibilidad
        const limitado = this.limiteAngulo / this.sensibilidad;
        let pitchRaw = this._clamp(deltaBeta  / limitado, -1, 1);
        let rollRaw  = this._clamp(deltaGamma / limitado, -1, 1);

        // Suavizado exponencial (EMA)
        const alpha_ema = this.suavizado;
        this._pitchSuav = pitchRaw  + alpha_ema * (this._pitchSuav - pitchRaw);
        this._rollSuav  = rollRaw   + alpha_ema * (this._rollSuav  - rollRaw);

        const pitchFinal = parseFloat(this._pitchSuav.toFixed(3));
        const rollFinal  = parseFloat(this._rollSuav.toFixed(3));

        // Emitir sólo si hubo cambio
        if (pitchFinal !== this.pitch || rollFinal !== this.roll) {
            this.pitch = pitchFinal;
            this.roll  = rollFinal;
            if (typeof this.onChange === 'function') {
                this.onChange({ pitch: this.pitch, roll: this.roll });
            }
        }
    }

    _clamp(valor, min, max) {
        return Math.max(min, Math.min(max, valor));
    }
}
