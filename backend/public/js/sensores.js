/**
 * Módulo Diagnóstico de Sensores — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Verifica los sensores del celular que usa el dron (se muestra en el modo técnico de Sensores):
 *  - Giroscopio y acelerómetro: se escuchan los eventos de verdad durante 1,5 s. Que exista la API
 *    (DeviceOrientationEvent) no alcanza: en un celular sin giroscopio existe igual, pero no trae datos.
 *  - Cámara trasera.
 */

// eslint-disable-next-line no-unused-vars
const Sensores = (() => {
    'use strict';

    const estado = {
        giroscopio:   { disponible: null, detalle: '' },
        acelerometro: { disponible: null, detalle: '' },
        camara:       { disponible: null, resolucion: null, error: null },
    };

    /**
     * Escucha deviceorientation y devicemotion y anota qué llega con datos.
     * Hay giroscopio si llega orientación con números o si devicemotion trae rotationRate.
     */
    function sondearMovimiento(ms = 1500) {
        const visto = { orientacion: false, gravedad: false, rotacion: false, eventos: 0 };
        if (typeof window === 'undefined') return Promise.resolve(visto);
        const enOrientacion = (ev) => {
            visto.eventos++;
            if (typeof ev.beta === 'number' && typeof ev.gamma === 'number') visto.orientacion = true;
        };
        const enMovimiento = (ev) => {
            visto.eventos++;
            const g = ev.accelerationIncludingGravity;
            if (g && typeof g.x === 'number' && typeof g.z === 'number') visto.gravedad = true;
            const r = ev.rotationRate;
            if (r && (typeof r.alpha === 'number' || typeof r.beta === 'number')) visto.rotacion = true;
        };
        window.addEventListener('deviceorientation', enOrientacion);
        window.addEventListener('devicemotion', enMovimiento);
        return new Promise(resolve => setTimeout(() => {
            window.removeEventListener('deviceorientation', enOrientacion);
            window.removeEventListener('devicemotion', enMovimiento);
            resolve(visto);
        }, ms));
    }

    async function diagnosticarMovimiento() {
        const v = await sondearMovimiento();
        const giro = v.orientacion || v.rotacion;
        estado.giroscopio = {
            disponible: giro,
            detalle: giro ? 'Llegan datos de orientación: el control por inclinación usa el giroscopio.'
                : (v.gravedad ? 'No disponible: se usa el acelerómetro para la inclinación (sin giro sobre el eje vertical).'
                    : 'No llegan datos (en una PC es normal).'),
        };
        estado.acelerometro = {
            disponible: v.gravedad,
            detalle: v.gravedad ? 'Llegan datos de aceleración con gravedad.' : 'No llegan datos.',
        };
    }

    async function diagnosticarCamara() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            estado.camara = { disponible: false, resolucion: null, error: 'API no disponible' };
            return;
        }

        try {
            const dispositivos = await navigator.mediaDevices.enumerateDevices();
            const hayVideo = dispositivos.some(d => d.kind === 'videoinput');
            estado.camara = { disponible: hayVideo, resolucion: null, error: null };

            // Resolución máxima (abre la cámara un instante; si no hay permiso, se informa)
            if (hayVideo) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    });
                    const track = stream.getVideoTracks()[0];
                    if (track) {
                        const caps = track.getCapabilities ? track.getCapabilities() : null;
                        if (caps && caps.width && caps.height) {
                            estado.camara.resolucion = `${caps.width.max}×${caps.height.max}`;
                        } else {
                            const cfg = track.getSettings();
                            estado.camara.resolucion = `${cfg.width || '?'}×${cfg.height || '?'}`;
                        }
                    }
                    stream.getTracks().forEach(t => t.stop());
                } catch (_) {
                    estado.camara.resolucion = 'sin permiso';
                }
            }
        } catch (err) {
            estado.camara = { disponible: false, resolucion: null, error: err.message };
        }
    }

    /**
     * Ejecuta los diagnósticos en paralelo.
     * @returns {Promise<Object>} copia del estado
     */
    async function diagnosticar() {
        await Promise.allSettled([diagnosticarMovimiento(), diagnosticarCamara()]);
        return JSON.parse(JSON.stringify(estado));
    }

    /**
     * Resumen para la interfaz. El ícono es HTML (ícono propio de app.css); el giroscopio conserva su brújula.
     * @returns {Array<{ nombre: string, icono: string, estado: string, detalle: string, ok: boolean }>}
     */
    function obtenerResumen() {
        const disp = d => (d === true ? 'Disponible' : d === false ? 'No disponible' : 'Desconocido');
        return [
            {
                nombre: 'Giroscopio',
                icono: '🧭',
                ok: estado.giroscopio.disponible === true,
                estado: disp(estado.giroscopio.disponible),
                detalle: estado.giroscopio.detalle,
            },
            {
                nombre: 'Acelerómetro',
                icono: '<span class="ico ico--sensores" aria-hidden="true"></span>',
                ok: estado.acelerometro.disponible === true,
                estado: disp(estado.acelerometro.disponible),
                detalle: estado.acelerometro.detalle,
            },
            {
                nombre: 'Cámara',
                icono: '<span class="ico ico--camara" aria-hidden="true"></span>',
                ok: estado.camara.disponible === true,
                estado: disp(estado.camara.disponible),
                detalle: estado.camara.disponible
                    ? (estado.camara.resolucion ? `Resolución: ${estado.camara.resolucion}` : 'Disponible')
                    : (estado.camara.error || 'No detectada'),
            },
        ];
    }

    return {
        diagnosticar,
        obtenerResumen,
    };
})();
