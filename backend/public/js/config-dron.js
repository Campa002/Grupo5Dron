/**
 * Módulo Configuración de Dron — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * Gestiona los perfiles de dron:
 *  - Listado y selección del perfil activo
 *  - Creación, edición y eliminación de perfiles (sólo admin)
 *  - Caché local en localStorage: los perfiles se cachean para funcionar
 *    sin internet cuando el teléfono está conectado al WiFi del dron.
 *  - Integración con API.perfilesDron y validación del formulario
 *
 * Depende de: api.js, auth.js
 * Renderizado por: app.js → rutear('#/config-dron')
 */

// eslint-disable-next-line no-unused-vars
const ConfigDron = (() => {
    'use strict';

    const CACHE_KEY = 'grupo5dron_perfiles_cache';

    // ----------------------------------------------------------------
    // Caché local
    // ----------------------------------------------------------------

    function guardarCache(perfiles) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                ts: Date.now(),
                perfiles,
            }));
        } catch (_) { /* storage lleno */ }
    }

    function leerCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const datos = JSON.parse(raw);
            return datos.perfiles || null;
        } catch (_) {
            return null;
        }
    }

    function perfilActivoId() {
        return localStorage.getItem('grupo5dron_perfil_activo') || null;
    }

    function guardarPerfilActivo(id) {
        if (id) {
            localStorage.setItem('grupo5dron_perfil_activo', String(id));
        } else {
            localStorage.removeItem('grupo5dron_perfil_activo');
        }
    }

    // ----------------------------------------------------------------
    // Carga de perfiles
    // ----------------------------------------------------------------

    /**
     * Carga los perfiles desde la API (o desde caché si no hay conexión).
     * @returns {Promise<Array>}
     */
    async function cargarPerfiles() {
        try {
            const resp = await API.perfilesDron.listar();
            const perfiles = resp.datos || resp.data || [];
            guardarCache(perfiles);
            return perfiles;
        } catch (err) {
            console.warn('[ConfigDron] No se pudo cargar desde la API, usando caché:', err.message);
            return leerCache() || [];
        }
    }

    /**
     * Carga un perfil específico por ID.
     * @param {number|string} id
     * @returns {Promise<Object|null>}
     */
    async function cargarPerfil(id) {
        // Intentar desde caché primero para respuesta rápida
        const cache = leerCache();
        if (cache) {
            const local = cache.find(p => String(p.id) === String(id));
            if (local) return local;
        }
        try {
            const resp = await API.perfilesDron.obtener(id);
            return resp.datos || resp.data || null;
        } catch (err) {
            console.warn('[ConfigDron] No se pudo cargar el perfil ID', id, err.message);
            return null;
        }
    }

    // ----------------------------------------------------------------
    // Renderizado principal de la página
    // ----------------------------------------------------------------

    /**
     * Inicializa la vista Config-Dron en el contenedor dado.
     * @param {HTMLElement} contenedor
     */
    async function inicializar(contenedor) {
        if (!contenedor) return;
        const usuario = Auth.obtenerUsuario();
        const esAdmin = usuario && (usuario.rol === 'admin' || usuario.rol === 'profesor');

        // Esqueleto inicial con spinner
        contenedor.innerHTML = _plantillaBase(esAdmin);

        const perfiles = await cargarPerfiles();

        // Si no hay perfiles en caché ni en API
        if (!perfiles || perfiles.length === 0) {
            _renderizarVacio(contenedor, esAdmin);
            return;
        }

        _renderizarListaPerfiles(contenedor, perfiles, esAdmin);
        _agregarEventos(contenedor, esAdmin);
    }

    // ----------------------------------------------------------------
    // Renderizado de subvistas
    // ----------------------------------------------------------------

    function _plantillaBase(esAdmin) {
        return `
        <div class="config-dron-pagina">
            <div class="flex justify-between items-center mb-md flex-wrap gap-sm">
                <div>
                    <h2 class="seccion-titulo" style="margin-bottom: var(--espacio-xs);">
                        🔧 Configuración de Perfiles de Dron
                    </h2>
                    <p class="texto-sm texto-secundario">
                        Seleccioná el perfil de dron a utilizar. Los perfiles se guardan localmente para funcionar sin internet.
                    </p>
                </div>
                ${esAdmin ? `<button id="btn-nuevo-perfil" class="btn btn--primario">➕ Nuevo perfil</button>` : ''}
            </div>
            <div id="config-dron-contenido">
                <div class="cargando"><div class="cargando__spinner"></div><p>Cargando perfiles...</p></div>
            </div>
            <!-- Modal de edición -->
            <div id="modal-perfil" class="modal" style="display:none;" aria-modal="true" role="dialog" aria-labelledby="modal-perfil-titulo">
                <div class="modal__overlay" id="modal-perfil-overlay"></div>
                <div class="modal__contenido tarjeta" style="max-width:520px; width:94%;">
                    <div class="modal__header">
                        <h3 id="modal-perfil-titulo" class="modal__titulo">Perfil de Dron</h3>
                        <button id="btn-cerrar-modal-perfil" class="modal__btn-cerrar" aria-label="Cerrar">✕</button>
                    </div>
                    <div id="modal-perfil-body" class="modal__cuerpo"></div>
                </div>
            </div>
        </div>`;
    }

    function _renderizarVacio(contenedor, esAdmin) {
        const div = contenedor.querySelector('#config-dron-contenido');
        if (!div) return;
        div.innerHTML = `
            <div class="tarjeta tarjeta--acento texto-centro" style="padding: var(--espacio-2xl) var(--espacio-lg);">
                <div style="font-size:3rem; margin-bottom: var(--espacio-md);">🚁</div>
                <h3 style="font-size: var(--tamano-xl); font-weight:700; margin-bottom: var(--espacio-sm);">
                    No hay perfiles de dron configurados
                </h3>
                <p class="texto-sm texto-secundario mb-lg">
                    ${esAdmin
                        ? 'Creá el primer perfil para empezar a volar.'
                        : 'Un administrador debe crear al menos un perfil de dron.'}
                </p>
                ${esAdmin ? `<button id="btn-nuevo-perfil-vacio" class="btn btn--primario">➕ Crear primer perfil</button>` : ''}
            </div>`;
        if (esAdmin) {
            div.querySelector('#btn-nuevo-perfil-vacio')
               ?.addEventListener('click', () => _abrirModalPerfil(contenedor, null));
        }
    }

    function _renderizarListaPerfiles(contenedor, perfiles, esAdmin) {
        const div = contenedor.querySelector('#config-dron-contenido');
        if (!div) return;
        const activoId = perfilActivoId();

        const tarjetas = perfiles.map(p => _tarjetaPerfil(p, activoId, esAdmin)).join('');
        div.innerHTML = `<div class="grilla-perfiles" style="display:grid; gap: var(--espacio-md); grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">${tarjetas}</div>`;

        // Eventos de selección y administración
        div.querySelectorAll('.btn-seleccionar-perfil').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                guardarPerfilActivo(id);
                div.querySelectorAll('.tarjeta-perfil').forEach(t => t.classList.remove('tarjeta-perfil--activo'));
                btn.closest('.tarjeta-perfil')?.classList.add('tarjeta-perfil--activo');
                btn.textContent = '✓ Seleccionado';
                btn.disabled = true;
                App.mostrarToast('Perfil seleccionado correctamente', 'exito');
            });
        });

        if (esAdmin) {
            div.querySelectorAll('.btn-editar-perfil').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const perfil = await cargarPerfil(id);
                    _abrirModalPerfil(contenedor, perfil);
                });
            });

            div.querySelectorAll('.btn-eliminar-perfil').forEach(btn => {
                btn.addEventListener('click', () => _confirmarEliminar(contenedor, btn.dataset.id, btn.dataset.nombre, perfiles));
            });
        }
    }

    function _tarjetaPerfil(perfil, activoId, esAdmin) {
        const esActivo = String(perfil.id) === String(activoId);
        const tipo = perfil.tipo_protocolo || 'desconocido';
        const iconoTipo = { tello: '🛸', http: '🌐', udp_tcp: '📡', simulador: '🎮' }[tipo] || '🚁';

        return `
        <div class="tarjeta tarjeta-perfil ${esActivo ? 'tarjeta-perfil--activo' : ''}" data-id="${perfil.id}">
            <div class="flex justify-between items-start mb-sm">
                <div>
                    <span style="font-size:1.75rem;">${iconoTipo}</span>
                    <h3 class="texto-md font-semibold mt-xs">${_esc(perfil.nombre)}</h3>
                </div>
                <div class="flex gap-xs">
                    ${esAdmin ? `
                        <button class="btn btn--icono btn-editar-perfil" data-id="${perfil.id}" title="Editar perfil">✏️</button>
                        <button class="btn btn--icono btn-eliminar-perfil" data-id="${perfil.id}" data-nombre="${_esc(perfil.nombre)}" title="Eliminar perfil">🗑️</button>
                    ` : ''}
                </div>
            </div>
            <div class="texto-sm texto-secundario mb-xs">
                <span class="badge badge--info">${tipo}</span>
            </div>
            ${perfil.descripcion ? `<p class="texto-sm texto-secundario mb-md">${_esc(perfil.descripcion)}</p>` : '<div class="mb-md"></div>'}
            <div class="texto-xs texto-secundario mb-md">
                ${perfil.ip_dron ? `IP: <code>${_esc(perfil.ip_dron)}</code>` : ''}
                ${perfil.puerto_cmd ? ` · Puerto CMD: <code>${_esc(String(perfil.puerto_cmd))}</code>` : ''}
            </div>
            <button class="btn ${esActivo ? 'btn--secundario' : 'btn--primario'} btn-seleccionar-perfil w-full" data-id="${perfil.id}" ${esActivo ? 'disabled' : ''}>
                ${esActivo ? '✓ Seleccionado' : 'Seleccionar'}
            </button>
        </div>`;
    }

    // ----------------------------------------------------------------
    // Modal de creación / edición
    // ----------------------------------------------------------------

    function _abrirModalPerfil(contenedor, perfil) {
        const modal = contenedor.querySelector('#modal-perfil');
        const titulo = contenedor.querySelector('#modal-perfil-titulo');
        const body   = contenedor.querySelector('#modal-perfil-body');
        if (!modal || !body) return;

        titulo.textContent = perfil ? 'Editar perfil de dron' : 'Nuevo perfil de dron';
        body.innerHTML = _formularioPerfil(perfil);
        modal.style.display = 'flex';
        body.querySelector('#campo-nombre-perfil')?.focus();

        // Cerrar
        contenedor.querySelector('#btn-cerrar-modal-perfil')?.addEventListener('click', () => { modal.style.display = 'none'; });
        contenedor.querySelector('#modal-perfil-overlay')?.addEventListener('click', () => { modal.style.display = 'none'; });
        body.querySelector('#btn-cancelar-perfil')?.addEventListener('click', () => { modal.style.display = 'none'; });

        // Guardar
        body.querySelector('#form-perfil')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await _guardarPerfil(contenedor, body, perfil ? perfil.id : null);
        });

        // Mostrar/ocultar campos según protocolo
        body.querySelector('#campo-tipo-protocolo')?.addEventListener('change', () => {
            _actualizarCamposProtocolo(body);
        });
        _actualizarCamposProtocolo(body);
    }

    function _formularioPerfil(perfil) {
        const p = perfil || {};
        const tipos = ['tello', 'http', 'udp_tcp', 'simulador'];
        const opcionesTipo = tipos.map(t =>
            `<option value="${t}" ${p.tipo_protocolo === t ? 'selected' : ''}>${t}</option>`
        ).join('');

        return `
        <form id="form-perfil" novalidate>
            <div class="campo-formulario">
                <label class="campo-formulario__etiqueta" for="campo-nombre-perfil">Nombre *</label>
                <input id="campo-nombre-perfil" class="campo-formulario__entrada" name="nombre"
                    type="text" required maxlength="80" value="${_esc(p.nombre || '')}" placeholder="Ej: Tello del aula">
            </div>
            <div class="campo-formulario">
                <label class="campo-formulario__etiqueta" for="campo-tipo-protocolo">Tipo de protocolo *</label>
                <select id="campo-tipo-protocolo" class="campo-formulario__entrada" name="tipo_protocolo" required>
                    ${opcionesTipo}
                </select>
            </div>
            <div class="campo-formulario">
                <label class="campo-formulario__etiqueta" for="campo-descripcion-perfil">Descripción</label>
                <input id="campo-descripcion-perfil" class="campo-formulario__entrada" name="descripcion"
                    type="text" maxlength="200" value="${_esc(p.descripcion || '')}" placeholder="Descripción opcional">
            </div>
            <div id="campos-red-perfil">
                <div class="campo-formulario">
                    <label class="campo-formulario__etiqueta" for="campo-ip-dron">IP del dron</label>
                    <input id="campo-ip-dron" class="campo-formulario__entrada" name="ip_dron"
                        type="text" maxlength="45" value="${_esc(p.ip_dron || p.ip || '')}" placeholder="Ej: 192.168.10.1">
                </div>
                <div class="flex gap-sm">
                    <div class="campo-formulario" style="flex:1;">
                        <label class="campo-formulario__etiqueta" for="campo-puerto-cmd">Puerto CMD</label>
                        <input id="campo-puerto-cmd" class="campo-formulario__entrada" name="puerto_cmd"
                            type="number" min="1" max="65535" value="${p.puerto_cmd || p.puerto_comando || ''}" placeholder="8889">
                    </div>
                    <div class="campo-formulario" style="flex:1;">
                        <label class="campo-formulario__etiqueta" for="campo-puerto-estado">Puerto Estado</label>
                        <input id="campo-puerto-estado" class="campo-formulario__entrada" name="puerto_estado"
                            type="number" min="1" max="65535" value="${p.puerto_estado || ''}" placeholder="8890">
                    </div>
                </div>
                <div class="campo-formulario">
                    <label class="campo-formulario__etiqueta" for="campo-puerto-video">Puerto Video</label>
                    <input id="campo-puerto-video" class="campo-formulario__entrada" name="puerto_video"
                        type="number" min="1" max="65535" value="${p.puerto_video || ''}" placeholder="11111">
                </div>
            </div>
            <div class="campo-formulario">
                <label class="campo-formulario__etiqueta" for="campo-plantilla-cmds">Plantilla de comandos (JSON)</label>
                <textarea id="campo-plantilla-cmds" class="campo-formulario__entrada" name="plantilla_comandos"
                    rows="4" placeholder='{"despegar":"takeoff","aterrizar":"land"}'>${_esc(
                        typeof p.plantilla_comandos === 'object'
                            ? JSON.stringify(p.plantilla_comandos, null, 2)
                            : (p.plantilla_comandos || '')
                    )}</textarea>
                <span class="campo-formulario__ayuda">Opcional. Sobreescribe los comandos por defecto del adaptador.</span>
            </div>
            <div id="error-form-perfil" class="alerta alerta--error" style="display:none;"></div>
            <div class="flex gap-sm justify-end mt-md">
                <button type="button" id="btn-cancelar-perfil" class="btn btn--secundario">Cancelar</button>
                <button type="submit" class="btn btn--primario" id="btn-guardar-perfil">
                    ${perfil ? '💾 Guardar cambios' : '➕ Crear perfil'}
                </button>
            </div>
        </form>`;
    }

    function _actualizarCamposProtocolo(body) {
        const tipo = body.querySelector('#campo-tipo-protocolo')?.value;
        const campos = body.querySelector('#campos-red-perfil');
        if (!campos) return;
        // El simulador no requiere IP/puerto
        campos.style.display = (tipo === 'simulador') ? 'none' : 'block';
    }

    async function _guardarPerfil(contenedor, body, idExistente) {
        const form = body.querySelector('#form-perfil');
        const errorDiv = body.querySelector('#error-form-perfil');
        const btnGuardar = body.querySelector('#btn-guardar-perfil');

        if (!form) return;

        // Recoger datos
        const datos = {};
        new FormData(form).forEach((val, key) => { datos[key] = val; });

        // Validar plantilla JSON si hay algo escrito
        if (datos.plantilla_comandos && datos.plantilla_comandos.trim()) {
            try {
                datos.plantilla_comandos = JSON.parse(datos.plantilla_comandos);
            } catch (err) {
                errorDiv.textContent = 'La plantilla de comandos no es JSON válido: ' + err.message;
                errorDiv.style.display = 'block';
                return;
            }
        } else {
            delete datos.plantilla_comandos;
        }

        // Convertir puertos a enteros
        ['puerto_cmd', 'puerto_estado', 'puerto_video'].forEach(k => {
            if (datos[k]) datos[k] = parseInt(datos[k], 10);
            else delete datos[k];
        });

        // Sincronizar nombres para compatibilidad BD / Adaptadores
        datos.ip = datos.ip_dron || datos.ip || '192.168.10.1';
        datos.ip_dron = datos.ip;
        datos.puerto_comando = datos.puerto_cmd || datos.puerto_comando || 8889;
        datos.puerto_cmd = datos.puerto_comando;
        datos.tipo_adaptador = datos.tipo_protocolo || datos.tipo_adaptador || 'tello';
        datos.tipo_protocolo = datos.tipo_adaptador;

        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';
        errorDiv.style.display = 'none';

        try {
            if (idExistente) {
                await API.perfilesDron.actualizar(idExistente, datos);
                App.mostrarToast('Perfil actualizado correctamente', 'exito');
            } else {
                await API.perfilesDron.crear(datos);
                App.mostrarToast('Perfil creado correctamente', 'exito');
            }

            // Cerrar modal y recargar lista
            const modal = contenedor.querySelector('#modal-perfil');
            if (modal) modal.style.display = 'none';
            await inicializar(contenedor);
        } catch (err) {
            errorDiv.textContent = 'Error al guardar: ' + (err.message || 'error desconocido');
            errorDiv.style.display = 'block';
            btnGuardar.disabled = false;
            btnGuardar.textContent = idExistente ? '💾 Guardar cambios' : '➕ Crear perfil';
        }
    }

    function _confirmarEliminar(contenedor, id, nombre, perfilesActuales) {
        if (!confirm(`¿Eliminar el perfil "${nombre}"?\n\nEsta acción no se puede deshacer.`)) return;
        API.perfilesDron.eliminar(id)
            .then(() => {
                if (perfilActivoId() === String(id)) guardarPerfilActivo(null);
                App.mostrarToast('Perfil eliminado', 'info');
                return inicializar(contenedor);
            })
            .catch(err => App.mostrarToast('Error al eliminar: ' + err.message, 'error'));
    }

    // ----------------------------------------------------------------
    // Eventos globales del módulo
    // ----------------------------------------------------------------

    function _agregarEventos(contenedor, esAdmin) {
        if (esAdmin) {
            contenedor.querySelector('#btn-nuevo-perfil')
                ?.addEventListener('click', () => _abrirModalPerfil(contenedor, null));
        }
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

    // ----------------------------------------------------------------
    // API pública
    // ----------------------------------------------------------------
    return {
        inicializar,
        cargarPerfiles,
        cargarPerfil,
        perfilActivoId,
        guardarPerfilActivo,
        leerCache,
    };
})();
