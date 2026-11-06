/**
 * Seguimiento visual — EXPERIMENTAL
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * Una sola tubería para todos los modos:
 *   imagen reducida → CANDIDATOS (COCO-SSD, 5-10 FPS, sin superponer inferencias)
 *   → SELECTOR (fija un objetivo y lo asocia cuadro a cuadro; tolera pérdidas cortas)
 *   → SUAVIZADO (posición, tamaño y velocidad del recuadro)
 *   → CONTROLADOR (función pura: yaw centra, throttle altura, pitch distancia; nunca roll)
 *   → bucle de control a 15 Hz: último comando vigente, que vence y decae a 0 si la detección se atrasa,
 *     con aceleración gradual.
 *
 * Las partes puras (Selector, Seguidor, Controlador, condicionesControlReal) no usan el DOM ni timers:
 * reciben el tiempo como parámetro y se prueban en Node (tests/seguimiento.test.js).
 *
 * Coordenadas: todo normalizado a [0, 1] respecto de la imagen (x, y = esquina superior izquierda).
 * Comandos: yaw, ud (throttle) y fb (pitch) en [-1, 1] (×100 = valor del comando "rc" del Tello).
 *
 * ⚠ Por ahora la cabina lo usa SOLO EN ENSAYO (calcula y muestra, no envía). El control real es la etapa S3.
 */

// eslint-disable-next-line no-unused-vars
const DronSeguimiento = (() => {
    'use strict';

    // ================================================================
    // Ajustes (los editables se guardan en el teléfono en la etapa S2)
    // ================================================================
    const CLAVE_AJUSTES = 'grupo5dron_seguimiento_ajustes';

    const AJUSTES_POR_DEFECTO = Object.freeze({
        // Detección
        claseObjetivo: 'person',
        umbralConfianza: 0.5,          // score mínimo de COCO-SSD
        anchoAnalisis: 480,            // la inferencia se hace sobre una imagen de este ancho (menos = más rápido en el celular,
                                       // pero en 320 se pierden personas lejanas chicas; medido el 6/11 con COCO-SSD lite)
        fpsMin: 5,
        fpsMax: 10,
        // Selector
        confirmarDetecciones: 3,       // detecciones seguidas para fijar un objetivo (evita falsos positivos de un cuadro)
        alturaMinimaFijar: 0.12,       // no se fija una persona más chica que esto (lejana): avanzaría a fondo hacia ella
        costoMaxAsociacion: 1.0,       // distancia (en altos de recuadro) + diferencia de tamaño para aceptar el mismo objetivo
        toleranciaPerdidaMs: 1500,     // sin ver el objetivo más que esto → "perdido": quieto y aviso
        ventanaReadquisicionMs: 5000,  // después de perderlo, solo se retoma algo cerca de donde estaba, durante este tiempo
        suavizadoPosicion: 0.5,        // EMA: peso de la detección nueva (0 = no se mueve, 1 = sin suavizado)
        suavizadoTamano: 0.3,
        // Controlador
        alturaObjetivo: 0.45,          // altura deseada del recuadro (fracción de la imagen): define la distancia
        zonaMuertaX: 0.05,
        zonaMuertaY: 0.07,
        zonaMuertaTamano: 0.05,
        gananciaYaw: 0.6,
        gananciaAltura: 0.5,
        gananciaDistancia: 0.8,
        velMaxYaw: 0.30,
        velMaxAltura: 0.20,
        velMaxAvance: 0.20,
        aceleracionMax: 0.6,           // cambio máximo por segundo al AUMENTAR un comando (aceleración gradual)
        desaceleracionMax: 1.5,        // cambio máximo por segundo al REDUCIR un comando (frena más rápido)
        vencimientoComandoMs: 400,     // si la última detección es más vieja, el comando empieza a decaer
        decaimientoMs: 300,            // y llega a 0 en este tiempo
        margenBorde: 0.02,             // un recuadro a menos de esto del borde superior/inferior está cortado
        // Condiciones para el control real (etapa S3)
        alturaMinCm: 80,
        alturaMaxCm: 250,
        bateriaMin: 30,
        fpsMinReal: 4,
        // "Mis objetos" (etapa S4), criterio tipo RAC
        confirmacionUmbral: 0.75,
        confirmacionVentana: 8,
        perdidaVentana: 5,
        perdidaMinimo: 3,
    });

    function leerAjustesGuardados() {
        try {
            const datos = JSON.parse(globalThis.localStorage?.getItem(CLAVE_AJUSTES) || 'null');
            if (!datos || typeof datos !== 'object') return {};
            // Solo claves conocidas y numéricas (o la clase)
            const limpios = {};
            for (const [k, v] of Object.entries(datos)) {
                if (!(k in AJUSTES_POR_DEFECTO)) continue;
                if (typeof AJUSTES_POR_DEFECTO[k] === 'number' && Number.isFinite(Number(v))) limpios[k] = Number(v);
                else if (typeof AJUSTES_POR_DEFECTO[k] === 'string' && typeof v === 'string') limpios[k] = v;
            }
            return limpios;
        } catch (_) {
            return {};
        }
    }

    function ajustesActuales(extra = {}) {
        return { ...AJUSTES_POR_DEFECTO, ...leerAjustesGuardados(), ...extra };
    }

    // ================================================================
    // Utilidades puras
    // ================================================================
    const limitar = (v, min, max) => Math.max(min, Math.min(max, v));

    /** Zona muerta continua: 0 dentro de la zona; afuera crece desde 0 (sin saltos). */
    function zonaMuerta(error, zona) {
        const a = Math.abs(error);
        return a <= zona ? 0 : Math.sign(error) * (a - zona);
    }

    function conCentro(c) {
        return { ...c, cx: c.x + c.w / 2, cy: c.y + c.h / 2 };
    }

    // ================================================================
    // Controlador (puro)
    // ================================================================
    const Controlador = {
        /**
         * Comando deseado para llevar el objetivo al centro y a la altura de recuadro buscada.
         * @param {{cx:number, cy:number, h:number}} ob objetivo suavizado
         * @param {Object} a ajustes
         * @returns {{yaw:number, ud:number, fb:number}}
         */
        comandoDeseado(ob, a) {
            // Horizontal → yaw (girar hacia el objetivo). ex en [-0,5; 0,5]
            const ex = zonaMuerta(ob.cx - 0.5, a.zonaMuertaX);
            const yaw = limitar(ex * 2 * a.gananciaYaw, -a.velMaxYaw, a.velMaxYaw);

            // Vertical → throttle. Si el recuadro está cortado arriba o abajo, el centro no es confiable: no se sube ni se baja
            const y = ob.cy - ob.h / 2;
            const cortado = y <= a.margenBorde || y + ob.h >= 1 - a.margenBorde;
            const ey = zonaMuerta(0.5 - ob.cy, a.zonaMuertaY);
            const ud = cortado ? 0 : limitar(ey * 2 * a.gananciaAltura, -a.velMaxAltura, a.velMaxAltura);

            // Distancia → pitch, por la altura del recuadro (chico = lejos → avanzar; grande = cerca → retroceder)
            const eh = zonaMuerta(a.alturaObjetivo - ob.h, a.zonaMuertaTamano);
            const fb = limitar((eh / a.alturaObjetivo) * a.gananciaDistancia, -a.velMaxAvance, a.velMaxAvance);

            return { yaw, ud, fb };
        },

        /**
         * Aceleración gradual: limita cuánto puede cambiar un eje en dt segundos.
         * Aumentar usa aceleracionMax; reducir (o ir hacia 0) usa desaceleracionMax, que es mayor.
         * Si el comando cambia de sentido, primero frena hasta 0.
         */
        limitarCambio(actual, deseado, dtSeg, a) {
            if (actual !== 0 && Math.sign(deseado) !== Math.sign(actual)) {
                const restante = Math.abs(actual) - a.desaceleracionMax * dtSeg;
                return restante > 0 ? Math.sign(actual) * restante : 0;
            }
            const max = (Math.abs(deseado) > Math.abs(actual) ? a.aceleracionMax : a.desaceleracionMax) * dtSeg;
            return actual + limitar(deseado - actual, -max, max);
        },

        /** 1 mientras la detección es reciente; decae linealmente a 0 cuando se atrasa. */
        factorVencimiento(edadMs, a) {
            if (edadMs <= a.vencimientoComandoMs) return 1;
            if (a.decaimientoMs <= 0) return 0;
            return limitar(1 - (edadMs - a.vencimientoComandoMs) / a.decaimientoMs, 0, 1);
        },
    };

    // ================================================================
    // Selector de objetivo (puro): por clase, con objetivo fijo
    // Estados: 'buscando' → 'siguiendo' ⇄ 'perdiendo' → 'perdido'
    // ================================================================
    class Selector {
        constructor(ajustes) {
            this.a = ajustes;
            this.estado = 'buscando';
            // objetivo: posición suavizada para el control (cx, cy, w, h) y, para asociar,
            // la última detección cruda (rx, ry, rh) con su velocidad (vx, vy) en unidades/s
            this.objetivo = null;
            this.ultimaVista = 0;
            this.perdidoDesde = 0;
            this.ultimaPosicion = null;
            this._confirmaciones = 0;
            this._candidatoPrevio = null;
            this._tPrevio = 0;
        }

        _validos(candidatos) {
            return candidatos
                .filter(c => c.clase === this.a.claseObjetivo && c.score >= this.a.umbralConfianza && c.w > 0 && c.h > 0)
                .map(conCentro);
        }

        /** Costo de asociar un candidato a una referencia (posición prevista y tamaño). */
        _costo(ref, c) {
            const escala = Math.max(ref.h, 0.1);
            const dist = Math.hypot(c.cx - ref.cx, c.cy - ref.cy) / escala;
            const tamano = Math.abs(Math.log(c.h / ref.h));
            return dist + tamano;
        }

        _mejor(ref, candidatos, costoMax) {
            let mejor = null;
            let costoMin = Infinity;
            for (const c of candidatos) {
                const costo = this._costo(ref, c);
                if (costo < costoMin) { costoMin = costo; mejor = c; }
            }
            return costoMin <= costoMax ? mejor : null;
        }

        /** Exige N detecciones seguidas del mismo candidato antes de fijarlo. */
        _confirmar(c, t) {
            const previo = this._candidatoPrevio;
            const mismo = previo && this._costo(previo, c) <= this.a.costoMaxAsociacion;
            this._confirmaciones = mismo ? this._confirmaciones + 1 : 1;
            const dt = mismo ? (t - this._tPrevio) / 1000 : 0;
            this._candidatoPrevio = c;
            this._tPrevio = t;
            if (this._confirmaciones >= this.a.confirmarDetecciones) {
                this.objetivo = {
                    cx: c.cx, cy: c.cy, w: c.w, h: c.h,
                    rx: c.cx, ry: c.cy, rh: c.h,
                    vx: dt > 0 ? (c.cx - previo.cx) / dt : 0,
                    vy: dt > 0 ? (c.cy - previo.cy) / dt : 0,
                    t, score: c.score,
                };
                this.ultimaVista = t;
                this.estado = 'siguiendo';
                this._confirmaciones = 0;
                this._candidatoPrevio = null;
            }
        }

        _reiniciarConfirmacion() {
            this._confirmaciones = 0;
            this._candidatoPrevio = null;
        }

        /** Revisa la tolerancia de pérdida por tiempo (también entre detecciones). */
        revisarTiempo(t) {
            if ((this.estado === 'siguiendo' || this.estado === 'perdiendo') && t - this.ultimaVista > this.a.toleranciaPerdidaMs) {
                this.estado = 'perdido';
                this.perdidoDesde = t;
                this.ultimaPosicion = this.objetivo;
                this.objetivo = null;
                this._reiniciarConfirmacion();
            }
        }

        /**
         * Procesa las detecciones de un cuadro.
         * @param {Array<{clase:string, score:number, x:number, y:number, w:number, h:number}>} candidatos
         * @param {number} t tiempo en ms
         */
        actualizar(candidatos, t) {
            const validos = this._validos(candidatos);

            if (this.estado === 'buscando') {
                // La persona más grande (la más cercana), con un premio por estar centrada; las muy chicas no se fijan
                const elegibles = validos.filter(v => v.h >= this.a.alturaMinimaFijar);
                if (!elegibles.length) { this._reiniciarConfirmacion(); return; }
                const puntaje = v => v.h * (1 - 0.5 * Math.min(1, Math.abs(v.cx - 0.5) / 0.5));
                const c = elegibles.reduce((m, v) => (puntaje(v) > puntaje(m) ? v : m));
                this._confirmar(c, t);
                return;
            }

            if (this.estado === 'perdido') {
                // Solo se retoma algo cerca de donde estaba y dentro de la ventana; si no, hay que reactivar a mano
                if (t - this.perdidoDesde > this.a.ventanaReadquisicionMs || !this.ultimaPosicion) return;
                const c = this._mejor(this.ultimaPosicion, validos.filter(v => v.h >= this.a.alturaMinimaFijar), this.a.costoMaxAsociacion);
                if (c) this._confirmar(c, t);
                else this._reiniciarConfirmacion();
                return;
            }

            // 'siguiendo' o 'perdiendo': asociar con la posición prevista a partir de la última detección
            // CRUDA y su velocidad (la suavizada va atrasada y, en un cruce, queda del lado de la otra persona).
            // La extrapolación se limita a 1 s para que una pérdida larga no la mande lejos.
            const ob = this.objetivo;
            const dt = Math.max(0, (t - ob.t) / 1000);
            const dtPrev = Math.min(dt, 1);
            const prevista = { cx: ob.rx + ob.vx * dtPrev, cy: ob.ry + ob.vy * dtPrev, h: ob.rh };
            const c = this._mejor(prevista, validos, this.a.costoMaxAsociacion);
            if (c) {
                const ap = this.a.suavizadoPosicion;
                const at = this.a.suavizadoTamano;
                const vxInst = dt > 0 ? (c.cx - ob.rx) / dt : ob.vx;
                const vyInst = dt > 0 ? (c.cy - ob.ry) / dt : ob.vy;
                this.objetivo = {
                    // Suavizado: solo para el control
                    cx: ob.cx + ap * (c.cx - ob.cx),
                    cy: ob.cy + ap * (c.cy - ob.cy),
                    w: ob.w + at * (c.w - ob.w),
                    h: ob.h + at * (c.h - ob.h),
                    // Crudo y velocidad: para asociar en el próximo cuadro
                    rx: c.cx, ry: c.cy, rh: c.h,
                    vx: 0.5 * ob.vx + 0.5 * vxInst,
                    vy: 0.5 * ob.vy + 0.5 * vyInst,
                    t,
                    score: c.score,
                };
                this.ultimaVista = t;
                this.estado = 'siguiendo';
            } else {
                this.estado = 'perdiendo';
                this.revisarTiempo(t);
            }
        }
    }

    // ================================================================
    // Seguidor (puro): selector + controlador + vencimiento + aceleración gradual
    // ================================================================
    class Seguidor {
        constructor(ajustes) {
            this.a = ajustes;
            this.selector = new Selector(ajustes);
            this.comando = { yaw: 0, ud: 0, fb: 0 };
            this._tUltimoTick = null;
        }

        get estado() { return this.selector.estado; }

        procesarDeteccion(candidatos, t) {
            this.selector.actualizar(candidatos, t);
        }

        /**
         * Paso del bucle de control (15 Hz). Devuelve el comando a aplicar.
         * @param {number} t tiempo en ms
         */
        tickControl(t) {
            this.selector.revisarTiempo(t);
            const s = this.selector;
            let deseado = { yaw: 0, ud: 0, fb: 0 };
            if ((s.estado === 'siguiendo' || s.estado === 'perdiendo') && s.objetivo) {
                const f = Controlador.factorVencimiento(t - s.ultimaVista, this.a);
                const c = Controlador.comandoDeseado(s.objetivo, this.a);
                deseado = { yaw: c.yaw * f, ud: c.ud * f, fb: c.fb * f };
            }
            const dt = this._tUltimoTick === null ? 0 : Math.max(0, (t - this._tUltimoTick) / 1000);
            this._tUltimoTick = t;
            for (const eje of ['yaw', 'ud', 'fb']) {
                this.comando[eje] = Controlador.limitarCambio(this.comando[eje], deseado[eje], dt, this.a);
            }
            return { comando: { ...this.comando }, estado: s.estado };
        }
    }

    // ================================================================
    // Condiciones para habilitar el control real (pura; se aplica en S3)
    // ================================================================
    function condicionesControlReal(e, a) {
        const motivos = [];
        if (!e.enVuelo) motivos.push('el dron no está en vuelo');
        if (e.alturaCm === null || e.alturaCm === undefined) motivos.push('no se conoce la altura');
        else if (e.alturaCm < a.alturaMinCm) motivos.push(`altura menor a ${a.alturaMinCm} cm`);
        else if (e.alturaCm > a.alturaMaxCm) motivos.push(`altura mayor a ${a.alturaMaxCm} cm`);
        if (e.bateria === null || e.bateria === undefined || e.bateria < a.bateriaMin) motivos.push(`batería menor a ${a.bateriaMin} %`);
        if (!e.telemetriaOk) motivos.push('no llega telemetría');
        if (e.backend !== 'webgl') motivos.push(`TensorFlow no usa WebGL (usa ${e.backend || 'nada'})`);
        if (!(e.fps >= a.fpsMinReal)) motivos.push(`menos de ${a.fpsMinReal} FPS de detección`);
        return { ok: motivos.length === 0, motivos };
    }

    // ================================================================
    // Visión (navegador): COCO-SSD sobre una imagen reducida
    // ================================================================
    class Vision {
        constructor(ajustes) {
            this.a = ajustes;
            this.modelo = null;
            this.backend = null;
            this.canvas = null;
            this.ctx = null;
        }

        async cargar() {
            if (typeof tf === 'undefined' || typeof cocoSsd === 'undefined') {
                throw new Error('Faltan TensorFlow.js o COCO-SSD (libs/).');
            }
            // Preferir WebGL; si no está, queda el que haya (CPU es inutilizable para controlar)
            try { if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl'); } catch (_) { /* sin WebGL */ }
            await tf.ready();
            this.backend = tf.getBackend();
            this.modelo = await cocoSsd.load({ modelUrl: './libs/coco-ssd/model.json' });
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
            // Calentamiento: la primera inferencia compila los shaders y es lenta
            this.canvas.width = 64; this.canvas.height = 48;
            await this.modelo.detect(this.canvas);
            return { backend: this.backend };
        }

        /** @returns {Promise<{ms:number, candidatos:Array}|null>} null si la fuente no tiene imagen */
        async detectar(fuente) {
            const fw = fuente.videoWidth || fuente.width || 0;
            const fh = fuente.videoHeight || fuente.height || 0;
            if (fw < 32 || fh < 32) return null;
            const w = Math.min(this.a.anchoAnalisis, fw);
            const h = Math.round(w * fh / fw);
            if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
            this.ctx.drawImage(fuente, 0, 0, w, h);
            const t0 = performance.now();
            const preds = await this.modelo.detect(this.canvas, 20, Math.min(0.3, this.a.umbralConfianza));
            const ms = performance.now() - t0;
            return {
                ms,
                candidatos: preds.map(p => ({
                    clase: p.class, score: p.score,
                    x: p.bbox[0] / w, y: p.bbox[1] / h, w: p.bbox[2] / w, h: p.bbox[3] / h,
                })),
            };
        }
    }

    // ================================================================
    // Orquestador (navegador): ritmos de inferencia y de control, dibujo y estado
    // ================================================================
    class Seguimiento {
        /**
         * @param {Object} opciones
         * @param {HTMLCanvasElement|HTMLVideoElement} opciones.videoEl fuente de imagen
         * @param {HTMLCanvasElement} [opciones.canvasDebug] canvas superpuesto para dibujar los recuadros
         * @param {Object} [opciones.ajustes] ajustes que pisan los guardados
         */
        constructor({ videoEl, canvasDebug = null, ajustes = {} }) {
            if (!videoEl) throw new Error('[Seguimiento] Se requiere un elemento <video> o <canvas>.');
            this.fuente = videoEl;
            this.canvasDebug = canvasDebug;
            this.ajustes = ajustesActuales(ajustes);
            this.vision = new Vision(this.ajustes);
            this.seguidor = null;
            this.activo = false;
            this.modeloCargado = false;
            this.cargando = false;
            /** @type {Function|null} ({yaw, ud, fb}, info) en cada paso de control (15 Hz) */
            this.onComando = null;
            /** @type {Function|null} (estadoNuevo, estadoAnterior) cuando cambia el estado del selector */
            this.onEstado = null;
            this._timerInferencia = null;
            this._timerControl = null;
            this._estadoAnterior = 'apagado';
            this._msInferencia = null;   // EMA del tiempo de inferencia
            this._fps = 0;
            this._tUltimaInferencia = null;
            this._ultimosCandidatos = [];
        }

        async inicializar() {
            if (this.modeloCargado) return { ok: true, backend: this.vision.backend };
            if (this.cargando) return { ok: false, error: 'El modelo se está cargando.' };
            this.cargando = true;
            try {
                const { backend } = await this.vision.cargar();
                this.modeloCargado = true;
                return {
                    ok: true,
                    backend,
                    aviso: backend === 'webgl' ? null
                        : `TensorFlow está usando "${backend}" en vez de WebGL: la detección va a ser muy lenta y el control real no se va a poder activar.`,
                };
            } catch (e) {
                return { ok: false, error: e.message };
            } finally {
                this.cargando = false;
            }
        }

        activar() {
            if (!this.modeloCargado || this.activo) return;
            this.seguidor = new Seguidor(this.ajustes);
            this.activo = true;
            this._estadoAnterior = 'buscando';
            this._fps = 0;
            this._tUltimaInferencia = null;
            this._cicloInferencia();
            this._timerControl = setInterval(() => this._tickControl(), Math.round(1000 / 15));
        }

        desactivar() {
            this.activo = false;
            clearTimeout(this._timerInferencia);
            clearInterval(this._timerControl);
            this._timerInferencia = null;
            this._timerControl = null;
            if (this.seguidor) this.seguidor.comando = { yaw: 0, ud: 0, fb: 0 };
            if (typeof this.onComando === 'function') this.onComando({ yaw: 0, ud: 0, fb: 0 }, this.info('apagado'));
            this._limpiarDebug();
        }

        /** Estado para el panel y el registro. */
        info(estado = this.seguidor?.estado || 'apagado') {
            const ahora = performance.now();
            return {
                estado,
                backend: this.vision.backend,
                fps: Math.round(this._fps * 10) / 10,
                inferenciaMs: this._msInferencia === null ? null : Math.round(this._msInferencia),
                edadMs: this.seguidor?.selector.ultimaVista ? Math.round(ahora - this.seguidor.selector.ultimaVista) : null,
                comando: this.seguidor ? { ...this.seguidor.comando } : { yaw: 0, ud: 0, fb: 0 },
                objetivo: this.seguidor?.selector.objetivo ? { ...this.seguidor.selector.objetivo } : null,
                candidatos: this._ultimosCandidatos.length,
            };
        }

        async _cicloInferencia() {
            if (!this.activo) return;
            const t0 = performance.now();
            try {
                const r = await this.vision.detectar(this.fuente);
                if (!this.activo) return;
                const t = performance.now();
                if (r) {
                    this._msInferencia = this._msInferencia === null ? r.ms : 0.8 * this._msInferencia + 0.2 * r.ms;
                    this._ultimosCandidatos = r.candidatos;
                    this.seguidor.procesarDeteccion(r.candidatos, t);
                    this._dibujar(r.candidatos);
                } else {
                    this._ultimosCandidatos = [];
                    this.seguidor.procesarDeteccion([], t);
                }
                if (this._tUltimaInferencia !== null) {
                    const fpsInst = 1000 / Math.max(1, t - this._tUltimaInferencia);
                    this._fps = this._fps ? 0.8 * this._fps + 0.2 * fpsInst : fpsInst;
                }
                this._tUltimaInferencia = t;
            } catch (e) {
                console.warn('[Seguimiento] Error en la detección:', e?.message || e);
            }
            // FPS adaptativo: entre fpsMin y fpsMax según lo que tarde la inferencia (nunca se superponen)
            const a = this.ajustes;
            const objetivoMs = limitar((this._msInferencia || 100) * 1.2, 1000 / a.fpsMax, 1000 / a.fpsMin);
            const espera = Math.max(0, objetivoMs - (performance.now() - t0));
            this._timerInferencia = setTimeout(() => this._cicloInferencia(), espera);
        }

        _tickControl() {
            if (!this.activo || !this.seguidor) return;
            const { comando, estado } = this.seguidor.tickControl(performance.now());
            if (estado !== this._estadoAnterior) {
                const anterior = this._estadoAnterior;
                this._estadoAnterior = estado;
                if (typeof this.onEstado === 'function') this.onEstado(estado, anterior);
            }
            if (typeof this.onComando === 'function') this.onComando(comando, this.info(estado));
        }

        _dibujar(candidatos) {
            const cv = this.canvasDebug;
            if (!cv) return;
            const fw = this.fuente.videoWidth || this.fuente.width || 0;
            const fh = this.fuente.videoHeight || this.fuente.height || 0;
            if (!fw || !fh) return;
            if (cv.width !== fw || cv.height !== fh) { cv.width = fw; cv.height = fh; }
            const ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, fw, fh);
            ctx.lineWidth = Math.max(2, fw / 320);
            // Candidatos de la clase (gris) y objetivo (verde)
            ctx.strokeStyle = 'rgba(203, 213, 225, 0.7)';
            for (const c of candidatos) {
                if (c.clase !== this.ajustes.claseObjetivo || c.score < this.ajustes.umbralConfianza) continue;
                ctx.strokeRect(c.x * fw, c.y * fh, c.w * fw, c.h * fh);
            }
            const ob = this.seguidor?.selector.objetivo;
            if (ob) {
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = Math.max(3, fw / 200);
                ctx.strokeRect((ob.cx - ob.w / 2) * fw, (ob.cy - ob.h / 2) * fh, ob.w * fw, ob.h * fh);
            }
            // Cruz del centro
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(fw / 2 - 12, fh / 2); ctx.lineTo(fw / 2 + 12, fh / 2);
            ctx.moveTo(fw / 2, fh / 2 - 12); ctx.lineTo(fw / 2, fh / 2 + 12);
            ctx.stroke();
        }

        _limpiarDebug() {
            const cv = this.canvasDebug;
            if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        }
    }

    // Partes puras accesibles para la cabina, la demo y las pruebas
    Seguimiento.AJUSTES_POR_DEFECTO = AJUSTES_POR_DEFECTO;
    Seguimiento.CLAVE_AJUSTES = CLAVE_AJUSTES;
    Seguimiento.ajustesActuales = ajustesActuales;
    Seguimiento.Controlador = Controlador;
    Seguimiento.Selector = Selector;
    Seguimiento.Seguidor = Seguidor;
    Seguimiento.condicionesControlReal = condicionesControlReal;
    return Seguimiento;
})();

// En Node (pruebas automáticas) se exporta como módulo; en el navegador queda como global
if (typeof module !== 'undefined' && module.exports) module.exports = DronSeguimiento;
