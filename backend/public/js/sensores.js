/**
 * Módulo Diagnóstico de Sensores — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Verifica la disponibilidad y funcionamiento de los sensores del dispositivo
 * necesarios para la operación del dron:
 *  - DeviceOrientation (giroscopio / acelerómetro)
 *  - Geolocalización GPS
 *  - Cámara trasera
 *  - Vibración (Vibration API)
 *  - Conectividad (Network Information API)
 *  - Pantalla de alta densidad (DPR)
 *
 * Todos los diagnósticos son no bloqueantes y se ejecutan en paralelo.
 */

// eslint-disable-next-line no-unused-vars
const Sensores = (() => {
    'use strict';

    // ----------------------------------------------------------------
    // Resultados de diagnóstico
    // ----------------------------------------------------------------

    /**
     * Estado interno de los sensores. Se actualiza en cada llamada a diagnosticar().
     */
    const estado = {
        giroscopio:    { disponible: null, permiso: null, error: null },
        gps:           { disponible: null, permiso: null, precision: null, error: null },
        camara:        { disponible: null, resolucion: null, error: null },
        vibracion:     { disponible: null },
        red:           { disponible: null, tipo: null, velocidadBajaEstimada: null },
        pantalla:      { dpr: null, resolucion: null },
    };

    /** @type {Function|null} */
    let _onProgreso = null;

    // ----------------------------------------------------------------
    // Diagnóstico individual de cada sensor
    // ----------------------------------------------------------------

    async function diagnosticarGiroscopio() {
        if (typeof DeviceOrientationEvent === 'undefined') {
            estado.giroscopio = { disponible: false, permiso: null, error: 'API no disponible' };
            return;
        }

        estado.giroscopio.disponible = true;

        // iOS 13+ requiere permiso explícito
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                // No llamamos requestPermission acá para no interrumpir el flujo sin gesto de usuario.
                // Simplemente marcamos que el permiso es necesario y desconocido.
                estado.giroscopio.permiso = 'requiere_gesto_usuario';
            } catch (err) {
                estado.giroscopio.permiso = 'error';
                estado.giroscopio.error   = err.message;
            }
        } else {
            // Android / Desktop: no requiere permiso explícito
            estado.giroscopio.permiso = 'automatico';
        }
    }

    async function diagnosticarGPS() {
        if (!navigator.geolocation) {
            estado.gps = { disponible: false, permiso: null, precision: null, error: 'API no disponible' };
            return;
        }
        estado.gps.disponible = true;

        // Verificar permiso sin disparar el diálogo (si navigator.permissions está disponible)
        if (navigator.permissions) {
            try {
                const perm = await navigator.permissions.query({ name: 'geolocation' });
                estado.gps.permiso = perm.state; // 'granted' | 'denied' | 'prompt'
            } catch (_) {
                estado.gps.permiso = 'desconocido';
            }
        } else {
            estado.gps.permiso = 'desconocido';
        }

        // Si tiene permiso, obtener una lectura para medir precisión
        if (estado.gps.permiso === 'granted') {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        timeout: 5000,
                        maximumAge: 10000,
                        enableHighAccuracy: true,
                    });
                });
                estado.gps.precision = Math.round(pos.coords.accuracy);
            } catch (err) {
                estado.gps.error = err.message;
            }
        }
    }

    async function diagnosticarCamara() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            estado.camara = { disponible: false, resolucion: null, error: 'API no disponible' };
            return;
        }

        try {
            const dispositivos = await navigator.mediaDevices.enumerateDevices();
            const camTrasera = dispositivos.some(d =>
                d.kind === 'videoinput' && (d.label.toLowerCase().includes('back') ||
                d.label.toLowerCase().includes('trasera') ||
                d.label.toLowerCase().includes('rear') ||
                d.label === '') // En Android, sin permiso no hay label pero la cámara existe
            );
            const hayVideo = dispositivos.some(d => d.kind === 'videoinput');
            estado.camara.disponible = hayVideo;

            // Intentar obtener la resolución máxima sin abrir un stream real
            // (esto sólo funciona si ya hay permiso de cámara)
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
                        stream.getTracks().forEach(t => t.stop());
                    }
                } catch (_) {
                    estado.camara.resolucion = 'sin permiso';
                }
            }
        } catch (err) {
            estado.camara = { disponible: false, resolucion: null, error: err.message };
        }
    }

    function diagnosticarVibracion() {
        estado.vibracion.disponible = 'vibrate' in navigator;
    }

    function diagnosticarRed() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn) {
            estado.red = { disponible: false, tipo: null, velocidadBajaEstimada: null };
            return;
        }
        estado.red.disponible = true;
        estado.red.tipo       = conn.effectiveType || conn.type || 'desconocido';
        // 'slow-2g' y '2g' se consideran lentos para streaming de video
        estado.red.velocidadBajaEstimada = ['slow-2g', '2g'].includes(conn.effectiveType);
    }

    function diagnosticarPantalla() {
        estado.pantalla.dpr        = window.devicePixelRatio || 1;
        estado.pantalla.resolucion = `${window.screen.width}×${window.screen.height}`;
    }

    // ----------------------------------------------------------------
    // API pública
    // ----------------------------------------------------------------

    /**
     * Ejecuta todos los diagnósticos en paralelo y devuelve el estado completo.
     * @param {Function} [onProgreso] - Callback(nombre, resultado) llamado a medida que cada sensor termina.
     * @returns {Promise<Object>} Copia del estado completo.
     */
    async function diagnosticar(onProgreso = null) {
        _onProgreso = onProgreso;

        const tareas = [
            diagnosticarGiroscopio().then(() => _notificar('giroscopio', estado.giroscopio)),
            diagnosticarGPS().then(()        => _notificar('gps',        estado.gps)),
            diagnosticarCamara().then(()     => _notificar('camara',     estado.camara)),
        ];

        // Síncronos, no hay necesidad de Promise
        diagnosticarVibracion(); _notificar('vibracion', estado.vibracion);
        diagnosticarRed();       _notificar('red',       estado.red);
        diagnosticarPantalla();  _notificar('pantalla',  estado.pantalla);

        await Promise.allSettled(tareas);
        return obtenerEstado();
    }

    function _notificar(nombre, resultado) {
        if (typeof _onProgreso === 'function') {
            _onProgreso(nombre, resultado);
        }
    }

    /**
     * Devuelve una copia del estado de todos los sensores.
     * @returns {Object}
     */
    function obtenerEstado() {
        return JSON.parse(JSON.stringify(estado));
    }

    /**
     * Devuelve un resumen legible para mostrar en la UI.
     * @returns {Array<{ nombre: string, icono: string, estado: string, detalle: string, ok: boolean }>}
     */
    function obtenerResumen() {
        return [
            {
                nombre:  'Giroscopio / Acelerómetro',
                icono:   '🧭',
                ok:      estado.giroscopio.disponible === true,
                estado:  _textoDisponibilidad(estado.giroscopio.disponible),
                detalle: estado.giroscopio.disponible
                    ? `Permiso: ${_textoPermiso(estado.giroscopio.permiso)}`
                    : (estado.giroscopio.error || 'No soportado'),
            },
            {
                nombre:  'GPS',
                icono:   '📍',
                ok:      estado.gps.disponible === true,
                estado:  _textoDisponibilidad(estado.gps.disponible),
                detalle: estado.gps.disponible
                    ? `Permiso: ${_textoPermiso(estado.gps.permiso)}` +
                      (estado.gps.precision !== null ? `, precisión: ±${estado.gps.precision} m` : '')
                    : (estado.gps.error || 'No soportado'),
            },
            {
                nombre:  'Cámara',
                icono:   '📷',
                ok:      estado.camara.disponible === true,
                estado:  _textoDisponibilidad(estado.camara.disponible),
                detalle: estado.camara.disponible
                    ? (estado.camara.resolucion ? `Resolución: ${estado.camara.resolucion}` : 'Disponible')
                    : (estado.camara.error || 'No detectada'),
            },
            {
                nombre:  'Vibración',
                icono:   '📳',
                ok:      estado.vibracion.disponible === true,
                estado:  _textoDisponibilidad(estado.vibracion.disponible),
                detalle: estado.vibracion.disponible ? 'Vibration API disponible' : 'No soportada',
            },
            {
                nombre:  'Conexión de Red',
                icono:   '📶',
                ok:      estado.red.disponible !== false,
                estado:  estado.red.disponible ? 'Disponible' : 'Desconocida',
                detalle: estado.red.tipo
                    ? `Tipo: ${estado.red.tipo}` +
                      (estado.red.velocidadBajaEstimada ? ' ⚠ Velocidad baja' : '')
                    : 'Network Information API no disponible',
            },
            {
                nombre:  'Pantalla',
                icono:   '🖥️',
                ok:      true,
                estado:  'Detectada',
                detalle: `${estado.pantalla.resolucion || '?'}, DPR: ${estado.pantalla.dpr || '?'}`,
            },
        ];
    }

    function _textoDisponibilidad(disponible) {
        if (disponible === true)  return 'Disponible';
        if (disponible === false) return 'No disponible';
        return 'Desconocido';
    }

    function _textoPermiso(permiso) {
        const mapa = {
            granted:                'Otorgado',
            denied:                 'Denegado',
            prompt:                 'Pendiente',
            automatico:             'Automático',
            requiere_gesto_usuario: 'Requiere acción',
            desconocido:            'Desconocido',
            error:                  'Error',
        };
        return mapa[permiso] || (permiso || 'Desconocido');
    }

    return {
        diagnosticar,
        obtenerEstado,
        obtenerResumen,
    };
})();
