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

    /** El perfil elegido (si lo guardado no es uno de los dos, por ejemplo uno viejo del servidor, el Tello). */
    function perfilActivoId() {
        const id = localStorage.getItem('grupo5dron_perfil_activo');
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
            <header class="encabezado">
                <p class="etiqueta etiqueta--linea">Configuración</p>
                <h2 class="titulo-grande">Config. del dron</h2>
                <p class="bajada">Elegí con qué dron vuela la cabina. Se guarda en el teléfono y funciona sin internet.</p>
            </header>

            <!-- 01 — Perfil -->
            <section class="bloque">
                <p class="etiqueta">01 — Perfil</p>
                <h3 class="bloque__titulo">Dron de la cabina</h3>
                <div id="config-dron-contenido"></div>
            </section>

            <!-- 02 — Modo técnico -->
            <section class="bloque">
                <p class="etiqueta">02 — Diagnóstico</p>
                <h3 class="bloque__titulo">Modo técnico</h3>
                <p class="bloque__texto">
                    Muestra herramientas para buscar problemas: registros de la conexión, el detalle del seguimiento,
                    lo que analiza la cámara y ajustes avanzados. Arranca apagado.
                </p>
                <label class="switch" for="switch-modo-tecnico">
                    <input type="checkbox" id="switch-modo-tecnico">
                    <span class="switch__control" aria-hidden="true"></span>
                    <span class="switch__label">Mostrar el modo técnico</span>
                </label>
            </section>

            <!-- 03 — Failsafe (modo técnico; el failsafe está siempre activo) -->
            <section class="bloque solo-tecnico">
                <p class="etiqueta">03 — Seguridad</p>
                <h3 class="bloque__titulo">Aterrizaje de seguridad (failsafe)</h3>
                <p class="bloque__texto">
                    Siempre está activo. Si dejan de llegar los datos del dron (telemetría, por UDP 8890) durante este tiempo,
                    la app lo frena y lo hace aterrizar.
                </p>
                <div class="flex items-center gap-sm flex-wrap">
                    <input type="number" id="input-failsafe-timeout" class="campo__input" style="width:8rem;" min="1000" max="30000" step="500" value="3500" aria-label="Tiempo del failsafe en milisegundos">
                    <span class="texto-xs texto-secundario">ms (1000 a 30000; por defecto 3500)</span>
                    <button id="btn-guardar-failsafe" class="btn btn--secundario">Guardar</button>
                </div>
            </section>

            <!-- 04 — Sentido del avance por inclinación (modo técnico) -->
            <section class="bloque solo-tecnico">
                <p class="etiqueta">04 — Inclinación</p>
                <h3 class="bloque__titulo">Sentido del avance</h3>
                <p class="bloque__texto">
                    Normal: inclinar el celular hacia adelante (el borde de arriba de la pantalla hacia abajo) avanza,
                    como empujar un joystick. Invertido: levantar el borde de arriba hacia vos avanza (el sentido anterior).
                    Vale desde la próxima vez que actives la inclinación.
                </p>
                <label class="switch" for="switch-invertir-avance">
                    <input type="checkbox" id="switch-invertir-avance">
                    <span class="switch__control" aria-hidden="true"></span>
                    <span class="switch__label">Invertir avance</span>
                </label>
            </section>

            <!-- 05 — Ajustes del seguimiento (modo técnico; se guardan en el teléfono) -->
            <section class="bloque solo-tecnico" id="ajustes-seguimiento"></section>

        </div>`;
    }

    function _renderizarListaPerfiles(contenedor) {
        const div = contenedor.querySelector('#config-dron-contenido');
        if (!div) return;
        const activoId = perfilActivoId();
        div.innerHTML = `<div class="grilla-perfiles" style="display:grid; gap: var(--espacio-md); grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));">
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
        <div class="tarjeta tarjeta-perfil ${esActivo ? 'tarjeta--acento' : ''}" data-id="${_esc(perfil.id)}">
            <div class="flex items-center gap-sm mb-md">
                <span style="font-size:1.5rem; line-height:1; color: var(--color-celeste);">${App.icono(esTello ? 'dron' : 'simulador')}</span>
                <h3 class="tarjeta__titulo" style="margin:0;">${_esc(perfil.nombre)}</h3>
            </div>
            <p class="texto-sm texto-secundario mb-md">${_esc(perfil.descripcion)}</p>
            ${esTello ? `<p class="texto-xs texto-secundario mb-md solo-tecnico">IP: <code>${_esc(p.ip)}</code> · Puerto de comandos: <code>${_esc(String(p.puerto_comando))}</code></p>` : ''}
            <button class="btn ${esActivo ? 'btn--secundario' : 'btn--primario'} btn--bloque btn-seleccionar-perfil" data-id="${_esc(perfil.id)}" ${esActivo ? 'disabled' : ''}>
                ${esActivo ? App.icono('check') + ' Seleccionado' : 'Seleccionar'}
            </button>
        </div>`;
    }

    // ----------------------------------------------------------------
    // Ajustes del seguimiento (definidos en DronSeguimiento.RANGOS)
    // ----------------------------------------------------------------

    // Una línea por grupo de ajustes (modo técnico)
    const AYUDA_GRUPOS = {
        'Detección': 'Qué tan seguro tiene que estar el detector y cuántas veces por segundo analiza la imagen.',
        'Control': 'Cuánto y qué tan rápido se movería el dron para seguir lo elegido.',
        'Pérdida': 'Cuánto espera antes de darlo por perdido y dejar de moverse.',
        'Control real (etapa S3)': 'Condiciones para que el seguimiento mueva el dron de verdad (todavía no se usa).',
        'Mis objetos': 'Qué tan parecido a tus fotos tiene que ser, y cuántas veces seguidas, para seguirlo o darlo por perdido.',
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
            <p class="etiqueta">05 — Seguimiento</p>
            <h3 class="bloque__titulo">Ajustes del seguimiento</h3>
            <p class="bloque__texto">
                Se guardan en este teléfono y se aplican la próxima vez que actives el ensayo.
                Por ahora el seguimiento funciona solo en ensayo (no le manda órdenes al dron).
            </p>
            ${Object.entries(grupos).map(([grupo, campos]) => `
                <fieldset style="border:1px solid var(--color-borde); border-radius: var(--radio-md); padding: var(--espacio-sm) var(--espacio-md); margin-bottom: var(--espacio-md);">
                    <legend class="texto-sm font-semibold" style="padding: 0 var(--espacio-xs);">${_esc(grupo)}</legend>
                    ${AYUDA_GRUPOS[grupo] ? `<p class="texto-xs texto-secundario mb-sm">${_esc(AYUDA_GRUPOS[grupo])}</p>` : ''}
                    <div style="display:grid; gap: var(--espacio-sm) var(--espacio-md); grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));">
                        ${campos.map(([clave, r]) => `
                            <label class="campo" style="margin:0;">
                                <span class="campo__label">${_esc(r.etiqueta)}${r.unidad ? ` (${_esc(r.unidad)})` : ''}</span>
                                <input class="campo__input" type="number" inputmode="decimal" data-ajuste="${clave}"
                                    min="${redondear(r.min * (r.escala || 1))}" max="${redondear(r.max * (r.escala || 1))}" step="${redondear(r.paso * (r.escala || 1))}"
                                    value="${redondear(actuales[clave] * (r.escala || 1))}">
                            </label>`).join('')}
                    </div>
                </fieldset>`).join('')}
            <div id="ajustes-seguimiento-errores" class="alerta alerta--error mb-md" hidden></div>
            <div class="flex gap-sm flex-wrap">
                <button id="btn-guardar-ajustes-seg" class="btn btn--primario">Guardar ajustes</button>
                <button id="btn-restaurar-ajustes-seg" class="btn btn--secundario">Valores por defecto</button>
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
            App.mostrarToast('Ajustes del seguimiento guardados. Se aplican al activar el ensayo.', 'exito');
        });
        caja.querySelector('#btn-restaurar-ajustes-seg').addEventListener('click', () => {
            DronSeguimiento.restaurarAjustes();
            _renderizarAjustesSeguimiento(contenedor);
            App.mostrarToast('Ajustes del seguimiento en sus valores por defecto.', 'info');
        });
    }

    function _agregarEventos(contenedor) {
        _renderizarAjustesSeguimiento(contenedor);

        const sw = contenedor.querySelector('#switch-modo-tecnico');
        if (sw) {
            sw.checked = App.modoTecnico();
            sw.addEventListener('change', () => {
                App.cambiarModoTecnico(sw.checked);
                App.mostrarToast(sw.checked ? 'Modo técnico activado.' : 'Modo técnico apagado.', 'info');
            });
        }

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
