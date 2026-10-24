/**
 * Módulo de Seguimiento Visual — EXPERIMENTAL
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * ⚠ REQUIERE VALIDACIÓN CON EL DRON REAL.
 * Este módulo es EXPERIMENTAL y no debe usarse en vuelo autónomo sin
 * supervisión humana permanente. El seguimiento puede fallar en condiciones
 * de baja iluminación, fondos complejos o movimiento brusco.
 *
 * Implementación:
 *  - Usa el modelo TensorFlow.js COCO-SSD empaquetado localmente (sin CDN).
 *  - Procesa frames del stream de video del dron a una frecuencia máxima
 *    configurable para no saturar el hilo principal.
 *  - Emite offsets de corrección (dx, dy) normalizados en [-1, 1] para que
 *    el módulo de vuelo los traduzca a comandos de movimiento.
 *  - El seguimiento está DESACTIVADO por defecto al iniciar cada sesión.
 *
 * Dependencias externas:
 *  - TensorFlow.js (tf.js) y el modelo COCO-SSD deben estar servidos
 *    localmente en /vendor/tfjs/ y /vendor/coco-ssd/ respectivamente.
 *    Si no están disponibles, el módulo reporta el error y no falla silenciosamente.
 *
 * Uso:
 *   const seg = new DronSeguimiento({ videoEl: document.getElementById('video-dron') });
 *   await seg.inicializar();      // carga el modelo
 *   seg.activar('person');        // empieza a detectar
 *   seg.onOffset = ({dx, dy}) => { ... };
 *   seg.desactivar();
 */

// eslint-disable-next-line no-unused-vars
const DronSeguimiento = (() => {
    'use strict';

    class DronSeguimiento {
        /**
         * @param {Object} config
         * @param {HTMLVideoElement} config.videoEl          - Elemento <video> con el stream del dron.
         * @param {HTMLCanvasElement} [config.canvasDebug]   - Canvas opcional para dibujar bounding boxes.
         * @param {number} [config.maxFPS]                   - Frecuencia máxima de inferencia. Default: 5.
         * @param {number} [config.umbralConfianza]          - Confianza mínima [0,1]. Default: 0.55.
         */
        constructor({
            videoEl,
            canvasDebug = null,
            maxFPS = 5,
            umbralConfianza = 0.55,
        }) {
            if (!videoEl) throw new Error('[Seguimiento] Se requiere un elemento <video>.');
            this.videoEl         = videoEl;
            this.canvasDebug     = canvasDebug;
            this.maxFPS          = maxFPS;
            this.umbralConfianza = umbralConfianza;

            this.activo      = false; // Desactivado por defecto (requisito de seguridad)
            this.cargando    = false;
            this.modeloCargado = false;
            this._modelo     = null;
            this._claseObj   = 'person'; // Clase a seguir
            this._rafId      = null;
            this._ultFrame   = 0;

            /** @type {Function|null} Callback ({dx, dy, deteccion}) */
            this.onOffset = null;
            /** @type {Function|null} Callback cuando no se detecta objeto */
            this.onPerdida = null;

            this._ADVERTENCIA = [
                '⚠ SEGUIMIENTO VISUAL EXPERIMENTAL',
                'Este módulo NO es apto para vuelo autónomo sin supervisión.',
                'Puede perder el objetivo o enviar comandos incorrectos.',
            ].join(' | ');
        }

        // ----------------------------------------------------------------
        // Inicialización del modelo
        // ----------------------------------------------------------------

        /**
         * Carga el modelo COCO-SSD desde el servidor local.
         * Requiere que /vendor/coco-ssd/model.json exista.
         * @returns {Promise<{ ok: boolean, error?: string }>}
         */
        async inicializar() {
            if (this.modeloCargado) return { ok: true };
            if (this.cargando) return { ok: false, error: 'ya_cargando' };
            this.cargando = true;

            // Verificar disponibilidad de TensorFlow.js
            if (typeof tf === 'undefined') {
                this.cargando = false;
                const msg = '[Seguimiento] TensorFlow.js no está disponible. ' +
                    'Asegurate de incluir /vendor/tfjs/tf.min.js antes de este módulo.';
                console.error(msg);
                return { ok: false, error: 'tfjs_no_disponible' };
            }

            // Verificar disponibilidad de cocoSsd
            if (typeof cocoSsd === 'undefined') {
                this.cargando = false;
                const msg = '[Seguimiento] cocoSsd no está disponible. ' +
                    'Asegurate de incluir /vendor/coco-ssd/coco-ssd.min.js antes de este módulo.';
                console.error(msg);
                return { ok: false, error: 'cocossd_no_disponible' };
            }

            try {
                console.info('[Seguimiento] Cargando modelo COCO-SSD local...');
                // El modelo se carga desde el servidor propio, sin CDN
                this._modelo = await cocoSsd.load({
                    modelUrl: '/vendor/coco-ssd/model.json',
                });
                this.modeloCargado = true;
                this.cargando = false;
                console.info('[Seguimiento] Modelo COCO-SSD cargado correctamente.');
                console.warn(this._ADVERTENCIA);
                return { ok: true };
            } catch (err) {
                this.cargando = false;
                console.error('[Seguimiento] Error al cargar el modelo:', err);
                return { ok: false, error: err.message || 'error_carga_modelo' };
            }
        }

        // ----------------------------------------------------------------
        // Activación / desactivación
        // ----------------------------------------------------------------

        /**
         * Activa el bucle de detección.
         * @param {string} [claseObjetivo] - Clase COCO a seguir (ej: 'person', 'cell phone').
         */
        activar(claseObjetivo = 'person') {
            if (!this.modeloCargado) {
                console.warn('[Seguimiento] El modelo no está cargado. Llamá a inicializar() primero.');
                return;
            }
            this._claseObj = claseObjetivo;
            this.activo    = true;
            this._ultFrame = 0;
            console.warn(this._ADVERTENCIA);
            this._bucle();
        }

        /**
         * Detiene el bucle de detección y emite offset (0, 0).
         */
        desactivar() {
            this.activo = false;
            if (this._rafId !== null) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            if (typeof this.onOffset === 'function') {
                this.onOffset({ dx: 0, dy: 0, deteccion: null });
            }
            this._limpiarDebug();
            console.info('[Seguimiento] Seguimiento desactivado.');
        }

        // ----------------------------------------------------------------
        // Bucle de inferencia
        // ----------------------------------------------------------------

        _bucle() {
            if (!this.activo) return;
            this._rafId = requestAnimationFrame(async (timestamp) => {
                const intervalo = 1000 / this.maxFPS;
                if (timestamp - this._ultFrame >= intervalo) {
                    this._ultFrame = timestamp;
                    await this._detectar();
                }
                this._bucle();
            });
        }

        async _detectar() {
            if (!this.activo || !this._modelo) return;
            if (!this.videoEl || this.videoEl.readyState < 2) return;

            try {
                const detecciones = await this._modelo.detect(this.videoEl);
                // Filtrar por clase y umbral de confianza
                const objetivo = detecciones
                    .filter(d => d.class === this._claseObj && d.score >= this.umbralConfianza)
                    .sort((a, b) => b.score - a.score)[0]; // La de mayor confianza

                if (objetivo) {
                    const offset = this._calcularOffset(objetivo);
                    if (typeof this.onOffset === 'function') {
                        this.onOffset({ ...offset, deteccion: objetivo });
                    }
                    this._dibujarDebug([objetivo]);
                } else {
                    if (typeof this.onPerdida === 'function') {
                        this.onPerdida();
                    }
                    this._limpiarDebug();
                }
            } catch (err) {
                // No interrumpir el bucle ante errores de inferencia puntuales
                console.warn('[Seguimiento] Error de inferencia (no fatal):', err.message);
            }
        }

        /**
         * Calcula el offset del centro del bounding box respecto al centro del video.
         * @param {Object} deteccion
         * @returns {{ dx: number, dy: number }}
         */
        _calcularOffset(deteccion) {
            const vw = this.videoEl.videoWidth  || this.videoEl.clientWidth  || 640;
            const vh = this.videoEl.videoHeight || this.videoEl.clientHeight || 480;

            const [bx, by, bw, bh] = deteccion.bbox;
            const centroX = bx + bw / 2;
            const centroY = by + bh / 2;

            // Normalizar: centro del frame = 0, bordes = ±1
            const dx = parseFloat(((centroX - vw / 2) / (vw / 2)).toFixed(3));
            const dy = parseFloat(((centroY - vh / 2) / (vh / 2)).toFixed(3));

            return { dx, dy };
        }

        // ----------------------------------------------------------------
        // Visualización de debug
        // ----------------------------------------------------------------

        _dibujarDebug(detecciones) {
            if (!this.canvasDebug) return;
            const ctx = this.canvasDebug.getContext('2d');
            const vw = this.videoEl.videoWidth  || 640;
            const vh = this.videoEl.videoHeight || 480;
            this.canvasDebug.width  = vw;
            this.canvasDebug.height = vh;
            ctx.clearRect(0, 0, vw, vh);

            for (const d of detecciones) {
                const [x, y, w, h] = d.bbox;
                ctx.strokeStyle = '#00ccff';
                ctx.lineWidth   = 2;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = 'rgba(0,102,204,0.6)';
                ctx.fillRect(x, y - 18, w, 18);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.fillText(`${d.class} ${(d.score * 100).toFixed(0)}%`, x + 4, y - 4);
            }
        }

        _limpiarDebug() {
            if (!this.canvasDebug) return;
            const ctx = this.canvasDebug.getContext('2d');
            ctx.clearRect(0, 0, this.canvasDebug.width, this.canvasDebug.height);
        }

        // ----------------------------------------------------------------
        // API pública
        // ----------------------------------------------------------------

        /**
         * Lista de clases que soporta COCO-SSD (para el selector de UI).
         */
        static clasesDisponibles() {
            return [
                'person', 'bicycle', 'car', 'motorcycle', 'airplane',
                'bus', 'train', 'truck', 'boat', 'traffic light',
                'fire hydrant', 'stop sign', 'parking meter', 'bench',
                'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
                'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
                'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
                'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat',
                'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
                'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon',
                'bowl', 'banana', 'apple', 'sandwich', 'orange', 'broccoli',
                'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
                'couch', 'potted plant', 'bed', 'dining table', 'toilet',
                'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
                'microwave', 'oven', 'toaster', 'sink', 'refrigerator',
                'book', 'clock', 'vase', 'scissors', 'teddy bear',
                'hair drier', 'toothbrush',
            ];
        }
    }

    return DronSeguimiento;
})();
