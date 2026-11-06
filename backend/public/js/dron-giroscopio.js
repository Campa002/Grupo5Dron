/**
 * Módulo Giroscopio — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Traduce la inclinación física del teléfono en comandos de vuelo (pitch / roll).
 *
 * De dónde sale la inclinación (LectorInclinacion):
 *  - Con giroscopio: el evento deviceorientation (beta, gamma, alpha). Es lo de siempre.
 *  - Sin giroscopio (por ejemplo, Samsung Galaxy A06): el navegador manda deviceorientation vacío o no lo manda.
 *    Si en ~0,7 s no llegan datos de orientación, se calcula beta y gamma con el acelerómetro
 *    (accelerationIncludingGravity de devicemotion), suavizado. Sin giroscopio no se puede medir el giro
 *    sobre el eje vertical (alpha / yaw): queda en null y se avisa.
 *  - Si después aparece la orientación (giroscopio que tardó), se pasa a ella y se recalibra.
 *
 * DronGiroscopio (lo usa la cabina):
 *  - Permiso explícito en iOS 13+.
 *  - Calibración: la primera lectura después de activar (o de calibrar() o de cambiar de sensor) es el "centro".
 *  - Zona muerta, límite de ángulo, sensibilidad y suavizado (EMA), iguales que antes.
 *  - Al desactivar, emite pitch y roll en 0.
 *
 * Uso:
 *   const giro = new DronGiroscopio({ onChange: ({pitch, roll}) => { ... } });
 *   giro.onFuente = (fuente) => { ... };  // 'giroscopio' | 'acelerometro' | 'ninguno'
 *   await giro.activar();
 *   giro.desactivar();
 */

/**
 * beta y gamma (grados) a partir de la gravedad que mide el acelerómetro, con la misma convención que
 * deviceorientation en Android: beta = 0 apoyado boca arriba y 90 parado (pantalla hacia vos);
 * gamma positivo al bajar el costado derecho. Rango: beta (-180, 180], gamma [-90, 90].
 * @param {number} x @param {number} y @param {number} z  accelerationIncludingGravity (m/s²)
 */
function inclinacionDesdeGravedad(x, y, z) {
    const grados = 180 / Math.PI;
    return {
        beta: Math.atan2(y, z) * grados,
        gamma: Math.atan2(-x, Math.hypot(y, z)) * grados,
    };
}

/** Texto para la interfaz según el sensor que se está usando. */
function textoFuenteInclinacion(fuente) {
    switch (fuente) {
        case 'giroscopio': return 'Sensor: giroscopio.';
        case 'acelerometro': return 'Giroscopio: no disponible, usando acelerómetro. El giro sobre el eje vertical no se puede medir.';
        case 'ninguno': return 'No llegan datos de inclinación: este dispositivo no tiene los sensores o el navegador no los da (en una PC es normal).';
        default: return 'Buscando el sensor de inclinación...';
    }
}

/**
 * Lee la inclinación del teléfono del sensor que haya. Emite lecturas crudas (sin calibrar).
 * `objetivo` permite probarlo sin navegador (cualquier EventTarget).
 */
class LectorInclinacion {
    /**
     * @param {Object} config
     * @param {Function} [config.onLectura]  ({beta, gamma, alpha, fuente}) — alpha es null con el acelerómetro
     * @param {Function} [config.onFuente]   (fuente) cuando se decide o cambia el sensor
     * @param {number}   [config.esperaMs]   cuánto esperar la orientación antes de usar el acelerómetro
     * @param {number}   [config.sinDatosMs] sin ninguna lectura en este tiempo → 'ninguno'
     * @param {number}   [config.suavizado]  peso de la muestra nueva del acelerómetro (filtro pasa bajos)
     * @param {EventTarget} [config.objetivo]
     */
    constructor({ onLectura = null, onFuente = null, esperaMs = 700, sinDatosMs = 2500, suavizado = 0.25, objetivo = null } = {}) {
        this.onLectura = onLectura;
        this.onFuente = onFuente;
        this.esperaMs = esperaMs;
        this.sinDatosMs = sinDatosMs;
        this.suavizado = suavizado;
        this.objetivo = objetivo || (typeof window !== 'undefined' ? window : null);
        this.fuente = null;          // null (decidiendo) | 'giroscopio' | 'acelerometro' | 'ninguno'
        this.activo = false;
        this._g = null;              // gravedad suavizada
        this._t0 = 0;
        this._timerSinDatos = null;
        this._onOrientacion = this._procesarOrientacion.bind(this);
        this._onMovimiento = this._procesarMovimiento.bind(this);
    }

    iniciar() {
        if (this.activo || !this.objetivo) return;
        this.activo = true;
        this.fuente = null;
        this._g = null;
        this._t0 = Date.now();
        this.objetivo.addEventListener('deviceorientation', this._onOrientacion, true);
        this.objetivo.addEventListener('devicemotion', this._onMovimiento, true);
        this._timerSinDatos = setTimeout(() => {
            if (this.activo && this.fuente === null) this._cambiarFuente('ninguno');
        }, this.sinDatosMs);
    }

    detener() {
        if (!this.activo) return;
        this.activo = false;
        clearTimeout(this._timerSinDatos);
        this.objetivo.removeEventListener('deviceorientation', this._onOrientacion, true);
        this.objetivo.removeEventListener('devicemotion', this._onMovimiento, true);
    }

    _cambiarFuente(fuente) {
        if (this.fuente === fuente) return;
        this.fuente = fuente;
        if (fuente === 'giroscopio') {
            // Con orientación real no hace falta el acelerómetro
            this.objetivo.removeEventListener('devicemotion', this._onMovimiento, true);
        }
        if (typeof this.onFuente === 'function') this.onFuente(fuente);
    }

    _procesarOrientacion(ev) {
        // Sin giroscopio, Chrome puede mandar el evento con todo en null: no son datos
        if (typeof ev.beta !== 'number' || typeof ev.gamma !== 'number') return;
        this._cambiarFuente('giroscopio');
        if (typeof this.onLectura === 'function') {
            this.onLectura({ beta: ev.beta, gamma: ev.gamma, alpha: typeof ev.alpha === 'number' ? ev.alpha : null, fuente: 'giroscopio' });
        }
    }

    _procesarMovimiento(ev) {
        if (this.fuente === 'giroscopio') return;
        const g = ev.accelerationIncludingGravity;
        if (!g || typeof g.x !== 'number' || typeof g.y !== 'number' || typeof g.z !== 'number') return;
        // Filtro pasa bajos: deja la gravedad y saca los movimientos bruscos de la mano
        const k = this.suavizado;
        this._g = this._g
            ? { x: this._g.x + k * (g.x - this._g.x), y: this._g.y + k * (g.y - this._g.y), z: this._g.z + k * (g.z - this._g.z) }
            : { x: g.x, y: g.y, z: g.z };
        // Se le da tiempo a la orientación (giroscopio) antes de decidir usar el acelerómetro
        if (this.fuente === null && Date.now() - this._t0 < this.esperaMs) return;
        this._cambiarFuente('acelerometro');
        const { beta, gamma } = inclinacionDesdeGravedad(this._g.x, this._g.y, this._g.z);
        if (typeof this.onLectura === 'function') this.onLectura({ beta, gamma, alpha: null, fuente: 'acelerometro' });
    }
}

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
        /** @type {Function|null} (fuente) 'giroscopio' | 'acelerometro' | 'ninguno' */
        this.onFuente     = null;
        this.zonaMuerta   = zonaMuerta;
        this.limiteAngulo = limiteAngulo;
        this.sensibilidad = sensibilidad;
        this.suavizado    = suavizado;

        this.activo  = false;
        this.permiso = false; // true si el usuario otorgó permiso
        this.fuente  = null;

        // Orientación de calibración (capturada en la primera lectura)
        this._baseBeta  = null;
        this._baseGamma = null;

        // Valores suavizados actuales
        this._pitchSuav = 0;
        this._rollSuav  = 0;

        // Valores exportados actuales
        this.pitch = 0;
        this.roll  = 0;

        this._lector = null;
    }

    // ----------------------------------------------------------------
    // Activación / desactivación
    // ----------------------------------------------------------------

    /**
     * Activa la lectura de inclinación. Solicita permiso si es necesario (iOS 13+).
     * @returns {Promise<{ ok: boolean, motivo?: string }>}
     */
    async activar() {
        if (this.activo) return { ok: true };

        const hayOrientacion = typeof DeviceOrientationEvent !== 'undefined';
        const hayMovimiento = typeof DeviceMotionEvent !== 'undefined';
        if (!hayOrientacion && !hayMovimiento) {
            console.warn('[Giroscopio] Este navegador no da acceso a los sensores de movimiento.');
            return { ok: false, motivo: 'no_disponible' };
        }

        // iOS 13+ requiere permiso explícito
        if (hayOrientacion && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const resultado = await DeviceOrientationEvent.requestPermission();
                if (resultado !== 'granted') {
                    console.warn('[Giroscopio] Permiso denegado por el usuario.');
                    return { ok: false, motivo: 'permiso_denegado' };
                }
                if (hayMovimiento && typeof DeviceMotionEvent.requestPermission === 'function') {
                    await DeviceMotionEvent.requestPermission().catch(() => {});
                }
            } catch (err) {
                console.warn('[Giroscopio] Error al solicitar permiso:', err);
                return { ok: false, motivo: 'error_permiso' };
            }
        }

        // Resetear calibración
        this._baseBeta  = null;
        this._baseGamma = null;
        this._pitchSuav = 0;
        this._rollSuav  = 0;
        this.pitch = 0;
        this.roll  = 0;
        this.permiso = true;
        this.fuente = null;

        this._lector = new LectorInclinacion({
            onLectura: ({ beta, gamma }) => this._procesarLectura(beta, gamma),
            onFuente: (fuente) => {
                this.fuente = fuente;
                this.calibrar(); // otro sensor: la próxima lectura es el nuevo "centro"
                if (typeof this.onFuente === 'function') this.onFuente(fuente);
            },
        });
        this._lector.iniciar();
        this.activo = true;
        return { ok: true };
    }

    /**
     * Desactiva la lectura y emite valores 0.
     */
    desactivar() {
        if (!this.activo) return;
        this._lector?.detener();
        this._lector = null;
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
    // Procesamiento interno (igual para el giroscopio y el acelerómetro)
    // ----------------------------------------------------------------

    _procesarLectura(beta, gamma) {
        // beta  ≈ inclinación adelante/atrás  → Pitch
        // gamma ≈ inclinación izquierda/derecha → Roll

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
        const pitchRaw = this._clamp(deltaBeta  / limitado, -1, 1);
        const rollRaw  = this._clamp(deltaGamma / limitado, -1, 1);

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

// Lector y utilidades accesibles desde Sensores y las pruebas
DronGiroscopio.LectorInclinacion = LectorInclinacion;
DronGiroscopio.inclinacionDesdeGravedad = inclinacionDesdeGravedad;
DronGiroscopio.textoFuente = textoFuenteInclinacion;

// En Node (pruebas automáticas) se exporta como módulo; en el navegador queda como global
if (typeof module !== 'undefined' && module.exports) module.exports = DronGiroscopio;
