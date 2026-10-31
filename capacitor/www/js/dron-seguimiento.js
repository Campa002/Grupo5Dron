/**
 * Módulo de Seguimiento Visual — EXPERIMENTAL
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * ⚠ REQUIERE VALIDACIÓN CON EL DRON REAL.
 * Este módulo es EXPERIMENTAL y no debe usarse en vuelo autónomo sin
 * supervisión humana permanente.
 *
 * Modalidades de Detección:
 *  1. Modo 'persona': Detección por IA con TensorFlow.js + COCO-SSD (modelo empaquetado localmente en /vendor/coco-ssd/).
 *  2. Modo 'color': Respaldo por segmentación de color (offline, sin librerías pesadas), útil para pruebas en clase.
 */

// eslint-disable-next-line no-unused-vars
const DronSeguimiento = (() => {
    'use strict';

    class DronSeguimiento {
        constructor({
            videoEl,
            canvasDebug = null,
            maxFPS = 5,
            umbralConfianza = 0.55,
        }) {
            if (!videoEl) throw new Error('[Seguimiento] Se requiere un elemento <video> o <canvas>.');
            this.videoEl         = videoEl;
            this.canvasDebug     = canvasDebug;
            this.maxFPS          = maxFPS;
            this.umbralConfianza = umbralConfianza;

            this.modo            = 'persona'; // 'persona' o 'color'
            this.activo          = false;    // Desactivado por defecto al inicio
            this.cargando        = false;
            this.modeloCargado   = false;
            this._modelo         = null;
            this._claseObj       = 'person';
            this._rafId          = null;
            this._ultFrame       = 0;
            this._framesSinDetectar = 0;

            // Parámetros de seguridad de control
            this.maxVelocidadRC  = 25; // Límite estricto del 25% de velocidad máxima

            /** @type {Function|null} Callback ({dx, dy, deteccion, modo}) */
            this.onOffset = null;
            /** @type {Function|null} Callback cuando no se detecta objeto */
            this.onPerdida = null;

            this._ADVERTENCIA = '⚠ SEGUIMIENTO EXPERIMENTAL: supervisión obligatoria. Límites de velocidad activos.';
        }

        async inicializar() {
            if (this.modeloCargado) return { ok: true, modo: this.modo };
            if (this.cargando) return { ok: false, error: 'ya_cargando' };
            this.cargando = true;

            // 1. Intentar cargar modelo local de TensorFlow.js
            const tfDisponible = typeof tf !== 'undefined' && typeof cocoSsd !== 'undefined';

            if (tfDisponible) {
                try {
                    console.info('[Seguimiento] Intentando cargar modelo COCO-SSD local...');
                    this._modelo = await cocoSsd.load({
                        modelUrl: '/vendor/coco-ssd/model.json',
                    });
                    this.modeloCargado = true;
                    this.cargando = false;
                    this.modo = 'persona';
                    console.info('[Seguimiento] ✅ Modelo COCO-SSD cargado para modo "persona".');
                    return { ok: true, modo: 'persona' };
                } catch (err) {
                    console.warn('[Seguimiento] No se pudo cargar el modelo COCO-SSD local:', err);
                }
            }

            // 2. Fallback automático a modo 'color' si no hay modelo de IA
            this.cargando = false;
            this.modeloCargado = true;
            this.modo = 'color';
            console.info('[Seguimiento] ℹ️ Activando modo respaldo por color (sin dependencias pesadas).');
            return {
                ok: true,
                modo: 'color',
                aviso: 'Operando en modo respaldo por color (modelo IA no encontrado en /vendor/coco-ssd/).'
            };
        }

        activar(modoDeseado = 'persona') {
            this.modo = (modoDeseado === 'color' || !this._modelo) ? 'color' : 'persona';
            this.activo = true;
            this._ultFrame = 0;
            this._framesSinDetectar = 0;
            console.warn(`[Seguimiento] ${this._ADVERTENCIA} (Modo: ${this.modo})`);
            this._bucle();
        }

        desactivar() {
            this.activo = false;
            if (this._rafId !== null) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            if (typeof this.onOffset === 'function') {
                this.onOffset({ dx: 0, dy: 0, deteccion: null, activo: false });
            }
            this._limpiarDebug();
            console.info('[Seguimiento] Seguimiento desactivado.');
        }

        _bucle(ts = 0) {
            if (!this.activo) return;

            const intervaloMs = 1000 / this.maxFPS;
            if (ts - this._ultFrame >= intervaloMs) {
                this._ultFrame = ts;
                this._detectar();
            }

            this._rafId = requestAnimationFrame((t) => this._bucle(t));
        }

        async _detectar() {
            if (!this.activo) return;

            if (this.modo === 'persona' && this._modelo) {
                await this._detectarPersona();
            } else {
                this._detectarColor();
            }
        }

        async _detectarPersona() {
            try {
                const preds = await this._modelo.detect(this.videoEl);
                const persona = preds.find(p => p.class === 'person' && p.score >= this.umbralConfianza);

                if (persona) {
                    this._framesSinDetectar = 0;
                    const offset = this._calcularOffset(persona.bbox);
                    this._dibujarDebug([persona]);
                    if (this.onOffset) this.onOffset({ ...offset, deteccion: persona, modo: 'persona' });
                } else {
                    this._manejarPerdida();
                }
            } catch (e) {
                this._manejarPerdida();
            }
        }

        _detectarColor() {
            // Segmentación por color en canvas auxiliar
            if (!this.canvasDebug) {
                this._manejarPerdida();
                return;
            }

            const ctx = this.canvasDebug.getContext('2d');
            const w = this.canvasDebug.width || 320;
            const h = this.canvasDebug.height || 240;

            try {
                // Dibujar frame en el canvas de análisis
                ctx.drawImage(this.videoEl, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const d = imgData.data;

                let sumaX = 0;
                let sumaY = 0;
                let count = 0;

                // Buscar píxeles con predominancia de verde/naranja (objetivo típico de prueba)
                for (let i = 0; i < d.length; i += 16) {
                    const r = d[i];
                    const g = d[i + 1];
                    const b = d[i + 2];

                    // Detección de color objetivo: por ejemplo verde intenso
                    if (g > 100 && g > r * 1.3 && g > b * 1.3) {
                        const px = (i / 4) % w;
                        const py = Math.floor((i / 4) / w);
                        sumaX += px;
                        sumaY += py;
                        count++;
                    }
                }

                if (count > 25) {
                    this._framesSinDetectar = 0;
                    const cx = sumaX / count;
                    const cy = sumaY / count;

                    const dx = Math.max(-1, Math.min(1, (cx - w / 2) / (w / 2)));
                    const dy = Math.max(-1, Math.min(1, (cy - h / 2) / (h / 2)));

                    // Dibujar cruz de seguimiento
                    ctx.strokeStyle = '#22c55e';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
                    ctx.moveTo(cx - 25, cy); ctx.lineTo(cx + 25, cy);
                    ctx.moveTo(cx, cy - 25); ctx.lineTo(cx, cy + 25);
                    ctx.stroke();

                    if (this.onOffset) {
                        this.onOffset({
                            dx: dx * (this.maxVelocidadRC / 100),
                            dy: dy * (this.maxVelocidadRC / 100),
                            deteccion: { class: 'color_target', area: count },
                            modo: 'color'
                        });
                    }
                } else {
                    this._manejarPerdida();
                }
            } catch (err) {
                this._manejarPerdida();
            }
        }

        _manejarPerdida() {
            this._framesSinDetectar++;
            if (this._framesSinDetectar >= 3) {
                // Parada inmediata al perder el objetivo
                if (this.onOffset) this.onOffset({ dx: 0, dy: 0, deteccion: null, perdido: true });
                if (this.onPerdida) this.onPerdida();
                this._limpiarDebug();
            }
        }

        _calcularOffset(bbox) {
            const [x, y, ancho, alto] = bbox;
            const centroX = x + ancho / 2;
            const centroY = y + alto / 2;

            const vW = this.videoEl.videoWidth || this.videoEl.width || 640;
            const vH = this.videoEl.videoHeight || this.videoEl.height || 360;

            const dxNorm = (centroX - vW / 2) / (vW / 2);
            const dyNorm = (centroY - vH / 2) / (vH / 2);

            // Aplicar límite de seguridad conservador
            const factorSeguro = this.maxVelocidadRC / 100.0;

            return {
                dx: Math.max(-factorSeguro, Math.min(factorSeguro, dxNorm * factorSeguro)),
                dy: Math.max(-factorSeguro, Math.min(factorSeguro, dyNorm * factorSeguro))
            };
        }

        _dibujarDebug(detecciones) {
            if (!this.canvasDebug) return;
            const ctx = this.canvasDebug.getContext('2d');
            const w = this.canvasDebug.width;
            const h = this.canvasDebug.height;
            ctx.clearRect(0, 0, w, h);

            detecciones.forEach(d => {
                const [x, y, bw, bh] = d.bbox;
                ctx.strokeStyle = '#38ef7d';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, bw, bh);
                ctx.fillStyle = '#38ef7d';
                ctx.font = '12px sans-serif';
                ctx.fillText(`Persona ${(d.score * 100).toFixed(0)}%`, x, Math.max(12, y - 4));
            });
        }

        _limpiarDebug() {
            if (!this.canvasDebug) return;
            const ctx = this.canvasDebug.getContext('2d');
            ctx.clearRect(0, 0, this.canvasDebug.width, this.canvasDebug.height);
        }
    }

    return DronSeguimiento;
})();
