/**
 * Módulo de Control de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Cabina de vuelo táctil. Integra:
 *  - DronAdaptadores  (dron-adaptadores.js)
 *  - DronJoystick     (dron-joystick.js)
 *  - DronGiroscopio   (dron-giroscopio.js)
 *  - DronSeguimiento  (dron-seguimiento.js)  [EXPERIMENTAL]
 *  - ConfigDron       (config-dron.js)
 *
 * Reglas de seguridad:
 *  - Giroscopio DESACTIVADO al iniciar cada sesión.
 *  - Seguimiento DESACTIVADO al iniciar cada sesión.
 *  - Botón de EMERGENCIA siempre visible durante el vuelo.
 *  - Stop automático si se pierde la conexión con el dron por más de 2 s.
 *  - Confirmación explícita antes de despegar.
 *
 * Depende de: api.js, auth.js, dron-adaptadores.js, dron-joystick.js,
 *             dron-giroscopio.js, dron-seguimiento.js, config-dron.js
 */

// eslint-disable-next-line no-unused-vars
const Dron = (() => {
    'use strict';

    // ----------------------------------------------------------------
    // Estado interno
    // ----------------------------------------------------------------

    let _adaptador     = null;
    let _joystickIzq   = null;
    let _joystickDer   = null;
    let _giroscopio    = null;
    let _seguimiento   = null;

    let _modoGiro      = false; // Giroscopio activo (OFF por defecto)
    let _modoSeguimiento = false; // Seguimiento activo (OFF por defecto)

    let _watchdogId    = null;   // setInterval del watchdog de conexión
    let _ultimaRespuesta = 0;    // timestamp de la última telemetría recibida

    let _contenedor    = null;   // HTMLElement de la página
    let _telemetriaDiv = null;   // Panel de telemetría

    // ----------------------------------------------------------------
    // Inicialización de la página
    // ----------------------------------------------------------------

    /**
     * Punto de entrada: renderiza la cabina de vuelo.
     * Llamado por app.js al navegar a #/dron.
     * @param {HTMLElement} contenedor
     */
    async function inicializar(contenedor) {
        if (!contenedor) return;
        _contenedor = contenedor;

        // Destruir instancias anteriores si las hubiera
        _limpiarInstancias();

        // Renderizar el esqueleto de la cabina
        contenedor.innerHTML = _plantillaCabina();
        _telemetriaDiv = contenedor.querySelector('#panel-telemetria');

        // Cargar el perfil activo desde caché o API
        const perfilId = ConfigDron.perfilActivoId();
        if (!perfilId) {
            _mostrarSinPerfil(contenedor);
            return;
        }

        const perfil = await ConfigDron.cargarPerfil(perfilId);
        if (!perfil) {
            _mostrarSinPerfil(contenedor);
            return;
        }

        // Mostrar info del perfil
        const nombreSpan = contenedor.querySelector('#nombre-perfil-activo');
        if (nombreSpan) nombreSpan.textContent = perfil.nombre;

        // Crear el adaptador según el perfil
        try {
            _adaptador = DronAdaptadores.crearAdaptador(perfil);
        } catch (err) {
            _mostrarError(contenedor, `Error al crear el adaptador: ${err.message}`);
            return;
        }

        // Registrar oyente de telemetría
        _adaptador.agregarOyenteTelemetria(_actualizarPanelTelemetria.bind(null));

        // Instanciar joysticks (desactivados hasta conectar)
        _inicializarJoysticks(contenedor);

        // Instanciar giroscopio (DESACTIVADO por defecto)
        _giroscopio = new DronGiroscopio({
            onChange: _onGiroscopioCambio,
        });
        _giroscopio.restaurarConfiguracion();

        // Agregar eventos a los botones de la cabina
        _agregarEventosCabina(contenedor);

        // Intentar conectar automáticamente
        _actualizarEstadoUI('conectando');
        await _conectar();
    }

    // ----------------------------------------------------------------
    // Conexión al dron
    // ----------------------------------------------------------------

    async function _conectar() {
        if (!_adaptador) return;
        try {
            await _adaptador.conectar();
            _actualizarEstadoUI('conectado');
            _iniciarWatchdog();
        } catch (err) {
            console.warn('[Dron] No se pudo conectar:', err.message);
            _actualizarEstadoUI('desconectado');
        }
    }

    async function _desconectar() {
        _detenerWatchdog();
        if (!_adaptador) return;
        try {
            if (_adaptador.enVuelo) await _adaptador.aterrizar();
            await _adaptador.desconectar();
        } catch (_) { /* ignorar errores al desconectar */ }
        _actualizarEstadoUI('desconectado');
    }

    // ----------------------------------------------------------------
    // Watchdog de conexión
    // ----------------------------------------------------------------

    function _iniciarWatchdog() {
        _ultimaRespuesta = Date.now();
        _detenerWatchdog();
        _watchdogId = setInterval(() => {
            if (!_adaptador || !_adaptador.conectado) return;
            const ahora = Date.now();
            // Si no hubo telemetría en los últimos 2 segundos → emergencia
            if (ahora - _ultimaRespuesta > 2000 && _adaptador.enVuelo) {
                console.warn('[Dron] Watchdog: sin telemetría por 2 s → emergencia');
                _emergencia('Pérdida de conexión con el dron');
            }
        }, 500);
    }

    function _detenerWatchdog() {
        if (_watchdogId !== null) {
            clearInterval(_watchdogId);
            _watchdogId = null;
        }
    }

    // ----------------------------------------------------------------
    // Eventos de la cabina
    // ----------------------------------------------------------------

    function _agregarEventosCabina(contenedor) {
        // Despegar
        contenedor.querySelector('#btn-despegar')
            ?.addEventListener('click', _confirmarDespegue);

        // Aterrizar
        contenedor.querySelector('#btn-aterrizar')
            ?.addEventListener('click', () => _aterrizar());

        // EMERGENCIA
        contenedor.querySelector('#btn-emergencia')
            ?.addEventListener('click', () => _emergencia('Parada de emergencia manual'));

        // Giroscopio toggle
        contenedor.querySelector('#btn-toggle-giro')
            ?.addEventListener('click', _toggleGiroscopio);

        // Seguimiento toggle
        contenedor.querySelector('#btn-toggle-seguimiento')
            ?.addEventListener('click', _toggleSeguimiento);

        // Reconectar
        contenedor.querySelector('#btn-reconectar')
            ?.addEventListener('click', async () => {
                _actualizarEstadoUI('conectando');
                await _conectar();
            });

        // Navegar a Config de Dron
        contenedor.querySelector('#btn-ir-config-dron')
            ?.addEventListener('click', () => { window.location.hash = '#/config-dron'; });

        // Botón de calibrar giroscopio
        contenedor.querySelector('#btn-calibrar-giro')
            ?.addEventListener('click', () => {
                _giroscopio?.calibrar();
                App.mostrarToast('Giroscopio calibrado. Mantené el teléfono en posición de vuelo.', 'info');
            });
    }

    // ----------------------------------------------------------------
    // Acciones de vuelo
    // ----------------------------------------------------------------

    function _confirmarDespegue() {
        if (!_adaptador || !_adaptador.conectado) {
            App.mostrarToast('El dron no está conectado.', 'advertencia');
            return;
        }
        if (_adaptador.enVuelo) {
            App.mostrarToast('El dron ya está en vuelo.', 'info');
            return;
        }

        // Confirmación explícita antes de despegar
        if (!confirm(
            '¿Confirmar despegue?\n\n' +
            '• Asegurate de que el área esté despejada.\n' +
            '• El dron despegará al confirmar.\n' +
            '• Usá el botón EMERGENCIA si algo sale mal.'
        )) return;

        _adaptador.despegar()
            .then(() => {
                _actualizarEstadoUI('en_vuelo');
                App.mostrarToast('Despegue iniciado', 'exito');
                _iniciarWatchdog();
            })
            .catch(err => {
                App.mostrarToast('Error al despegar: ' + err.message, 'error');
            });
    }

    function _aterrizar() {
        if (!_adaptador || !_adaptador.enVuelo) {
            App.mostrarToast('El dron no está en vuelo.', 'info');
            return;
        }
        _adaptador.aterrizar()
            .then(() => {
                _actualizarEstadoUI('conectado');
                App.mostrarToast('Aterrizaje iniciado', 'exito');
            })
            .catch(err => {
                App.mostrarToast('Error al aterrizar: ' + err.message, 'error');
            });
    }

    function _emergencia(motivo = 'Emergencia') {
        if (!_adaptador) return;
        _detenerWatchdog();
        _modoGiro = false;
        _modoSeguimiento = false;
        _giroscopio?.desactivar();
        _seguimiento?.desactivar();

        _adaptador.detenerEmergencia()
            .then(() => {
                _actualizarEstadoUI('conectado');
                App.mostrarToast(`⛔ ${motivo} — dron detenido`, 'error');
                _actualizarBotonGiro();
                _actualizarBotonSeguimiento();
            })
            .catch(err => {
                App.mostrarToast('Error en emergencia: ' + err.message, 'error');
            });
    }

    // ----------------------------------------------------------------
    // Giroscopio
    // ----------------------------------------------------------------

    async function _toggleGiroscopio() {
        if (!_giroscopio) return;

        if (_modoGiro) {
            _modoGiro = false;
            _giroscopio.desactivar();
            _joystickDer?.centrar();
            App.mostrarToast('Giroscopio desactivado', 'info');
        } else {
            // Desactivar seguimiento si está activo (modos mutuamente excluyentes para el eje Roll/Pitch)
            if (_modoSeguimiento) await _toggleSeguimiento();

            const resultado = await _giroscopio.activar();
            if (resultado.ok) {
                _modoGiro = true;
                App.mostrarToast('Giroscopio activado — inclinate para controlar', 'exito');
            } else {
                let msg = 'No se pudo activar el giroscopio.';
                if (resultado.motivo === 'permiso_denegado') msg = 'Permiso de giroscopio denegado. Habilitalo desde los ajustes del navegador.';
                if (resultado.motivo === 'no_disponible') msg = 'Este dispositivo no tiene giroscopio.';
                App.mostrarToast(msg, 'advertencia');
            }
        }
        _actualizarBotonGiro();
    }

    function _onGiroscopioCambio({ pitch, roll }) {
        if (!_modoGiro || !_adaptador || !_adaptador.enVuelo) return;
        _adaptador.moverRC({ lr: roll, fb: pitch, ud: 0, yaw: 0 });
        // Reflejar en el joystick derecho visualmente
        if (_joystickDer) {
            _joystickDer._paloX = roll * _joystickDer._radio;
            _joystickDer._paloY = -pitch * _joystickDer._radio;
            _joystickDer._dibujar();
        }
    }

    function _actualizarBotonGiro() {
        const btn = _contenedor?.querySelector('#btn-toggle-giro');
        if (!btn) return;
        btn.textContent = _modoGiro ? '🧭 Giro: ON' : '🧭 Giro: OFF';
        btn.classList.toggle('btn--activo', _modoGiro);
    }

    // ----------------------------------------------------------------
    // Seguimiento (EXPERIMENTAL)
    // ----------------------------------------------------------------

    async function _toggleSeguimiento() {
        if (!_seguimiento) {
            App.mostrarToast('El módulo de seguimiento no está inicializado.', 'advertencia');
            return;
        }

        if (_modoSeguimiento) {
            _modoSeguimiento = false;
            _seguimiento.desactivar();
            App.mostrarToast('Seguimiento desactivado', 'info');
        } else {
            if (!_seguimiento.modeloCargado) {
                App.mostrarToast('Cargando modelo de seguimiento...', 'info');
                const res = await _seguimiento.inicializar();
                if (!res.ok) {
                    let msg = 'No se pudo cargar el modelo de seguimiento.';
                    if (res.error === 'tfjs_no_disponible') msg = 'TensorFlow.js no está disponible (requiere /vendor/tfjs/).';
                    if (res.error === 'cocossd_no_disponible') msg = 'Modelo COCO-SSD no disponible (requiere /vendor/coco-ssd/).';
                    App.mostrarToast(msg, 'advertencia');
                    return;
                }
            }

            // Giroscopio y seguimiento son mutuamente excluyentes
            if (_modoGiro) {
                _modoGiro = false;
                _giroscopio.desactivar();
                _actualizarBotonGiro();
            }

            _modoSeguimiento = true;
            _seguimiento.onOffset = _onSeguimientoOffset;
            _seguimiento.onPerdida = () => {
                // Al perder el objetivo, centrar joystick (vuelo estacionario)
                _adaptador?.moverRC({ lr: 0, fb: 0, ud: 0, yaw: 0 });
            };
            _seguimiento.activar('person');
            App.mostrarToast(
                '⚠ SEGUIMIENTO EXPERIMENTAL activado — supervisión humana requerida',
                'advertencia'
            );
        }
        _actualizarBotonSeguimiento();
    }

    function _onSeguimientoOffset({ dx, dy }) {
        if (!_modoSeguimiento || !_adaptador || !_adaptador.enVuelo) return;
        // dx → movimiento lateral (roll), dy → movimiento vertical (throttle)
        const sensibilidad = 0.5;
        _adaptador.moverRC({
            lr:  parseFloat((dx * sensibilidad).toFixed(3)),
            fb:  0,
            ud:  parseFloat((-dy * sensibilidad).toFixed(3)),
            yaw: 0,
        });
    }

    function _actualizarBotonSeguimiento() {
        const btn = _contenedor?.querySelector('#btn-toggle-seguimiento');
        if (!btn) return;
        btn.textContent = _modoSeguimiento ? '🎯 Seguimiento: ON' : '🎯 Seguimiento: OFF';
        btn.classList.toggle('btn--activo', _modoSeguimiento);
    }

    // ----------------------------------------------------------------
    // Joysticks
    // ----------------------------------------------------------------

    function _inicializarJoysticks(contenedor) {
        const cIzq = contenedor.querySelector('#joystick-izquierdo');
        const cDer = contenedor.querySelector('#joystick-derecho');
        if (!cIzq || !cDer) return;

        const tamano = Math.min(window.innerWidth * 0.38, 180);

        // Joystick izquierdo: Throttle (Y) / Yaw (X)
        _joystickIzq = new DronJoystick({
            contenedor:   cIzq,
            etiqueta:     'THR / YAW',
            throttleFijo: false,
            tamano:       tamano,
        });

        // Joystick derecho: Pitch (Y) / Roll (X)
        _joystickDer = new DronJoystick({
            contenedor: cDer,
            etiqueta:   'PITCH / ROLL',
            tamano:     tamano,
        });

        // Callbacks de movimiento
        _joystickIzq.onChange = ({ x, y }) => {
            if (_modoGiro) return; // En modo giro el joystick derecho es visual, izq sigue activo
            _adaptador?.moverRC({ lr: 0, fb: 0, ud: y, yaw: x });
        };

        _joystickDer.onChange = ({ x, y }) => {
            if (_modoGiro || _modoSeguimiento) return; // No interferir en esos modos
            _adaptador?.moverRC({ lr: x, fb: y, ud: 0, yaw: 0 });
        };

        _joystickIzq.onRelease = () => { _adaptador?.moverRC({ lr: 0, fb: 0, ud: 0, yaw: 0 }); };
        _joystickDer.onRelease = () => { _adaptador?.moverRC({ lr: 0, fb: 0, ud: 0, yaw: 0 }); };
    }

    // ----------------------------------------------------------------
    // Telemetría
    // ----------------------------------------------------------------

    function _actualizarPanelTelemetria(tel) {
        _ultimaRespuesta = Date.now();
        if (!_telemetriaDiv) return;

        _telemetriaDiv.querySelector('#tel-bateria-valor')
            && (_telemetriaDiv.querySelector('#tel-bateria-valor').textContent = `${tel.bateria ?? '--'}%`);
        _telemetriaDiv.querySelector('#tel-altura-valor')
            && (_telemetriaDiv.querySelector('#tel-altura-valor').textContent = `${tel.altura ?? '--'} cm`);
        _telemetriaDiv.querySelector('#tel-velocidad-valor')
            && (_telemetriaDiv.querySelector('#tel-velocidad-valor').textContent = `${tel.velocidad ?? '--'} cm/s`);
        _telemetriaDiv.querySelector('#tel-rssi-valor')
            && (_telemetriaDiv.querySelector('#tel-rssi-valor').textContent = `${tel.rssi ?? '--'} dBm`);

        // Advertencia de batería baja
        const bateria = parseInt(tel.bateria ?? 100, 10);
        const iconoBat = _telemetriaDiv.querySelector('#tel-bateria-icono');
        if (iconoBat) {
            iconoBat.textContent = bateria <= 10 ? '🔴' : bateria <= 25 ? '🟡' : '🟢';
        }
        if (bateria <= 10 && _adaptador?.enVuelo) {
            App.mostrarToast(`⚠ Batería crítica: ${bateria}% — considerá aterrizar`, 'advertencia');
        }
    }

    // ----------------------------------------------------------------
    // Estado de la UI
    // ----------------------------------------------------------------

    function _actualizarEstadoUI(estado) {
        if (!_contenedor) return;
        const btnDespegar   = _contenedor.querySelector('#btn-despegar');
        const btnAterrizar  = _contenedor.querySelector('#btn-aterrizar');
        const btnEmergencia = _contenedor.querySelector('#btn-emergencia');
        const btnReconectar = _contenedor.querySelector('#btn-reconectar');
        const estadoSpan    = _contenedor.querySelector('#estado-conexion');

        const estadoTextos = {
            conectando:    '🟡 Conectando...',
            conectado:     '🟢 Conectado',
            en_vuelo:      '🔵 En vuelo',
            desconectado:  '🔴 Desconectado',
        };

        if (estadoSpan) estadoSpan.textContent = estadoTextos[estado] || estado;

        const conectado  = estado === 'conectado' || estado === 'en_vuelo';
        const enVuelo    = estado === 'en_vuelo';

        if (btnDespegar)   btnDespegar.disabled   = !conectado || enVuelo;
        if (btnAterrizar)  btnAterrizar.disabled  = !enVuelo;
        if (btnEmergencia) btnEmergencia.disabled  = !conectado && !enVuelo;
        if (btnReconectar) btnReconectar.style.display = conectado ? 'none' : 'inline-flex';
    }

    // ----------------------------------------------------------------
    // Sin perfil configurado
    // ----------------------------------------------------------------

    function _mostrarSinPerfil(contenedor) {
        contenedor.innerHTML = `
        <div class="dron-pagina">
            <h2 class="seccion-titulo mb-md">🚁 Control del Dron</h2>
            <div class="tarjeta tarjeta--acento texto-centro" style="padding: var(--espacio-2xl) var(--espacio-lg);">
                <div style="font-size:3rem; margin-bottom: var(--espacio-md);">⚙️</div>
                <h3 style="font-size: var(--tamano-xl); font-weight:700; margin-bottom: var(--espacio-sm);">
                    No hay perfil de dron seleccionado
                </h3>
                <p class="texto-sm texto-secundario mb-lg" style="max-width:32rem; margin:0 auto var(--espacio-lg);">
                    Antes de volar, necesitás seleccionar (o crear) un perfil de dron en la sección de Configuración.
                </p>
                <button id="btn-ir-config-dron" class="btn btn--primario">🔧 Ir a Configuración de Dron</button>
            </div>
        </div>`;
        contenedor.querySelector('#btn-ir-config-dron')
            ?.addEventListener('click', () => { window.location.hash = '#/config-dron'; });
    }

    function _mostrarError(contenedor, mensaje) {
        contenedor.innerHTML = `
        <div class="dron-pagina">
            <h2 class="seccion-titulo mb-md">🚁 Control del Dron</h2>
            <div class="tarjeta tarjeta--acento texto-centro" style="padding: var(--espacio-2xl) var(--espacio-lg);">
                <div style="font-size:3rem; margin-bottom: var(--espacio-md);">⚠️</div>
                <h3 style="font-size: var(--tamano-xl); font-weight:700; margin-bottom: var(--espacio-sm);">Error</h3>
                <p class="texto-sm texto-secundario mb-lg">${mensaje}</p>
                <a href="#/config-dron" class="btn btn--primario">🔧 Ir a Configuración de Dron</a>
            </div>
        </div>`;
    }

    // ----------------------------------------------------------------
    // Plantilla HTML de la cabina
    // ----------------------------------------------------------------

    function _plantillaCabina() {
        return `
        <div class="dron-pagina">
            <!-- Encabezado -->
            <div class="flex justify-between items-center mb-sm flex-wrap gap-sm">
                <div>
                    <h2 class="seccion-titulo" style="margin-bottom: var(--espacio-xs);">🚁 Control del Dron</h2>
                    <p class="texto-sm texto-secundario">
                        Perfil: <strong id="nombre-perfil-activo">—</strong>
                        &nbsp;·&nbsp;
                        <span id="estado-conexion">🟡 Conectando...</span>
                    </p>
                </div>
                <div class="flex gap-sm flex-wrap">
                    <button id="btn-reconectar" class="btn btn--secundario" style="display:none;">🔄 Reconectar</button>
                    <button id="btn-ir-config-dron" class="btn btn--secundario">🔧 Config</button>
                </div>
            </div>

            <!-- EMERGENCIA — siempre visible en vuelo -->
            <button id="btn-emergencia" class="btn btn--peligro w-full mb-md" disabled
                style="font-size: var(--tamano-lg); padding: var(--espacio-sm); letter-spacing: 0.05em;">
                ⛔ PARADA DE EMERGENCIA
            </button>

            <!-- Panel de telemetría -->
            <div id="panel-telemetria" class="tarjeta mb-md">
                <h3 class="texto-sm font-semibold texto-secundario mb-sm">📊 Telemetría</h3>
                <div class="grilla-telemetria" style="display:grid; grid-template-columns: repeat(4, 1fr); gap: var(--espacio-sm); text-align:center;">
                    <div>
                        <div class="texto-xl font-bold" style="color: var(--color-primario);">
                            <span id="tel-bateria-icono">🟢</span>
                            <span id="tel-bateria-valor">--%</span>
                        </div>
                        <div class="texto-xs texto-secundario">Batería</div>
                    </div>
                    <div>
                        <div class="texto-xl font-bold" id="tel-altura-valor" style="color: var(--color-primario);">-- cm</div>
                        <div class="texto-xs texto-secundario">Altura</div>
                    </div>
                    <div>
                        <div class="texto-xl font-bold" id="tel-velocidad-valor" style="color: var(--color-primario);">-- cm/s</div>
                        <div class="texto-xs texto-secundario">Velocidad</div>
                    </div>
                    <div>
                        <div class="texto-xl font-bold" id="tel-rssi-valor" style="color: var(--color-primario);">-- dBm</div>
                        <div class="texto-xs texto-secundario">RSSI</div>
                    </div>
                </div>
            </div>

            <!-- Área de video -->
            <div class="tarjeta mb-md" style="position:relative; background:#000; border-radius: var(--radio-lg); overflow:hidden; min-height:180px;">
                <video id="video-dron" autoplay playsinline muted
                    style="width:100%; max-height:260px; display:block; object-fit:cover; background:#000;">
                </video>
                <canvas id="canvas-seguimiento"
                    style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
                </canvas>
                <div id="overlay-video-off"
                    style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:1.75rem;">
                    📷 Sin señal de video
                </div>
            </div>

            <!-- Cabina de joysticks -->
            <div class="tarjeta mb-md">
                <div class="flex justify-around items-center gap-sm flex-wrap" style="padding: var(--espacio-sm) 0;">
                    <!-- Joystick izquierdo: Throttle / Yaw -->
                    <div style="display:flex; flex-direction:column; align-items:center; gap: var(--espacio-xs);">
                        <span class="texto-xs texto-secundario">↑ THR &nbsp; ← YAW →</span>
                        <div id="joystick-izquierdo"></div>
                    </div>

                    <!-- Botones centrales -->
                    <div class="flex flex-column gap-sm items-center" style="min-width:110px;">
                        <button id="btn-despegar" class="btn btn--primario w-full" disabled>🛫 Despegar</button>
                        <button id="btn-aterrizar" class="btn btn--secundario w-full" disabled>🛬 Aterrizar</button>
                        <button id="btn-toggle-giro" class="btn btn--secundario w-full">🧭 Giro: OFF</button>
                        <button id="btn-calibrar-giro" class="btn btn--secundario w-full texto-xs">🎯 Calibrar giro</button>
                        <button id="btn-toggle-seguimiento" class="btn btn--secundario w-full texto-xs">
                            🎯 Seguimiento: OFF
                        </button>
                    </div>

                    <!-- Joystick derecho: Pitch / Roll -->
                    <div style="display:flex; flex-direction:column; align-items:center; gap: var(--espacio-xs);">
                        <span class="texto-xs texto-secundario">↑ PITCH &nbsp; ← ROLL →</span>
                        <div id="joystick-derecho"></div>
                    </div>
                </div>
            </div>

            <!-- Nota experimental -->
            <p class="texto-xs texto-secundario texto-centro" style="opacity:0.6; margin-top: var(--espacio-sm);">
                ⚠ El seguimiento visual es EXPERIMENTAL — requiere validación con el dron real.
                Supervisión humana permanente obligatoria durante el vuelo.
            </p>
        </div>`;
    }

    // ----------------------------------------------------------------
    // Limpieza
    // ----------------------------------------------------------------

    function _limpiarInstancias() {
        _detenerWatchdog();
        _modoGiro = false;
        _modoSeguimiento = false;

        if (_giroscopio) { _giroscopio.desactivar(); _giroscopio = null; }
        if (_seguimiento) { _seguimiento.desactivar(); _seguimiento = null; }
        if (_joystickIzq) { _joystickIzq.destruir(); _joystickIzq = null; }
        if (_joystickDer) { _joystickDer.destruir(); _joystickDer = null; }

        if (_adaptador) {
            try { _adaptador.desconectar(); } catch (_) {}
            _adaptador = null;
        }
    }

    // ----------------------------------------------------------------
    // API pública
    // ----------------------------------------------------------------
    return {
        inicializar,
        destruir: _limpiarInstancias,
    };
})();
