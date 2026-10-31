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
        cargarTab('dispositivos');
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
            case 'dispositivos': cargarTabDispositivos(contenido); break;
            case 'historial':    cargarTabHistorial(contenido); break;
            case 'usuarios':     cargarTabUsuarios(contenido); break;
            case 'config':       cargarTabConfig(contenido); break;
            default: contenido.innerHTML = '<p>Pestaña no encontrada.</p>';
        }
    }

    // ============================================================
    // Tab: Dispositivos
    // ============================================================
    async function cargarTabDispositivos(contenedor) {
        contenedor.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div></div>';

        try {
            const resp = await API.dispositivos.listar();
            const dispositivos = resp.dispositivos || [];

            contenedor.innerHTML = `
                <div class="flex justify-between items-center mb-md">
                    <h3>Dispositivos del aula</h3>
                    <button class="btn btn--primario" onclick="Admin.mostrarFormDispositivo()">+ Nuevo dispositivo</button>
                </div>
                <div class="tabla-contenedor">
                    <table class="tabla">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>Botones</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${dispositivos.map((d) => `
                                <tr>
                                    <td><strong>${d.nombre}</strong></td>
                                    <td>${d.tipo}</td>
                                    <td>${(d.botones || []).length} botones</td>
                                    <td><span class="badge badge--${d.activo ? 'exito' : 'error'}">${d.activo ? 'Activo' : 'Inactivo'}</span></td>
                                    <td>
                                        <button class="btn btn--secundario btn--icono" onclick="Admin.editarDispositivo(${d.id})" title="Editar">✏️</button>
                                        <button class="btn btn--secundario btn--icono" onclick="Admin.gestionarBotones(${d.id})" title="Botones">🎛️</button>
                                        <button class="btn btn--peligro btn--icono" onclick="Admin.eliminarDispositivo(${d.id})" title="Eliminar">🗑️</button>
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
     * Muestra el formulario para crear/editar un dispositivo.
     */
    function mostrarFormDispositivo(datosExistentes = null) {
        const esEdicion = !!datosExistentes;
        const html = `
            <div class="modal-overlay" id="modal-dispositivo">
                <div class="modal">
                    <div class="modal__header">
                        <h3 class="modal__titulo">${esEdicion ? 'Editar' : 'Nuevo'} dispositivo</h3>
                        <button class="modal__cerrar" onclick="Admin.cerrarModal()">&times;</button>
                    </div>
                    <div class="modal__body">
                        <div class="campo">
                            <label class="campo__label" for="disp-nombre">Nombre</label>
                            <input class="campo__input" id="disp-nombre" type="text" placeholder="Ej: Aire acondicionado" value="${datosExistentes?.nombre || ''}" required>
                        </div>
                        <div class="campo">
                            <label class="campo__label" for="disp-tipo">Tipo</label>
                            <select class="campo__input" id="disp-tipo">
                                <option value="luz" ${datosExistentes?.tipo === 'luz' ? 'selected' : ''}>💡 Luz</option>
                                <option value="ventilador" ${datosExistentes?.tipo === 'ventilador' ? 'selected' : ''}>🌀 Ventilador</option>
                                <option value="aire" ${datosExistentes?.tipo === 'aire' ? 'selected' : ''}>❄️ Aire acondicionado</option>
                                <option value="proyector" ${datosExistentes?.tipo === 'proyector' ? 'selected' : ''}>📽️ Proyector</option>
                                <option value="otro" ${datosExistentes?.tipo === 'otro' ? 'selected' : ''}>🔌 Otro</option>
                            </select>
                        </div>
                        <div class="campo">
                            <label class="campo__label" for="disp-orden">Orden (posición)</label>
                            <input class="campo__input" id="disp-orden" type="number" min="0" value="${datosExistentes?.orden || 0}">
                        </div>
                    </div>
                    <div class="modal__footer">
                        <button class="btn btn--secundario" onclick="Admin.cerrarModal()">Cancelar</button>
                        <button class="btn btn--primario" onclick="Admin.guardarDispositivo(${datosExistentes?.id || 'null'})">${esEdicion ? 'Guardar' : 'Crear'}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    /**
     * Guarda (crea o actualiza) un dispositivo.
     */
    async function guardarDispositivo(id) {
        const datos = {
            nombre: document.getElementById('disp-nombre').value.trim(),
            tipo: document.getElementById('disp-tipo').value,
            orden: parseInt(document.getElementById('disp-orden').value) || 0,
        };

        if (!datos.nombre) {
            App.mostrarToast('El nombre es obligatorio.', 'advertencia');
            return;
        }

        try {
            if (id) {
                await API.dispositivos.actualizar(id, datos);
                App.mostrarToast('Dispositivo actualizado.', 'exito');
            } else {
                await API.dispositivos.crear(datos);
                App.mostrarToast('Dispositivo creado.', 'exito');
            }
            cerrarModal();
            cargarTab('dispositivos');
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    /**
     * Edita un dispositivo existente.
     */
    async function editarDispositivo(id) {
        try {
            const resp = await API.dispositivos.obtener(id);
            mostrarFormDispositivo(resp.dispositivo);
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    /**
     * Elimina un dispositivo con confirmación.
     */
    async function eliminarDispositivo(id) {
        if (!confirm('¿Estás seguro de eliminar este dispositivo? Se eliminarán también todos sus botones y códigos IR.')) {
            return;
        }
        try {
            await API.dispositivos.eliminar(id);
            App.mostrarToast('Dispositivo eliminado.', 'exito');
            cargarTab('dispositivos');
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    /**
     * Gestiona los botones de un dispositivo (modal con lista y acciones).
     */
    async function gestionarBotones(dispositivoId) {
        try {
            const resp = await API.botones.listar(dispositivoId);
            const botones = resp.botones || [];
            const dispResp = await API.dispositivos.obtener(dispositivoId);
            const dispositivo = dispResp.dispositivo;

            const html = `
                <div class="modal-overlay" id="modal-botones">
                    <div class="modal" style="max-width:36rem">
                        <div class="modal__header">
                            <h3 class="modal__titulo">Botones: ${dispositivo.nombre}</h3>
                            <button class="modal__cerrar" onclick="Admin.cerrarModal()">&times;</button>
                        </div>
                        <div class="modal__body">
                            <div class="flex justify-between items-center mb-md">
                                <span class="texto-sm texto-secundario">${botones.length} botones</span>
                                <button class="btn btn--primario" onclick="Admin.mostrarFormBoton(${dispositivoId})">+ Nuevo botón</button>
                            </div>
                            ${botones.map((b) => `
                                <div class="tarjeta mb-md" style="padding:0.75rem">
                                    <div class="flex justify-between items-center">
                                        <div>
                                            <strong>${b.nombre}</strong>
                                            ${b.codigo_ir_id
                                                ? `<span class="badge badge--exito ml-sm">IR: ${b.protocolo} ${b.codigo || 'RAW'}</span>`
                                                : '<span class="badge badge--advertencia">Sin código IR</span>'
                                            }
                                        </div>
                                        <div class="flex gap-sm">
                                            <button class="btn btn--secundario btn--icono" onclick="Aula.activarAprendizaje(${b.id})" title="Aprender IR">📡</button>
                                            <button class="btn btn--peligro btn--icono" onclick="Admin.eliminarBoton(${b.id}, ${dispositivoId})" title="Eliminar">🗑️</button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    /**
     * Muestra formulario para crear un botón.
     */
    function mostrarFormBoton(dispositivoId) {
        const nombre = prompt('Nombre del botón (ej: Encender, Subir temperatura):');
        if (!nombre) return;

        API.botones.crear({ dispositivo_id: dispositivoId, nombre: nombre.trim() })
            .then(() => {
                App.mostrarToast('Botón creado.', 'exito');
                cerrarModal();
                gestionarBotones(dispositivoId);
            })
            .catch((err) => App.mostrarToast(err.message, 'error'));
    }

    /**
     * Elimina un botón.
     */
    async function eliminarBoton(botonId, dispositivoId) {
        if (!confirm('¿Eliminar este botón y su código IR?')) return;
        try {
            await API.botones.eliminar(botonId);
            App.mostrarToast('Botón eliminado.', 'exito');
            cerrarModal();
            gestionarBotones(dispositivoId);
        } catch (error) {
            App.mostrarToast(error.message, 'error');
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
                                        <button class="btn btn--secundario btn--icono" onclick="Admin.eliminarUsuario(${u.id})" title="Desactivar">🚫</button>
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
                    <div class="tarjeta__titulo">⚡ Control de relé 220V</div>
                    <div class="advertencia-seguridad">
                        <span class="advertencia-seguridad__icono">⚠️</span>
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

                <div class="tarjeta mb-md">
                    <div class="tarjeta__titulo">🔧 Parámetros del ESP32</div>
                    <div class="campo">
                        <label class="campo__label">Intervalo de polling (ms)</label>
                        <input class="campo__input" id="cfg-polling" type="number" value="${valores.polling_intervalo_ms || 1000}" min="500" max="10000">
                    </div>
                    <div class="campo">
                        <label class="campo__label">Timeout heartbeat (seg)</label>
                        <input class="campo__input" id="cfg-heartbeat" type="number" value="${valores.heartbeat_timeout_seg || 30}" min="5" max="120">
                    </div>
                </div>

                <div class="tarjeta mb-md">
                    <div class="tarjeta__titulo">🎮 Giroscopio</div>
                    <div class="campo">
                        <label class="campo__label">Zona muerta (grados)</label>
                        <input class="campo__input" id="cfg-zona-muerta" type="number" value="${valores.giroscopio_zona_muerta || 5}" min="1" max="30">
                    </div>
                    <div class="campo">
                        <label class="campo__label">Sensibilidad (1-100)</label>
                        <input class="campo__input" id="cfg-sensibilidad" type="number" value="${valores.giroscopio_sensibilidad || 50}" min="1" max="100">
                    </div>
                </div>

                <button class="btn btn--primario btn--bloque" onclick="Admin.guardarConfig()">Guardar configuración</button>
            `;
        } catch (error) {
            contenedor.innerHTML = `<p class="texto-error">Error: ${error.message}</p>`;
        }
    }

    async function toggleRele(habilitado) {
        try {
            if (habilitado) {
                const confirmado = confirm(
                    '⚠️ ADVERTENCIA DE SEGURIDAD ⚠️\n\n' +
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

    async function guardarConfig() {
        try {
            await API.configuracion.actualizar({
                polling_intervalo_ms: document.getElementById('cfg-polling').value,
                heartbeat_timeout_seg: document.getElementById('cfg-heartbeat').value,
                giroscopio_zona_muerta: document.getElementById('cfg-zona-muerta').value,
                giroscopio_sensibilidad: document.getElementById('cfg-sensibilidad').value,
            });
            App.mostrarToast('Configuración guardada.', 'exito');
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
        mostrarFormDispositivo,
        guardarDispositivo,
        editarDispositivo,
        eliminarDispositivo,
        gestionarBotones,
        mostrarFormBoton,
        eliminarBoton,
        mostrarFormUsuario,
        crearUsuario,
        eliminarUsuario,
        toggleRele,
        guardarConfig,
        cerrarModal,
    };
})();
