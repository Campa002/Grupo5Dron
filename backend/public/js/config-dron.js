/**
 * Módulo Configuración de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Gestiona los perfiles de dron:
 *  - Dos perfiles LOCALES que siempre existen (no dependen del servidor):
 *    "DJI Tello" y "Simulador". Sirven sin internet y en el modo sin cuenta.
 *  - Perfiles del SERVIDOR (tabla perfiles_dron), cacheados en localStorage
 *    para usarlos sin internet cuando el teléfono está en el WiFi del dron.
 *  - Crear y editar: admin y docente (como exige la API). Eliminar: solo admin.
 *  - Timeout del failsafe de telemetría.
 *
 * Contrato con la API (dron-perfiles.php): listar -> {perfiles: [...]}, obtener -> {perfil: {...}},
 * campos tipo_adaptador (tello|simulador), ip, puerto_comando, puerto_video.
 *
 * Depende de: api.js, auth.js, dron-adaptadores.js
 */

// eslint-disable-next-line no-unused-vars
const ConfigDron = (() => {
    'use strict';

    const CACHE_KEY = 'grupo5dron_perfiles_cache';

    // Perfiles que viven en la app (no se pueden editar ni borrar)
    const PERFILES_LOCALES = [
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

    // ----------------------------------------------------------------
    // Caché local de perfiles del servidor
    // ----------------------------------------------------------------

    function guardarCache(perfiles) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), perfiles }));
        } catch (_) { /* almacenamiento lleno */ }
    }

    function leerCache() {
        try {
            const datos = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            return Array.isArray(datos?.perfiles) ? datos.perfiles : [];
        } catch (_) {
            return [];
        }
    }

    function perfilActivoId() {
        return localStorage.getItem('grupo5dron_perfil_activo') || 'tello-default';
    }

    function guardarPerfilActivo(id) {
        if (id) localStorage.setItem('grupo5dron_perfil_activo', String(id));
        else localStorage.removeItem('grupo5dron_perfil_activo');
    }

    /** Solo se consulta la API con sesión iniciada y conexión (no en modo sin cuenta ni sin conexión). */
    function puedeUsarApi() {
        return API.estaAutenticado() && !Auth.esModoInvitado() && !Auth.esModoSinConexion();
    }

    function _conLocales(servidor) {
        // Por compatibilidad: una caché vieja podía guardar copias de los perfiles locales
        const ids = new Set(PERFILES_LOCALES.map(p => p.id));
        return [...PERFILES_LOCALES, ...servidor.filter(p => !ids.has(String(p.id)))];
    }

    // ----------------------------------------------------------------
    // Carga de perfiles
    // ----------------------------------------------------------------

    /**
     * Perfiles locales + los del servidor (o los de la caché si no hay conexión).
     * @returns {Promise<{perfiles: Array, origen: 'servidor'|'cache', error?: string}>}
     */
    async function cargarPerfiles() {
        if (!puedeUsarApi()) {
            return { perfiles: _conLocales(leerCache()), origen: 'cache' };
        }
        try {
            const resp = await API.perfilesDron.listar();
            const servidor = Array.isArray(resp.perfiles) ? resp.perfiles : [];
            guardarCache(servidor);
            return { perfiles: _conLocales(servidor), origen: 'servidor' };
        } catch (err) {
            console.warn('[ConfigDron] No se pudieron cargar los perfiles del servidor; se usa la caché:', err.message);
            return { perfiles: _conLocales(leerCache()), origen: 'cache', error: err.message };
        }
    }

    /**
     * Carga un perfil por ID: primero los locales, después la caché y por último la API.
     * @param {number|string} id
     * @returns {Promise<Object|null>}
     */
    async function cargarPerfil(id) {
        const clave = String(id || 'tello-default');
        const local = PERFILES_LOCALES.find(p => p.id === clave);
        if (local) return local;

        const enCache = leerCache().find(p => String(p.id) === clave);
        if (enCache) return enCache;

        if (!puedeUsarApi()) return null;
        try {
            const resp = await API.perfilesDron.obtener(clave);
            return resp.perfil || null;
        } catch (err) {
            console.warn('[ConfigDron] No se pudo cargar el perfil', clave, err.message);
            return null;
        }
    }

    // ----------------------------------------------------------------
    // Renderizado de la página
    // ----------------------------------------------------------------

    function _permisos() {
        const rol = Auth.obtenerUsuario()?.rol;
        const conSesion = API.estaAutenticado() && !Auth.esModoInvitado();
        return {
            editar: conSesion && (rol === 'admin' || rol === 'docente'),
            eliminar: conSesion && rol === 'admin',
        };
    }

    /**
     * Inicializa la vista Config. Dron en el contenedor dado.
     * Muestra al instante los perfiles guardados y después actualiza con los del servidor.
     * @param {HTMLElement} contenedor
     */
    async function inicializar(contenedor) {
        if (!contenedor) return;
        const permisos = _permisos();
        contenedor.innerHTML = _plantillaBase(permisos);
        _agregarEventos(contenedor, permisos);

        // 1. Lo que hay en el teléfono, sin esperar a la red
        _renderizarListaPerfiles(contenedor, _conLocales(leerCache()), permisos);
        _mostrarOrigen(contenedor, puedeUsarApi() ? 'Actualizando perfiles del servidor...' : _textoSinServidor());

        // 2. Perfiles del servidor (si hay sesión y conexión)
        if (!puedeUsarApi()) return;
        const { perfiles, origen, error } = await cargarPerfiles();
        if (!contenedor.isConnected) return;
        _renderizarListaPerfiles(contenedor, perfiles, permisos);
        _mostrarOrigen(contenedor, origen === 'servidor'
            ? ''
            : `No se pudo actualizar desde el servidor (${error}). Se muestran los perfiles guardados en el teléfono.`);
    }

    function _textoSinServidor() {
        if (Auth.esModoInvitado()) return 'Modo sin cuenta: se muestran los perfiles locales y los guardados en el teléfono.';
        if (Auth.esModoSinConexion()) return 'Sin conexión con el servidor: se muestran los perfiles guardados en el teléfono.';
        return '';
    }

    function _mostrarOrigen(contenedor, texto) {
        const nota = contenedor.querySelector('#config-dron-origen');
        if (!nota) return;
        nota.textContent = texto;
        nota.hidden = !texto;
    }

    function _plantillaBase(permisos) {
        return `
        <div class="config-dron-pagina">
            <div class="flex justify-between items-center mb-md flex-wrap gap-sm">
                <div>
                    <h2 class="seccion-titulo" style="margin-bottom: var(--espacio-xs);">🔧 Configuración del dron</h2>
                    <p class="texto-sm texto-secundario">
                        Elegí el perfil que usa la cabina. Los perfiles se guardan en el teléfono para funcionar sin internet.
                    </p>
                </div>
                ${permisos.editar ? `<button id="btn-nuevo-perfil" class="btn btn--primario">➕ Nuevo perfil</button>` : ''}
            </div>

            <p id="config-dron-origen" class="texto-xs texto-secundario mb-md" hidden></p>
            <div id="config-dron-contenido"></div>

            <!-- Failsafe configurable -->
            <div class="tarjeta mt-lg">
                <h3 class="texto-sm texto-secundario" style="font-weight:600; margin-bottom: var(--espacio-xs);">⏱️ Failsafe de seguridad (telemetría UDP 8890)</h3>
                <p class="texto-xs texto-secundario" style="margin-bottom: var(--espacio-sm);">
                    Tiempo máximo sin recibir telemetría antes de frenar y aterrizar automáticamente.
                </p>
                <div class="flex items-center gap-sm flex-wrap">
                    <input type="number" id="input-failsafe-timeout" class="campo__input" style="width:8rem;" min="1000" max="30000" step="500" value="3500">
                    <span class="texto-xs texto-secundario">ms (1000 a 30000; por defecto 3500)</span>
                    <button id="btn-guardar-failsafe" class="btn btn--secundario">Guardar</button>
                </div>
            </div>

        </div>`;
    }

    function _renderizarListaPerfiles(contenedor, perfiles, permisos) {
        const div = contenedor.querySelector('#config-dron-contenido');
        if (!div) return;
        const activoId = perfilActivoId();
        div.innerHTML = `<div class="grilla-perfiles" style="display:grid; gap: var(--espacio-md); grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));">
            ${perfiles.map(p => _tarjetaPerfil(p, activoId, permisos)).join('')}
        </div>`;

        div.querySelectorAll('.btn-seleccionar-perfil').forEach(btn => {
            btn.addEventListener('click', () => {
                guardarPerfilActivo(btn.dataset.id);
                _renderizarListaPerfiles(contenedor, perfiles, permisos);
                App.mostrarToast('Perfil seleccionado. La cabina va a usar este perfil.', 'exito');
            });
        });
        div.querySelectorAll('.btn-editar-perfil').forEach(btn => {
            btn.addEventListener('click', () => {
                const perfil = perfiles.find(p => String(p.id) === btn.dataset.id);
                if (perfil) _abrirModalPerfil(contenedor, perfil);
            });
        });
        div.querySelectorAll('.btn-eliminar-perfil').forEach(btn => {
            btn.addEventListener('click', () => _confirmarEliminar(contenedor, btn.dataset.id, btn.dataset.nombre));
        });
    }

    function _tarjetaPerfil(perfil, activoId, permisos) {
        const p = DronAdaptadores.normalizarPerfil(perfil);
        const id = String(perfil.id);
        const esActivo = id === String(activoId);
        const esTello = p.tipo_adaptador === 'tello';
        const editable = !perfil.local;

        return `
        <div class="tarjeta tarjeta-perfil ${esActivo ? 'tarjeta--acento' : ''}" data-id="${_esc(id)}">
            <div class="flex justify-between items-center mb-md">
                <div class="flex items-center gap-sm">
                    <span style="font-size:1.75rem;">${esTello ? '🛸' : '🎮'}</span>
                    <h3 class="tarjeta__titulo" style="margin:0;">${_esc(perfil.nombre)}</h3>
                </div>
                ${editable && (permisos.editar || permisos.eliminar) ? `
                <div class="flex gap-sm">
                    ${permisos.editar ? `<button class="btn btn--secundario btn--icono btn-editar-perfil" data-id="${_esc(id)}" aria-label="Editar perfil">✏️</button>` : ''}
                    ${permisos.eliminar ? `<button class="btn btn--secundario btn--icono btn-eliminar-perfil" data-id="${_esc(id)}" data-nombre="${_esc(perfil.nombre)}" aria-label="Eliminar perfil">🗑️</button>` : ''}
                </div>` : ''}
            </div>
            <div class="flex gap-sm flex-wrap mb-md">
                <span class="badge badge--info">${esTello ? 'DJI Tello' : 'Simulador'}</span>
                <span class="badge ${perfil.local ? 'badge--exito' : 'badge--advertencia'}">${perfil.local ? 'Local' : 'Servidor'}</span>
            </div>
            ${perfil.descripcion ? `<p class="texto-sm texto-secundario mb-md">${_esc(perfil.descripcion)}</p>` : ''}
            ${esTello ? `<p class="texto-xs texto-secundario mb-md">IP: <code>${_esc(p.ip)}</code> · Puerto de comandos: <code>${_esc(String(p.puerto_comando))}</code></p>` : ''}
            <button class="btn ${esActivo ? 'btn--secundario' : 'btn--primario'} btn--bloque btn-seleccionar-perfil" data-id="${_esc(id)}" ${esActivo ? 'disabled' : ''}>
                ${esActivo ? '✓ Seleccionado' : 'Seleccionar'}
            </button>
        </div>`;
    }

    // ----------------------------------------------------------------
    // Modal de creación / edición (solo perfiles del servidor)
    // ----------------------------------------------------------------

    function _cerrarModalPerfil() {
        document.getElementById('modal-perfil')?.remove();
    }

    function _abrirModalPerfil(contenedor, perfil) {
        _cerrarModalPerfil();
        const overlay = document.createElement('div');
        overlay.id = 'modal-perfil';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-perfil-titulo">
                <div class="modal__header">
                    <h3 id="modal-perfil-titulo" class="modal__titulo">${perfil ? 'Editar perfil de dron' : 'Nuevo perfil de dron'}</h3>
                    <button type="button" class="modal__cerrar" id="btn-cerrar-modal-perfil" aria-label="Cerrar">&times;</button>
                </div>
                <div class="modal__body" id="modal-perfil-body">${_formularioPerfil(perfil)}</div>
            </div>`;
        document.body.appendChild(overlay);
        const body = overlay.querySelector('#modal-perfil-body');
        body.querySelector('#campo-nombre-perfil')?.focus();

        overlay.querySelector('#btn-cerrar-modal-perfil').onclick = _cerrarModalPerfil;
        overlay.onclick = (e) => { if (e.target === overlay) _cerrarModalPerfil(); };
        body.querySelector('#btn-cancelar-perfil').onclick = _cerrarModalPerfil;
        // Si se navega a otra pantalla con el modal abierto, se cierra
        window.addEventListener('hashchange', _cerrarModalPerfil, { once: true });
        body.querySelector('#form-perfil').addEventListener('submit', async (e) => {
            e.preventDefault();
            await _guardarPerfil(contenedor, body, perfil ? perfil.id : null);
        });
        const selTipo = body.querySelector('#campo-tipo-adaptador');
        selTipo.addEventListener('change', () => _actualizarCamposTipo(body));
        _actualizarCamposTipo(body);
    }

    function _formularioPerfil(perfil) {
        const p = perfil ? DronAdaptadores.normalizarPerfil(perfil) : { tipo_adaptador: 'tello', ip: '192.168.10.1', puerto_comando: 8889 };
        const opcion = (valor, texto) => `<option value="${valor}" ${p.tipo_adaptador === valor ? 'selected' : ''}>${texto}</option>`;
        return `
        <form id="form-perfil" novalidate>
            <div class="campo">
                <label class="campo__label" for="campo-nombre-perfil">Nombre *</label>
                <input id="campo-nombre-perfil" class="campo__input" name="nombre" type="text" required maxlength="100"
                    value="${_esc(perfil?.nombre || '')}" placeholder="Ej: Tello del aula">
            </div>
            <div class="campo">
                <label class="campo__label" for="campo-tipo-adaptador">Tipo *</label>
                <select id="campo-tipo-adaptador" class="campo__input" name="tipo_adaptador">
                    ${opcion('tello', 'DJI Tello')}
                    ${opcion('simulador', 'Simulador')}
                </select>
            </div>
            <div id="campos-red-perfil">
                <div class="campo">
                    <label class="campo__label" for="campo-ip-dron">IP del dron</label>
                    <input id="campo-ip-dron" class="campo__input" name="ip" type="text" maxlength="45" inputmode="decimal"
                        value="${_esc(p.ip)}" placeholder="192.168.10.1">
                </div>
                <div class="campo">
                    <label class="campo__label" for="campo-puerto-cmd">Puerto de comandos</label>
                    <input id="campo-puerto-cmd" class="campo__input" name="puerto_comando" type="number" min="1" max="65535"
                        value="${_esc(String(p.puerto_comando || 8889))}">
                </div>
                <p class="texto-xs texto-secundario mb-md">
                    El Tello usa siempre 192.168.10.1 y el puerto 8889; la telemetría (8890) y el video (11111) son fijos.
                </p>
            </div>
            <div id="error-form-perfil" class="advertencia-seguridad" style="display:none;"></div>
            <div class="flex gap-sm mt-md" style="justify-content:flex-end;">
                <button type="button" id="btn-cancelar-perfil" class="btn btn--secundario">Cancelar</button>
                <button type="submit" class="btn btn--primario" id="btn-guardar-perfil">${perfil ? '💾 Guardar cambios' : '➕ Crear perfil'}</button>
            </div>
        </form>`;
    }

    function _actualizarCamposTipo(body) {
        const tipo = body.querySelector('#campo-tipo-adaptador')?.value;
        const campos = body.querySelector('#campos-red-perfil');
        if (campos) campos.hidden = tipo === 'simulador';
    }

    async function _guardarPerfil(contenedor, body, idExistente) {
        const errorDiv = body.querySelector('#error-form-perfil');
        const btnGuardar = body.querySelector('#btn-guardar-perfil');
        const mostrarError = (msg) => { errorDiv.textContent = msg; errorDiv.style.display = 'flex'; };

        const nombre = body.querySelector('#campo-nombre-perfil').value.trim();
        const tipo = body.querySelector('#campo-tipo-adaptador').value === 'simulador' ? 'simulador' : 'tello';
        const ip = body.querySelector('#campo-ip-dron').value.trim();
        const puerto = parseInt(body.querySelector('#campo-puerto-cmd').value, 10);

        if (!nombre) { mostrarError('Poné un nombre para el perfil.'); return; }
        const datos = { nombre, tipo_adaptador: tipo };
        if (tipo === 'tello') {
            if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.split('.').some(n => Number(n) > 255)) { mostrarError('La IP no es válida (ejemplo: 192.168.10.1).'); return; }
            if (!(puerto >= 1 && puerto <= 65535)) { mostrarError('El puerto tiene que estar entre 1 y 65535.'); return; }
            datos.ip = ip;
            datos.puerto_comando = puerto;
        } else {
            datos.ip = '127.0.0.1';
            datos.puerto_comando = 0;
        }

        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';
        errorDiv.style.display = 'none';
        try {
            if (idExistente) {
                await API.perfilesDron.actualizar(idExistente, datos);
                App.mostrarToast('Perfil actualizado.', 'exito');
            } else {
                await API.perfilesDron.crear(datos);
                App.mostrarToast('Perfil creado.', 'exito');
            }
            _cerrarModalPerfil();
            await inicializar(contenedor);
        } catch (err) {
            mostrarError('No se pudo guardar: ' + (err.message || 'error desconocido'));
            btnGuardar.disabled = false;
            btnGuardar.textContent = idExistente ? '💾 Guardar cambios' : '➕ Crear perfil';
        }
    }

    function _confirmarEliminar(contenedor, id, nombre) {
        if (!confirm(`¿Eliminar el perfil "${nombre}"?\n\nEsta acción no se puede deshacer.`)) return;
        API.perfilesDron.eliminar(id)
            .then(() => {
                if (perfilActivoId() === String(id)) guardarPerfilActivo(null);
                guardarCache(leerCache().filter(p => String(p.id) !== String(id)));
                App.mostrarToast('Perfil eliminado.', 'info');
                return inicializar(contenedor);
            })
            .catch(err => App.mostrarToast('No se pudo eliminar: ' + err.message, 'error'));
    }

    // ----------------------------------------------------------------
    // Eventos de la página
    // ----------------------------------------------------------------

    function _agregarEventos(contenedor, permisos) {
        if (permisos.editar) {
            contenedor.querySelector('#btn-nuevo-perfil')?.addEventListener('click', () => _abrirModalPerfil(contenedor, null));
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
        cargarPerfiles,
        cargarPerfil,
        perfilActivoId,
        guardarPerfilActivo,
        leerCache,
    };
})();
