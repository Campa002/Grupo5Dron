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
 * IMPORTANTE: por ahora la cabina lo usa SOLO EN ENSAYO (calcula y muestra, no envía). El control real es la etapa S3.
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
        anchoAnalisis: 480,            // ancho de la imagen que se le pasa al modelo (el modelo la reduce a 300×300 igual;
                                       // medido el 6/11 en la PC: 300, 320 y 480 tardan lo mismo y detectan lo mismo)
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
        // "Mis objetos", criterio tipo RAC
        confirmacionUmbral: 0.75,
        confirmacionVentana: 8,
        perdidaVentana: 5,
        perdidaMinimo: 3,
        // "Mis objetos": rendimiento en el celular (no editables)
        maxComparar: 3,                // como mucho 3 candidatos comparados por cuadro (buscando)
        reverificarMs: 1000,           // siguiendo: se vuelve a comparar el objetivo cada ~1 s
        avisoNoEncuentraMs: 3000,      // sin nada parecido durante este tiempo → "No encuentro ..."
    });

    /**
     * Ajustes editables en pantalla (Config. del dron). Valores internos; "escala" es solo para mostrarlos
     * (por ejemplo 0,45 se muestra como 45 %).
     */
    const RANGOS = Object.freeze({
        umbralConfianza:      { grupo: 'Detección', etiqueta: 'Confianza mínima de la detección', unidad: '%', escala: 100, min: 0.3, max: 0.9, paso: 0.05 },
        anchoAnalisis:        { grupo: 'Detección', etiqueta: 'Ancho de la imagen analizada', unidad: 'px', min: 240, max: 960, paso: 80 },
        fpsMax:               { grupo: 'Detección', etiqueta: 'Detecciones por segundo (máximo)', unidad: 'FPS', min: 5, max: 15, paso: 1 },
        alturaMinimaFijar:    { grupo: 'Detección', etiqueta: 'Tamaño mínimo para fijar a alguien', unidad: '% del alto', escala: 100, min: 0.05, max: 0.5, paso: 0.01 },
        alturaObjetivo:       { grupo: 'Control', etiqueta: 'Distancia objetivo (alto del recuadro)', unidad: '% del alto', escala: 100, min: 0.15, max: 0.8, paso: 0.05 },
        gananciaYaw:          { grupo: 'Control', etiqueta: 'Ganancia de giro', unidad: '', min: 0, max: 2, paso: 0.05 },
        gananciaAltura:       { grupo: 'Control', etiqueta: 'Ganancia de altura', unidad: '', min: 0, max: 2, paso: 0.05 },
        gananciaDistancia:    { grupo: 'Control', etiqueta: 'Ganancia de distancia', unidad: '', min: 0, max: 2, paso: 0.05 },
        zonaMuertaX:          { grupo: 'Control', etiqueta: 'Zona muerta horizontal', unidad: '%', escala: 100, min: 0, max: 0.2, paso: 0.01 },
        zonaMuertaY:          { grupo: 'Control', etiqueta: 'Zona muerta vertical', unidad: '%', escala: 100, min: 0, max: 0.2, paso: 0.01 },
        zonaMuertaTamano:     { grupo: 'Control', etiqueta: 'Zona muerta de distancia', unidad: '%', escala: 100, min: 0, max: 0.2, paso: 0.01 },
        velMaxYaw:            { grupo: 'Control', etiqueta: 'Velocidad máxima de giro', unidad: '%', escala: 100, min: 0.05, max: 0.5, paso: 0.05 },
        velMaxAltura:         { grupo: 'Control', etiqueta: 'Velocidad máxima de altura', unidad: '%', escala: 100, min: 0.05, max: 0.5, paso: 0.05 },
        velMaxAvance:         { grupo: 'Control', etiqueta: 'Velocidad máxima de avance', unidad: '%', escala: 100, min: 0.05, max: 0.5, paso: 0.05 },
        aceleracionMax:       { grupo: 'Control', etiqueta: 'Aceleración máxima', unidad: '%/s', escala: 100, min: 0.1, max: 2, paso: 0.1 },
        toleranciaPerdidaMs:  { grupo: 'Pérdida', etiqueta: 'Tiempo sin verla antes de darla por perdida', unidad: 'ms', min: 500, max: 5000, paso: 100 },
        vencimientoComandoMs: { grupo: 'Pérdida', etiqueta: 'Vencimiento del comando (detección atrasada)', unidad: 'ms', min: 100, max: 2000, paso: 50 },
        alturaMinCm:          { grupo: 'Control real (etapa S3)', etiqueta: 'Altura mínima', unidad: 'cm', min: 30, max: 500, paso: 10 },
        alturaMaxCm:          { grupo: 'Control real (etapa S3)', etiqueta: 'Altura máxima', unidad: 'cm', min: 50, max: 1000, paso: 10 },
        bateriaMin:           { grupo: 'Control real (etapa S3)', etiqueta: 'Batería mínima', unidad: '%', min: 10, max: 90, paso: 5 },
        confirmacionUmbral:   { grupo: 'Mis objetos', etiqueta: 'Parecido mínimo con las fotos', unidad: '%', escala: 100, min: 0.5, max: 0.99, paso: 0.01 },
        confirmacionVentana:  { grupo: 'Mis objetos', etiqueta: 'Detecciones seguidas para confirmar', unidad: '', min: 2, max: 20, paso: 1 },
        perdidaVentana:       { grupo: 'Mis objetos', etiqueta: 'Ventana para darlo por perdido', unidad: 'detecciones', min: 2, max: 15, paso: 1 },
        perdidaMinimo:        { grupo: 'Mis objetos', etiqueta: 'Fallas dentro de la ventana para perderlo', unidad: '', min: 1, max: 15, paso: 1 },
    });

    /**
     * Valida ajustes en unidades internas.
     * @returns {{ok:boolean, ajustes:Object, errores:string[]}}
     */
    function validarAjustes(valores) {
        const errores = [];
        const ajustes = {};
        for (const [clave, valor] of Object.entries(valores || {})) {
            const r = RANGOS[clave];
            if (!r) continue;
            const n = Number(valor);
            const mostrar = v => `${Math.round(v * (r.escala || 1) * 100) / 100}${r.unidad ? ' ' + r.unidad : ''}`;
            if (valor === '' || valor === null || !Number.isFinite(n)) { errores.push(`${r.etiqueta}: no es un número.`); continue; }
            if (n < r.min - 1e-9 || n > r.max + 1e-9) { errores.push(`${r.etiqueta}: tiene que estar entre ${mostrar(r.min)} y ${mostrar(r.max)}.`); continue; }
            ajustes[clave] = n;
        }
        const final = { ...AJUSTES_POR_DEFECTO, ...ajustes };
        if (final.alturaMinCm >= final.alturaMaxCm) errores.push('La altura mínima tiene que ser menor que la máxima.');
        if (final.perdidaMinimo > final.perdidaVentana) errores.push('Las fallas para perderlo no pueden ser más que la ventana.');
        return { ok: errores.length === 0, ajustes, errores };
    }

    function guardarAjustes(ajustes) {
        globalThis.localStorage?.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes));
    }

    function restaurarAjustes() {
        globalThis.localStorage?.removeItem(CLAVE_AJUSTES);
    }

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
    // Estados: 'buscando' → 'siguiendo' <-> 'perdiendo' → 'perdido'
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
            const c = this._mejor(this._prevista(t), validos, this.a.costoMaxAsociacion);
            if (c) {
                this._actualizarObjetivo(c, t);
                this.ultimaVista = t;
                this.estado = 'siguiendo';
            } else {
                this.estado = 'perdiendo';
                this.revisarTiempo(t);
            }
        }

        /** Posición prevista del objetivo en t (extrapolación limitada a 1 s). */
        _prevista(t) {
            const ob = this.objetivo;
            const dtPrev = Math.min(Math.max(0, (t - ob.t) / 1000), 1);
            return { cx: ob.rx + ob.vx * dtPrev, cy: ob.ry + ob.vy * dtPrev, h: ob.rh };
        }

        /** Suaviza el objetivo con la detección asociada `c` y actualiza su velocidad. */
        _actualizarObjetivo(c, t) {
            const ob = this.objetivo;
            const dt = Math.max(0, (t - ob.t) / 1000);
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
                sim: typeof c.sim === 'number' ? c.sim : ob.sim,
            };
        }
    }

    // ================================================================
    // Selector de "Mis objetos" (puro): cualquier clase del detector, comparada con las huellas guardadas
    // Criterio tipo RAC: se fija con 8 detecciones seguidas parecidas (75 %) y se pierde con 3 fallas de 5.
    // Rendimiento: buscando, se comparan como mucho 3 candidatos por cuadro; siguiendo, solo el objetivo
    // y cada ~1 s (entre medio se lo sigue por posición).
    // Cada candidato puede traer `sim` (parecido 0-1) si se lo comparó en este cuadro.
    // ================================================================
    class SelectorObjeto extends Selector {
        constructor(ajustes, nombre = 'objeto') {
            super(ajustes);
            this.nombre = nombre;
            this.noEncuentra = false;      // sin nada parecido durante avisoNoEncuentraMs
            this.coincidencias = 0;        // candidatos parecidos en el último cuadro
            this._ventana = [];            // aciertos (true) y fallas (false) de las últimas detecciones
            this._ultimaVerificacion = 0;
            this._tSinCoincidencia = null;
        }

        /** Cualquier clase con la confianza mínima del detector. */
        _validos(candidatos) {
            return candidatos
                .filter(c => c.score >= this.a.umbralConfianza && c.w > 0 && c.h > 0)
                .map(conCentro);
        }

        /**
         * Qué candidatos hay que comparar con las huellas en este cuadro (índices de `candidatos`).
         * Buscando: los 3 de más confianza. Siguiendo: el asociado al objetivo, si pasó ~1 s de la última vez.
         */
        aVerificar(candidatos, t) {
            const validos = candidatos
                .map((c, i) => ({ ...conCentro(c), i }))
                .filter(c => c.score >= this.a.umbralConfianza && c.w > 0 && c.h > 0);
            if (this.estado === 'siguiendo' || this.estado === 'perdiendo') {
                if (t - this._ultimaVerificacion < this.a.reverificarMs) return [];
                const c = this._mejor(this._prevista(t), validos, this.a.costoMaxAsociacion);
                return c ? [c.i] : [];
            }
            return validos.sort((a, b) => b.score - a.score).slice(0, this.a.maxComparar).map(c => c.i);
        }

        actualizar(candidatos, t) {
            const validos = this._validos(candidatos);
            if (this.estado === 'siguiendo' || this.estado === 'perdiendo') {
                this._seguirObjeto(validos, t);
                return;
            }
            // Buscando (o perdido): el más parecido, con el parecido mínimo
            const parecidos = validos.filter(v => typeof v.sim === 'number' && v.sim >= this.a.confirmacionUmbral);
            this.coincidencias = parecidos.length;
            if (!parecidos.length) {
                this._reiniciarConfirmacion();
                if (this._tSinCoincidencia === null) this._tSinCoincidencia = t;
                this.noEncuentra = t - this._tSinCoincidencia >= this.a.avisoNoEncuentraMs;
                return;
            }
            this._tSinCoincidencia = null;
            this.noEncuentra = false;
            const c = parecidos.reduce((m, v) => (v.sim > m.sim ? v : m));
            const previo = this._candidatoPrevio;
            const mismo = previo && this._costo(previo, c) <= this.a.costoMaxAsociacion;
            this._confirmaciones = mismo ? this._confirmaciones + 1 : 1;
            const dt = mismo ? (t - this._tPrevio) / 1000 : 0;
            this._candidatoPrevio = c;
            this._tPrevio = t;
            if (this._confirmaciones >= this.a.confirmacionVentana) {
                this.objetivo = {
                    cx: c.cx, cy: c.cy, w: c.w, h: c.h,
                    rx: c.cx, ry: c.cy, rh: c.h,
                    vx: dt > 0 ? (c.cx - previo.cx) / dt : 0,
                    vy: dt > 0 ? (c.cy - previo.cy) / dt : 0,
                    t, score: c.score, sim: c.sim,
                };
                this.ultimaVista = t;
                this._ultimaVerificacion = t;
                this._ventana = [];
                this.estado = 'siguiendo';
                this._reiniciarConfirmacion();
            }
        }

        _seguirObjeto(validos, t) {
            const c = this._mejor(this._prevista(t), validos, this.a.costoMaxAsociacion);
            let acierto = !!c;
            if (c && typeof c.sim === 'number') {
                this._ultimaVerificacion = t;
                acierto = c.sim >= this.a.confirmacionUmbral;
            }
            this._ventana.push(acierto);
            if (this._ventana.length > this.a.perdidaVentana) this._ventana.shift();
            this.coincidencias = acierto ? 1 : 0;
            if (acierto) {
                this._actualizarObjetivo(c, t);
                this.ultimaVista = t;
                this.estado = 'siguiendo';
            } else {
                this.estado = 'perdiendo';
            }
            if (this._ventana.filter(a => !a).length >= this.a.perdidaMinimo) {
                this.estado = 'perdido';
                this.perdidoDesde = t;
                this.ultimaPosicion = this.objetivo;
                this.objetivo = null;
                this._ventana = [];
                this._tSinCoincidencia = t;
                this._reiniciarConfirmacion();
            }
        }
    }

    // ================================================================
    // Seguidor (puro): selector + controlador + vencimiento + aceleración gradual
    // ================================================================
    class Seguidor {
        /** @param {Object} ajustes @param {Selector} [selector] por defecto, el de personas */
        constructor(ajustes, selector = null) {
            this.a = ajustes;
            this.selector = selector || new Selector(ajustes);
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
    // Marco de la imagen analizada (puro)
    // COCO-SSD reduce TODA imagen a 300×300 sin respetar la proporción. Una imagen vertical del celular
    // (9:16) le llegaba aplastada casi al doble y las personas bajaban mucho de confianza. Por eso:
    //  - vertical o cuadrada → se completa a un cuadrado con bordes negros a los costados;
    //  - entre 1:1 y 4:3 (el Tello es 4:3) → se usa tal cual;
    //  - más ancha que 4:3 → bordes arriba y abajo hasta 4:3.
    // Medido el 6/11 en la PC con fotos verticales: confianza 81 % → 95 % y 82 % → 87 %, sin perder personas.
    // ================================================================
    function marcoAnalisis(fw, fh, anchoMax) {
        const a = fw / fh;
        const t = limitar(a, 1, 4 / 3);                       // proporción del lienzo
        const cw = Math.max(1, Math.round(Math.min(anchoMax, Math.max(fw, fh * t))));
        const ch = Math.max(1, Math.round(cw / t));
        let dw = cw;
        let dh = ch;
        if (a < t) dw = Math.round(ch * a);                     // bordes a los costados
        else if (a > t) dh = Math.round(cw / a);                // bordes arriba y abajo
        return { cw, ch, dx: Math.round((cw - dw) / 2), dy: Math.round((ch - dh) / 2), dw, dh, bordes: dw !== cw || dh !== ch };
    }

    /** Pasa un recuadro del lienzo analizado (px) a coordenadas normalizadas de la imagen original, recortado a [0, 1]. */
    function recuadroEnFuente([bx, by, bw, bh], m) {
        const x0 = limitar((bx - m.dx) / m.dw, 0, 1);
        const y0 = limitar((by - m.dy) / m.dh, 0, 1);
        const x1 = limitar((bx + bw - m.dx) / m.dw, 0, 1);
        const y1 = limitar((by + bh - m.dy) / m.dh, 0, 1);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    // ================================================================
    // Visión (navegador): COCO-SSD sobre una imagen reducida
    // ================================================================
    // Flags de empaquetado de WebGL: guardan 4 valores por píxel de textura. En GPUs que no pueden escribir
    // texturas float32 (muchas Mali), TensorFlow usa float16 y el empaquetado suma error y fallas de algunos
    // drivers. El arreglo conocido es apagarlo (más lento, pero preciso). Solo se aplica en esas GPUs.
    const FLAGS_EMPAQUETADO = ['WEBGL_PACK', 'WEBGL_PACK_DEPTHWISECONV', 'WEBGL_PACK_BINARY_OPERATIONS', 'WEBGL_PACK_UNARY_OPERATIONS',
        'WEBGL_PACK_ARRAY_OPERATIONS', 'WEBGL_PACK_IMAGE_OPERATIONS', 'WEBGL_PACK_REDUCE', 'WEBGL_PACK_CLIP', 'WEBGL_PACK_NORMALIZATION',
        'WEBGL_LAZILY_UNPACK', 'WEBGL_CONV_IM2COL'];

    // Puntaje mínimo de lo que devuelve el detector: bajo, para mostrar TODO en la miniatura y en la prueba en CPU.
    // El umbral para seguir (umbralConfianza, 50 %) se aplica después y no cambia.
    const PUNTAJE_MINIMO_CRUDO = 0.1;

    let _detector = null;

    /**
     * Carga UNA vez el detector (COCO-SSD) para toda la app: la cabina, la demo y "Mis objetos" lo comparten.
     * @returns {Promise<{modelo:Object, backend:string, gpu:Object|null}>}
     */
    function cargarDetector() {
        if (!_detector) {
            _detector = (async () => {
                if (typeof tf === 'undefined' || typeof cocoSsd === 'undefined') {
                    throw new Error('Faltan TensorFlow.js o COCO-SSD (libs/).');
                }
                // Preferir WebGL; si no está, queda el que haya (CPU es inutilizable para controlar)
                try { if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl'); } catch (_) { /* sin WebGL */ }
                await tf.ready();
                const backend = tf.getBackend();
                let gpu = null;
                if (backend === 'webgl') {
                    try {
                        const float32 = tf.env().getBool('WEBGL_RENDER_FLOAT32_CAPABLE');
                        // Antes de cargar el modelo (los shaders se compilan con estos flags)
                        if (!float32) FLAGS_EMPAQUETADO.forEach(f => tf.env().set(f, false));
                        gpu = { version: tf.env().getNumber('WEBGL_VERSION'), float32, empaquetado: tf.env().getBool('WEBGL_PACK') };
                    } catch (_) { /* sin datos */ }
                }
                const modelo = await cocoSsd.load({ modelUrl: './libs/coco-ssd/model.json' });
                // Calentamiento: la primera inferencia compila los shaders y es lenta
                const c = document.createElement('canvas');
                c.width = 64; c.height = 48;
                await modelo.detect(c);
                return { modelo, backend, gpu };
            })();
            _detector.catch(() => { _detector = null; }); // si falla, se puede reintentar
        }
        return _detector;
    }

    class Vision {
        constructor(ajustes) {
            this.a = ajustes;
            this.modelo = null;
            this.backend = null;
            this.gpu = null;          // datos de WebGL para el modo técnico
            this.canvas = null;
            this.ctx = null;
            this.marco = null;        // último marco usado (para la miniatura y el panel)
            this.fuenteW = 0;
            this.fuenteH = 0;
            this.brillo = null;       // brillo medio (0-255) de la imagen analizada: ~0 = le llega negro
            this._muestra = null;
            this._cuadros = 0;
        }

        async cargar() {
            const d = await cargarDetector();
            this.modelo = d.modelo;
            this.backend = d.backend;
            this.gpu = d.gpu;
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
            this._muestra = document.createElement('canvas');
            this._muestra.width = 16; this._muestra.height = 16;
            return { backend: this.backend };
        }

        /** Brillo medio de la parte con imagen (cada 5 cuadros: leer píxeles frena la GPU). */
        _medirBrillo(m) {
            if (this._cuadros++ % 5 !== 0) return;
            try {
                const c = this._muestra.getContext('2d', { willReadFrequently: true });
                c.drawImage(this.canvas, m.dx, m.dy, m.dw, m.dh, 0, 0, 16, 16);
                const d = c.getImageData(0, 0, 16, 16).data;
                let suma = 0;
                for (let i = 0; i < d.length; i += 4) suma += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                this.brillo = Math.round(suma / (d.length / 4));
            } catch (_) {
                this.brillo = null;
            }
        }

        /**
         * @returns {Promise<{ms:number, candidatos:Array, crudos:Array}|null>} null si la fuente no tiene imagen.
         * candidatos: normalizados a la imagen original; crudos: en píxeles del lienzo analizado (miniatura).
         */
        /** Dibuja la fuente en `lienzo` con el marco de análisis (bordes si hace falta). @returns marco o null */
        prepararLienzo(fuente, lienzo) {
            const fw = fuente.videoWidth || fuente.width || 0;
            const fh = fuente.videoHeight || fuente.height || 0;
            if (fw < 32 || fh < 32) return null;
            const m = marcoAnalisis(fw, fh, this.a.anchoAnalisis);
            if (lienzo.width !== m.cw || lienzo.height !== m.ch) { lienzo.width = m.cw; lienzo.height = m.ch; }
            const ctx = lienzo.getContext('2d');
            if (m.bordes) {
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, m.cw, m.ch);
            }
            ctx.drawImage(fuente, m.dx, m.dy, m.dw, m.dh);
            return m;
        }

        async detectar(fuente) {
            const m = this.prepararLienzo(fuente, this.canvas);
            if (!m) return null;
            const fw = fuente.videoWidth || fuente.width;
            const fh = fuente.videoHeight || fuente.height;
            this.marco = m;
            this.fuenteW = fw;
            this.fuenteH = fh;
            this._medirBrillo(m);
            const t0 = performance.now();
            const preds = await this.modelo.detect(this.canvas, 20, Math.min(PUNTAJE_MINIMO_CRUDO, this.a.umbralConfianza));
            const ms = performance.now() - t0;
            return {
                ms,
                crudos: preds,
                candidatos: preds.map(p => ({ clase: p.class, score: p.score, ...recuadroEnFuente(p.bbox, m) })),
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
         * @param {Function} [opciones.obtenerContexto] () => {enVuelo, alturaCm, bateria, telemetriaOk} (para el registro y las condiciones)
         * @param {HTMLCanvasElement} [opciones.miniatura] canvas donde se dibuja "lo que ve el modelo" (solo si está visible)
         */
        constructor({ videoEl, canvasDebug = null, ajustes = {}, obtenerContexto = null, miniatura = null }) {
            if (!videoEl) throw new Error('[Seguimiento] Se requiere un elemento <video> o <canvas>.');
            this.fuente = videoEl;
            this.canvasDebug = canvasDebug;
            this.miniatura = miniatura;
            this._ajustesExtra = ajustes;
            this.ajustes = ajustesActuales(ajustes);
            this.obtenerContexto = obtenerContexto;
            /** Registro por cuadro (detección, comando y telemetría); se reinicia al activar */
            this.registro = [];
            this._tActivacion = 0;
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
            /** Objeto de "Mis objetos" a seguir ({id, nombre, huellas}); null = una persona */
            this.objeto = null;
        }

        /**
         * Elige qué seguir: null = una persona; o un objeto de "Mis objetos" (carga MobileNet para las huellas).
         * Vale desde la próxima activación.
         * @returns {Promise<{ok:boolean, error?:string}>}
         */
        async elegirObjeto(objeto) {
            if (!objeto) { this.objeto = null; return { ok: true }; }
            if (typeof DronObjetos === 'undefined') return { ok: false, error: 'Falta el módulo de Mis objetos.' };
            if (!Array.isArray(objeto.huellas) || !objeto.huellas.length) return { ok: false, error: 'El objeto no tiene fotos analizadas.' };
            try {
                await DronObjetos.cargarModelo();
            } catch (e) {
                return { ok: false, error: `No se pudo cargar el modelo de huellas: ${e?.message || e}` };
            }
            this.objeto = objeto;
            return { ok: true };
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
            // Los ajustes se releen al activar: lo que se cambie en Config. del dron vale desde la próxima activación
            this.ajustes = ajustesActuales(this._ajustesExtra);
            this.vision.a = this.ajustes;
            const selector = this.objeto ? new SelectorObjeto(this.ajustes, this.objeto.nombre) : null;
            this.seguidor = new Seguidor(this.ajustes, selector);
            this.registro = [];
            this._tActivacion = performance.now();
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
                candidatos: this._contarValidos(this._ultimosCandidatos),
                objeto: this.objeto ? this.objeto.nombre : null,
                noEncuentra: !!this.seguidor?.selector.noEncuentra,
                condiciones: this.condiciones(),
                imagen: this._infoImagen(),
                imagenNegra: this.vision.brillo !== null && this.vision.brillo < 6,
                gpu: this.vision.gpu,
            };
        }

        /** Tamaño de la cámara, del lienzo analizado y brillo (para el modo técnico). */
        _infoImagen() {
            const v = this.vision;
            if (!v.marco) return null;
            return { fuente: `${v.fuenteW}×${v.fuenteH}`, analizada: `${v.marco.cw}×${v.marco.ch}`, bordes: v.marco.bordes, brillo: v.brillo };
        }

        /**
         * Personas que superan el umbral; con un objeto, los parecidos según el selector (buscando: los comparados
         * en ese cuadro; siguiendo: 1 mientras lo sigue, aunque ese cuadro no se haya comparado).
         */
        _contarValidos(candidatos) {
            if (this.objeto) return this.seguidor?.selector.coincidencias ?? 0;
            return candidatos.filter(c => c.clase === this.ajustes.claseObjetivo && c.score >= this.ajustes.umbralConfianza).length;
        }

        /** Condiciones del control real con el contexto actual del dron (sin dron: no se cumplen). */
        condiciones() {
            const ctx = (typeof this.obtenerContexto === 'function' && this.obtenerContexto()) || {};
            return condicionesControlReal({ ...ctx, backend: this.vision.backend, fps: this._fps }, this.ajustes);
        }

        _registrar(t, r) {
            const ob = this.seguidor.selector.objetivo;
            const cmd = this.seguidor.comando;
            const ctx = (typeof this.obtenerContexto === 'function' && this.obtenerContexto()) || {};
            this.registro.push({
                t: Math.round(t - this._tActivacion),
                estado: this.seguidor.estado,
                candidatos: r ? this._contarValidos(r.candidatos) : 0,
                inferenciaMs: r ? Math.round(r.ms) : null,
                fps: Math.round(this._fps * 10) / 10,
                objetivo: ob ? { cx: ob.cx, cy: ob.cy, h: ob.h, score: ob.score } : null,
                comando: { ...cmd },
                enVuelo: ctx.enVuelo ?? null,
                alturaCm: Number.isFinite(ctx.alturaCm) ? Math.round(ctx.alturaCm) : null,
                bateria: Number.isFinite(ctx.bateria) ? Math.round(ctx.bateria) : null,
                brillo: this.vision.brillo,
            });
            if (this.registro.length > 3000) this.registro.shift(); // ~5 min a 10 FPS
        }

        /** Registro en CSV (para "Copiar registro"). */
        registroCSV() {
            const r3 = v => (v === null || v === undefined ? '' : Math.round(v * 1000) / 1000);
            const img = this._infoImagen();
            const filas = [
                // Primera línea: con qué imagen se trabajó (para leer el registro de un celular a distancia)
                `# camara ${img?.fuente || '?'} · analizada ${img?.analizada || '?'}${img?.bordes ? ' con bordes' : ''} · backend ${this.vision.backend || '?'}`
                    + (this.vision.gpu ? ` · WebGL ${this.vision.gpu.version} float32 ${this.vision.gpu.float32 ? 'sí' : 'no'}` : '')
                    + ` · sigue: ${this.objeto ? this.objeto.nombre : 'una persona'}`,
                `t_ms;estado;${this.objeto ? 'parecidos' : 'personas'};inferencia_ms;fps;obj_cx;obj_cy;obj_alto;obj_score;cmd_giro;cmd_altura;cmd_avance;en_vuelo;altura_cm;bateria;brillo`,
            ];
            for (const e of this.registro) {
                filas.push([
                    e.t, e.estado, e.candidatos, e.inferenciaMs ?? '', e.fps,
                    r3(e.objetivo?.cx), r3(e.objetivo?.cy), r3(e.objetivo?.h), r3(e.objetivo?.score),
                    r3(e.comando.yaw), r3(e.comando.ud), r3(e.comando.fb),
                    e.enVuelo === null ? '' : (e.enVuelo ? 1 : 0), e.alturaCm ?? '', e.bateria ?? '', e.brillo ?? '',
                ].join(';'));
            }
            return filas.join('\n');
        }

        async _cicloInferencia() {
            if (!this.activo) return;
            // Pausado mientras corre "Probar este cuadro en CPU" (no se pueden mezclar los dos backends)
            if (this._pausado) { this._timerInferencia = setTimeout(() => this._cicloInferencia(), 200); return; }
            const t0 = performance.now();
            try {
                this._inferenciaEnCurso = this.vision.detectar(this.fuente);
                const r = await this._inferenciaEnCurso;
                if (!this.activo) return;
                const t = performance.now();
                if (r) {
                    this._msInferencia = this._msInferencia === null ? r.ms : 0.8 * this._msInferencia + 0.2 * r.ms;
                    if (this.objeto) await this._compararConObjeto(r);
                    if (!this.activo) return;
                    this._ultimosCandidatos = r.candidatos;
                    this.seguidor.procesarDeteccion(r.candidatos, this.objeto ? performance.now() : t);
                    this._dibujar(r.candidatos);
                    this._dibujarMiniatura(r.crudos, r.candidatos);
                } else {
                    this._ultimosCandidatos = [];
                    this.seguidor.procesarDeteccion([], t);
                }
                this._registrar(t, r);
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

        /**
         * "Mis objetos": compara con las huellas guardadas solo los candidatos que pide el selector
         * (como mucho 3 buscando; el objetivo cada ~1 s siguiendo). Deja el parecido en `sim`.
         */
        async _compararConObjeto(r) {
            const indices = this.seguidor.selector.aVerificar(r.candidatos, performance.now());
            for (const i of indices) {
                const h = await DronObjetos.huella(this.vision.canvas, r.crudos[i].bbox);
                r.candidatos[i].sim = DronObjetos.mejorParecido(h, this.objeto.huellas);
            }
        }

        /**
         * Modo técnico: analiza el cuadro actual con WebGL (GPU) y con el backend CPU de TensorFlow, para ver
         * si la GPU da otros puntajes. Pausa el ciclo mientras tanto. La CPU es lenta (segundos en el celular).
         * @returns {Promise<{ok:boolean, error?:string, webgl?:Array, cpu?:Array, msWebgl?:number, msCpu?:number, tamano?:string}>}
         */
        async probarCuadroEnCpu() {
            if (!this.modeloCargado) return { ok: false, error: 'Primero activá el ensayo o la cámara: el modelo no está cargado.' };
            if (typeof tf === 'undefined') return { ok: false, error: 'Falta TensorFlow.js.' };
            const lienzo = document.createElement('canvas');
            this._pausado = true;
            const anterior = tf.getBackend();
            try {
                await this._inferenciaEnCurso?.catch(() => {});
                const m = this.vision.prepararLienzo(this.fuente, lienzo);
                if (!m) return { ok: false, error: 'No hay imagen para analizar.' };
                const resumen = preds => preds.map(p => ({ clase: p.class, score: p.score })).sort((a, b) => b.score - a.score);
                let t0 = performance.now();
                const webgl = resumen(await this.vision.modelo.detect(lienzo, 20, PUNTAJE_MINIMO_CRUDO));
                const msWebgl = Math.round(performance.now() - t0);
                await tf.setBackend('cpu');
                t0 = performance.now();
                const cpu = resumen(await this.vision.modelo.detect(lienzo, 20, PUNTAJE_MINIMO_CRUDO));
                const msCpu = Math.round(performance.now() - t0);
                return { ok: true, webgl, cpu, msWebgl, msCpu, tamano: `${m.cw}×${m.ch}`, backendAnterior: anterior };
            } catch (e) {
                return { ok: false, error: e?.message || String(e) };
            } finally {
                try { if (tf.getBackend() !== anterior) await tf.setBackend(anterior); } catch (_) { /* queda el que haya */ }
                this._pausado = false;
            }
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

        /**
         * Miniatura de "lo que ve el modelo": el lienzo analizado tal cual (con los bordes) y todas sus
         * detecciones, también las de otras clases y las de poca confianza. Solo si la miniatura está visible.
         */
        _dibujarMiniatura(crudos, candidatos = []) {
            const mini = this.miniatura;
            const v = this.vision;
            if (!mini || !mini.isConnected || mini.offsetParent === null || !v.marco) return;
            const ancho = Math.round(mini.clientWidth * (globalThis.devicePixelRatio || 1)) || 160;
            const escala = ancho / v.marco.cw;
            const alto = Math.max(1, Math.round(v.marco.ch * escala));
            if (mini.width !== ancho || mini.height !== alto) { mini.width = ancho; mini.height = alto; }
            const ctx = mini.getContext('2d');
            ctx.drawImage(v.canvas, 0, 0, ancho, alto);
            ctx.lineWidth = 2;
            ctx.font = `600 ${Math.max(10, Math.round(ancho / 22))}px system-ui, sans-serif`;
            (crudos || []).forEach((p, i) => {
                // Todas las detecciones (desde el 10 %), con su puntaje; con un objeto, también el parecido
                const sim = candidatos[i]?.sim;
                let color = 'rgba(203, 213, 225, 0.8)';
                if (this.objeto) {
                    if (typeof sim === 'number') color = sim >= this.ajustes.confirmacionUmbral ? '#22c55e' : '#f59e0b';
                } else if (p.class === this.ajustes.claseObjetivo) {
                    color = p.score >= this.ajustes.umbralConfianza ? '#22c55e' : '#f59e0b';
                }
                ctx.strokeStyle = color;
                const [x, y, w, h] = p.bbox.map(n => n * escala);
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = color;
                const parecido = typeof sim === 'number' ? ` · parecido ${Math.round(sim * 100)}%` : '';
                ctx.fillText(`${nombreClase(p.class)} ${Math.round(p.score * 100)}%${parecido}`, x + 2, Math.max(10, y - 3));
            });
        }

        _limpiarDebug() {
            const cv = this.canvasDebug;
            if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        }
    }

    // ================================================================
    // Texto del ensayo y panel superpuesto (cabina y demo de la cámara)
    // ================================================================
    const pct = v => (v >= 0 ? '+' : '') + Math.round(v * 100);
    const nombreClase = c => (c === 'person' ? 'persona' : c);

    /** Lo que haría el dron, en palabras ("avanzaría, giraría a la derecha"). */
    function describirComando(cmd) {
        const partes = [];
        const umbral = 0.03;
        if (Math.abs(cmd.fb) >= umbral) partes.push(cmd.fb > 0 ? 'avanzaría' : 'retrocedería');
        if (Math.abs(cmd.yaw) >= umbral) partes.push(cmd.yaw > 0 ? 'giraría a la derecha' : 'giraría a la izquierda');
        if (Math.abs(cmd.ud) >= umbral) partes.push(cmd.ud > 0 ? 'subiría' : 'bajaría');
        return partes.length ? partes.join(', ') : 'se quedaría quieto';
    }

    /** Comando en números (modo técnico): valores del "rc" del Tello, de -100 a 100. */
    function comandoEnNumeros(cmd) {
        return `giro ${pct(cmd.yaw)} · altura ${pct(cmd.ud)} · avance ${pct(cmd.fb)}`;
    }

    /** Cartel del ensayo (abajo de la imagen): qué haría el dron, sin moverlo. */
    function textoEnsayo(cmd, info) {
        const que = info.objeto ? `«${info.objeto}»` : 'la persona';
        switch (info.estado) {
            case 'buscando':
                if (info.objeto && info.noEncuentra) return `No encuentro «${info.objeto}». Probá con más fotos o más luz.`;
                return `Ensayo: buscando ${info.objeto ? que : 'una persona'}...`;
            case 'siguiendo': return `Ensayo (no mueve el dron): ${describirComando(cmd)}`;
            case 'perdiendo': return `Ensayo: se está perdiendo ${que}; el dron frenaría de a poco`;
            case 'perdido':
                if (info.objeto && info.noEncuentra) return `No encuentro «${info.objeto}». Probá con más fotos o más luz.`;
                return `Ensayo: se perdió ${que}; el dron se quedaría quieto`;
            default: return '';
        }
    }

    /**
     * Estado corto para la etiqueta sobre la imagen (como las de RAC): texto y color del punto.
     * @returns {{texto:string, color:string}}
     */
    function estadoCorto(info) {
        if (info.imagenNegra) return { texto: 'Sin imagen de la cámara', color: 'error' };
        if (info.objeto) {
            const n = `«${info.objeto}»`;
            switch (info.estado) {
                case 'buscando': return info.noEncuentra ? { texto: `No encuentro ${n}`, color: 'error' } : { texto: `Buscando ${n}`, color: 'acento' };
                case 'siguiendo': return { texto: `Siguiendo ${n}`, color: 'exito' };
                case 'perdiendo': return { texto: `Perdiendo ${n}`, color: 'advertencia' };
                case 'perdido': return { texto: info.noEncuentra ? `No encuentro ${n}` : `Se perdió ${n}`, color: 'error' };
                default: return { texto: 'Seguimiento apagado', color: '' };
            }
        }
        switch (info.estado) {
            case 'buscando': return { texto: 'Buscando persona', color: 'acento' };
            case 'siguiendo': return { texto: 'Persona fijada', color: 'exito' };
            case 'perdiendo': return { texto: 'Perdiéndola', color: 'advertencia' };
            case 'perdido': return { texto: 'Persona perdida', color: 'error' };
            default: return { texto: 'Seguimiento apagado', color: '' };
        }
    }

    /**
     * Panel detallado (modo técnico): backend, FPS, demora, estado, imagen analizada y condiciones del control real.
     * El comando lo muestra el cartel "ENSAYO" sobre el video. Se ubica con la clase .panel-seguimiento de app.css.
     */
    class Panel {
        constructor(contenedor) {
            this.el = document.createElement('div');
            this.el.className = 'panel-seguimiento';
            contenedor.appendChild(this.el);
            this._ultimo = 0;
        }

        actualizar(info, forzar = false) {
            const ahora = performance.now();
            if (!forzar && ahora - this._ultimo < 200) return; // 5 veces por segundo alcanza
            this._ultimo = ahora;
            const backend = info.backend === 'webgl' ? 'WebGL (placa de video)' : `${String(info.backend || '?').toUpperCase()} (lento)`;
            const nombres = { buscando: 'buscando', siguiendo: 'siguiendo', perdiendo: 'perdiéndolo', perdido: 'perdido', apagado: 'apagado' };
            const cond = info.condiciones;
            const lineaReal = !cond ? '' : cond.ok ? 'Control real (S3): se cumplen las condiciones'
                : `Control real (S3): falta ${cond.motivos[0]}${cond.motivos.length > 1 ? ` (+${cond.motivos.length - 1})` : ''}`;
            const demora = info.edadMs !== null ? ` · hace ${info.edadMs} ms` : '';
            const img = info.imagen;
            const gpu = info.gpu ? ` · WebGL ${info.gpu.version}, float32 ${info.gpu.float32 ? 'sí' : 'no'}${info.gpu.empaquetado === false ? ', empaquetado apagado' : ''}` : '';
            const lineas = [
                `Visión (backend): ${backend} · ${info.fps} FPS (análisis por segundo) · ${info.inferenciaMs ?? '--'} ms por análisis${demora}`,
                `Estado: ${nombres[info.estado] || info.estado} · ${info.objeto ? `parecidos a «${info.objeto}»` : 'personas'}: ${info.candidatos}`,
                `Comando (rc, de -100 a 100): ${comandoEnNumeros(info.comando)}`,
                img ? `Imagen: cámara ${img.fuente} → modelo ${img.analizada}${img.bordes ? ' con bordes' : ''} · brillo ${img.brillo ?? '--'}${gpu}` : '',
                info.imagenNegra ? 'ATENCIÓN: al modelo le llega una imagen negra' : '',
                lineaReal,
            ].filter(Boolean);
            this.el.textContent = lineas.join('\n');
        }

        destruir() {
            this.el.remove();
        }
    }

    /** Texto del resultado de "Probar este cuadro en CPU" (modo técnico). */
    function textoPruebaCpu(r, claseObjetivo = 'person') {
        if (!r.ok) return `No se pudo probar: ${r.error}`;
        const lista = l => (l.length ? l.map(d => `${nombreClase(d.clase)} ${Math.round(d.score * 100)} %`).join(', ') : 'nada');
        const mejor = l => Math.max(0, ...l.filter(d => d.clase === claseObjetivo).map(d => d.score));
        const g = mejor(r.webgl);
        const c = mejor(r.cpu);
        let conclusion = 'Los dos dan lo mismo: la GPU no es el problema (revisá la imagen, la luz o la distancia).';
        if (Math.abs(g - c) >= 0.15) {
            conclusion = c > g
                ? 'La CPU encuentra más que la GPU: el problema es la precisión de WebGL en este celular.'
                : 'La GPU encuentra más que la CPU: la diferencia no explica que no detecte.';
        }
        return [
            `Mismo cuadro (${r.tamano}), todo desde el 10 %:`,
            `WebGL (GPU, ${r.msWebgl} ms): ${lista(r.webgl)}`,
            `CPU (procesador, ${r.msCpu} ms): ${lista(r.cpu)}`,
            conclusion,
        ].join('\n');
    }

    /** Copia texto al portapapeles (con respaldo para WebViews sin API de portapapeles). */
    async function copiarTexto(texto) {
        try {
            if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); return true; }
        } catch (_) { /* se intenta el respaldo */ }
        try {
            const ta = document.createElement('textarea');
            ta.value = texto;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed; left:-9999px; opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (_) {
            return false;
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
    Seguimiento.RANGOS = RANGOS;
    Seguimiento.validarAjustes = validarAjustes;
    Seguimiento.guardarAjustes = guardarAjustes;
    Seguimiento.restaurarAjustes = restaurarAjustes;
    Seguimiento.textoEnsayo = textoEnsayo;
    Seguimiento.describirComando = describirComando;
    Seguimiento.SelectorObjeto = SelectorObjeto;
    Seguimiento.cargarDetector = cargarDetector;
    Seguimiento.estadoCorto = estadoCorto;
    Seguimiento.textoPruebaCpu = textoPruebaCpu;
    Seguimiento.marcoAnalisis = marcoAnalisis;
    Seguimiento.recuadroEnFuente = recuadroEnFuente;
    Seguimiento.Panel = Panel;
    Seguimiento.copiarTexto = copiarTexto;
    return Seguimiento;
})();

// En Node (pruebas automáticas) se exporta como módulo; en el navegador queda como global
if (typeof module !== 'undefined' && module.exports) module.exports = DronSeguimiento;
