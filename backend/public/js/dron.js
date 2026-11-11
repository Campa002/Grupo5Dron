/**
 * Módulo de Control de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Cabina de vuelo táctil. Integra:
 *  - DronAdaptadores  (dron-adaptadores.js)
 *  - DronBotonesMovimiento y DronJoystick (dron-joystick.js): botones de mantener apretado
 *    (mando por defecto) y joysticks (solo en el modo técnico)
 *  - DronGiroscopio   (dron-giroscopio.js)
 *  - DronSeguimiento  (dron-seguimiento.js)  [EXPERIMENTAL]
 *  - DronVideoDecoder (dron-video.js)
 *  - ConfigDron       (config-dron.js)
 *
 * Reglas de seguridad:
 *  - Giroscopio y seguimiento DESACTIVADOS al iniciar; al apagar el giroscopio, sus ejes vuelven a cero.
 *  - El seguimiento funciona por ahora SOLO EN ENSAYO: calcula y muestra los comandos, nunca los envía.
 *  - Botón de EMERGENCIA fijo y siempre visible (vertical y horizontal).
 *  - Confirmación explícita antes de despegar; no se despega si no llega telemetría.
 *  - Failsafe: sin telemetría en vuelo por más del tiempo configurado → freno (rc 0 0 0 0) y aterrizaje.
 *    Si el aterrizaje no se confirma, se reintenta una vez y se avisa (no se cortan motores solos).
 *  - Durante un paso o una misión se pausa el rc continuo para no interrumpirlos.
 *  - Botones de mantener apretado: al soltar, salir del botón, perder el toque o pasar a segundo plano,
 *    su eje vuelve a 0 (frena). Arrancan en velocidad Lenta y solo se pueden apretar en vuelo.
 *  - Salir de la cabina en vuelo aterriza el dron (app.js pide confirmación antes).
 */

// eslint-disable-next-line no-unused-vars
const Dron = (() => {
    'use strict';

    const FAILSAFE_POR_DEFECTO_MS = 3500;
    const ACCIONES_MISION = ['adelante', 'atras', 'izquierda', 'derecha', 'subir', 'bajar', 'girar', 'esperar'];

    const MISIONES_DEFAULT = [
        {
            id: 'cuadrado',
            nombre: 'Cuadrado 50 cm',
            descripcion: 'Vuela en patrón cuadrado de 50 cm por lado',
            pasos: [
                { accion: 'adelante', valor: 50 }, { accion: 'girar', valor: 90 },
                { accion: 'adelante', valor: 50 }, { accion: 'girar', valor: 90 },
                { accion: 'adelante', valor: 50 }, { accion: 'girar', valor: 90 },
                { accion: 'adelante', valor: 50 }, { accion: 'girar', valor: 90 },
            ],
        },
        {
            id: 'rotar_360',
            nombre: 'Subir y giro 360°',
            descripcion: 'Sube 50 cm, gira 360° para inspección y baja',
            pasos: [
                { accion: 'subir', valor: 50 }, { accion: 'girar', valor: 180 },
                { accion: 'girar', valor: 180 }, { accion: 'bajar', valor: 50 },
            ],
        },
        {
            id: 'ida_vuelta',
            nombre: 'Ida y vuelta 1 m',
            descripcion: 'Avanza 1 metro, gira 180° y vuelve',
            pasos: [
                { accion: 'adelante', valor: 100 }, { accion: 'girar', valor: 180 },
                { accion: 'adelante', valor: 100 }, { accion: 'girar', valor: 180 },
            ],
        },
    ];

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
    let _video = null;

    let _modoGiro = false;
    let _modoSeguimiento = false;
    let _misionEnEjecucion = false;
    let _cancelarMisionFlag = false;
    let _pasoEnEjecucion = false;
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
    // Misiones guardadas
    // ----------------------------------------------------------------
    function _misionValida(m) {
        return m && typeof m.id === 'string' && typeof m.nombre === 'string' && Array.isArray(m.pasos) && m.pasos.length > 0 &&
            m.pasos.every(p => ACCIONES_MISION.includes(p.accion) && Number.isFinite(Number(p.valor)));
    }

    function _obtenerMisiones() {
        try {
            const lista = JSON.parse(localStorage.getItem('grupo5dron_misiones') || 'null');
            if (Array.isArray(lista)) {
                const validas = lista.filter(_misionValida);
                if (validas.length) return validas;
            }
        } catch (_) { /* JSON inválido: usar las de fábrica */ }
        return MISIONES_DEFAULT;
    }

    function _guardarMisiones(lista) {
        try { localStorage.setItem('grupo5dron_misiones', JSON.stringify(lista)); } catch (_) { /* almacenamiento lleno */ }
    }

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
            _mostrarError(contenedor, `Error al crear el adaptador: ${err.message}`);
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
        }

        _agregarEventosCabina();
        _actualizarSelectMisiones();
        if (typeof DronObjetos !== 'undefined') {
            App.llenarQueSeguir(_q('#sel-que-seguir')).then(lista => { if (gen === _generacion) _objetosGuardados = lista; });
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
            _textoVideo('Sin conexión: ' + err.message);
            App.mostrarToast(err.message, 'error', 9000);
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
        if (!a.tieneVideo()) { _textoVideo('Simulador: no tiene cámara'); return; }
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
            if (a === _adaptador) _textoVideo('No se pudo abrir el video: ' + err.message);
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
        if (_misionEnEjecucion) _cancelarMision(false);
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
        on('#btn-copiar-registro-seg', _copiarRegistroSeguimiento);
        on('#btn-copiar-registro-udp', _copiarRegistroComandos);
        on('#btn-cambiar-mando', _cambiarMando);
        on('#btn-probar-cpu', _probarCuadroEnCpu);
        _q('#sel-que-seguir')?.addEventListener('change', _elegirQueSeguir);
        on('#btn-reconectar', _conectar);
        on('#btn-ir-config-dron', () => { window.location.hash = '#/config-dron'; });
        on('#btn-cab-menu', () => App.abrirMenu());
        on('#btn-cerrar-aviso-fijo', _ocultarAvisoFijo);
        on('#btn-calibrar-giro', () => {
            _giroscopio?.calibrar();
            App.mostrarToast('Listo: esta posición del celular ahora es "quieto".', 'info');
        });

        // Movimientos por paso
        const distancia = () => parseInt(_q('#sel-paso-distancia')?.value, 10) || 30;
        const angulo = () => parseInt(_q('#sel-paso-angulo')?.value, 10) || 90;
        on('#btn-paso-adelante', () => _ejecutarPaso('adelante', distancia()));
        on('#btn-paso-atras', () => _ejecutarPaso('atras', distancia()));
        on('#btn-paso-izquierda', () => _ejecutarPaso('izquierda', distancia()));
        on('#btn-paso-derecha', () => _ejecutarPaso('derecha', distancia()));
        on('#btn-paso-subir', () => _ejecutarPaso('subir', distancia()));
        on('#btn-paso-bajar', () => _ejecutarPaso('bajar', distancia()));
        on('#btn-paso-girar-der', () => _ejecutarPaso('girar', angulo()));
        on('#btn-paso-girar-izq', () => _ejecutarPaso('girar', -angulo()));
        on('#btn-paso-frenar', _frenar);

        // Misiones
        on('#btn-ejecutar-mision', _ejecutarMision);
        on('#btn-cancelar-mision', () => _cancelarMision(true));
        on('#btn-nueva-mision', _crearMision);
    }

    // ----------------------------------------------------------------
    // Despegue, aterrizaje, emergencia y freno
    // ----------------------------------------------------------------

    async function _confirmarDespegue() {
        const a = _adaptador;
        if (!a || !a.conectado) { App.mostrarToast('El dron no está conectado.', 'advertencia'); return; }
        if (a.enVuelo || _accionVuelo) return;
        if (!_hayTelemetria()) {
            App.mostrarToast('No llegan datos del dron, así que no puede despegar (aterrizaría enseguida por seguridad). Revisá la conexión en "Prueba Tello".', 'error', 9000);
            return;
        }
        if (!confirm(
            '¿Confirmar despegue?\n\n' +
            '• Asegurate de que el área esté despejada.\n' +
            '• El dron despegará al confirmar.\n' +
            '• Usá el botón EMERGENCIA si algo sale mal.'
        )) return;

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
            App.mostrarToast('No se pudo despegar: ' + err.message, 'error', 8000);
        }
        if (a !== _adaptador) return;
        _accionVuelo = false;
        _actualizarEstadoUI(final);
    }

    async function _aterrizar() {
        const a = _adaptador;
        if (!a || !a.enVuelo) { App.mostrarToast('El dron no está en vuelo.', 'info'); return; }
        if (_accionVuelo) return;
        if (_misionEnEjecucion) _cancelarMision(false);
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
            App.mostrarToast('No se pudo confirmar el aterrizaje: ' + err.message, 'error', 8000);
        }
        if (a !== _adaptador) return;
        _accionVuelo = false;
        _actualizarEstadoUI(final);
    }

    function _emergencia(motivo) {
        const a = _adaptador;
        if (!a) return;
        if (_misionEnEjecucion) _cancelarMision(false);
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

    /** Freno: rc 0 0 0 0 sin esperar respuesta. Funciona aunque haya un paso en curso. */
    function _frenar() {
        const a = _adaptador;
        if (!a || !a.enVuelo) { App.mostrarToast('El dron no está en vuelo.', 'info'); return; }
        if (_misionEnEjecucion) _cancelarMision(false);
        _apagarModosAutomaticos();
        _soltarMandos();
        a.frenar();
        const txt = _q('#estado-paso-texto');
        if (txt) txt.textContent = 'Freno enviado: el dron se queda quieto.';
    }

    // ----------------------------------------------------------------
    // Pasos y misiones
    // ----------------------------------------------------------------

    function _ejecutarAccion(a, accion, valor) {
        switch (accion) {
            case 'adelante':
            case 'atras':
            case 'izquierda':
            case 'derecha': return a.moverPaso(accion, valor);
            case 'subir': return a.subirPaso(valor);
            case 'bajar': return a.bajarPaso(valor);
            case 'girar': return a.girarPaso(valor);
            case 'esperar': return _esperarCancelable(Math.min(10, Math.max(0, Number(valor) || 0)) * 1000).then(() => 'ok');
            default: return Promise.reject(new Error(`Acción desconocida: ${accion}`));
        }
    }

    async function _esperarCancelable(ms) {
        const fin = Date.now() + ms;
        while (Date.now() < fin && !_cancelarMisionFlag) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    function _maniobraEnCurso() {
        return _pasoEnEjecucion || _misionEnEjecucion || _accionVuelo;
    }

    async function _ejecutarPaso(accion, valor) {
        const a = _adaptador;
        if (!a || !a.enVuelo) { App.mostrarToast('El dron tiene que estar en vuelo para moverse.', 'advertencia'); return; }
        if (_failsafeBloquea()) return;
        if (_maniobraEnCurso()) { App.mostrarToast('El dron todavía está haciendo otro movimiento. Esperá o tocá el botón rojo para frenarlo.', 'advertencia'); return; }

        _apagarModosAutomaticos();
        _mando?.soltarTodo();
        _pasoEnEjecucion = true;
        const txt = _q('#estado-paso-texto');
        const nombre = accion === 'girar' ? `girar ${valor > 0 ? 'derecha' : 'izquierda'} ${Math.abs(valor)}°` : `${accion} ${valor} cm`;
        if (txt) txt.textContent = `Ejecutando: ${nombre}...`;

        a.pausarRC();
        try {
            await _ejecutarAccion(a, accion, valor);
            App.textoConIcono(txt, 'check', `Listo: ${nombre}`);
        } catch (err) {
            App.textoConIcono(txt, 'cruz', err.message);
            App.mostrarToast(`El paso "${nombre}" falló: ${err.message}`, 'error', 7000);
        } finally {
            a.reanudarRC();
            _pasoEnEjecucion = false;
        }
    }

    function _actualizarSelectMisiones() {
        const sel = _q('#sel-mision-activa');
        const info = _q('#info-mision-pasos');
        if (!sel) return;
        const misiones = _obtenerMisiones();
        const previo = sel.value;
        sel.innerHTML = misiones.map(m => `<option value="${_esc(m.id)}">${_esc(m.nombre)}</option>`).join('');
        if (misiones.some(m => m.id === previo)) sel.value = previo;

        const mostrarDetalle = () => {
            const m = misiones.find(x => x.id === sel.value) || misiones[0];
            if (m && info) {
                const pasos = m.pasos.map((p, i) => `${i + 1}. ${p.accion} ${p.valor}`).join(' → ');
                info.innerHTML = `<strong>${_esc(m.nombre)}:</strong> ${_esc(m.descripcion || '')}<br><span>${_esc(pasos)}</span>`;
            }
        };
        sel.onchange = mostrarDetalle;
        mostrarDetalle();
    }

    async function _ejecutarMision() {
        const a = _adaptador;
        if (!a || !a.enVuelo) { App.mostrarToast('El dron tiene que estar en vuelo para iniciar la misión.', 'advertencia'); return; }
        if (_failsafeBloquea()) return;
        if (_maniobraEnCurso()) { App.mostrarToast('El dron todavía está haciendo otro movimiento.', 'advertencia'); return; }

        const mision = _obtenerMisiones().find(m => m.id === _q('#sel-mision-activa')?.value);
        if (!mision) { App.mostrarToast('Elegí una misión válida.', 'advertencia'); return; }
        if (!confirm(`¿Iniciar la misión "${mision.nombre}"?\n\nVerificá que haya espacio libre suficiente.`)) return;

        _apagarModosAutomaticos();
        _mando?.soltarTodo();
        _misionEnEjecucion = true;
        _cancelarMisionFlag = false;
        const btnEjecutar = _q('#btn-ejecutar-mision');
        const btnCancelar = _q('#btn-cancelar-mision');
        const info = _q('#info-mision-pasos');
        if (btnEjecutar) btnEjecutar.hidden = true;
        if (btnCancelar) btnCancelar.hidden = false;

        a.pausarRC();
        let resultado = 'completada';
        let detalleError = '';
        try {
            for (let i = 0; i < mision.pasos.length; i++) {
                if (_cancelarMisionFlag || a !== _adaptador) { resultado = 'cancelada'; break; }
                const p = mision.pasos[i];
                if (info) info.innerHTML = `<strong>Paso ${i + 1} de ${mision.pasos.length}:</strong> ${_esc(p.accion)} ${_esc(String(p.valor))} (esperando que el dron termine)...`;
                try {
                    await _ejecutarAccion(a, p.accion, p.valor);
                } catch (err) {
                    resultado = _cancelarMisionFlag ? 'cancelada' : 'fallida';
                    detalleError = `paso ${i + 1}: ${err.message}`;
                    break;
                }
                await _esperarCancelable(500); // estabilización entre pasos
            }
            if (_cancelarMisionFlag && resultado === 'completada') resultado = 'cancelada';
        } finally {
            a.reanudarRC();
            _misionEnEjecucion = false;
            _cancelarMisionFlag = false;
        }
        if (a !== _adaptador) return;
        if (btnEjecutar) btnEjecutar.hidden = false;
        if (btnCancelar) btnCancelar.hidden = true;
        _actualizarSelectMisiones();

        if (resultado === 'completada') App.mostrarToast(`Misión "${mision.nombre}" completada.`, 'exito');
        else if (resultado === 'cancelada') App.mostrarToast(`Misión "${mision.nombre}" cancelada.`, 'advertencia');
        else App.mostrarToast(`Misión "${mision.nombre}" interrumpida (${detalleError}).`, 'error', 8000);
    }

    /** @param {boolean} frenar si true, además manda rc 0 0 0 0 */
    function _cancelarMision(frenar) {
        if (!_misionEnEjecucion) return;
        _cancelarMisionFlag = true;
        if (frenar) _adaptador?.frenar();
        App.mostrarToast('Cancelando la misión: termina el paso en curso y se detiene.', 'advertencia');
    }

    function _crearMision() {
        const nombre = (prompt('Nombre de la nueva misión:', 'Patrulla del aula') || '').trim();
        if (!nombre) return;
        const texto = prompt(
            'Escribí los pasos separados por coma.\nPodés usar: ' + ACCIONES_MISION.join(', ') +
            '\n(distancias en cm; giros en grados, positivo a la derecha; esperar en segundos)\nEjemplo: adelante 50, girar 90, subir 30',
            'adelante 50, girar 90, adelante 50');
        if (!texto) return;

        const pasos = [];
        const invalidos = [];
        texto.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
            const [accion, valorTxt] = t.toLowerCase().split(/\s+/);
            const valor = parseInt(valorTxt, 10);
            if (ACCIONES_MISION.includes(accion) && Number.isFinite(valor)) pasos.push({ accion, valor });
            else invalidos.push(t);
        });
        if (invalidos.length || !pasos.length) {
            App.mostrarToast(`No se guardó la misión. Pasos no válidos: ${invalidos.join(' | ') || '(ninguno)'}`, 'error', 8000);
            return;
        }
        const lista = _obtenerMisiones().slice();
        lista.push({ id: 'm_' + Date.now(), nombre, descripcion: 'Misión personalizada', pasos });
        _guardarMisiones(lista);
        _actualizarSelectMisiones();
        _q('#sel-mision-activa').value = lista[lista.length - 1].id;
        _q('#sel-mision-activa').onchange();
        App.mostrarToast('Misión guardada.', 'exito');
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

    function _apagarSeguimiento() {
        if (!_modoSeguimiento) return;
        _modoSeguimiento = false;
        _seguimiento?.desactivar();
        _panelSeguimiento?.destruir();
        _panelSeguimiento = null;
        _mostrarEnsayo('');
        const chip = _q('#cab-chip-seguimiento');
        if (chip) chip.hidden = true;
        _actualizarBotonSeguimiento();
    }

    function _apagarModosAutomaticos() {
        _apagarGiro();
        _apagarSeguimiento();
    }

    async function _toggleGiroscopio() {
        if (!_giroscopio) return;
        if (_modoGiro) {
            _apagarGiro();
            App.mostrarToast('Giroscopio desactivado.', 'info');
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
            App.mostrarToast('Inclinación activada: inclinate el celular para avanzar y moverte de costado.', 'exito');
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
            'Sostené el celular como vas a volar y volvé a activarlo para recalibrar.', 'advertencia', 8000);
    }

    /** El lector decidió de qué sensor sale la inclinación. Con giroscopio no se avisa nada (es lo de siempre). */
    function _onFuenteInclinacion(fuente) {
        if (!_modoGiro) return;
        if (fuente === 'acelerometro') {
            App.mostrarToast('Este celular no tiene giroscopio: la inclinación se mide con el acelerómetro. ' +
                'El giro no se puede medir: para girar, usá los botones de girar.', 'advertencia', 8000);
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
        btn.textContent = _modoGiro ? '🧭 Inclinación: ON' : '🧭 Inclinación: OFF';
        btn.classList.toggle('cab-activo', _modoGiro);
    }

    // ----------------------------------------------------------------
    // Seguimiento (EXPERIMENTAL) — SOLO ENSAYO
    // Calcula los comandos que mandaría y los muestra sobre el video, pero NUNCA
    // escribe los ejes del rc. Por eso se puede usar en tierra y no interfiere con
    // los mandos ni con el giroscopio. El control real llega en la etapa S3.
    // ----------------------------------------------------------------

    async function _toggleSeguimiento() {
        if (!_seguimiento) { App.mostrarToast('El seguimiento no está disponible.', 'advertencia'); return; }
        if (_modoSeguimiento) {
            _apagarSeguimiento();
            App.mostrarToast('Ensayo apagado.', 'info');
            return;
        }
        if (_failsafeBloquea()) return;
        if (_maniobraEnCurso()) { App.mostrarToast('Esperá a que termine la maniobra en curso.', 'advertencia'); return; }
        if (!_seguimiento.modeloCargado) {
            App.mostrarToast('Preparando el seguimiento...', 'info');
            const res = await _seguimiento.inicializar();
            if (!res.ok) { App.mostrarToast(`No se pudo preparar el seguimiento: ${res.error}`, 'advertencia', 7000); return; }
            if (res.aviso) App.mostrarToast(res.aviso, 'advertencia', 8000);
        }
        _modoSeguimiento = true;
        _seguimiento.onComando = _onSeguimientoComando;
        _panelSeguimiento?.destruir();
        _panelSeguimiento = new DronSeguimiento.Panel(_q('#cab-panel-seg'));
        _seguimiento.onEstado = (nuevo) => {
            if (_modoSeguimiento && nuevo === 'perdido') App.mostrarToast('Se perdió lo que seguías: el dron se quedaría quieto.', 'advertencia', 5000);
        };
        _seguimiento.activar();
        _mostrarEnsayo('ENSAYO · buscando una persona...');
        const btnRegistro = _q('#btn-copiar-registro-seg');
        if (btnRegistro) btnRegistro.hidden = false;
        App.mostrarToast('Ensayo: la app muestra lo que haría el dron, pero no lo mueve.', 'info', 6000);
        _actualizarBotonSeguimiento();
    }

    /** Muestra (sin enviar) el comando que calcula el seguimiento, 15 veces por segundo. */
    function _onSeguimientoComando(cmd, info) {
        if (!_modoSeguimiento) return;
        _mostrarEnsayo(DronSeguimiento.textoEnsayo(cmd, info));
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

    /** "¿Qué seguir?": una persona o un objeto guardado. Si el ensayo está activo, vuelve a empezar con lo elegido. */
    async function _elegirQueSeguir() {
        const sel = _q('#sel-que-seguir');
        if (!sel || !_seguimiento) return;
        const objeto = _objetosGuardados.find(o => o.id === sel.value) || null;
        const res = await _seguimiento.elegirObjeto(objeto);
        if (!res.ok) {
            App.mostrarToast(res.error, 'advertencia', 7000);
            sel.value = 'persona';
            await _seguimiento.elegirObjeto(null);
        }
        if (_modoSeguimiento) {
            _seguimiento.desactivar();
            _seguimiento.activar();
        }
    }

    /** Modo técnico: el mismo cuadro con WebGL y con CPU (pausa el ensayo unos segundos). */
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

    /** Copia el registro por cuadro del último ensayo (CSV separado por ";"). */
    async function _copiarRegistroSeguimiento() {
        const filas = _seguimiento?.registro.length || 0;
        if (!filas) { App.mostrarToast('Todavía no hay registro: activá el ensayo un rato.', 'info'); return; }
        const ok = await DronSeguimiento.copiarTexto(_seguimiento.registroCSV());
        App.mostrarToast(ok ? `Registro copiado (${filas} cuadros).` : 'No se pudo copiar el registro.', ok ? 'exito' : 'advertencia');
    }

    function _mostrarEnsayo(texto) {
        const caja = _q('#cab-ensayo');
        if (!caja) return;
        caja.textContent = texto;
        caja.hidden = !texto;
    }

    function _actualizarBotonSeguimiento() {
        const btn = _q('#btn-toggle-seguimiento');
        if (!btn) return;
        App.textoConIcono(btn, 'objetivo', _modoSeguimiento ? 'Ensayo: ON' : 'Ensayo: OFF');
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
        if (acciones.length && _maniobraEnCurso()) {
            _mando.soltarTodo(); // vuelve a llamar con los ejes en 0
            if (Date.now() - _avisoManiobraTs > 3000) {
                _avisoManiobraTs = Date.now();
                App.mostrarToast('El dron todavía está haciendo otro movimiento. Esperá o tocá el botón rojo para frenarlo.', 'advertencia');
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
            _adaptador?.actualizarEjes({ ud: y, yaw: x });
        };
        _joystickIzq.onRelease = () => {
            _adaptador?.actualizarEjes({ ud: 0, yaw: 0 });
        };
        _joystickDer.onChange = ({ x, y }) => {
            if (_modoGiro) return; // en ese modo lo maneja el giroscopio
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
            <h2 class="seccion-titulo mb-md">Control del Dron</h2>
            <div class="tarjeta tarjeta--acento texto-centro">
                <div style="margin-bottom: var(--espacio-md);">${App.icono('alerta', 'ico--grande')}</div>
                <h3 class="tarjeta__titulo">Error</h3>
                <p class="texto-sm texto-secundario mb-lg">${_esc(mensaje)}</p>
                <a href="#/config-dron" class="btn btn--primario">${App.icono('llave-ajuste')} Ir a Configuración del dron</a>
            </div>
        </div>`;
    }

    function _esc(str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ----------------------------------------------------------------
    // Plantilla de la cabina
    // ----------------------------------------------------------------

    function _plantillaCabina() {
        return `
        <div class="dron-pagina cabina">
            <!-- Barra superior: nombre del perfil (y en el modo técnico, más telemetría) -->
            <div class="cab-barra">
                <button id="btn-cab-menu" class="cab-btn-menu" aria-label="Abrir menú">${App.icono('menu')}</button>
                <p class="etiqueta cab-titulo">Cabina · <span id="nombre-perfil-activo">—</span></p>
                <div class="cab-datos-tecnicos solo-tecnico" id="panel-telemetria">
                    <span>Velocidad <b id="tel-velocidad-valor">-- cm/s</b></span>
                    <span>Motores <b id="tel-tiempo-valor">-- s</b></span>
                </div>
            </div>

            <!-- EMERGENCIA: fija y siempre visible -->
            <button id="btn-emergencia" class="cab-emergencia" disabled>${App.icono('alto')} EMERGENCIA</button>

            <!-- Aviso fijo (por ejemplo, failsafe sin aterrizaje confirmado) -->
            <div id="cab-aviso-fijo" class="cab-aviso-fijo" role="alert" hidden>
                ${App.icono('alerta')}
                <span id="cab-aviso-fijo-texto"></span>
                <button id="btn-cerrar-aviso-fijo" class="btn btn--secundario">Entendido</button>
            </div>

            <!-- Zona principal: mando izquierdo | video | mando derecho (botones de mantener apretado o joysticks) -->
            <div class="cab-principal">
                <div class="cab-lado cab-lado--izq">
                    <div class="cab-botones">
                        <button id="btn-despegar" class="btn btn--primario" disabled>${App.icono('despegar')} Despegar</button>
                        <button id="btn-aterrizar" class="btn btn--secundario" disabled>${App.icono('aterrizar')} Aterrizar</button>
                    </div>
                    <div class="cab-mando">
                        <span class="cab-joy-etq">Subir y bajar · Girar</span>
                        <div class="cab-cruz cab-cruz--mantener">
                            <span></span><button class="btn btn--secundario cab-mantener" data-mover="subir" aria-label="Subir" title="Subir" disabled>${App.icono('chevron-arriba')}</button><span></span>
                            <button class="btn btn--secundario cab-mantener" data-mover="girar-izq" aria-label="Girar a la izquierda" title="Girar a la izquierda" disabled>${App.icono('girar-izq')}</button><span></span><button class="btn btn--secundario cab-mantener" data-mover="girar-der" aria-label="Girar a la derecha" title="Girar a la derecha" disabled>${App.icono('girar-der')}</button>
                            <span></span><button class="btn btn--secundario cab-mantener" data-mover="bajar" aria-label="Bajar" title="Bajar" disabled>${App.icono('chevron-abajo')}</button><span></span>
                        </div>
                    </div>
                    <div class="cab-joystick" hidden>
                        <span class="cab-joy-etq">${App.icono('flechas-v')} Subir y bajar · ${App.icono('flechas-h')} Girar</span>
                        <div id="joystick-izquierdo"></div>
                    </div>
                </div>

                <div class="cab-video">
                    <canvas id="canvas-video" width="960" height="720"></canvas>
                    <canvas id="canvas-seguimiento"></canvas>
                    <div id="overlay-video-off" class="cab-video__aviso">Sin señal de video</div>
                    <!-- Estados sobre la imagen -->
                    <div class="sobre-imagen">
                        <div class="sobre-imagen__grupo">
                            <span id="estado-conexion" class="chip"><span class="punto punto--advertencia" aria-hidden="true"></span>Conectando...</span>
                            <span id="estado-telemetria" class="chip chip--alerta" hidden><span class="punto punto--alerta" aria-hidden="true"></span>Sin datos del dron</span>
                            <span id="cab-chip-seguimiento" class="chip" hidden></span>
                        </div>
                        <div class="sobre-imagen__grupo sobre-imagen__grupo--der">
                            <span class="chip chip--dato" title="Batería"><span id="tel-bateria-icono" class="punto" aria-hidden="true"></span><span class="chip__etq">Bat.</span><span id="tel-bateria-valor">--%</span></span>
                            <span class="chip chip--dato" title="Altura"><span class="chip__etq">Alt.</span><span id="tel-altura-valor">-- cm</span></span>
                        </div>
                    </div>
                    <div id="cab-ensayo" class="cartel-ensayo" hidden></div>
                </div>

                <!-- Velocidad de los botones (arranca siempre en Lenta) -->
                <div id="cab-velocidad" class="cab-velocidad">
                    <div class="cab-velocidad__selector" role="group" aria-label="Velocidad">
                        <span class="cab-velocidad__etq">Velocidad</span>
                        <button class="btn btn--secundario cab-vel" data-velocidad="lenta" aria-pressed="true">Lenta</button>
                        <button class="btn btn--secundario cab-vel" data-velocidad="normal" aria-pressed="false">Normal</button>
                        <button class="btn btn--secundario cab-vel" data-velocidad="rapida" aria-pressed="false">Rápida</button>
                    </div>
                    <p class="cab-ayuda-mando">Mantené apretado para mover el dron; soltá para frenar.</p>
                </div>

                <div class="cab-lado cab-lado--der">
                    <div class="cab-botones">
                        <button id="btn-toggle-giro" class="btn btn--secundario">🧭 Inclinación: OFF</button>
                        <button id="btn-toggle-seguimiento" class="btn btn--secundario">${App.icono('objetivo')} Ensayo: OFF</button>
                    </div>
                    <div class="cab-mando">
                        <span class="cab-joy-etq">Avanzar · De costado</span>
                        <div class="cab-cruz cab-cruz--mantener">
                            <span></span><button class="btn btn--secundario cab-mantener" data-mover="adelante" aria-label="Adelante" title="Adelante" disabled>${App.icono('tri-arriba')}</button><span></span>
                            <button class="btn btn--secundario cab-mantener" data-mover="izquierda" aria-label="Izquierda" title="Izquierda" disabled>${App.icono('tri-izq')}</button><span></span><button class="btn btn--secundario cab-mantener" data-mover="derecha" aria-label="Derecha" title="Derecha" disabled>${App.icono('tri-der')}</button>
                            <span></span><button class="btn btn--secundario cab-mantener" data-mover="atras" aria-label="Atrás" title="Atrás" disabled>${App.icono('tri-abajo')}</button><span></span>
                        </div>
                    </div>
                    <div class="cab-joystick" hidden>
                        <span class="cab-joy-etq">${App.icono('flechas-v')} Avanzar · ${App.icono('flechas-h')} De costado</span>
                        <div id="joystick-derecho"></div>
                    </div>
                </div>
            </div>

            <!-- Modo técnico: detalle del seguimiento, lo que ve el modelo, prueba en CPU y registro -->
            <section class="cab-panel solo-tecnico">
                <p class="etiqueta">Modo técnico · Seguimiento</p>
                <ul class="ayuda-tecnica">
                    <li><b>Lo que ve el modelo:</b> la imagen que analiza el detector, con todo lo que encuentra y su puntaje (desde el 10 %).</li>
                    <li><b>Probar este cuadro en CPU:</b> analiza la misma imagen con la placa de video (WebGL) y con el procesador (CPU) para ver si la placa analiza mal.</li>
                    <li><b>Copiar registro:</b> copia una tabla (CSV) con cada imagen analizada, para mandarla y revisarla.</li>
                </ul>
                <div class="detalle-seguimiento">
                    <figure class="miniatura-modelo">
                        <canvas id="cab-miniatura" width="160" height="120"></canvas>
                        <figcaption>Lo que ve el modelo</figcaption>
                    </figure>
                    <div id="cab-panel-seg" class="detalle-seguimiento__panel" data-vacio="Activá el ensayo para ver el detalle."></div>
                </div>
                <div class="par-botones mt-sm">
                    <button id="btn-probar-cpu" class="btn btn--secundario">${App.icono('probeta')} Probar este cuadro en CPU</button>
                    <button id="btn-copiar-registro-seg" class="btn btn--secundario" hidden>${App.icono('copiar')} Copiar registro</button>
                </div>
                <pre id="cab-resultado-cpu" class="panel-seguimiento mt-sm" hidden></pre>
            </section>

            <!-- Modo técnico: joysticks en lugar de los botones -->
            <section class="cab-panel solo-tecnico">
                <p class="etiqueta">Modo técnico · Mandos</p>
                <ul class="ayuda-tecnica">
                    <li><b>Usar joysticks:</b> cambia los botones por las palancas de antes (mueven según cuánto las corrés: son más sensibles). Al salir de la cabina vuelven los botones.</li>
                </ul>
                <div class="par-botones mt-sm">
                    <button id="btn-cambiar-mando" class="btn btn--secundario">Usar joysticks</button>
                </div>
            </section>

            <!-- Modo técnico: comandos y respuestas del dron -->
            <section class="cab-panel solo-tecnico">
                <p class="etiqueta">Modo técnico · Conexión</p>
                <ul class="ayuda-tecnica">
                    <li><b>Copiar registro de comandos:</b> copia cada orden que se mandó al dron y cada respuesta que llegó, con su puerto (UDP), para revisar la conexión.</li>
                </ul>
                <div class="par-botones mt-sm">
                    <button id="btn-copiar-registro-udp" class="btn btn--secundario">${App.icono('copiar')} Copiar registro de comandos</button>
                </div>
            </section>

            <div class="cab-acciones">
                <button id="btn-reconectar" class="btn btn--primario" hidden>${App.icono('recargar')} Reconectar</button>
                <button id="btn-ir-config-dron" class="btn btn--secundario">${App.icono('llave-ajuste')} Config. dron</button>
            </div>

            <!-- Inclinación y seguimiento -->
            <section class="cab-panel">
                <p class="etiqueta">01 — Inclinación y seguimiento</p>
                <h3 class="cab-panel__titulo">Inclinación y seguimiento</h3>
                <p class="cab-ayuda">Inclinación: movés el dron inclinando el celular. Sostené el celular como lo vas a usar y tocá Calibrar: esa posición será "quieto".</p>
                <p class="cab-ayuda">Seguimiento (ensayo): la app busca lo que elijas y muestra qué haría el dron, pero no lo mueve.</p>
                <div class="cab-opciones">
                    <button id="btn-calibrar-giro" class="btn btn--secundario">${App.icono('objetivo')} Calibrar</button>
                    <label>¿Qué seguir?
                        <select id="sel-que-seguir" class="cab-select"><option value="persona">Una persona</option></select>
                    </label>
                </div>
            </section>

            <!-- Movimientos por paso -->
            <section class="cab-panel">
                <p class="etiqueta">02 — Por pasos</p>
                <h3 class="cab-panel__titulo">Movimientos por paso</h3>
                <p class="cab-ayuda">Cada botón mueve el dron la distancia elegida y lo deja quieto. El botón rojo lo frena.</p>
                <div class="cab-opciones">
                    <label>Distancia
                        <select id="sel-paso-distancia" class="cab-select">
                            <option value="20">20 cm</option>
                            <option value="30" selected>30 cm</option>
                            <option value="50">50 cm</option>
                            <option value="100">100 cm</option>
                        </select>
                    </label>
                    <label>Giro
                        <select id="sel-paso-angulo" class="cab-select">
                            <option value="45">45°</option>
                            <option value="90" selected>90°</option>
                            <option value="180">180°</option>
                        </select>
                    </label>
                </div>
                <div class="cab-pasos">
                    <div class="cab-cruz">
                        <span></span>
                        <button id="btn-paso-adelante" class="btn btn--secundario" aria-label="Adelante">${App.icono('tri-arriba')}</button>
                        <span></span>
                        <button id="btn-paso-izquierda" class="btn btn--secundario" aria-label="Izquierda">${App.icono('tri-izq')}</button>
                        <button id="btn-paso-frenar" class="btn btn--peligro" aria-label="Frenar">${App.icono('detener')}</button>
                        <button id="btn-paso-derecha" class="btn btn--secundario" aria-label="Derecha">${App.icono('tri-der')}</button>
                        <span></span>
                        <button id="btn-paso-atras" class="btn btn--secundario" aria-label="Atrás">${App.icono('tri-abajo')}</button>
                        <span></span>
                    </div>
                    <div class="cab-pasos__extra">
                        <button id="btn-paso-subir" class="btn btn--secundario">${App.icono('chevron-arriba')} Subir</button>
                        <button id="btn-paso-bajar" class="btn btn--secundario">${App.icono('chevron-abajo')} Bajar</button>
                        <button id="btn-paso-girar-izq" class="btn btn--secundario">${App.icono('girar-izq')} Girar izq.</button>
                        <button id="btn-paso-girar-der" class="btn btn--secundario">${App.icono('girar-der')} Girar der.</button>
                    </div>
                </div>
                <p id="estado-paso-texto" class="cab-panel__estado">Listo. El botón rojo del centro frena.</p>
            </section>

            <!-- Misiones -->
            <section class="cab-panel">
                <p class="etiqueta">03 — Automático</p>
                <h3 class="cab-panel__titulo">Misiones</h3>
                <p class="cab-ayuda">Una lista de pasos que el dron hace solo. Elegí una y tocá Iniciar; Cancelar la frena.</p>
                <div class="cab-mision">
                    <select id="sel-mision-activa" class="cab-select" aria-label="Misión"></select>
                    <button id="btn-ejecutar-mision" class="btn btn--primario">${App.icono('play')} Iniciar</button>
                    <button id="btn-cancelar-mision" class="btn btn--peligro" hidden>${App.icono('alto')} Cancelar misión</button>
                    <button id="btn-nueva-mision" class="btn btn--secundario">${App.icono('mas')} Nueva</button>
                </div>
                <div id="info-mision-pasos" class="cab-panel__estado"></div>
            </section>

            <p class="cab-nota">
                ${App.icono('escudo')} Vuelo supervisado, con 3×3 m libres de personas. El seguimiento está en ensayo: muestra los comandos, no los envía.
            </p>
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
        _cancelarMisionFlag = true;
        if (_giroscopio) { _giroscopio.desactivar(); _giroscopio = null; }
        if (_seguimiento) { _seguimiento.desactivar(); _seguimiento = null; }
        _panelSeguimiento = null;
        if (_mando) { _mando.destruir(); _mando = null; }
        _usarJoysticks = false;
        if (_joystickIzq) { _joystickIzq.destruir(); _joystickIzq = null; }
        if (_joystickDer) { _joystickDer.destruir(); _joystickDer = null; }
        if (_video) { _video.destruir(); _video = null; }

        const a = _adaptador;
        _adaptador = null;
        _misionEnEjecucion = false;
        _pasoEnEjecucion = false;
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
                    App.mostrarToast('Al salir de la cabina no se pudo confirmar el aterrizaje: ' + err.message, 'error', 9000);
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
