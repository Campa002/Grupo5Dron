/**
 * Módulo de Control de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Cabina de vuelo táctil. Integra:
 *  - DronAdaptadores  (dron-adaptadores.js)
 *  - DronJoystick     (dron-joystick.js)
 *  - DronGiroscopio   (dron-giroscopio.js)
 *  - DronSeguimiento  (dron-seguimiento.js)  [EXPERIMENTAL]
 *  - DronVideoDecoder (dron-video.js)
 *  - ConfigDron       (config-dron.js)
 *
 * Reglas de seguridad:
 *  - Giroscopio y seguimiento DESACTIVADOS al iniciar; al apagarlos, sus ejes vuelven a cero.
 *  - Botón de EMERGENCIA fijo y siempre visible (vertical y horizontal).
 *  - Confirmación explícita antes de despegar; no se despega si no llega telemetría.
 *  - Failsafe: sin telemetría en vuelo por más del tiempo configurado → freno (rc 0 0 0 0) y aterrizaje.
 *    Si el aterrizaje no se confirma, se reintenta una vez y se avisa (no se cortan motores solos).
 *  - Durante un paso o una misión se pausa el rc continuo para no interrumpirlos.
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
    let _joystickIzq = null;
    let _joystickDer = null;
    let _giroscopio = null;
    let _seguimiento = null;
    let _video = null;

    let _modoGiro = false;
    let _modoSeguimiento = false;
    let _misionEnEjecucion = false;
    let _cancelarMisionFlag = false;
    let _pasoEnEjecucion = false;
    let _accionVuelo = false;      // despegue o aterrizaje en curso

    let _watchdogId = null;
    let _failsafeActivado = false;
    let _esperandoVueltaTelemetria = false; // failsafe sin aterrizaje confirmado: reintentar si vuelve el enlace
    let _nivelAvisoBateria = 0;    // 0 = sin aviso, 1 = ≤25 %, 2 = ≤10 %

    let _contenedor = null;
    let _generacion = 0;           // cambia al salir de la cabina: corta inicializaciones a medias
    let _onResize = null;
    let _timerResize = null;
    let _tamanoJoystick = 0;

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
        if (!perfil) {
            _mostrarSinPerfil(contenedor);
            return;
        }

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

        _inicializarJoysticks();
        _onResize = () => {
            clearTimeout(_timerResize);
            _timerResize = setTimeout(() => {
                if (Math.abs(_calcularTamanoJoystick() - _tamanoJoystick) > 8) _inicializarJoysticks();
            }, 250);
        };
        window.addEventListener('resize', _onResize);

        _giroscopio = new DronGiroscopio({ onChange: _onGiroscopioCambio });

        if (typeof DronSeguimiento !== 'undefined') {
            _seguimiento = new DronSeguimiento({
                videoEl: _q('#canvas-video'),
                canvasDebug: _q('#canvas-seguimiento'),
            });
        }

        _agregarEventosCabina();
        _actualizarSelectMisiones();
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
        _textoVideo('📷 Conectando...');
        try {
            await a.conectar();
        } catch (err) {
            if (a !== _adaptador) return;
            _actualizarEstadoUI('desconectado');
            _textoVideo('🔴 ' + err.message);
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
        if (!a.tieneVideo()) { _textoVideo('🎮 Simulador: sin video'); return; }
        if (typeof DronVideoDecoder === 'undefined') { _textoVideo('⚠ Falta el módulo de video'); return; }

        _video = new DronVideoDecoder({
            canvasEl: _q('#canvas-video'),
            onFrameRendered: (n) => { if (n === 1) _textoVideo(''); },
        });
        if (!_video.soportaWebCodecs) { _textoVideo('⚠ Este WebView no soporta WebCodecs: no hay video'); return; }

        _textoVideo('📷 Esperando video del Tello...');
        try {
            const ok = await a.iniciarVideo(d => _video?.procesarChunk(d?.data));
            if (a === _adaptador && !ok) _textoVideo('📷 El Tello no confirmó "streamon"');
        } catch (err) {
            if (a === _adaptador) _textoVideo('📷 No se pudo abrir el video: ' + err.message);
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
        App.mostrarToast('Failsafe activo: solo se puede usar Aterrizar o EMERGENCIA.', 'advertencia');
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
        _joystickIzq?.centrar();
        _joystickDer?.centrar();
        // 2. Desde acá no sale ningún comando automático (ni rc continuo ni keep-alive).
        //    Si el enlace está caído a medias, así el Tello activa su aterrizaje automático (~15 s sin comandos).
        a.suspenderEnviosAutomaticos();
        App.mostrarToast(`⚠ FAILSAFE: sin telemetría hace ${(msSinTelemetria / 1000).toFixed(1)} s. Frenando y aterrizando...`, 'error', 8000);

        // 3. Dos intentos de "land"
        _accionVuelo = true;
        _actualizarEstadoUI('aterrizando');
        for (let intento = 1; intento <= 2; intento++) {
            try {
                await a.aterrizar(10000);
                if (a !== _adaptador) return;
                _accionVuelo = false;
                _actualizarEstadoUI('conectado');
                App.mostrarToast('Failsafe: aterrizaje confirmado.', 'advertencia', 6000);
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
            _mostrarAvisoFijo('⚠ El dron no confirmó el aterrizaje. La app dejó de mandar comandos para que el Tello ' +
                'aterrice solo (lo hace a los ~15 s sin comandos). Si sigue en el aire, usá EMERGENCIA o Aterrizar. ' +
                'Si vuelve la conexión, se reintenta el aterrizaje automáticamente.');
        }
    }

    /** El enlace volvió después de un failsafe sin aterrizaje confirmado: un nuevo intento de "land". */
    async function _reintentarAterrizajeFailsafe() {
        const a = _adaptador;
        if (!a) return;
        App.mostrarToast('Volvió la telemetría: reintentando el aterrizaje del failsafe...', 'advertencia', 6000);
        _accionVuelo = true;
        _actualizarEstadoUI('aterrizando');
        try {
            await a.aterrizar(10000);
            if (a !== _adaptador) return;
            _accionVuelo = false;
            _ocultarAvisoFijo();
            _actualizarEstadoUI('conectado');
            App.mostrarToast('Failsafe: aterrizaje confirmado.', 'advertencia', 6000);
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
        on('#btn-reconectar', _conectar);
        on('#btn-ir-config-dron', () => { window.location.hash = '#/config-dron'; });
        on('#btn-cab-menu', () => App.abrirMenu());
        on('#btn-cerrar-aviso-fijo', _ocultarAvisoFijo);
        on('#btn-calibrar-giro', () => {
            _giroscopio?.calibrar();
            App.mostrarToast('Giroscopio calibrado: la posición actual del teléfono es el "centro".', 'info');
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
            App.mostrarToast('No llega telemetría del dron (puerto 8890): no se puede despegar, porque el failsafe lo haría aterrizar enseguida. Revisá la conexión en "Prueba Tello".', 'error', 9000);
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
        _joystickIzq?.centrar();
        _joystickDer?.centrar();
        a.detenerEmergencia()
            .catch(err => console.error('[Dron] Error enviando emergencia:', err))
            .finally(() => {
                if (a !== _adaptador) return;
                _accionVuelo = false;
                _ocultarAvisoFijo();
                _actualizarEstadoUI(a.conectado ? 'conectado' : 'desconectado');
                App.mostrarToast(`⛔ ${motivo}: motores apagados.`, 'error', 6000);
            });
    }

    /** Freno: rc 0 0 0 0 sin esperar respuesta. Funciona aunque haya un paso en curso. */
    function _frenar() {
        const a = _adaptador;
        if (!a || !a.enVuelo) { App.mostrarToast('El dron no está en vuelo.', 'info'); return; }
        if (_misionEnEjecucion) _cancelarMision(false);
        _apagarModosAutomaticos();
        _joystickIzq?.centrar();
        _joystickDer?.centrar();
        a.frenar();
        const txt = _q('#estado-paso-texto');
        if (txt) txt.textContent = '⏹ Freno: rc 0 0 0 0 enviado';
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
        if (_maniobraEnCurso()) { App.mostrarToast('Hay otra maniobra en curso. Esperá a que termine o usá el freno.', 'advertencia'); return; }

        _apagarModosAutomaticos();
        _pasoEnEjecucion = true;
        const txt = _q('#estado-paso-texto');
        const nombre = accion === 'girar' ? `girar ${valor > 0 ? 'derecha' : 'izquierda'} ${Math.abs(valor)}°` : `${accion} ${valor} cm`;
        if (txt) txt.textContent = `⏳ Ejecutando: ${nombre}...`;

        a.pausarRC();
        try {
            await _ejecutarAccion(a, accion, valor);
            if (txt) txt.textContent = `✅ Listo: ${nombre}`;
        } catch (err) {
            if (txt) txt.textContent = `❌ ${err.message}`;
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
        if (_maniobraEnCurso()) { App.mostrarToast('Hay otra maniobra en curso.', 'advertencia'); return; }

        const mision = _obtenerMisiones().find(m => m.id === _q('#sel-mision-activa')?.value);
        if (!mision) { App.mostrarToast('Elegí una misión válida.', 'advertencia'); return; }
        if (!confirm(`¿Iniciar la misión "${mision.nombre}"?\n\nVerificá que haya espacio libre suficiente.`)) return;

        _apagarModosAutomaticos();
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
                if (info) info.innerHTML = `⏳ <strong>Paso ${i + 1}/${mision.pasos.length}:</strong> ${_esc(p.accion)} ${_esc(String(p.valor))} (esperando "ok" del dron)...`;
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
        App.mostrarToast('🛑 Cancelando la misión: termina el paso en curso y se detiene.', 'advertencia');
    }

    function _crearMision() {
        const nombre = (prompt('Nombre de la nueva misión:', 'Patrulla del aula') || '').trim();
        if (!nombre) return;
        const texto = prompt(
            'Pasos separados por coma.\nAcciones: ' + ACCIONES_MISION.join(', ') +
            '\n(distancias en cm, giros en grados con signo, esperar en segundos)\nEjemplo: adelante 50, girar 90, subir 30',
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
        _actualizarBotonGiro();
    }

    function _apagarSeguimiento() {
        if (!_modoSeguimiento) return;
        _modoSeguimiento = false;
        _seguimiento?.desactivar();
        _adaptador?.actualizarEjes({ lr: 0, ud: 0 });
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
        _apagarSeguimiento();
        const resultado = await _giroscopio.activar();
        if (resultado.ok) {
            _modoGiro = true;
            _adaptador?.actualizarEjes({ lr: 0, fb: 0 });
            _joystickDer?.centrar();
            App.mostrarToast('Giroscopio activado: inclinate para controlar avance y lateral.', 'exito');
        } else {
            let msg = 'No se pudo activar el giroscopio.';
            if (resultado.motivo === 'permiso_denegado') msg = 'Permiso del giroscopio denegado. Habilitalo en los ajustes.';
            if (resultado.motivo === 'no_disponible') msg = 'Este dispositivo no tiene giroscopio.';
            App.mostrarToast(msg, 'advertencia');
        }
        _actualizarBotonGiro();
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
        btn.textContent = _modoGiro ? '🧭 Giro: ON' : '🧭 Giro: OFF';
        btn.classList.toggle('cab-activo', _modoGiro);
    }

    // ----------------------------------------------------------------
    // Seguimiento (EXPERIMENTAL)
    // ----------------------------------------------------------------

    async function _toggleSeguimiento() {
        if (!_seguimiento) { App.mostrarToast('El seguimiento no está disponible.', 'advertencia'); return; }
        if (_modoSeguimiento) {
            _apagarSeguimiento();
            App.mostrarToast('Seguimiento desactivado.', 'info');
            return;
        }
        if (_failsafeBloquea()) return;
        if (_maniobraEnCurso()) { App.mostrarToast('Esperá a que termine la maniobra en curso.', 'advertencia'); return; }
        if (!_seguimiento.modeloCargado) {
            App.mostrarToast('Cargando el modelo de seguimiento...', 'info');
            const res = await _seguimiento.inicializar();
            if (!res.ok) { App.mostrarToast('No se pudo cargar el modelo de seguimiento.', 'advertencia'); return; }
            if (res.aviso) App.mostrarToast(res.aviso, 'advertencia', 6000);
        }
        _apagarGiro();
        _modoSeguimiento = true;
        _seguimiento.onOffset = _onSeguimientoOffset;
        _seguimiento.onPerdida = () => { if (_modoSeguimiento) _adaptador?.actualizarEjes({ lr: 0, ud: 0 }); };
        _seguimiento.activar('person');
        App.mostrarToast('⚠ Seguimiento EXPERIMENTAL activado: supervisión humana obligatoria.', 'advertencia');
        _actualizarBotonSeguimiento();
    }

    function _onSeguimientoOffset({ dx, dy }) {
        if (!_modoSeguimiento || !_adaptador || !_adaptador.enVuelo) return;
        const sensibilidad = 0.5;
        _adaptador.actualizarEjes({ lr: dx * sensibilidad, ud: -dy * sensibilidad });
    }

    function _actualizarBotonSeguimiento() {
        const btn = _q('#btn-toggle-seguimiento');
        if (!btn) return;
        btn.textContent = _modoSeguimiento ? '🎯 Seguir: ON' : '🎯 Seguir: OFF';
        btn.classList.toggle('cab-activo', _modoSeguimiento);
    }

    // ----------------------------------------------------------------
    // Joysticks
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
            if (_modoSeguimiento) _adaptador?.actualizarEjes({ yaw: x });   // el seguimiento maneja la altura
            else _adaptador?.actualizarEjes({ ud: y, yaw: x });
        };
        _joystickIzq.onRelease = () => {
            if (_modoSeguimiento) _adaptador?.actualizarEjes({ yaw: 0 });
            else _adaptador?.actualizarEjes({ ud: 0, yaw: 0 });
        };
        _joystickDer.onChange = ({ x, y }) => {
            if (_modoGiro || _modoSeguimiento) return; // en esos modos lo maneja el sensor
            _adaptador?.actualizarEjes({ lr: x, fb: y });
        };
        _joystickDer.onRelease = () => {
            if (_modoGiro || _modoSeguimiento) return;
            _adaptador?.actualizarEjes({ lr: 0, fb: 0 });
        };
    }

    // ----------------------------------------------------------------
    // Telemetría
    // ----------------------------------------------------------------

    function _actualizarPanelTelemetria(tel) {
        const fmt = (v, sufijo) => (v === null || v === undefined || Number.isNaN(Number(v))) ? `--${sufijo}` : `${Math.round(v)}${sufijo}`;
        const set = (sel, txt) => { const e = _q(sel); if (e) e.textContent = txt; };
        set('#tel-bateria-valor', fmt(tel.bateria, '%'));
        set('#tel-altura-valor', fmt(tel.altura, ' cm'));
        set('#tel-velocidad-valor', fmt(tel.velocidad, ' cm/s'));
        set('#tel-tiempo-valor', fmt(tel.tiempoVuelo, ' s'));

        const icono = _q('#tel-bateria-icono');
        if (tel.bateria === null || tel.bateria === undefined) {
            if (icono) icono.textContent = '⚪';
            return;
        }
        const bat = Number(tel.bateria);
        if (icono) icono.textContent = bat <= 10 ? '🔴' : bat <= 25 ? '🟡' : '🟢';

        // Avisos de batería: una sola vez por nivel
        const nivel = bat <= 10 ? 2 : bat <= 25 ? 1 : 0;
        if (nivel > _nivelAvisoBateria && _adaptador?.enVuelo) {
            App.mostrarToast(nivel === 2 ? `🔴 Batería crítica: ${Math.round(bat)}%. Aterrizá ya.` : `🟡 Batería baja: ${Math.round(bat)}%. Pensá en aterrizar.`,
                nivel === 2 ? 'error' : 'advertencia', 8000);
        }
        if (nivel > _nivelAvisoBateria || nivel === 0) _nivelAvisoBateria = nivel;
    }

    // ----------------------------------------------------------------
    // Estado de la interfaz
    // ----------------------------------------------------------------

    function _actualizarEstadoUI(estado) {
        const textos = {
            conectando: '🟡 Conectando...',
            conectado: '🟢 Conectado (en tierra)',
            despegando: '🔵 Despegando...',
            en_vuelo: '🔵 En vuelo',
            aterrizando: '🔵 Aterrizando...',
            failsafe: '🟠 Failsafe: sin enviar comandos',
            desconectado: '🔴 Desconectado',
        };
        const span = _q('#estado-conexion');
        if (span) span.textContent = textos[estado] || estado;

        const btnDespegar = _q('#btn-despegar');
        const btnAterrizar = _q('#btn-aterrizar');
        const btnEmergencia = _q('#btn-emergencia');
        const btnReconectar = _q('#btn-reconectar');
        if (btnDespegar) btnDespegar.disabled = estado !== 'conectado';
        if (btnAterrizar) btnAterrizar.disabled = estado !== 'en_vuelo' && estado !== 'failsafe';
        // La emergencia queda habilitada siempre que exista un adaptador (aunque la conexión falle)
        if (btnEmergencia) btnEmergencia.disabled = !_adaptador;
        if (btnReconectar) btnReconectar.hidden = estado !== 'desconectado';
        if (estado === 'desconectado') { const m = _q('#estado-telemetria'); if (m) m.hidden = true; }
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
    // Pantallas sin perfil / error
    // ----------------------------------------------------------------

    function _mostrarSinPerfil(contenedor) {
        contenedor.innerHTML = `
        <div class="dron-pagina">
            <h2 class="seccion-titulo mb-md">🚁 Control del Dron</h2>
            <div class="tarjeta tarjeta--acento texto-centro">
                <div style="font-size:3rem; margin-bottom: var(--espacio-md);">⚙️</div>
                <h3 class="tarjeta__titulo">No hay perfil de dron seleccionado</h3>
                <p class="texto-sm texto-secundario mb-lg">Antes de volar, elegí un perfil en Configuración del dron.</p>
                <a href="#/config-dron" class="btn btn--primario">🔧 Ir a Configuración del dron</a>
            </div>
        </div>`;
    }

    function _mostrarError(contenedor, mensaje) {
        contenedor.innerHTML = `
        <div class="dron-pagina">
            <h2 class="seccion-titulo mb-md">🚁 Control del Dron</h2>
            <div class="tarjeta tarjeta--acento texto-centro">
                <div style="font-size:3rem; margin-bottom: var(--espacio-md);">⚠️</div>
                <h3 class="tarjeta__titulo">Error</h3>
                <p class="texto-sm texto-secundario mb-lg">${_esc(mensaje)}</p>
                <a href="#/config-dron" class="btn btn--primario">🔧 Ir a Configuración del dron</a>
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
            <!-- Barra superior: estado y telemetría -->
            <div class="cab-barra">
                <button id="btn-cab-menu" class="cab-btn-menu" aria-label="Abrir menú">☰</button>
                <div class="cab-estado">
                    <span id="estado-conexion">🟡 Conectando...</span>
                    <span id="estado-telemetria" class="cab-sin-tel" hidden>🟠 Sin telemetría</span>
                    <span class="cab-perfil">Perfil: <strong id="nombre-perfil-activo">—</strong></span>
                </div>
                <div class="cab-telemetria" id="panel-telemetria">
                    <div class="cab-dato"><b><span id="tel-bateria-icono">⚪</span> <span id="tel-bateria-valor">--%</span></b><small>Batería</small></div>
                    <div class="cab-dato"><b id="tel-altura-valor">-- cm</b><small>Altura</small></div>
                    <div class="cab-dato"><b id="tel-velocidad-valor">-- cm/s</b><small>Velocidad</small></div>
                    <div class="cab-dato"><b id="tel-tiempo-valor">-- s</b><small>Motores</small></div>
                </div>
            </div>

            <!-- EMERGENCIA: fija y siempre visible -->
            <button id="btn-emergencia" class="cab-emergencia" disabled>⛔ EMERGENCIA</button>

            <!-- Aviso fijo (por ejemplo, failsafe sin aterrizaje confirmado) -->
            <div id="cab-aviso-fijo" class="cab-aviso-fijo" role="alert" hidden>
                <span id="cab-aviso-fijo-texto"></span>
                <button id="btn-cerrar-aviso-fijo" class="btn btn--secundario">Entendido</button>
            </div>

            <!-- Zona principal: joystick izquierdo | video | joystick derecho -->
            <div class="cab-principal">
                <div class="cab-lado cab-lado--izq">
                    <div class="cab-botones">
                        <button id="btn-despegar" class="btn btn--primario" disabled>🛫 Despegar</button>
                        <button id="btn-aterrizar" class="btn btn--secundario" disabled>🛬 Aterrizar</button>
                    </div>
                    <div class="cab-joystick">
                        <span class="cab-joy-etq">↕ Subir/bajar · ↔ Girar</span>
                        <div id="joystick-izquierdo"></div>
                    </div>
                </div>

                <div class="cab-video">
                    <canvas id="canvas-video" width="960" height="720"></canvas>
                    <canvas id="canvas-seguimiento"></canvas>
                    <div id="overlay-video-off" class="cab-video__aviso">📷 Sin señal de video</div>
                </div>

                <div class="cab-lado cab-lado--der">
                    <div class="cab-botones">
                        <button id="btn-toggle-giro" class="btn btn--secundario">🧭 Giro: OFF</button>
                        <button id="btn-toggle-seguimiento" class="btn btn--secundario">🎯 Seguir: OFF</button>
                    </div>
                    <div class="cab-joystick">
                        <span class="cab-joy-etq">↕ Avanzar · ↔ Lateral</span>
                        <div id="joystick-derecho"></div>
                    </div>
                </div>
            </div>

            <div class="cab-acciones">
                <button id="btn-reconectar" class="btn btn--primario" hidden>🔄 Reconectar</button>
                <button id="btn-calibrar-giro" class="btn btn--secundario">🎯 Calibrar giro</button>
                <button id="btn-ir-config-dron" class="btn btn--secundario">🔧 Config. dron</button>
            </div>

            <!-- Movimientos por paso -->
            <section class="cab-panel">
                <h3 class="cab-panel__titulo">🎯 Movimientos por paso</h3>
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
                        <button id="btn-paso-adelante" class="btn btn--secundario" aria-label="Adelante">▲</button>
                        <span></span>
                        <button id="btn-paso-izquierda" class="btn btn--secundario" aria-label="Izquierda">◄</button>
                        <button id="btn-paso-frenar" class="btn btn--peligro" aria-label="Frenar">⏹</button>
                        <button id="btn-paso-derecha" class="btn btn--secundario" aria-label="Derecha">►</button>
                        <span></span>
                        <button id="btn-paso-atras" class="btn btn--secundario" aria-label="Atrás">▼</button>
                        <span></span>
                    </div>
                    <div class="cab-pasos__extra">
                        <button id="btn-paso-subir" class="btn btn--secundario">🔼 Subir</button>
                        <button id="btn-paso-bajar" class="btn btn--secundario">🔽 Bajar</button>
                        <button id="btn-paso-girar-izq" class="btn btn--secundario">↺ Girar izq.</button>
                        <button id="btn-paso-girar-der" class="btn btn--secundario">↻ Girar der.</button>
                    </div>
                </div>
                <p id="estado-paso-texto" class="cab-panel__estado">Listo para comandos. ⏹ = freno (rc 0 0 0 0).</p>
            </section>

            <!-- Misiones -->
            <section class="cab-panel">
                <h3 class="cab-panel__titulo">📜 Misiones</h3>
                <div class="cab-mision">
                    <select id="sel-mision-activa" class="cab-select" aria-label="Misión"></select>
                    <button id="btn-ejecutar-mision" class="btn btn--primario">▶ Iniciar</button>
                    <button id="btn-cancelar-mision" class="btn btn--peligro" hidden>⛔ Cancelar misión</button>
                    <button id="btn-nueva-mision" class="btn btn--secundario">+ Nueva</button>
                </div>
                <div id="info-mision-pasos" class="cab-panel__estado"></div>
            </section>

            <p class="cab-nota">
                🛡️ Vuelo supervisado obligatorio, con al menos 3×3 m libres de personas. Giroscopio y seguimiento arrancan apagados.
                El seguimiento visual es EXPERIMENTAL y requiere validación con el dron real.
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
