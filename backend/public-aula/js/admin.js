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
        contenedor.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div></div>';

        try {
            const resp = await API.comandos.historial(50);
            const historial = resp.historial || [];

            contenedor.innerHTML = `
                <h3 class="mb-md">Historial de comandos</h3>
                <div class="tabla-contenedor">
                    <table class="tabla">
                        <thead><tr><th>Fecha</th><th>Dispositivo</th><th>Botón</th><th>Estado</th><th>Resultado</th></tr></thead>
                        <tbody>
                            ${historial.length === 0 ? '<tr><td colspan="5" class="texto-centro texto-secundario">Sin registros</td></tr>' : ''}
                            ${historial.map((h) => `
                                <tr>
                                    <td class="texto-xs">${new Date(h.ejecutado_en).toLocaleString('es-AR')}</td>
                                    <td>${h.dispositivo || '-'}</td>
                                    <td>${h.boton || '-'}</td>
                                    <td><span class="badge badge--${h.estado === 'ejecutado' ? 'exito' : 'error'}">${h.estado}</span></td>
                                    <td class="texto-xs">${h.resultado || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            contenedor.innerHTML = `<p class="texto-error">Error: ${error.message}</p>`;
        }
    }

    // ============================================================
    // Tab: Usuarios
    // ============================================================
    async function cargarTabUsuarios(contenedor) {
        contenedor.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div></div>';

        try {
            const resp = await API.usuarios.listar();
            const usuarios = resp.usuarios || [];

            contenedor.innerHTML = `
                <div class="flex justify-between items-center mb-md">
                    <h3>Usuarios</h3>
                    <button class="btn btn--primario" onclick="Admin.mostrarFormUsuario()">+ Nuevo usuario</button>
                </div>
                <div class="tabla-contenedor">
                    <table class="tabla">
                        <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
                        <tbody>
                            ${usuarios.map((u) => `
                                <tr>
                                    <td><strong>${u.nombre}</strong></td>
                                    <td class="texto-xs">${u.email}</td>
                                    <td><span class="badge badge--info">${u.rol}</span></td>
                                    <td><span class="badge badge--${u.activo ? 'exito' : 'error'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                                    <td>
                                        <button class="btn btn--secundario btn--icono" onclick="Admin.eliminarUsuario(${u.id})" title="Desactivar" aria-label="Desactivar"><span class="ico ico--prohibido" aria-hidden="true"></span></button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            contenedor.innerHTML = `<p class="texto-error">Error: ${error.message}</p>`;
        }
    }

    /**
     * Muestra formulario para crear un usuario.
     */
    function mostrarFormUsuario() {
        const html = `
            <div class="modal-overlay" id="modal-usuario">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__titulo">Nuevo usuario</h3>
                        <button class="modal__cerrar" onclick="Admin.cerrarModal()">&times;</button>
                    </div>
                    <div class="modal__body">
                        <div class="campo"><label class="campo__label">Nombre</label><input class="campo__input" id="usr-nombre" type="text" required></div>
                        <div class="campo"><label class="campo__label">Email</label><input class="campo__input" id="usr-email" type="email" required></div>
                        <div class="campo"><label class="campo__label">Contraseña</label><input class="campo__input" id="usr-password" type="password" minlength="6" required></div>
                        <div class="campo">
                            <label class="campo__label">Rol</label>
                            <select class="campo__input" id="usr-rol">
                                <option value="usuario">Usuario</option>
                                <option value="docente">Docente</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secundario" onclick="Admin.cerrarModal()">Cancelar</button>
                        <button class="btn btn--primario" onclick="Admin.crearUsuario()">Crear</button>
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
        contenedor.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div></div>';

        try {
            const resp = await API.configuracion.obtener();
            const configs = resp.configuracion || [];
            const valores = resp.valores || {};

            contenedor.innerHTML = `
                <h3 class="mb-md">Configuración del sistema</h3>

                <div class="tarjeta mb-md">
                    <div class="tarjeta__titulo">Control de relé 220V</div>
                    <div class="advertencia-seguridad">
                        <span class="advertencia-seguridad__icono"><span class="ico ico--alerta" aria-hidden="true"></span></span>
                        <div>
                            <strong>Requiere supervisión docente y medidas de seguridad eléctrica.</strong>
                            <p class="texto-xs mt-sm">El control de un circuito de 220V mediante relé involucra riesgo eléctrico. Solo activar bajo supervisión de un docente calificado.</p>
                        </div>
                    </div>
                    <label class="switch mt-md">
                        <input type="checkbox" id="cfg-rele" ${valores.rele_habilitado === '1' ? 'checked' : ''} onchange="Admin.toggleRele(this.checked)">
                        <span class="switch__control"></span>
                        <span class="switch__label">Relé habilitado</span>
                    </label>
                </div>

            `;
        } catch (error) {
            contenedor.innerHTML = `<p class="texto-error">Error: ${error.message}</p>`;
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
