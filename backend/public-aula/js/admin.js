/**
 * Panel de Administración — Grupo 5: Control de Sistemas y Dron
 * 
 * Gestión de dispositivos, botones, códigos IR, usuarios,
 * historial de comandos y configuración del sistema.
 */

// eslint-disable-next-line no-unused-vars
const Admin = (() => {
    'use strict';

    let tabActual = 'dispositivos';

    /**
     * Inicializa el panel de administración.
     */
    function inicializar() {
        configurarTabs();
        cargarTab('historial');
    }

    /**
     * Configura los eventos de las pestañas.
     */
    function configurarTabs() {
        document.querySelectorAll('.admin-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                const nombre = tab.dataset.tab;
                cargarTab(nombre);
            });
        });
    }

    /**
     * Activa una pestaña y carga su contenido.
     */
    function cargarTab(nombre) {
        tabActual = nombre;

        // Actualizar UI de tabs
        document.querySelectorAll('.admin-tab').forEach((t) => {
            t.classList.toggle('activo', t.dataset.tab === nombre);
        });

        // Cargar contenido
        const contenido = document.getElementById('admin-contenido');
        if (!contenido) return;

        switch (nombre) {
            case 'historial':    cargarTabHistorial(contenido); break;
            case 'usuarios':     cargarTabUsuarios(contenido); break;
            case 'config':       cargarTabConfig(contenido); break;
            default: contenido.innerHTML = '<p>Pestaña no encontrada.</p>';
        }
    }

    // ============================================================
    // Tab: Historial
    // ============================================================
    async function cargarTabHistorial(contenedor) {
        contenedor.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-body-secondary" role="status"><span class="visually-hidden">Cargando...</span></div></div>';

        try {
            const resp = await API.comandos.historial(50);
            const historial = resp.historial || [];

            contenedor.innerHTML = `
                <h2 class="h5 fw-bold text-uppercase mb-3">Historial de órdenes</h2>
                <div class="table-responsive">
                    <table class="table table-sm align-middle">
                        <thead><tr><th>Fecha</th><th>Dispositivo</th><th>Botón</th><th>Estado</th><th>Resultado</th></tr></thead>
                        <tbody>
                            ${historial.length === 0 ? '<tr><td colspan="5" class="text-center text-body-secondary">Sin registros</td></tr>' : ''}
                            ${historial.map((h) => `
                                <tr>
                                    <td class="small text-nowrap">${new Date(h.ejecutado_en).toLocaleString('es-AR')}</td>
                                    <td>${h.dispositivo || '-'}</td>
                                    <td>${h.boton || '-'}</td>
                                    <td><span class="badge ${h.estado === 'ejecutado' ? 'text-bg-success' : 'text-bg-danger'}">${h.estado}</span></td>
                                    <td class="small">${h.resultado || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            contenedor.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        }
    }

    // ============================================================
    // Tab: Usuarios
    // ============================================================
    async function cargarTabUsuarios(contenedor) {
        contenedor.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-body-secondary" role="status"><span class="visually-hidden">Cargando...</span></div></div>';

        try {
            const resp = await API.usuarios.listar();
            const usuarios = resp.usuarios || [];

            contenedor.innerHTML = `
                <div class="d-flex justify-content-between align-items-center gap-2 mb-3">
                    <h2 class="h5 fw-bold text-uppercase mb-0">Usuarios</h2>
                    <button class="btn btn-primary" onclick="Admin.mostrarFormUsuario()">Nuevo usuario</button>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm align-middle">
                        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
                        <tbody>
                            ${usuarios.map((u) => `
                                <tr>
                                    <td><strong>${u.nombre}</strong></td>
                                    <td class="small">${u.email}</td>
                                    <td><span class="badge text-bg-secondary">${u.rol}</span></td>
                                    <td><span class="badge ${u.activo ? 'text-bg-success' : 'text-bg-danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-secondary" onclick="Admin.eliminarUsuario(${u.id})" title="Desactivar">Desactivar</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            contenedor.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        }
    }

    /**
     * Muestra formulario para crear un usuario.
     */
    function mostrarFormUsuario() {
        const html = `
            <div class="modal-overlay modal" id="modal-usuario">
              <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title fs-5">Nuevo usuario</h2>
                        <button type="button" class="btn-close" onclick="Admin.cerrarModal()" aria-label="Cerrar"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3"><label class="form-label" for="usr-nombre">Nombre</label><input class="form-control" id="usr-nombre" type="text" required></div>
                        <div class="mb-3"><label class="form-label" for="usr-email">Email</label><input class="form-control" id="usr-email" type="email" required></div>
                        <div class="mb-3"><label class="form-label" for="usr-password">Contraseña</label><input class="form-control" id="usr-password" type="password" minlength="6" required></div>
                        <div>
                            <label class="form-label" for="usr-rol">Rol</label>
                            <select class="form-select" id="usr-rol">
                                <option value="usuario">Usuario</option>
                                <option value="docente">Docente</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline-secondary" onclick="Admin.cerrarModal()">Cancelar</button>
                        <button class="btn btn-primary" onclick="Admin.crearUsuario()">Crear</button>
                    </div>
                </div>
              </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    async function crearUsuario() {
        const datos = {
            nombre: document.getElementById('usr-nombre').value.trim(),
            email: document.getElementById('usr-email').value.trim(),
            password: document.getElementById('usr-password').value,
            rol: document.getElementById('usr-rol').value,
        };
        if (!datos.nombre || !datos.email || !datos.password) {
            App.mostrarToast('Completá todos los campos.', 'advertencia');
            return;
        }
        try {
            await API.auth.registro(datos);
            App.mostrarToast('Usuario creado.', 'exito');
            cerrarModal();
            cargarTab('usuarios');
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    async function eliminarUsuario(id) {
        if (!confirm('¿Desactivar este usuario?')) return;
        try {
            await API.usuarios.eliminar(id);
            App.mostrarToast('Usuario desactivado.', 'exito');
            cargarTab('usuarios');
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    // ============================================================
    // Tab: Configuración
    // ============================================================
    async function cargarTabConfig(contenedor) {
        contenedor.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-body-secondary" role="status"><span class="visually-hidden">Cargando...</span></div></div>';

        try {
            const resp = await API.configuracion.obtener();
            const configs = resp.configuracion || [];
            const valores = resp.valores || {};

            contenedor.innerHTML = `
                <h2 class="h5 fw-bold text-uppercase mb-3">Relé de las luces (220 V)</h2>
                <div class="alert alert-warning small">
                    <strong class="d-block mb-1">Requiere supervisión docente y medidas de seguridad eléctrica.</strong>
                    El control de un circuito de 220 V mediante relé involucra riesgo eléctrico. Solo activar bajo supervisión de un docente calificado.
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" role="switch" id="cfg-rele" ${valores.rele_habilitado === '1' ? 'checked' : ''} onchange="Admin.toggleRele(this.checked)">
                    <label class="form-check-label" for="cfg-rele">Relé habilitado</label>
                </div>

            `;
        } catch (error) {
            contenedor.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        }
    }

    async function toggleRele(habilitado) {
        try {
            if (habilitado) {
                const confirmado = confirm(
                    'ADVERTENCIA DE SEGURIDAD\n\n' +
                    'Estás por habilitar el control de un circuito de 220V.\n' +
                    'Esto SOLO debe hacerse bajo supervisión docente y con las medidas de seguridad eléctrica adecuadas.\n\n' +
                    '¿Confirmar activación?'
                );
                if (!confirmado) {
                    document.getElementById('cfg-rele').checked = false;
                    return;
                }
            }
            await API.configuracion.actualizar({ rele_habilitado: habilitado ? '1' : '0' });
            App.mostrarToast(`Relé ${habilitado ? 'habilitado' : 'deshabilitado'}.`, habilitado ? 'advertencia' : 'info');
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    /**
     * Cierra cualquier modal abierto.
     */
    function cerrarModal() {
        document.querySelectorAll('.modal-overlay').forEach((m) => m.remove());
    }

    return {
        inicializar,
        cargarTab,
        mostrarFormUsuario,
        crearUsuario,
        eliminarUsuario,
        toggleRele,
        cerrarModal,
    };
})();
