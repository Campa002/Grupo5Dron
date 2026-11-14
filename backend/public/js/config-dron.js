/**
 * Módulo Configuración de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Gestiona:
 *  - Los dos perfiles de dron, fijos en la app: "DJI Tello" y "Simulador". La app del dron no usa
 *    el servidor (no tiene login): los perfiles no se crean ni se editan, solo se elige uno.
 *  - El modo técnico, el timeout del failsafe, el sentido del avance y los ajustes del seguimiento.
 *
 * Depende de: dron-adaptadores.js, dron-giroscopio.js, dron-seguimiento.js
 */

// eslint-disable-next-line no-unused-vars
const ConfigDron = (() => {
    'use strict';

    // Los únicos perfiles: viven en la app (no se pueden editar ni borrar)
    const PERFILES = [
        {
            id: 'tello-default',
            local: true,
            nombre: 'DJI Tello',
            tipo_adaptador: 'tello',
            ip: '192.168.10.1',
            puerto_comando: 8889,
            puerto_estado: 8890,
            puerto_video: 11111,
            descripcion: 'Tello real por su WiFi (TELLO-XXXXXX). Necesita la app instalada.',
        },
        {
            id: 'simulador-local',
            local: true,
            nombre: 'Simulador',
            tipo_adaptador: 'simulador',
            ip: '127.0.0.1',
            puerto_comando: 0,
            descripcion: 'Dron virtual para practicar sin el Tello. Funciona también en el navegador.',
        },
    ];

    /**
     * El perfil elegido. Si lo guardado no es uno de los dos (por ejemplo, uno viejo del servidor), el Tello.
     * El Simulador es de prueba: solo vale con el modo técnico; sin él, la cabina usa siempre el Tello.
     */
    function perfilActivoId() {
        const id = localStorage.getItem('grupo5dron_perfil_activo');
        if (id === 'simulador-local' && !App.modoTecnico()) return 'tello-default';
        return PERFILES.some(p => p.id === id) ? id : 'tello-default';
    }

    function guardarPerfilActivo(id) {
        if (PERFILES.some(p => p.id === id)) localStorage.setItem('grupo5dron_perfil_activo', id);
    }

    /**
     * Perfil por ID (si no existe, el DJI Tello).
     * @param {string} id
     * @returns {Promise<Object>}
     */
    async function cargarPerfil(id) {
        return PERFILES.find(p => p.id === String(id)) || PERFILES[0];
    }

    // ----------------------------------------------------------------
    // Renderizado de la página
    // ----------------------------------------------------------------

    /**
     * Inicializa la vista Config. Dron en el contenedor dado.
     * @param {HTMLElement} contenedor
     */
    async function inicializar(contenedor) {
        if (!contenedor) return;
        contenedor.innerHTML = _plantillaBase();
        _agregarEventos(contenedor);
        _renderizarListaPerfiles(contenedor);
    }

    function _plantillaBase() {
        return `
        <div class="config-dron-pagina">
            <header class="mb-4">
                <p class="etiqueta">Configuración</p>
                <h1 class="h3 fw-bold text-uppercase">Configuración</h1>
                <p class="text-body-secondary mb-0">El dron que usa la cabina y, en el modo técnico, los ajustes avanzados. Se guarda en el teléfono.</p>
            </header>

            <!-- 01 — Perfil -->
            <section class="mb-5">
                <p class="etiqueta">01 — Perfil</p>
                <h2 class="h5 fw-bold text-uppercase">Dron de la cabina</h2>
                <div id="config-dron-contenido"></div>
            </section>

            <!-- 02 — Failsafe (modo técnico; el failsafe está siempre activo) -->
            <section class="mb-5 solo-tecnico">
                <p class="etiqueta">02 — Seguridad</p>
                <h2 class="h5 fw-bold text-uppercase">Aterrizaje de seguridad (failsafe)</h2>
                <p class="small text-body-secondary">
                    Siempre está activo. Si dejan de llegar los datos del dron (telemetría, por UDP 8890) durante este tiempo,
                    la app lo frena y lo hace aterrizar.
                </p>
                <div class="input-group" style="max-width: 22rem;">
                    <input type="number" id="input-failsafe-timeout" class="form-control" min="1000" max="30000" step="500" value="3500" aria-label="Tiempo del failsafe en milisegundos">
                    <span class="input-group-text">ms</span>
                    <button id="btn-guardar-failsafe" class="btn btn-outline-secondary">Guardar</button>
                </div>
                <div class="form-text">De 1000 a 30000; por defecto 3500.</div>
            </section>

            <!-- 03 — Sentido del avance por inclinación (modo técnico) -->
            <section class="mb-5 solo-tecnico">
                <p class="etiqueta">03 — Inclinación</p>
                <h2 class="h5 fw-bold text-uppercase">Sentido del avance</h2>
                <p class="small text-body-secondary">
                    Normal: inclinar el celular hacia adelante (el borde de arriba de la pantalla hacia abajo) avanza,
                    como empujar un joystick. Invertido: levantar el borde de arriba hacia vos avanza (el sentido anterior).
                    Vale desde la próxima vez que actives la inclinación.
                </p>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" id="switch-invertir-avance">
                    <label class="form-check-label" for="switch-invertir-avance">Invertir avance</label>
                </div>
            </section>

            <!-- 04 — Ajustes del seguimiento (modo técnico; se guardan en el teléfono) -->
            <section class="mb-5 solo-tecnico" id="ajustes-seguimiento"></section>

        </div>`;
    }

    function _renderizarListaPerfiles(contenedor) {
        const div = contenedor.querySelector('#config-dron-contenido');
        if (!div) return;
        const activoId = perfilActivoId();
        div.innerHTML = `<div class="list-group">
            ${PERFILES.map(p => _tarjetaPerfil(p, activoId)).join('')}
        </div>`;

        div.querySelectorAll('.btn-seleccionar-perfil').forEach(btn => {
            btn.addEventListener('click', () => {
                guardarPerfilActivo(btn.dataset.id);
                _renderizarListaPerfiles(contenedor);
                App.mostrarToast('Perfil seleccionado. La cabina va a usar este perfil.', 'exito');
            });
        });
    }

    function _tarjetaPerfil(perfil, activoId) {
        const p = DronAdaptadores.normalizarPerfil(perfil);
        const esActivo = perfil.id === activoId;
        const esTello = p.tipo_adaptador === 'tello';

        return `
        <div class="list-group-item py-3 ${esActivo ? 'border-primary' : ''} ${esTello ? '' : 'solo-tecnico'}" data-id="${_esc(perfil.id)}">
            <div class="d-flex justify-content-between align-items-start gap-3">
                <div>
                    <p class="fw-semibold mb-1">${_esc(perfil.nombre)}</p>
                    <p class="small text-body-secondary mb-0">${_esc(perfil.descripcion)}</p>
                    ${esTello ? `<p class="small text-body-secondary mt-1 mb-0 solo-tecnico">IP: <code>${_esc(p.ip)}</code> · Puerto de comandos: <code>${_esc(String(p.puerto_comando))}</code></p>` : ''}
                </div>
                <button class="btn ${esActivo ? 'btn-outline-secondary' : 'btn-primary'} text-nowrap btn-seleccionar-perfil solo-tecnico" data-id="${_esc(perfil.id)}" ${esActivo ? 'disabled' : ''}>
                    ${esActivo ? 'Seleccionado' : 'Seleccionar'}
                </button>
            </div>
        </div>`;
    }

    // ----------------------------------------------------------------
    // Ajustes del seguimiento (definidos en DronSeguimiento.RANGOS)
    // ----------------------------------------------------------------

    // Una línea por grupo de ajustes (modo técnico)
    const AYUDA_GRUPOS = {
        'Detección': 'Qué tan seguro tiene que estar el detector y cuántas veces por segundo analiza la imagen.',
        'Control': 'Cuánto y qué tan rápido se movería el dron para seguir lo elegido.',
        'Reglas (como RAC)': 'Qué confianza tiene que tener una detección para contar, cuántas seguidas confirman el objetivo y cuántas fallas lo dan por perdido (en "Mis objetos", la confianza es el parecido con tus fotos).',
        'Pérdida': 'Cuánto espera sin detecciones antes de darlo por perdido y dejar de moverse.',
        'Control real': 'Condiciones para poder activar el control real (el dron sigue de verdad). Los límites de velocidad del control real son fijos, en el código.',
    };

    function _renderizarAjustesSeguimiento(contenedor) {
        const caja = contenedor.querySelector('#ajustes-seguimiento');
        if (!caja || typeof DronSeguimiento === 'undefined') return;
        const R = DronSeguimiento.RANGOS;
        const actuales = DronSeguimiento.ajustesActuales();
        const redondear = v => Math.round(v * 10000) / 10000;
        const grupos = {};
        for (const [clave, r] of Object.entries(R)) (grupos[r.grupo] = grupos[r.grupo] || []).push([clave, r]);

        caja.innerHTML = `
            <p class="etiqueta">04 — Seguimiento</p>
            <h2 class="h5 fw-bold text-uppercase">Ajustes del seguimiento</h2>
            <p class="small text-body-secondary">
                Se guardan en este teléfono y se aplican la próxima vez que inicies el seguimiento.
                El seguimiento arranca en ensayo; el control real se activa en la cabina, con confirmación.
            </p>
            ${Object.entries(grupos).map(([grupo, campos]) => `
                <fieldset class="border rounded p-3 mb-3">
                    <legend class="float-none w-auto px-2 fs-6 fw-semibold mb-0">${_esc(grupo)}</legend>
                    ${AYUDA_GRUPOS[grupo] ? `<p class="small text-body-secondary mb-2">${_esc(AYUDA_GRUPOS[grupo])}</p>` : ''}
                    <div class="row row-cols-1 row-cols-sm-2 g-2">
                        ${campos.map(([clave, r]) => `
                            <label class="col">
                                <span class="form-label small d-block mb-1">${_esc(r.etiqueta)}${r.unidad ? ` (${_esc(r.unidad)})` : ''}</span>
                                <input class="form-control" type="number" inputmode="decimal" data-ajuste="${clave}"
                                    min="${redondear(r.min * (r.escala || 1))}" max="${redondear(r.max * (r.escala || 1))}" step="${redondear(r.paso * (r.escala || 1))}"
                                    value="${redondear(actuales[clave] * (r.escala || 1))}">
                            </label>`).join('')}
                    </div>
                </fieldset>`).join('')}
            <div id="ajustes-seguimiento-errores" class="alert alert-danger" hidden></div>
            <div class="d-flex gap-2 flex-wrap">
                <button id="btn-guardar-ajustes-seg" class="btn btn-primary">Guardar ajustes</button>
                <button id="btn-restaurar-ajustes-seg" class="btn btn-outline-secondary">Valores por defecto</button>
            </div>`;

        caja.querySelector('#btn-guardar-ajustes-seg').addEventListener('click', () => {
            const valores = {};
            caja.querySelectorAll('[data-ajuste]').forEach(input => {
                const r = R[input.dataset.ajuste];
                const n = input.value.trim() === '' ? NaN : Number(input.value) / (r.escala || 1);
                valores[input.dataset.ajuste] = n;
            });
            const resultado = DronSeguimiento.validarAjustes(valores);
            const errores = caja.querySelector('#ajustes-seguimiento-errores');
            if (!resultado.ok) {
                errores.textContent = resultado.errores.join(' ');
                errores.hidden = false;
                return;
            }
            errores.hidden = true;
            DronSeguimiento.guardarAjustes(resultado.ajustes);
            App.mostrarToast('Ajustes del seguimiento guardados. Se aplican al iniciar el seguimiento.', 'exito');
        });
        caja.querySelector('#btn-restaurar-ajustes-seg').addEventListener('click', () => {
            DronSeguimiento.restaurarAjustes();
            _renderizarAjustesSeguimiento(contenedor);
            App.mostrarToast('Ajustes del seguimiento en sus valores por defecto.', 'info');
        });
    }

    function _agregarEventos(contenedor) {
        _renderizarAjustesSeguimiento(contenedor);

        const swAvance = contenedor.querySelector('#switch-invertir-avance');
        if (swAvance && typeof DronGiroscopio !== 'undefined') {
            swAvance.checked = DronGiroscopio.leerInvertirAvance();
            swAvance.addEventListener('change', () => {
                DronGiroscopio.guardarInvertirAvance(swAvance.checked);
                App.mostrarToast(swAvance.checked
                    ? 'Avance invertido: levantar el borde de arriba hacia vos avanza. Vale al volver a activar la inclinación.'
                    : 'Avance normal: inclinar hacia adelante avanza. Vale al volver a activar la inclinación.', 'info', 6000);
            });
        }

        const inputTimeout = contenedor.querySelector('#input-failsafe-timeout');
        if (inputTimeout) inputTimeout.value = localStorage.getItem('grupo5dron_failsafe_timeout_ms') || '3500';
        contenedor.querySelector('#btn-guardar-failsafe')?.addEventListener('click', () => {
            const ms = parseInt(inputTimeout?.value, 10);
            if (ms >= 1000 && ms <= 30000) {
                localStorage.setItem('grupo5dron_failsafe_timeout_ms', String(ms));
                App.mostrarToast(`Failsafe configurado en ${ms} ms.`, 'exito');
            } else {
                App.mostrarToast('El tiempo tiene que estar entre 1000 y 30000 ms.', 'advertencia');
            }
        });
    }

    // ----------------------------------------------------------------
    // Utilidades
    // ----------------------------------------------------------------

    function _esc(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    return {
        inicializar,
        cargarPerfil,
        perfilActivoId,
    };
})();
