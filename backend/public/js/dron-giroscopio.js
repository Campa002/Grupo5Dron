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
 *  - La inclinación es respecto de la PANTALLA (vertical y las dos horizontales): "adelante" es hacia el
 *    borde de arriba de lo que se ve. En vertical natural es igual que siempre.
 *  - Si la orientación de la pantalla cambia con la inclinación activada, se desactiva (emite 0, 0) y avisa
 *    con onCambioOrientacion: hay que volver a activarla, y así se recalibra.
 *  - Sentido del avance (decisión de Luciano del 6/11): inclinar hacia adelante (el borde de arriba de la pantalla
 *    hacia abajo, alejándose) es AVANZAR, como empujar un joystick. "Invertir avance" (modo técnico, Config. Dron)
 *    vuelve al sentido anterior. Se lee al activar.
 *  - Calibración: la primera lectura después de activar (o de calibrar() o de cambiar de sensor) es el "centro".
 *  - Zona muerta, límite de ángulo, sensibilidad y suavizado (EMA), iguales que antes.
 *  - Al desactivar, emite pitch y roll en 0.
 *
 * Uso:
 *   const giro = new DronGiroscopio({ onChange: ({pitch, roll}) => { ... } });
 *   giro.onFuente = (fuente) => { ... };  // 'giroscopio' | 'acelerometro' | 'ninguno'
 *   giro.onCambioOrientacion = (angulo) => { ... };  // ya se desactivó: avisar y pedir recalibrar
 *   await giro.activar();
 *   giro.desactivar();
 */

const GRADOS = 180 / Math.PI;

/**
 * beta y gamma (grados) a partir del vector "arriba" que mide el acelerómetro (accelerationIncludingGravity,
 * en ejes del teléfono). Es la inversa exacta de la convención de deviceorientation (W3C, Z-X'-Y''):
 * beta = 0 apoyado boca arriba y 90 parado (pantalla hacia vos); gamma positivo al bajar el costado derecho.
 * Rango: beta [-180, 180], gamma [-90, 90].
 * @param {number} x @param {number} y @param {number} z
 */
function inclinacionDesdeGravedad(x, y, z) {
    const s = z < 0 ? -1 : 1; // signo de cos(beta) (cos(gamma) nunca es negativo)
    return {
        beta: Math.atan2(y, s * Math.hypot(x, z)) * GRADOS,
        gamma: Math.atan2(-x * s, Math.abs(z)) * GRADOS,
    };
}

/** Vector "arriba" (unitario, ejes del teléfono) que corresponde a beta y gamma de deviceorientation. */
function arribaDesdeInclinacion(beta, gamma) {
    const b = beta / GRADOS;
    const g = gamma / GRADOS;
    return { x: -Math.sin(g) * Math.cos(b), y: Math.sin(b), z: Math.cos(g) * Math.cos(b) };
}

/**
 * Ángulo de la pantalla respecto de la posición natural del teléfono: 0, 90, 180 o 270.
 * 90 = teléfono girado en sentido antihorario (el borde de arriba queda a la izquierda).
 */
function anguloPantalla() {
    let a = 0;
    if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') a = screen.orientation.angle;
    else if (typeof window !== 'undefined' && typeof window.orientation === 'number') a = window.orientation;
    return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
}

/**
 * Pasa beta y gamma (ejes del teléfono) a los ejes de la PANTALLA: "adelante/atrás" es respecto del borde
 * de arriba de lo que se ve y "costados" respecto de sus lados, en vertical y en las dos horizontales.
 * Con el ángulo 0 (vertical natural) devuelve los mismos valores, sin cuentas: es el comportamiento de siempre.
 */
function inclinacionEnPantalla(beta, gamma, angulo) {
    if (!angulo) return { beta, gamma };
    const v = arribaDesdeInclinacion(beta, gamma);
    const t = angulo / GRADOS;
    const c = Math.round(Math.cos(t));
    const s = Math.round(Math.sin(t));
    // Componentes del vector en los ejes de la pantalla (derecha y arriba de lo que se ve)
    return inclinacionDesdeGravedad(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
}

/** Texto para la interfaz según el sensor que se está usando. */
function textoFuenteInclinacion(fuente) {
    switch (fuente) {
        case 'giroscopio': return 'Sensor: giroscopio.';
        case 'acelerometro': return 'Giroscopio: no disponible, usando acelerómetro. Sin giroscopio no se puede medir el giro (como una brújula).';
        case 'ninguno': return 'No llegan datos de inclinación: este dispositivo no tiene los sensores o el navegador no los da (en una PC es normal).';
        default: return 'Buscando el sensor de inclinación...';
    }
}

// "Invertir avance" (modo técnico): '1' = sentido anterior (levantar el borde de arriba hacia vos avanza)
const CLAVE_INVERTIR_AVANCE = 'grupo5dron_invertir_avance';

/** @returns {boolean} true si está activada la opción "Invertir avance" */
function leerInvertirAvance() {
    try { return globalThis.localStorage?.getItem(CLAVE_INVERTIR_AVANCE) === '1'; } catch (_) { return false; }
}

/** Guarda la opción "Invertir avance" (vale desde la próxima vez que se active la inclinación). */
function guardarInvertirAvance(invertir) {
    try {
        if (invertir) globalThis.localStorage?.setItem(CLAVE_INVERTIR_AVANCE, '1');
        else globalThis.localStorage?.removeItem(CLAVE_INVERTIR_AVANCE);
    } catch (_) { /* sin almacenamiento */ }
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
     * @param {Function} [config.obtenerAngulo]  - () => 0 | 90 | 180 | 270 (para las pruebas). Default: anguloPantalla.
     * @param {Function} [config.obtenerInvertirAvance] - () => boolean (para las pruebas). Default: la opción guardada.
     */
    constructor({
        onChange = null,
        zonaMuerta = 3,
        limiteAngulo = 30,
        sensibilidad = 1.0,
        suavizado = 0.3,
        obtenerAngulo = anguloPantalla,
        obtenerInvertirAvance = leerInvertirAvance,
    } = {}) {
        this.onChange     = onChange;
        /** @type {Function|null} (fuente) 'giroscopio' | 'acelerometro' | 'ninguno' */
        this.onFuente     = null;
        /** @type {Function|null} (anguloNuevo) la pantalla giró con la inclinación activada (ya se desactivó) */
        this.onCambioOrientacion = null;
        this.obtenerAngulo = obtenerAngulo;
        this.angulo = 0;   // orientación de la pantalla con la que se activó y calibró
        this.obtenerInvertirAvance = obtenerInvertirAvance;
        this.invertirAvance = false; // true = sentido anterior (se lee al activar)
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
        this._onOrientacionPantalla = () => this._revisarOrientacion();
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
        this.angulo = this.obtenerAngulo();
        this.invertirAvance = !!this.obtenerInvertirAvance();

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
        if (typeof screen !== 'undefined' && screen.orientation?.addEventListener) {
            screen.orientation.addEventListener('change', this._onOrientacionPantalla);
        }
        if (typeof window !== 'undefined') window.addEventListener('orientationchange', this._onOrientacionPantalla);
        return { ok: true };
    }

    /**
     * Desactiva la lectura y emite valores 0.
     */
    desactivar() {
        if (!this.activo) return;
        this._lector?.detener();
        this._lector = null;
        if (typeof screen !== 'undefined' && screen.orientation?.removeEventListener) {
            screen.orientation.removeEventListener('change', this._onOrientacionPantalla);
        }
        if (typeof window !== 'undefined') window.removeEventListener('orientationchange', this._onOrientacionPantalla);
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

    /**
     * Si la pantalla giró desde que se activó, se desactiva (ejes en 0) y se avisa.
     * La calibración era para la otra orientación: hay que volver a activarla.
     * @returns {boolean} true si se desactivó
     */
    _revisarOrientacion() {
        if (!this.activo) return false;
        const angulo = this.obtenerAngulo();
        if (angulo === this.angulo) return false;
        this.desactivar();
        if (typeof this.onCambioOrientacion === 'function') this.onCambioOrientacion(angulo);
        return true;
    }

    // ----------------------------------------------------------------
    // Procesamiento interno (igual para el giroscopio y el acelerómetro)
    // ----------------------------------------------------------------

    _procesarLectura(betaTelefono, gammaTelefono) {
        if (this._revisarOrientacion()) return;
        // Inclinación respecto de la pantalla (en vertical natural, los mismos valores de siempre)
        // beta  ≈ inclinación adelante/atrás  → Pitch
        // gamma ≈ inclinación izquierda/derecha → Roll
        const { beta, gamma } = inclinacionEnPantalla(betaTelefono, gammaTelefono, this.angulo);

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

        // Normalizar al rango [-1, 1] con límite de ángulo y sensibilidad.
        // Avance: bajar el borde de arriba (beta disminuye) es avanzar; con "Invertir avance", al revés.
        const limitado = this.limiteAngulo / this.sensibilidad;
        const signoAvance = this.invertirAvance ? 1 : -1;
        const pitchRaw = this._clamp(signoAvance * deltaBeta / limitado, -1, 1);
        const rollRaw  = this._clamp(deltaGamma / limitado, -1, 1);

        // Suavizado exponencial (EMA)
        const alpha_ema = this.suavizado;
        this._pitchSuav = pitchRaw  + alpha_ema * (this._pitchSuav - pitchRaw);
        this._rollSuav  = rollRaw   + alpha_ema * (this._rollSuav  - rollRaw);

        // "|| 0": sin -0 (con el signo del avance, una inclinación nula podía quedar como -0)
        const pitchFinal = parseFloat(this._pitchSuav.toFixed(3)) || 0;
        const rollFinal  = parseFloat(this._rollSuav.toFixed(3)) || 0;

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
DronGiroscopio.inclinacionEnPantalla = inclinacionEnPantalla;
DronGiroscopio.arribaDesdeInclinacion = arribaDesdeInclinacion;
DronGiroscopio.anguloPantalla = anguloPantalla;
DronGiroscopio.leerInvertirAvance = leerInvertirAvance;
DronGiroscopio.guardarInvertirAvance = guardarInvertirAvance;
DronGiroscopio.textoFuente = textoFuenteInclinacion;

// En Node (pruebas automáticas) se exporta como módulo; en el navegador queda como global
if (typeof module !== 'undefined' && module.exports) module.exports = DronGiroscopio;
