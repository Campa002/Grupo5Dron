/**
 * Módulo de Control de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Cabina de vuelo táctil. Integra:
 *  - DronAdaptadores  (dron-adaptadores.js)
 *  - DronBotonesMovimiento y DronJoystick (dron-joystick.js): botones de mantener apretado
 *    (mando por defecto) y joysticks (solo en el modo técnico)
 *  - DronGiroscopio   (dron-giroscopio.js)
 *  - DronSeguimiento  (dron-seguimiento.js)
 *  - DronVideoDecoder (dron-video.js)
 *  - ConfigDron       (config-dron.js)
 *
 * Reglas de seguridad:
 *  - Giroscopio y seguimiento DESACTIVADOS al iniciar; al apagar el giroscopio, sus ejes vuelven a cero.
 *  - Seguimiento: en el piso solo marca el objetivo (no manda nada). En vuelo, "Seguir persona" o "Seguir objeto"
 *    mueven el dron con límites bajos (DronSeguimiento.LIMITES_CONTROL_REAL), nunca roll; sin objetivo, rc 0 0 0 0.
 *    Solo manda con las condiciones cumplidas (DronSeguimiento.decidirSeguimiento). Se detiene con Detener, un botón
 *    de movimiento, la inclinación, Despegar, Aterrizar, EMERGENCIA, el failsafe, si dejan de cumplirse las
 *    condiciones, al pasar a segundo plano o al salir de la cabina.
 *  - Botón de EMERGENCIA fijo y siempre visible (vertical y horizontal).
 *  - Confirmación explícita antes de despegar; no se despega si no llega telemetría.
 *  - Failsafe: sin telemetría en vuelo por más del tiempo configurado → freno (rc 0 0 0 0) y aterrizaje.
 *    Si el aterrizaje no se confirma, se reintenta una vez y se avisa (no se cortan motores solos).
 *  - Botones de mantener apretado: al soltar, salir del botón, perder el toque o pasar a segundo plano,
 *    su eje vuelve a 0 (frena). Arrancan en velocidad Lenta y solo se pueden apretar en vuelo.
 *  - Salir de la cabina en vuelo aterriza el dron (app.js pide confirmación antes).
 */

// eslint-disable-next-line no-unused-vars
const Dron = (() => {
    'use strict';

    const FAILSAFE_POR_DEFECTO_MS = 3500;
    const TEXTO_EN_EL_PISO = 'En el piso solo marca el objetivo. Despegá y tocá Seguir para que el dron lo siga.';
    // ----------------------------------------------------------------
    // Estado interno
    // ----------------------------------------------------------------
    let _adaptador = null;
    let _mando = null;             // botones de mantener apretado (DronBotonesMovimiento)
    let _usarJoysticks = false;    // modo técnico: joysticks en lugar de los botones
    let _joystickIzq = null;
    let _joystickDer = null;
    let _giroscopio = null;
    let _seguimiento = null;
    let _panelSeguimiento = null;
    let _pantallaSeg = null;       // tarjetas estilo RAC (dron-seguimiento-ui.js)
    let _video = null;

    let _modoGiro = false;
    let _modoSeguimiento = false;
    let _controlReal = false;      // el seguimiento ya está moviendo el dron (en vuelo, con las condiciones)
    let _onVisibilidad = null;
    let _accionVuelo = false;      // despegue o aterrizaje en curso
    let _estadoUI = 'desconectado';

    let _watchdogId = null;
    let _failsafeActivado = false;
    let _esperandoVueltaTelemetria = false; // failsafe sin aterrizaje confirmado: reintentar si vuelve el enlace
    let _nivelAvisoBateria = 0;    // 0 = sin aviso, 1 = ≤25 %, 2 = ≤10 %

    let _contenedor = null;
    let _generacion = 0;           // cambia al salir de la cabina: corta inicializaciones a medias
    let _onResize = null;
    let _timerResize = null;
    let _tamanoJoystick = 0;
    let _avisoManiobraTs = 0;      // para no repetir el aviso de "esperá a que termine el movimiento"
    let _objetosGuardados = [];    // "Mis objetos" (para "¿Qué seguir?")

    // ----------------------------------------------------------------
    // Inicialización
    // ----------------------------------------------------------------

    /**
     * Punto de entrada: renderiza la cabina. Lo llama app.js al navegar a #/dron.
     * @param {HTMLElement} contenedor
     */
    async function inicializar(contenedor) {
        if (!contenedor) return;
        const gen = ++_generacion;
        await _limpiarInstancias();
        if (gen !== _generacion) return;
        _contenedor = contenedor;

        const perfil = await ConfigDron.cargarPerfil(ConfigDron.perfilActivoId());
        if (gen !== _generacion) return;
        try {
            _adaptador = DronAdaptadores.crearAdaptador(perfil);
        } catch (err) {
            _mostrarError(contenedor, App.modoTecnico() ? `No se pudo abrir la cabina: ${err.message}` : 'No se pudo abrir la cabina.');
            return;
        }

        document.body.classList.add('en-cabina');
        contenedor.innerHTML = _plantillaCabina();
        _q('#nombre-perfil-activo').textContent = perfil.nombre || '—';

        _adaptador.agregarOyenteTelemetria(_actualizarPanelTelemetria);
        // Avisos de diagnóstico (por ejemplo, despegue confirmado por la telemetría): solo en el modo técnico
        _adaptador.onAvisoTecnico = (texto) => { if (App.modoTecnico()) App.mostrarToast(texto, 'advertencia', 8000); };

        _inicializarMando();
        _onResize = () => {
            clearTimeout(_timerResize);
            _timerResize = setTimeout(() => {
                _reservarLugarEmergencia();
                if (_usarJoysticks && Math.abs(_calcularTamanoJoystick() - _tamanoJoystick) > 8) _inicializarJoysticks();
            }, 250);
        };
        window.addEventListener('resize', _onResize);

        _giroscopio = new DronGiroscopio({ onChange: _onGiroscopioCambio });
        _giroscopio.onFuente = _onFuenteInclinacion;
        _giroscopio.onCambioOrientacion = _onCambioOrientacionInclinacion;

        if (typeof DronSeguimiento !== 'undefined') {
            _seguimiento = new DronSeguimiento({
                videoEl: _q('#canvas-video'),
                canvasDebug: _q('#canvas-seguimiento'),
                miniatura: _q('#cab-miniatura'),
                // Para el registro por cuadro y las condiciones del control real
                obtenerContexto: () => ({
                    enVuelo: !!_adaptador?.enVuelo,
                    alturaCm: _adaptador?.telemetria.altura ?? null,
                    bateria: _adaptador?.telemetria.bateria ?? null,
                    telemetriaOk: _hayTelemetria(),
                }),
            });
            _pantallaSeg = new DronPantallaSeguimiento.Pantalla({
                contenedor: _q('#cab-seguimiento'),
                cajaVideo: _q('.cab-video'),
                chipFps: _q('#cab-chip-fps'),
                fuente: 'dron',
                fuenteTamano: () => { const v = _q('#canvas-video'); return [v?.width || 0, v?.height || 0]; },
                onIniciar: _seguirObjetivo,
                onDetener: () => { _apagarSeguimiento(); App.mostrarToast('Seguimiento detenido.', 'info'); },
                onTocar: (x, y) => _seguimiento?.elegirEnPunto(x, y) || { ok: false },
                onDiagnosticar: () => _seguimiento.diagnosticar(_q('#cab-foto-prueba')),
            });
        }
        // Al pasar a segundo plano se detiene el seguimiento (con freno)
        _onVisibilidad = () => { if (document.hidden) _detenerSeguimiento('La app pasó a segundo plano'); };
        document.addEventListener('visibilitychange', _onVisibilidad);

        _agregarEventosCabina();
        _reservarLugarEmergencia();
        if (typeof DronObjetos !== 'undefined' && _pantallaSeg) {
            App.objetosGuardados().then(lista => {
                if (gen !== _generacion) return;
                _objetosGuardados = lista;
                _pantallaSeg?.setObjetos(lista);
            });
        }
        await _conectar();
    }

    function _q(sel) {
        return _contenedor ? _contenedor.querySelector(sel) : null;
    }

    // ----------------------------------------------------------------
    // Conexión y video
    // ----------------------------------------------------------------

    async function _conectar() {
        const a = _adaptador;
        if (!a) return;
        _actualizarEstadoUI('conectando');
        _textoVideo('Conectando...');
        try {
            await a.conectar();
        } catch (err) {
            if (a !== _adaptador) return;
            _actualizarEstadoUI('desconectado');
            _textoVideo(_textoError(err));
            if (App.modoTecnico()) App.mostrarToast(_textoError(err), 'error', 9000);
            return;
        }
        if (a !== _adaptador) { a.desconectar(); return; }
        _actualizarEstadoUI('conectado');
        _iniciarWatchdog();
        _iniciarVideo();
    }

    function _textoVideo(texto) {
        const overlay = _q('#overlay-video-off');
        if (!overlay) return;
        overlay.hidden = !texto;
        if (texto) overlay.textContent = texto;
    }

    async function _iniciarVideo() {
        const a = _adaptador;
        if (!a) return;
        if (!a.tieneVideo()) { _textoVideo(Plataforma.esApk ? 'Simulador: no tiene cámara' : Plataforma.AVISO_WEB); return; }
        if (typeof DronVideoDecoder === 'undefined') { _textoVideo('No se puede mostrar el video'); return; }

        _video = new DronVideoDecoder({
            canvasEl: _q('#canvas-video'),
            onFrameRendered: (n) => { if (n === 1) _textoVideo(''); },
        });
        if (!_video.soportaWebCodecs) { _textoVideo('Este celular no puede mostrar el video del dron'); return; }

        _textoVideo('Esperando el video del dron...');
        try {
            const ok = await a.iniciarVideo(d => _video?.procesarChunk(d?.data, { perdida: !!d?.perdida }));
            if (a === _adaptador && !ok && !_video?.frameCount) _textoVideo('El dron no prendió la cámara');
        } catch (err) {
            if (a === _adaptador) _textoVideo(App.modoTecnico() ? `No se pudo abrir el video: ${err.message}` : 'No se pudo abrir el video del dron');
        }
    }

    // ----------------------------------------------------------------
    // Watchdog de telemetría y failsafe
    // ----------------------------------------------------------------

    function _obtenerTimeoutFailsafe() {
        const val = parseInt(localStorage.getItem('grupo5dron_failsafe_timeout_ms'), 10);
        return (val >= 1000 && val <= 30000) ? val : FAILSAFE_POR_DEFECTO_MS;
    }

    function _hayTelemetria() {
        return !!_adaptador && Date.now() - _adaptador.ultimaTelemetriaTs <= _obtenerTimeoutFailsafe();
    }

    function _iniciarWatchdog() {
        _detenerWatchdog();
        _failsafeActivado = false;
        _watchdogId = setInterval(_revisarTelemetria, 500);
    }

    function _detenerWatchdog() {
        if (_watchdogId !== null) {
            clearInterval(_watchdogId);
            _watchdogId = null;
        }
    }

    function _revisarTelemetria() {
        const a = _adaptador;
        if (!a || !a.conectado) return;
        const hay = _hayTelemetria();
        const marca = _q('#estado-telemetria');
        if (marca) marca.hidden = hay;
        _actualizarBotonDespegar();

        if (!hay && a.enVuelo && !_failsafeActivado) {
            _ejecutarFailsafe(Date.now() - a.ultimaTelemetriaTs);
        } else if (a.enviosSuspendidos && a.enVuelo && !_accionVuelo) {
            // Failsafe sin aterrizaje confirmado: si vuelve la telemetría, reintentar UNA vez por cada vuelta
            if (!hay) _esperandoVueltaTelemetria = true;
            else if (_esperandoVueltaTelemetria) {
                _esperandoVueltaTelemetria = false;
                _reintentarAterrizajeFailsafe();
            }
        } else if (hay && !a.enVuelo) {
            _failsafeActivado = false;
            _esperandoVueltaTelemetria = false;
        }
    }

    /** true mientras el failsafe tiene suspendidos los envíos automáticos (solo Aterrizar o EMERGENCIA). */
    function _failsafeBloquea() {
        if (!_adaptador?.enviosSuspendidos) return false;
        App.mostrarToast('Se cortó la conexión con el dron: solo podés usar Aterrizar o EMERGENCIA.', 'advertencia');
        return true;
    }

    async function _ejecutarFailsafe(msSinTelemetria) {
        const a = _adaptador;
        _failsafeActivado = true;
        console.warn(`[Dron] FAILSAFE: sin telemetría hace ${(msSinTelemetria / 1000).toFixed(1)} s`);

        // 1. Freno: un "rc 0 0 0 0" inmediato
        a.frenar();
        _apagarModosAutomaticos();
        _soltarMandos();
        // 2. Desde acá no sale ningún comando automático (ni rc continuo ni keep-alive).
        //    Si el enlace está caído a medias, así el Tello activa su aterrizaje automático (~15 s sin comandos).
        a.suspenderEnviosAutomaticos();
        App.mostrarToast(`Se cortó la conexión con el dron (hace ${(msSinTelemetria / 1000).toFixed(1)} s): frenando y aterrizando...`, 'error', 8000);

        // 3. Dos intentos de "land"
        _accionVuelo = true;
        _actualizarEstadoUI('aterrizando');
        for (let intento = 1; intento <= 2; intento++) {
            try {
                await a.aterrizar(10000);
                if (a !== _adaptador) return;
                _accionVuelo = false;
                _actualizarEstadoUI('conectado');
                App.mostrarToast('Aterrizaje de seguridad confirmado.', 'advertencia', 6000);
                return;
            } catch (err) {
                console.warn(`[Dron] Failsafe: intento ${intento} de aterrizaje sin confirmar:`, err.message);
            }
        }
        if (a !== _adaptador) return;
        _accionVuelo = false;
        _esperandoVueltaTelemetria = !_hayTelemetria();
        _actualizarEstadoUI(a.enVuelo ? 'failsafe' : 'conectado');
        if (a.enVuelo) {
            _mostrarAvisoFijo('El dron no avisó que aterrizó. La app dejó de mandarle órdenes para que aterrice solo ' +
                '(tarda unos 15 segundos). Si sigue en el aire, tocá EMERGENCIA o Aterrizar. ' +
                'Si vuelve la conexión, la app intenta aterrizar de nuevo.');
        }
    }

    /** El enlace volvió después de un failsafe sin aterrizaje confirmado: un nuevo intento de "land". */
    async function _reintentarAterrizajeFailsafe() {
        const a = _adaptador;
        if (!a) return;
        App.mostrarToast('Volvió la conexión: intentando aterrizar de nuevo...', 'advertencia', 6000);
        _accionVuelo = true;
        _actualizarEstadoUI('aterrizando');
        try {
            await a.aterrizar(10000);
            if (a !== _adaptador) return;
            _accionVuelo = false;
            _ocultarAvisoFijo();
            _actualizarEstadoUI('conectado');
            App.mostrarToast('Aterrizaje de seguridad confirmado.', 'advertencia', 6000);
        } catch (err) {
            if (a !== _adaptador) return;
            console.warn('[Dron] Failsafe: el reintento de aterrizaje no se confirmó:', err.message);
            _accionVuelo = false;
            if (a.enVuelo) a.suspenderEnviosAutomaticos();
            _actualizarEstadoUI(a.enVuelo ? 'failsafe' : 'conectado');
        }
    }

    // ----------------------------------------------------------------
    // Eventos de la cabina
    // ----------------------------------------------------------------

    function _agregarEventosCabina() {
        const on = (sel, fn) => _q(sel)?.addEventListener('click', fn);

        on('#btn-despegar', _confirmarDespegue);
        on('#btn-aterrizar', _aterrizar);
        on('#btn-emergencia', () => _emergencia('Parada de emergencia manual'));
        on('#btn-toggle-giro', _toggleGiroscopio);
        on('#btn-toggle-seguimiento', _toggleSeguimiento);
        // "Seguir objeto": abre la lista de objetos de la sección Seguimiento y la trae a la vista
        on('#btn-atajo-objeto', () => {
            _pantallaSeg?.abrirPanelObjeto();
            _q('#cab-seguimiento')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        on('#btn-copiar-registro-seg', _copiarRegistroSeguimiento);
        on('#btn-copiar-registro-udp', _copiarRegistroComandos);
        on('#btn-cambiar-mando', _cambiarMando);
        on('#btn-probar-cpu', _probarCuadroEnCpu);
        on('#btn-reconectar', _conectar);
        on('#btn-ir-config-dron', () => { window.location.hash = '#/config-dron'; });
        on('#btn-cab-menu', () => App.abrirMenu());
        on('#btn-cerrar-aviso-fijo', _ocultarAvisoFijo);
    }

    // ----------------------------------------------------------------
    // Despegue, aterrizaje y emergencia
    // ----------------------------------------------------------------

    async function _confirmarDespegue() {
        const a = _adaptador;
        if (!a || !a.conectado) { App.mostrarToast('El dron no está conectado.', 'advertencia'); return; }
        if (a.enVuelo || _accionVuelo) return;
        if (!_hayTelemetria()) {
            App.mostrarToast('No llegan datos del dron, así que no puede despegar. Acercá el celular al dron o tocá Reconectar.', 'error', 9000);
            return;
        }
        if (!confirm(
            '¿Confirmar despegue?\n\n' +
            '• Asegurate de que el área esté despejada.\n' +
            '• El dron despegará al confirmar.\n' +
            '• Usá el botón EMERGENCIA si algo sale mal.'
        )) return;
        // Al despegar se detiene el seguimiento: para que el dron siga a alguien hay que pedirlo ya en el aire
        if (_modoSeguimiento) {
            _apagarSeguimiento(false);
            App.mostrarToast('Seguimiento detenido para despegar. En el aire, tocá Seguir para que el dron siga al objetivo.', 'info', 7000);
        }

        _accionVuelo = true;
        _actualizarEstadoUI('despegando');
        let final = 'conectado';
        try {
            await a.despegar();
            final = 'en_vuelo';
            _ocultarAvisoFijo();
            if (_modoGiro) _giroscopio?.calibrar();
            App.mostrarToast('Despegue completado.', 'exito');
            _iniciarWatchdog();
        } catch (err) {
            final = a.enVuelo ? 'en_vuelo' : 'conectado';
            App.mostrarToast(`No se pudo despegar: ${_textoError(err)}`, 'error', 8000);
        }
        if (a !== _adaptador) return;
        _accionVuelo = false;
        _actualizarEstadoUI(final);
    }

    async function _aterrizar() {
        const a = _adaptador;
        if (!a || !a.enVuelo) { App.mostrarToast('El dron no está en vuelo.', 'info'); return; }
        if (_accionVuelo) return;
        _apagarModosAutomaticos();

        _accionVuelo = true;
        _actualizarEstadoUI('aterrizando');
        let final;
        try {
            await a.aterrizar();
            final = 'conectado';
            _ocultarAvisoFijo();
            App.mostrarToast('Aterrizaje completado.', 'exito');
        } catch (err) {
            final = !a.enVuelo ? 'conectado' : (a.enviosSuspendidos ? 'failsafe' : 'en_vuelo');
            App.mostrarToast(`No se pudo confirmar el aterrizaje: ${_textoError(err)}`, 'error', 8000);
        }
        if (a !== _adaptador) return;
        _accionVuelo = false;
        _actualizarEstadoUI(final);
    }

    function _emergencia(motivo) {
        const a = _adaptador;
        if (!a) return;
        _apagarModosAutomaticos();
        _soltarMandos();
        a.detenerEmergencia()
            .catch(err => console.error('[Dron] Error enviando emergencia:', err))
            .finally(() => {
                if (a !== _adaptador) return;
                _accionVuelo = false;
                _ocultarAvisoFijo();
                _actualizarEstadoUI(a.conectado ? 'conectado' : 'desconectado');
                App.mostrarToast(`${motivo}: motores apagados.`, 'error', 6000);
            });
    }

    /** Mensaje de error para el usuario; con el modo técnico, más el detalle (por ejemplo, la respuesta del dron). */
    function _textoError(err) {
        const msg = err?.message || String(err);
        return App.modoTecnico() && err?.detalle ? `${msg} (${err.detalle})` : msg;
    }

    /** true mientras despega o aterriza (incluido el aterrizaje del failsafe). */
    function _maniobraEnCurso() {
        return _accionVuelo;
    }

    // ----------------------------------------------------------------
    // Giroscopio
    // ----------------------------------------------------------------

    function _apagarGiro() {
        if (!_modoGiro) return;
        _modoGiro = false;
        _giroscopio?.desactivar();
        _adaptador?.actualizarEjes({ lr: 0, fb: 0 });
        _joystickDer?.centrar();
        _mando?.setBloqueados([]);
        _actualizarBotonGiro();
    }

    /**
     * Apaga el seguimiento (si estaba moviendo el dron, sus ejes vuelven a 0).
     * @param {boolean} [mandarFreno] true: si estaba moviendo el dron, manda ya "rc 0 0 0 0".
     *   Los que llaman desde emergencia, failsafe, aterrizaje, despegue o un botón de movimiento pasan false:
     *   ellos ya se ocupan de lo que se manda.
     */
    function _apagarSeguimiento(mandarFreno = true) {
        _dejarDeMandar(mandarFreno);
        if (!_modoSeguimiento) return;
        _modoSeguimiento = false;
        _seguimiento?.desactivar();
        _panelSeguimiento?.destruir();
        _panelSeguimiento = null;
        _mostrarCartel('');
        const chip = _q('#cab-chip-seguimiento');
        if (chip) chip.hidden = true;
        _pantallaSeg?.setActivo(false);
        _actualizarBotonSeguimiento();
    }

    /** Apaga el seguimiento con freno y avisa por qué (solo si estaba andando). */
    function _detenerSeguimiento(motivo) {
        if (!_modoSeguimiento) return;
        _apagarSeguimiento();
        App.mostrarToast(`${motivo}: el seguimiento se detuvo.`, 'advertencia', 6000);
    }

    function _apagarModosAutomaticos() {
        _apagarGiro();
        _apagarSeguimiento(false);
    }

    async function _toggleGiroscopio() {
        if (!_giroscopio) return;
        if (_modoGiro) {
            _apagarGiro();
            App.mostrarToast('Inclinación apagada.', 'info');
            return;
        }
        if (_failsafeBloquea()) return;
        if (_maniobraEnCurso()) { App.mostrarToast('Esperá a que termine la maniobra en curso.', 'advertencia'); return; }
        const resultado = await _giroscopio.activar();
        if (resultado.ok) {
            _modoGiro = true;
            _adaptador?.actualizarEjes({ lr: 0, fb: 0 });
            _joystickDer?.centrar();
            // Avance y costados los maneja la inclinación: esos botones quedan bloqueados (los de altura y giro siguen)
            _mando?.setBloqueados(['adelante', 'atras', 'izquierda', 'derecha']);
            // La inclinación y el seguimiento mueven los mismos ejes: no andan juntos
            _detenerSeguimiento('Prendiste la inclinación');
            // activar() ya tomó la posición de ahora como "quieto" (calibración automática)
            App.mostrarToast('Inclinación prendida: esta posición es quieto.', 'exito');
        } else {
            let msg = 'No se pudo activar el control por inclinación.';
            if (resultado.motivo === 'permiso_denegado') msg = 'Permiso de los sensores denegado. Habilitalo en los ajustes.';
            if (resultado.motivo === 'no_disponible') msg = 'Este celular no tiene sensores de inclinación.';
            App.mostrarToast(msg, 'advertencia');
        }
        _actualizarBotonGiro();
    }

    /**
     * La pantalla giró con la inclinación activada: DronGiroscopio ya se desactivó (ejes en 0).
     * Se apaga el modo (ejes y joystick al centro) y se pide volver a activarla para recalibrar.
     */
    function _onCambioOrientacionInclinacion() {
        if (!_modoGiro) return;
        _apagarGiro();
        App.mostrarToast('Cambió la orientación de la pantalla: se apagó el control por inclinación. ' +
            'Sostené el celular como vas a volar y volvé a prenderla: esa posición va a ser quieto.', 'advertencia', 8000);
    }

    /** El lector decidió de qué sensor sale la inclinación. Con giroscopio no se avisa nada (es lo de siempre). */
    function _onFuenteInclinacion(fuente) {
        if (!_modoGiro) return;
        if (fuente === 'acelerometro') {
            App.mostrarToast('En este celular la inclinación no mide el giro: para girar, usá los botones.', 'advertencia', 8000);
        } else if (fuente === 'ninguno') {
            _apagarGiro(); // sus ejes vuelven a cero
            App.mostrarToast('No llegan datos de inclinación: este dispositivo no los da. Usá los botones.', 'advertencia', 7000);
        }
    }

    function _onGiroscopioCambio({ pitch, roll }) {
        if (!_modoGiro || !_adaptador || !_adaptador.enVuelo) return;
        _adaptador.actualizarEjes({ lr: roll, fb: pitch });
        if (_joystickDer) {
            _joystickDer._paloX = roll * _joystickDer._radio;
            _joystickDer._paloY = -pitch * _joystickDer._radio;
            _joystickDer._dibujar();
        }
    }

    function _actualizarBotonGiro() {
        const btn = _q('#btn-toggle-giro');
        if (!btn) return;
        btn.textContent = _modoGiro ? 'Inclinación: activa' : 'Inclinación: apagada';
        btn.classList.toggle('cab-activo', _modoGiro);
    }

    // ----------------------------------------------------------------
    // Seguimiento estilo RAC
    // En el piso solo marca el objetivo: NUNCA escribe los ejes del rc. En vuelo, cada paso de control (15 Hz)
    // escribe los ejes con los límites de DronSeguimiento.LIMITES_CONTROL_REAL; sin objetivo, en 0.
    // Qué hacer en cada paso lo decide DronSeguimiento.decidirSeguimiento (función pura, con pruebas).
    // ----------------------------------------------------------------

    /** Botón "Seguir persona" de arriba: sigue a una persona, o (mientras sigue) detiene el seguimiento. */
    async function _toggleSeguimiento() {
        if (_modoSeguimiento) {
            _apagarSeguimiento();
            App.mostrarToast('Seguimiento detenido.', 'info');
            return;
        }
        _pantallaSeg?.marcarObjetivo({ tipo: 'persona' });
        await _seguirObjetivo({ tipo: 'persona' });
    }

    /**
     * "Seguir persona" / "Seguir objeto": elige qué seguir y arranca el seguimiento.
     * Si ya estaba andando, cambia el objetivo (deja de mover el dron hasta confirmar el nuevo).
     * @param {{tipo:'persona'}|{tipo:'clase', clase:string}|{tipo:'mio', id:string}} meta
     */
    async function _seguirObjetivo(meta) {
        if (!_seguimiento) { App.mostrarToast('El seguimiento no está disponible.', 'advertencia'); return; }
        const res = await _seguimiento.elegirObjetivo(meta, _objetosGuardados);
        if (!_seguimiento) return; // salió de la cabina mientras cargaba
        if (!res.ok) { App.mostrarToast(res.error, 'advertencia', 7000); return; }
        if (_modoSeguimiento) {
            // Antes de reactivar: activar() pone los FPS en 0 y, si siguiera mandando, se cortaría por las condiciones
            _dejarDeMandar(true);
            _seguimiento.desactivar();
            _seguimiento.activar();
            _pantallaSeg?.setActivo(true);
            App.mostrarToast('Ahora sigue lo que elegiste.', 'info');
            return;
        }
        await _activarSeguimiento();
    }

    async function _activarSeguimiento() {
        if (!_seguimiento) { App.mostrarToast('El seguimiento no está disponible.', 'advertencia'); return; }
        if (_modoSeguimiento) return;
        if (_failsafeBloquea()) return;
        if (_maniobraEnCurso()) { App.mostrarToast('Esperá a que termine la maniobra en curso.', 'advertencia'); return; }
        if (!_seguimiento.modeloCargado) {
            App.mostrarToast('Preparando el seguimiento...', 'info');
            _pantallaSeg?.setCargando(true);
            const res = await _seguimiento.inicializar();
            _pantallaSeg?.setCargando(false);
            if (!_seguimiento) return; // salió de la cabina mientras cargaba
            if (!res.ok) { App.mostrarToast(`No se pudo preparar el seguimiento: ${res.error}`, 'advertencia', 7000); return; }
            if (res.aviso) App.mostrarToast(res.aviso, 'advertencia', 8000);
        }
        // La inclinación y el seguimiento mueven los mismos ejes: no andan juntos
        if (_modoGiro) {
            _apagarGiro();
            App.mostrarToast('Se apagó la inclinación para seguir al objetivo.', 'info');
        }
        _modoSeguimiento = true;
        _controlReal = false;
        _seguimiento.controlReal = false;
        _seguimiento.onComando = _onSeguimientoComando;
        _panelSeguimiento?.destruir();
        _panelSeguimiento = new DronSeguimiento.Panel(_q('#cab-panel-seg'));
        _seguimiento.onEstado = (nuevo, anterior, info) => {
            _pantallaSeg?.cambioDeEstado(nuevo, anterior, info);
            if (_modoSeguimiento && nuevo === 'perdido') {
                App.mostrarToast(_controlReal ? 'Objetivo perdido: el dron queda quieto.' : 'Objetivo perdido.', 'advertencia', 5000);
            }
        };
        _seguimiento.activar();
        _pantallaSeg?.setActivo(true);
        const enVuelo = !!_adaptador?.enVuelo;
        _mostrarCartel(enVuelo ? 'Buscando objetivo...' : TEXTO_EN_EL_PISO);
        const btnRegistro = _q('#btn-copiar-registro-seg');
        if (btnRegistro) btnRegistro.hidden = false;
        App.mostrarToast(enVuelo ? 'Cuando confirme el objetivo, el dron lo sigue despacio. Tené el dedo listo en EMERGENCIA.' : TEXTO_EN_EL_PISO, 'info', 7000);
        _actualizarBotonSeguimiento();
    }

    /**
     * Deja de mover el dron: los ejes del seguimiento a 0 (el seguimiento puede seguir marcando el objetivo).
     * @param {boolean} [mandarFreno] mandar ya "rc 0 0 0 0" (si no, sale en el próximo ciclo del rc)
     */
    function _dejarDeMandar(mandarFreno = true) {
        if (!_controlReal) return;
        _controlReal = false;
        if (_seguimiento) _seguimiento.controlReal = false;
        _adaptador?.actualizarEjes({ lr: 0, fb: 0, ud: 0, yaw: 0 });
        if (mandarFreno) _adaptador?.enviarEjesYa();
    }

    /** Cada paso de control (15 Hz): en el piso solo muestra; en vuelo y con las condiciones, mueve el dron. */
    function _onSeguimientoComando(cmd, info) {
        if (!_modoSeguimiento) return;
        const a = _adaptador;
        const decision = DronSeguimiento.decidirSeguimiento({
            enVuelo: !!a?.enVuelo,
            conexionOk: !!a && !a.enviosSuspendidos && _hayTelemetria(),
            maniobra: _maniobraEnCurso(),
            condiciones: info.condiciones,
            mandando: _controlReal,
        });
        if (decision.accion === 'detener') {
            // Estaba moviendo el dron y dejó de poder: freno y fin del seguimiento (hay que volver a pedirlo)
            _apagarSeguimiento();
            App.mostrarToast(`El seguimiento se detuvo: ${decision.motivo}.`, 'advertencia', 7000);
            return;
        }
        let textoComando;
        if (decision.accion === 'mandar') {
            _controlReal = true;
            _seguimiento.controlReal = true;
            const ejes = DronSeguimiento.comandoControlReal(cmd, info.estado);
            a.actualizarEjes(ejes);
            textoComando = `Mandando al dron: ${DronSeguimiento.textoRc(ejes)}`;
            _pantallaSeg?.setModo('El dron sigue al objetivo, despacio.', true);
            // El estado ya está en la etiqueta de arriba del video: el cartel solo hace falta en el modo técnico (con el rc)
            _mostrarCartel(App.modoTecnico() ? `${DronSeguimiento.estadoCorto(info).texto} · ${DronSeguimiento.textoRc(ejes)}` : '');
        } else if (decision.accion === 'esperar') {
            textoComando = `Todavía no sigue: ${decision.motivo}.`;
            _pantallaSeg?.setModo(`Todavía no sigue: ${decision.motivo}.`, false);
            _mostrarCartel(`Todavía no sigue: ${decision.motivo}`);
        } else {
            textoComando = 'En el piso: no se manda nada.';
            _pantallaSeg?.setModo(TEXTO_EN_EL_PISO, false);
            _mostrarCartel(TEXTO_EN_EL_PISO);
        }
        _pantallaSeg?.actualizar(info, textoComando);
        _panelSeguimiento?.actualizar(info);
        const chip = _q('#cab-chip-seguimiento');
        if (chip) {
            const e = DronSeguimiento.estadoCorto(info);
            if (chip.dataset.texto !== e.texto) {
                App.textoConPunto(chip, e.color, e.texto);
                chip.dataset.texto = e.texto;
            }
            chip.hidden = false;
        }
    }

    /** Modo técnico: el mismo cuadro con WebGL y con CPU (pausa la detección unos segundos). */
    async function _probarCuadroEnCpu() {
        const btn = _q('#btn-probar-cpu');
        const salida = _q('#cab-resultado-cpu');
        if (!_seguimiento || !btn || !salida) return;
        btn.disabled = true;
        salida.hidden = false;
        salida.textContent = 'Probando en el procesador: puede tardar unos segundos...';
        const r = await _seguimiento.probarCuadroEnCpu();
        if (!_q('#btn-probar-cpu')) return;
        salida.textContent = DronSeguimiento.textoPruebaCpu(r, 'person');
        btn.disabled = false;
    }

    /** Copia el registro de comandos y respuestas del dron (cada respuesta con su puerto). */
    async function _copiarRegistroComandos() {
        const a = _adaptador;
        if (typeof a?.registroTexto !== 'function') { App.mostrarToast('El simulador no tiene registro de comandos.', 'info'); return; }
        const v = _video;
        const lineaVideo = v ? `Video: ${v.frameCount} cuadros, ${v.cuadrosClave} cuadros clave, ${v.perdidas} pérdidas, ${v.errores} errores` : 'Video: sin decodificador';
        const ok = typeof DronSeguimiento !== 'undefined' && await DronSeguimiento.copiarTexto(`${lineaVideo}\n${a.registroTexto()}`);
        App.mostrarToast(ok ? `Registro copiado (${a.registro.length} líneas).` : 'No se pudo copiar el registro.', ok ? 'exito' : 'advertencia');
    }

    /** Copia el registro por cuadro del último seguimiento (CSV separado por ";"). */
    async function _copiarRegistroSeguimiento() {
        const filas = _seguimiento?.registro.length || 0;
        if (!filas) { App.mostrarToast('Todavía no hay registro: usá el seguimiento un rato.', 'info'); return; }
        const ok = await DronSeguimiento.copiarTexto(_seguimiento.registroCSV());
        App.mostrarToast(ok ? `Registro copiado (${filas} cuadros).` : 'No se pudo copiar el registro.', ok ? 'exito' : 'advertencia');
    }

    /** Cartel sobre el video: qué está haciendo el seguimiento. */
    function _mostrarCartel(texto) {
        const caja = _q('#cab-cartel');
        if (!caja) return;
        caja.textContent = texto;
        caja.hidden = !texto;
    }

    function _actualizarBotonSeguimiento() {
        const btn = _q('#btn-toggle-seguimiento');
        if (!btn) return;
        btn.textContent = _modoSeguimiento ? 'Detener seguimiento' : 'Seguir persona';
        const objeto = _q('#btn-atajo-objeto');
        if (objeto) objeto.hidden = _modoSeguimiento;
        btn.classList.toggle('cab-activo', _modoSeguimiento);
    }

    // ----------------------------------------------------------------
    // Mandos: botones de mantener apretado (por defecto) o joysticks (modo técnico)
    // ----------------------------------------------------------------

    function _inicializarMando() {
        const zona = _q('.cab-principal');
        if (!zona) return;
        _mando?.destruir();
        _mando = new DronBotonesMovimiento({ contenedor: zona, velocidad: 'lenta' });
        _mando.onCambio = _onMandoBotones;
        _mando.habilitar(_estadoUI === 'en_vuelo');
        if (_modoGiro) _mando.setBloqueados(['adelante', 'atras', 'izquierda', 'derecha']);
        _q('#cab-velocidad')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-velocidad]');
            if (btn) _elegirVelocidad(btn.dataset.velocidad);
        });
        _elegirVelocidad('lenta');
    }

    /** Los botones cambiaron: cada eje vale la velocidad elegida mientras su botón está apretado, o 0. */
    function _onMandoBotones(ejes, acciones) {
        const a = _adaptador;
        if (!a) return;
        // Tocar un botón de movimiento detiene el seguimiento (sus ejes a 0; los del botón salen enseguida)
        if (acciones.length && _modoSeguimiento) {
            _apagarSeguimiento(false);
            App.mostrarToast('Tocaste un botón de movimiento: el seguimiento se detuvo.', 'advertencia');
        }
        if (acciones.length && _maniobraEnCurso()) {
            _mando.soltarTodo(); // vuelve a llamar con los ejes en 0
            if (Date.now() - _avisoManiobraTs > 3000) {
                _avisoManiobraTs = Date.now();
                App.mostrarToast('Esperá a que el dron termine de despegar o de aterrizar.', 'advertencia');
            }
            return;
        }
        // Con la inclinación activa, el avance y los costados los maneja ella
        a.actualizarEjes(_modoGiro ? { ud: ejes.ud, yaw: ejes.yaw } : ejes);
        a.enviarEjesYa(); // al soltar, el freno sale en el acto (no espera al próximo ciclo del rc)
    }

    function _elegirVelocidad(nombre) {
        if (!DronBotonesMovimiento.VELOCIDADES[nombre]) return;
        _mando?.setVelocidad(nombre);
        _contenedor?.querySelectorAll('[data-velocidad]').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.velocidad === nombre));
        });
    }

    /** Suelta los botones y centra los joysticks: los ejes del mando vuelven a 0. */
    function _soltarMandos() {
        _mando?.soltarTodo();
        _joystickIzq?.centrar();
        _joystickDer?.centrar();
    }

    /** Modo técnico: alterna entre los botones y los joysticks. Al cambiar, todos los ejes vuelven a 0. */
    function _cambiarMando() {
        _soltarMandos();
        _usarJoysticks = !_usarJoysticks;
        _adaptador?.actualizarEjes({ ud: 0, yaw: 0, ...(_modoGiro ? {} : { lr: 0, fb: 0 }) });
        _contenedor?.querySelectorAll('.cab-mando, #cab-velocidad').forEach(el => { el.hidden = _usarJoysticks; });
        _contenedor?.querySelectorAll('.cab-joystick').forEach(el => { el.hidden = !_usarJoysticks; });
        if (_usarJoysticks) {
            _inicializarJoysticks();
        } else {
            _joystickIzq?.destruir();
            _joystickDer?.destruir();
            _joystickIzq = null;
            _joystickDer = null;
        }
        const btn = _q('#btn-cambiar-mando');
        if (btn) btn.textContent = _usarJoysticks ? 'Volver a los botones' : 'Usar joysticks';
        App.mostrarToast(_usarJoysticks ? 'Joysticks activados (más sensibles que los botones).' : 'Botones activados.', 'info');
    }

    // ----------------------------------------------------------------
    // Joysticks (solo en el modo técnico)
    // ----------------------------------------------------------------

    function _calcularTamanoJoystick() {
        const caja = _q('.cab-joystick');
        const ancho = caja ? caja.clientWidth : window.innerWidth / 2;
        const horizontal = window.innerWidth > window.innerHeight && window.innerHeight <= 500;
        // En horizontal: alto de pantalla menos la barra superior, los botones del costado y márgenes
        const alto = horizontal ? window.innerHeight - 200 : 9999;
        return Math.round(Math.max(100, Math.min(170, ancho - 8, alto)));
    }

    function _inicializarJoysticks() {
        const cIzq = _q('#joystick-izquierdo');
        const cDer = _q('#joystick-derecho');
        if (!cIzq || !cDer) return;
        _joystickIzq?.destruir();
        _joystickDer?.destruir();
        // Al recrear se sueltan los dos sticks: sus ejes vuelven a cero
        _adaptador?.actualizarEjes({ lr: 0, fb: 0, ud: 0, yaw: 0 });

        _tamanoJoystick = _calcularTamanoJoystick();
        _joystickIzq = new DronJoystick({ contenedor: cIzq, etiqueta: 'ALTURA / GIRO', tamano: _tamanoJoystick });
        _joystickDer = new DronJoystick({ contenedor: cDer, etiqueta: 'AVANCE / LADO', tamano: _tamanoJoystick });

        // Cada joystick actualiza SOLO sus dos ejes
        _joystickIzq.onChange = ({ x, y }) => {
            if (_modoSeguimiento) _detenerSeguimiento('Tocaste un joystick');
            _adaptador?.actualizarEjes({ ud: y, yaw: x });
        };
        _joystickIzq.onRelease = () => {
            _adaptador?.actualizarEjes({ ud: 0, yaw: 0 });
        };
        _joystickDer.onChange = ({ x, y }) => {
            if (_modoGiro) return; // en ese modo lo maneja el giroscopio
            if (_modoSeguimiento) _detenerSeguimiento('Tocaste un joystick');
            _adaptador?.actualizarEjes({ lr: x, fb: y });
        };
        _joystickDer.onRelease = () => {
            if (_modoGiro) return;
            _adaptador?.actualizarEjes({ lr: 0, fb: 0 });
        };
    }

    // ----------------------------------------------------------------
    // Telemetría
    // ----------------------------------------------------------------

    function _actualizarPanelTelemetria(tel) {
        _actualizarBotonDespegar(); // el primer paquete habilita "Despegar" sin esperar al watchdog
        const fmt = (v, sufijo) => (v === null || v === undefined || Number.isNaN(Number(v))) ? `--${sufijo}` : `${Math.round(v)}${sufijo}`;
        const set = (sel, txt) => { const e = _q(sel); if (e) e.textContent = txt; };
        set('#tel-bateria-valor', fmt(tel.bateria, '%'));
        set('#tel-altura-valor', fmt(tel.altura, ' cm'));
        set('#tel-velocidad-valor', fmt(tel.velocidad, ' cm/s'));
        set('#tel-tiempo-valor', fmt(tel.tiempoVuelo, ' s'));

        const icono = _q('#tel-bateria-icono');
        if (tel.bateria === null || tel.bateria === undefined) {
            if (icono) icono.className = 'punto';
            return;
        }
        const bat = Number(tel.bateria);
        if (icono) icono.className = `punto punto--${bat <= 10 ? 'error' : bat <= 25 ? 'advertencia' : 'exito'}`;

        // Avisos de batería: una sola vez por nivel
        const nivel = bat <= 10 ? 2 : bat <= 25 ? 1 : 0;
        if (nivel > _nivelAvisoBateria && _adaptador?.enVuelo) {
            App.mostrarToast(nivel === 2 ? `Batería crítica: ${Math.round(bat)}%. Aterrizá ya.` : `Batería baja: ${Math.round(bat)}%. Pensá en aterrizar.`,
                nivel === 2 ? 'error' : 'advertencia', 8000);
        }
        if (nivel > _nivelAvisoBateria || nivel === 0) _nivelAvisoBateria = nivel;
    }

    // ----------------------------------------------------------------
    // Estado de la interfaz
    // ----------------------------------------------------------------

    function _actualizarEstadoUI(estado) {
        // [color del punto, texto]
        const textos = {
            conectando: ['advertencia', 'Conectando...'],
            conectado: ['exito', 'Conectado (en tierra)'],
            despegando: ['acento', 'Despegando...'],
            en_vuelo: ['acento', 'En vuelo'],
            aterrizando: ['acento', 'Aterrizando...'],
            failsafe: ['alerta', 'Sin conexión: aterriza solo'],
            desconectado: ['error', 'Desconectado'],
        };
        _estadoUI = estado;
        const [color, texto] = textos[estado] || ['', estado];
        App.textoConPunto(_q('#estado-conexion'), color, texto);

        const btnAterrizar = _q('#btn-aterrizar');
        const btnEmergencia = _q('#btn-emergencia');
        const btnReconectar = _q('#btn-reconectar');
        _actualizarBotonDespegar();
        if (btnAterrizar) btnAterrizar.disabled = estado !== 'en_vuelo' && estado !== 'failsafe';
        // La emergencia queda habilitada siempre que exista un adaptador (aunque la conexión falle)
        if (btnEmergencia) btnEmergencia.disabled = !_adaptador;
        if (btnReconectar) btnReconectar.hidden = estado !== 'desconectado';
        // Los botones de movimiento solo se pueden apretar en vuelo (al deshabilitarlos, frenan)
        _mando?.habilitar(estado === 'en_vuelo');
        if (estado === 'desconectado') { const m = _q('#estado-telemetria'); if (m) m.hidden = true; }
    }

    /**
     * "Despegar" solo se habilita conectado, en tierra y con telemetría.
     * Mientras no llega la telemetría muestra "Esperando telemetría…" (la protección de
     * _confirmarDespegue sigue igual: esto solo cambia cómo se muestra).
     */
    function _actualizarBotonDespegar() {
        const btn = _q('#btn-despegar');
        if (!btn) return;
        const esperando = _estadoUI === 'conectado' && !_hayTelemetria();
        btn.disabled = _estadoUI !== 'conectado' || esperando;
        const texto = esperando ? 'Esperando datos del dron…' : 'Despegar';
        if (btn.dataset.texto !== texto) {
            App.textoConIcono(btn, esperando ? '' : 'despegar', texto);
            btn.dataset.texto = texto;
        }
    }

    /**
     * Espacio al final de la página igual a lo que tapa EMERGENCIA (fija abajo en vertical) más un margen:
     * así se puede leer todo con scroll, aunque el celular agrande la letra. Acostado va arriba: sin espacio.
     */
    function _reservarLugarEmergencia() {
        const em = _q('#btn-emergencia');
        const fin = _q('.cab-reserva');
        if (!em || !fin) return;
        const r = em.getBoundingClientRect();
        fin.style.height = r.top > window.innerHeight / 2 ? `${Math.ceil(window.innerHeight - r.top) + 16}px` : '0px';
    }

    function _mostrarAvisoFijo(texto) {
        const caja = _q('#cab-aviso-fijo');
        if (!caja) return;
        _q('#cab-aviso-fijo-texto').textContent = texto;
        caja.hidden = false;
    }

    function _ocultarAvisoFijo() {
        const caja = _q('#cab-aviso-fijo');
        if (caja) caja.hidden = true;
    }

    // ----------------------------------------------------------------
    // Pantalla de error
    // ----------------------------------------------------------------

    function _mostrarError(contenedor, mensaje) {
        contenedor.innerHTML = `
        <div class="dron-pagina">
            <p class="etiqueta">Cabina</p>
            <h1 class="h3 fw-bold text-uppercase">Error</h1>
            <div class="alert alert-danger">${_esc(mensaje)}</div>
            <a href="#/inicio" class="btn btn-primary">Volver al inicio</a>
        </div>`;
    }

    function _esc(str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ----------------------------------------------------------------
    // Plantilla de la cabina
    // ----------------------------------------------------------------

    function _plantillaCabina() {
        const mantener = (mover, etiqueta, ico) =>
            `<button class="btn btn-outline-secondary cab-mantener" data-mover="${mover}" aria-label="${etiqueta}" title="${etiqueta}" disabled>${App.icono(ico)}</button>`;
        return `
        <div class="dron-pagina cabina d-flex flex-column gap-2">
            <!-- Barra: menú (en horizontal), perfil y, en el modo técnico, más datos -->
            <div class="cab-barra d-flex align-items-center gap-3">
                <button id="btn-cab-menu" class="btn btn-link text-body px-2 cab-btn-menu" aria-label="Abrir menú">${App.icono('menu')}</button>
                <p class="etiqueta mb-0 me-auto text-truncate titulo-app" data-titulo-app>Cabina · <span id="nombre-perfil-activo">—</span></p>
                <div class="solo-tecnico small text-body-secondary text-nowrap" id="panel-telemetria">
                    Velocidad <b id="tel-velocidad-valor">-- cm/s</b> · Motores <b id="tel-tiempo-valor">-- s</b>
                </div>
            </div>

            <!-- EMERGENCIA: fija y siempre visible -->
            <button id="btn-emergencia" class="btn btn-danger cab-emergencia" disabled>${App.icono('alto')} EMERGENCIA</button>

            <!-- Aviso fijo (por ejemplo, failsafe sin aterrizaje confirmado) -->
            <div id="cab-aviso-fijo" class="alert alert-warning d-flex flex-wrap align-items-center gap-2 mb-0" role="alert" hidden>
                <span id="cab-aviso-fijo-texto" class="flex-grow-1"></span>
                <button id="btn-cerrar-aviso-fijo" class="btn btn-outline-warning">Entendido</button>
            </div>

            <!-- Zona principal: mando izquierdo | video | mando derecho (botones de mantener apretado o joysticks) -->
            <div class="cab-principal">
                <div class="cab-lado cab-lado--izq">
                    <div class="cab-acciones">
                        <button id="btn-despegar" class="btn btn-primary" disabled>${App.icono('despegar')} Despegar</button>
                        <button id="btn-aterrizar" class="btn btn-outline-secondary" disabled>${App.icono('aterrizar')} Aterrizar</button>
                    </div>
                    <div class="cab-mando">
                        <span class="small text-body-secondary">Subir y bajar · Girar</span>
                        <div class="cab-cruz cab-cruz--mantener">
                            <span></span>${mantener('subir', 'Subir', 'chevron-arriba')}<span></span>
                            ${mantener('girar-izq', 'Girar a la izquierda', 'girar-izq')}<span></span>${mantener('girar-der', 'Girar a la derecha', 'girar-der')}
                            <span></span>${mantener('bajar', 'Bajar', 'chevron-abajo')}<span></span>
                        </div>
                    </div>
                    <div class="cab-joystick" hidden>
                        <span class="small text-body-secondary">Subir y bajar · Girar</span>
                        <div id="joystick-izquierdo"></div>
                    </div>
                </div>

                <div class="cab-video rounded border">
                    <canvas id="canvas-video" width="960" height="720"></canvas>
                    <canvas id="canvas-seguimiento"></canvas>
                    <div id="overlay-video-off" class="caja-video__aviso">Sin señal de video</div>
                    <!-- Estados sobre la imagen -->
                    <div class="sobre-imagen">
                        <div class="sobre-imagen__grupo">
                            <span id="estado-conexion" class="badge"><span class="punto punto--advertencia" aria-hidden="true"></span>Conectando...</span>
                            <span id="estado-telemetria" class="badge text-warning" hidden><span class="punto punto--alerta" aria-hidden="true"></span>Sin datos del dron</span>
                            <span id="cab-chip-seguimiento" class="badge" hidden></span>
                        </div>
                        <div class="sobre-imagen__grupo sobre-imagen__grupo--der">
                            <span class="badge" title="Batería"><span id="tel-bateria-icono" class="punto" aria-hidden="true"></span><span class="fw-normal opacity-75">Bat. </span><span id="tel-bateria-valor">--%</span></span>
                            <span class="badge" title="Altura"><span class="fw-normal opacity-75">Alt. </span><span id="tel-altura-valor">-- cm</span></span>
                            <span id="cab-chip-fps" class="badge solo-tecnico" hidden></span>
                        </div>
                    </div>
                    <div id="cab-cartel" class="cartel-seguimiento" hidden></div>
                </div>

                <!-- Velocidad de los botones (arranca siempre en Lenta) -->
                <div id="cab-velocidad" class="cab-velocidad">
                    <div class="btn-group" role="group" aria-label="Velocidad">
                        <button class="btn btn-outline-primary cab-vel" data-velocidad="lenta" aria-pressed="true">Lenta</button>
                        <button class="btn btn-outline-primary cab-vel" data-velocidad="normal" aria-pressed="false">Normal</button>
                        <button class="btn btn-outline-primary cab-vel" data-velocidad="rapida" aria-pressed="false">Rápida</button>
                    </div>
                    <p class="small text-body-secondary mb-0 mt-1">Mantené apretado para mover el dron; soltá para frenar.</p>
                </div>

                <div class="cab-lado cab-lado--der">
                    <div class="cab-acciones">
                        <button id="btn-toggle-giro" class="btn btn-outline-secondary">Inclinación: apagada</button>
                        <div class="cab-seguir">
                            <button id="btn-toggle-seguimiento" class="btn btn-outline-primary">Seguir persona</button>
                            <button id="btn-atajo-objeto" class="btn btn-outline-primary">Seguir objeto</button>
                        </div>
                    </div>
                    <div class="cab-mando">
                        <span class="small text-body-secondary">Avanzar · De costado</span>
                        <div class="cab-cruz cab-cruz--mantener">
                            <span></span>${mantener('adelante', 'Adelante', 'tri-arriba')}<span></span>
                            ${mantener('izquierda', 'Izquierda', 'tri-izq')}<span></span>${mantener('derecha', 'Derecha', 'tri-der')}
                            <span></span>${mantener('atras', 'Atrás', 'tri-abajo')}<span></span>
                        </div>
                    </div>
                    <div class="cab-joystick" hidden>
                        <span class="small text-body-secondary">Avanzar · De costado</span>
                        <div id="joystick-derecho"></div>
                    </div>
                </div>
            </div>

            <div class="d-flex flex-wrap gap-2 mt-2">
                <button id="btn-reconectar" class="btn btn-primary flex-fill" hidden>Reconectar</button>
                <button id="btn-ir-config-dron" class="btn btn-outline-secondary flex-fill solo-tecnico">Config. Dron</button>
            </div>

            <!-- Seguimiento estilo RAC (las tarjetas las arma dron-seguimiento-ui.js) -->
            <section class="border-top pt-4 mt-3">
                <p class="etiqueta">Seguimiento</p>
                <p class="small text-body-secondary">Tocá Seguir persona (la cara o, si no se ve, el cuerpo) o Seguir objeto. Con el dron en el aire, lo sigue despacio.</p>
                <div id="cab-seguimiento"></div>
                <img id="cab-foto-prueba" src="img/prueba-persona.jpg" alt="" hidden>
            </section>

            <!-- Modo técnico: detalle del seguimiento, lo que ve el modelo, prueba en CPU y registro -->
            <section class="solo-tecnico border-top pt-4 mt-3">
                <p class="etiqueta">Modo técnico · Seguimiento</p>
                <ul class="small text-body-secondary ps-3">
                    <li><b>Lo que ve el modelo:</b> la imagen que analiza el detector, con todo lo que encuentra y su puntaje (desde el 10 %).</li>
                    <li><b>Probar este cuadro en CPU:</b> analiza la misma imagen con la placa de video (WebGL) y con el procesador (CPU) para ver si la placa analiza mal.</li>
                    <li><b>Copiar registro:</b> copia una tabla (CSV) con cada imagen analizada, para mandarla y revisarla.</li>
                </ul>
                <div class="d-flex flex-wrap gap-3 align-items-start">
                    <figure class="miniatura-modelo m-0">
                        <canvas id="cab-miniatura" width="160" height="120"></canvas>
                        <figcaption class="small text-body-secondary mt-1">Lo que ve el modelo</figcaption>
                    </figure>
                    <div id="cab-panel-seg" class="detalle-seguimiento__panel" data-vacio="Iniciá el seguimiento para ver el detalle."></div>
                </div>
                <div class="d-flex flex-wrap gap-2 mt-2">
                    <button id="btn-probar-cpu" class="btn btn-outline-secondary">Probar este cuadro en CPU</button>
                    <button id="btn-copiar-registro-seg" class="btn btn-outline-secondary" hidden>Copiar registro</button>
                </div>
                <pre id="cab-resultado-cpu" class="panel-seguimiento mt-2" hidden></pre>
            </section>

            <!-- Modo técnico: joysticks en lugar de los botones -->
            <section class="solo-tecnico border-top pt-4 mt-3">
                <p class="etiqueta">Modo técnico · Mandos</p>
                <p class="small text-body-secondary"><b>Usar joysticks:</b> cambia los botones por las palancas de antes (mueven según cuánto las corrés: son más sensibles). Al salir de la cabina vuelven los botones.</p>
                <button id="btn-cambiar-mando" class="btn btn-outline-secondary">Usar joysticks</button>
            </section>

            <!-- Modo técnico: comandos y respuestas del dron -->
            <section class="solo-tecnico border-top pt-4 mt-3">
                <p class="etiqueta">Modo técnico · Conexión</p>
                <p class="small text-body-secondary"><b>Copiar registro de comandos:</b> copia cada orden que se mandó al dron y cada respuesta que llegó, con su puerto (UDP), para revisar la conexión.</p>
                <button id="btn-copiar-registro-udp" class="btn btn-outline-secondary">Copiar registro de comandos</button>
            </section>

            <p class="small text-body-secondary text-center border-top pt-3 mt-3">
                Volá con supervisión y con 3 × 3 m libres de personas.
            </p>
            <!-- Espacio para que EMERGENCIA no tape lo último (lo mide _reservarLugarEmergencia) -->
            <div class="cab-reserva" aria-hidden="true"></div>
        </div>`;
    }

    // ----------------------------------------------------------------
    // Limpieza (al salir de la cabina)
    // ----------------------------------------------------------------

    async function _limpiarInstancias() {
        _detenerWatchdog();
        clearTimeout(_timerResize);
        if (_onResize) { window.removeEventListener('resize', _onResize); _onResize = null; }

        _modoGiro = false;
        _modoSeguimiento = false;
        _controlReal = false; // al salir de la cabina, el seguimiento se apaga
        if (_onVisibilidad) { document.removeEventListener('visibilitychange', _onVisibilidad); _onVisibilidad = null; }
        if (_giroscopio) { _giroscopio.desactivar(); _giroscopio = null; }
        if (_seguimiento) { _seguimiento.desactivar(); _seguimiento = null; }
        _panelSeguimiento = null;
        if (_pantallaSeg) { _pantallaSeg.destruir(); _pantallaSeg = null; }
        if (_mando) { _mando.destruir(); _mando = null; }
        _usarJoysticks = false;
        if (_joystickIzq) { _joystickIzq.destruir(); _joystickIzq = null; }
        if (_joystickDer) { _joystickDer.destruir(); _joystickDer = null; }
        if (_video) { _video.destruir(); _video = null; }

        const a = _adaptador;
        _adaptador = null;
        _accionVuelo = false;
        _nivelAvisoBateria = 0;
        _esperandoVueltaTelemetria = false;
        if (a) {
            if (a.enVuelo) {
                try {
                    a.frenar();
                    await a.aterrizar();
                    App.mostrarToast('Saliste de la cabina: dron aterrizado.', 'info');
                } catch (err) {
                    App.mostrarToast(`Al salir de la cabina no se pudo confirmar el aterrizaje: ${_textoError(err)}`, 'error', 9000);
                }
            }
            try { await a.desconectar(); } catch (_) { /* nada */ }
        }
    }

    async function destruir() {
        _generacion++;
        document.body.classList.remove('en-cabina');
        await _limpiarInstancias();
    }

    /** true si el dron está en el aire o despegando/aterrizando (lo usa app.js antes de salir). */
    function estaEnVuelo() {
        return !!(_adaptador && (_adaptador.enVuelo || _accionVuelo));
    }

    return {
        inicializar,
        destruir,
        estaEnVuelo,
    };
})();
