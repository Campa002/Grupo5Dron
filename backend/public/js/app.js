/**
 * Aplicación Principal (SPA Router & Orquestador)
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

// eslint-disable-next-line no-unused-vars
const App = (() => {
    'use strict';

    // Caché en memoria de las plantillas parciales para rendimiento instantáneo
    const cachePlantillas = {};

    // Página activa actual
    let paginaActual = null;

    /**
     * Muestra una notificación emergente (Toast) en pantalla.
     * 
     * @param {string} mensaje Texto a mostrar
     * @param {string} tipo 'exito' | 'error' | 'advertencia' | 'info'
     * @param {number} duracion Milisegundos visible (por defecto 3500ms)
     */
    function mostrarToast(mensaje, tipo = 'info', duracion = 3500) {
        const contenedor = document.getElementById('toast-contenedor');
        if (!contenedor) return;

        const iconos = {
            exito: '✓',
            error: '✗',
            advertencia: '⚠️',
            info: 'ℹ️',
        };

        const toast = document.createElement('div');
        toast.className = `toast toast--${tipo}`;
        toast.innerHTML = `
            <span style="font-size: 1.1rem; flex-shrink: 0;">${iconos[tipo] || '⚡'}</span>
            <span style="flex-grow: 1;">${mensaje}</span>
        `;

        contenedor.appendChild(toast);

        // Auto eliminar tras la duración con animación
        setTimeout(() => {
            toast.classList.add('saliendo');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duracion);
    }

    /**
     * Navega programáticamente a una ruta hash.
     * @param {string} ruta Ej: '#/inicio'
     */
    function navegarA(ruta) {
        if (!ruta.startsWith('#/')) {
            ruta = '#/' + ruta.replace(/^\//, '');
        }
        window.location.hash = ruta;
    }

    /**
     * Alterna la visibilidad del menú lateral.
     */
    function toggleMenu() {
        const menu = document.getElementById('menu-lateral');
        if (menu) {
            menu.classList.toggle('abierto');
        }
    }

    /**
     * Abre el menú lateral.
     */
    function abrirMenu() {
        const menu = document.getElementById('menu-lateral');
        if (menu) {
            menu.classList.add('abierto');
        }
    }

    /**
     * Cierra el menú lateral.
     */
    function cerrarMenu() {
        const menu = document.getElementById('menu-lateral');
        if (menu) {
            menu.classList.remove('abierto');
        }
    }

    /**
     * Carga y obtiene una plantilla parcial HTML (/pages/*.html).
     * @param {string} nombre Nombre de la página (ej: 'inicio')
     * @returns {Promise<string>} Contenido HTML
     */
    async function cargarPlantilla(nombre) {
        if (cachePlantillas[nombre]) {
            return cachePlantillas[nombre];
        }

        try {
            const respuesta = await fetch(`/pages/${nombre}.html?v=${Date.now()}`);
            if (!respuesta.ok) {
                throw new Error(`No se pudo cargar la vista "${nombre}" (HTTP ${respuesta.status})`);
            }
            const html = await respuesta.text();
            cachePlantillas[nombre] = html;
            return html;
        } catch (error) {
            return `
                <div class="tarjeta texto-centro" style="padding: var(--espacio-2xl) var(--espacio-md);">
                    <div style="font-size: 3rem; margin-bottom: var(--espacio-sm);">⚠️</div>
                    <h3 class="mb-sm">Error cargando la página</h3>
                    <p class="texto-sm texto-secundario mb-lg">${error.message}</p>
                    <button class="btn btn--primario" onclick="App.cargarRutaActual()">Reintentar</button>
                </div>
            `;
        }
    }

    /**
     * Router SPA: analiza el hash actual y monta la vista correspondiente.
     */
    async function cargarRutaActual() {
        const hash = window.location.hash || '#/inicio';
        const ruta = hash.replace(/^#\/?/, '').split('?')[0].trim() || 'inicio';

        const rutasValidas = ['login', 'inicio', 'aula', 'dron', 'sensores', 'config-dron', 'admin', 'acerca'];
        const destino = rutasValidas.includes(ruta) ? ruta : 'inicio';

        // 1. Control de autenticación
        const estaAutenticado = API.estaAutenticado();

        if (!estaAutenticado && destino !== 'login') {
            window.location.hash = '#/login';
            return;
        }

        if (estaAutenticado && destino === 'login') {
            window.location.hash = '#/inicio';
            return;
        }

        // 2. Control de permisos por rol para /admin
        if (destino === 'admin' && !Auth.esAdmin()) {
            mostrarToast('Se requieren permisos de administrador.', 'advertencia');
            window.location.hash = '#/inicio';
            return;
        }

        // 3. Limpieza de página anterior si corresponde
        if (paginaActual === 'aula' && typeof Aula !== 'undefined' && Aula.destruir) {
            Aula.destruir();
        }
        if (paginaActual === 'dron' && typeof Dron !== 'undefined' && Dron.destruir) {
            Dron.destruir();
        }

        // 4. Adaptación visual del layout (header y menú en pantalla de login)
        const header = document.getElementById('header-principal');
        const btnMenu = document.getElementById('btn-menu');
        const btnUsuario = document.getElementById('btn-usuario');
        const indicadorEsp = document.getElementById('indicador-esp32');

        if (destino === 'login') {
            document.body.classList.add('pantalla-login');
            if (btnMenu) btnMenu.style.visibility = 'hidden';
            if (btnUsuario) btnUsuario.style.visibility = 'hidden';
            if (indicadorEsp) indicadorEsp.style.display = 'none';
        } else {
            document.body.classList.remove('pantalla-login');
            if (btnMenu) btnMenu.style.visibility = 'visible';
            if (btnUsuario) btnUsuario.style.visibility = 'visible';
            if (indicadorEsp) indicadorEsp.style.display = 'flex';
        }

        // 5. Cargar plantilla en el contenedor principal
        const contenedor = document.getElementById('app-contenido');
        if (!contenedor) return;

        contenedor.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div><p>Cargando...</p></div>';

        const html = await cargarPlantilla(destino);
        contenedor.innerHTML = html;
        paginaActual = destino;

        // 6. Actualizar enlaces activos en menú lateral
        actualizarNavegacionActiva(destino);
        cerrarMenu();

        // 7. Inicializar controlador específico de la página
        await inicializarControladorPagina(destino);
    }

    /**
     * Resalta el link actual en el menú lateral.
     */
    function actualizarNavegacionActiva(pagina) {
        document.querySelectorAll('.menu-lateral__enlace').forEach((enlace) => {
            const dataPagina = enlace.dataset.pagina;
            enlace.classList.toggle('activo', dataPagina === pagina);
        });
    }

    /**
     * Inicializa la lógica JS de cada vista luego de inyectar el HTML.
     */
    async function inicializarControladorPagina(pagina) {
        const usuario = Auth.obtenerUsuario();

        // Asegurar clases de rol en el body
        if (usuario && usuario.rol) {
            document.body.classList.remove('rol-admin', 'rol-docente', 'rol-usuario');
            document.body.classList.add(`rol-${usuario.rol}`);
        }

        switch (pagina) {
            case 'login':
                Auth.inicializarPaginaLogin();
                break;

            case 'inicio':
                inicializarPaginaInicio(usuario);
                break;

            case 'aula':
                if (typeof Aula !== 'undefined' && Aula.inicializar) {
                    await Aula.inicializar();
                }
                break;

            case 'admin':
                if (typeof Admin !== 'undefined' && Admin.inicializar) {
                    Admin.inicializar();
                }
                break;

            case 'dron':
                if (typeof Dron !== 'undefined' && Dron.inicializar) {
                    const contenedorDron = document.getElementById('app-contenido');
                    await Dron.inicializar(contenedorDron);
                }
                break;

            case 'sensores': {
                const contenedorSens = document.getElementById('app-contenido');
                if (typeof Sensores !== 'undefined' && contenedorSens) {
                    await inicializarPaginaSensores(contenedorSens);
                }
                break;
            }

            case 'config-dron': {
                const contenedorCfg = document.getElementById('app-contenido');
                if (typeof ConfigDron !== 'undefined' && contenedorCfg) {
                    await ConfigDron.inicializar(contenedorCfg);
                }
                break;
            }

            case 'acerca':
                // Vista estática informativa
                break;
        }
    }

    /**
     * Configura y puebla los datos dinámicos de la página de inicio.
     */
    async function inicializarPaginaInicio(usuario) {
        const elemNombre = document.getElementById('inicio-nombre-usuario');
        const elemRol = document.getElementById('inicio-rol-usuario');

        if (elemNombre && usuario) {
            elemNombre.textContent = usuario.nombre || 'Usuario';
        }

        if (elemRol && usuario) {
            const etiquetasRol = {
                admin: '👑 Administrador',
                docente: '👨‍🏫 Docente',
                usuario: '🎒 Estudiante',
            };
            elemRol.textContent = etiquetasRol[usuario.rol] || usuario.rol;
            elemRol.className = `badge badge--${usuario.rol === 'admin' ? 'advertencia' : (usuario.rol === 'docente' ? 'info' : 'exito')}`;
        }

        // Consultar estado rápido del ESP32 para el resumen
        const elemEsp32 = document.getElementById('inicio-esp32-resumen');
        if (elemEsp32) {
            try {
                const resp = await API.esp32.estado();
                const estado = resp.estado;
                if (estado && estado.en_linea) {
                    elemEsp32.innerHTML = `
                        <div class="flex items-center gap-sm mt-xs">
                            <span class="badge badge--exito">🟢 En línea</span>
                            <span>IP: <code>${estado.ip_local || 'N/A'}</code></span>
                            <span>Señal: <strong>${estado.rssi || 'N/A'} dBm</strong></span>
                            <span>FW: v${estado.version_fw || '1.0'}</span>
                        </div>
                    `;
                } else {
                    elemEsp32.innerHTML = `
                        <div class="flex items-center gap-sm mt-xs">
                            <span class="badge badge--error">🔴 Desconectado</span>
                            <span>Último latido registrado: ${estado && estado.ultimo_heartbeat ? estado.ultimo_heartbeat : 'Sin registros'}</span>
                        </div>
                    `;
                }
            } catch (e) {
                elemEsp32.innerHTML = '<span class="texto-xs texto-secundario">No se pudo verificar el estado del ESP32 en este momento.</span>';
            }
        }
    }

    /**
     * Muestra un diálogo flotante o modal con los datos de sesión del usuario.
     */
    function mostrarModalUsuario() {
        const usuario = Auth.obtenerUsuario();
        if (!usuario) {
            window.location.hash = '#/login';
            return;
        }

        // Remover modal previo si hubiera
        const previo = document.getElementById('modal-usuario');
        if (previo) previo.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'modal-usuario';
        modalOverlay.className = 'modal-overlay';
        modalOverlay.innerHTML = `
            <div class="modal">
                <div class="modal__header">
                    <h3 class="modal__titulo">👤 Perfil de Usuario</h3>
                    <button class="modal__cerrar" id="btn-cerrar-modal-user">&times;</button>
                </div>
                <div class="modal__body">
                    <div class="tarjeta mb-md" style="background: var(--color-fondo-claro);">
                        <div class="flex items-center gap-md">
                            <div style="font-size: 2.5rem;">🎓</div>
                            <div>
                                <h4 style="font-weight: 700;">${usuario.nombre}</h4>
                                <p class="texto-sm texto-secundario">${usuario.email}</p>
                                <span class="badge badge--info mt-xs">${usuario.rol.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>
                    <p class="texto-xs texto-secundario">
                        Conectado al servidor de Grupo 5 — EEST N° 1 "Eduardo Ader".
                    </p>
                </div>
                <div class="modal__footer">
                    <button class="btn btn--secundario" id="btn-modal-cancelar">Cerrar</button>
                    <button class="btn btn--peligro" id="btn-modal-logout">🚪 Cerrar sesión</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        const cerrar = () => modalOverlay.remove();
        document.getElementById('btn-cerrar-modal-user').onclick = cerrar;
        document.getElementById('btn-modal-cancelar').onclick = cerrar;
        modalOverlay.onclick = (e) => { if (e.target === modalOverlay) cerrar(); };

        document.getElementById('btn-modal-logout').onclick = async () => {
            cerrar();
            await Auth.logout();
            mostrarToast('Sesión finalizada.', 'info');
            window.location.hash = '#/login';
        };
    }

    /**
     * Inicializa la vista de Diagnóstico de Sensores (/pages/sensores.html).
     * @param {HTMLElement} contenedor
     */
    async function inicializarPaginaSensores(contenedor) {
        if (!contenedor) return;
        // El HTML ya fue inyectado por el router; activar diagnóstico
        const btnDiagnosticar = contenedor.querySelector('#btn-diagnosticar-sensores');
        const panelResultados = contenedor.querySelector('#panel-resultados-sensores');
        if (!btnDiagnosticar || !panelResultados) return;

        async function ejecutarDiagnostico() {
            btnDiagnosticar.disabled = true;
            btnDiagnosticar.textContent = 'Diagnosticando...';
            panelResultados.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div><p>Verificando sensores...</p></div>';

            await Sensores.diagnosticar((nombre, resultado) => {
                // Actualizar cada fila a medida que llega
                const fila = panelResultados.querySelector(`[data-sensor="${nombre}"]`);
                if (fila) {
                    const iconoEl = fila.querySelector('.sensor-icono-estado');
                    if (iconoEl) iconoEl.textContent = '✓';
                }
            });

            const resumen = Sensores.obtenerResumen();
            panelResultados.innerHTML = resumen.map(s => `
                <div class="tarjeta flex items-start gap-md mb-sm" data-sensor="${s.nombre.toLowerCase().replace(/ /g, '_')}">
                    <span style="font-size:1.75rem; flex-shrink:0;">${s.icono}</span>
                    <div style="flex:1;">
                        <div class="flex justify-between items-center">
                            <strong class="texto-sm">${s.nombre}</strong>
                            <span class="badge ${s.ok ? 'badge--exito' : 'badge--error'} sensor-icono-estado">
                                ${s.ok ? '✓ ' + s.estado : '✗ ' + s.estado}
                            </span>
                        </div>
                        <p class="texto-xs texto-secundario mt-xs">${s.detalle}</p>
                    </div>
                </div>
            `).join('');

            btnDiagnosticar.disabled = false;
            btnDiagnosticar.textContent = '🔄 Repetir diagnóstico';
        }

        btnDiagnosticar.addEventListener('click', ejecutarDiagnostico);
        // Ejecutar automáticamente al abrir la pantalla
        await ejecutarDiagnostico();
    }

    /**
     * Inicialización global de la aplicación.
     */
    async function iniciar() {
        // Enlazar eventos del menú lateral
        const btnMenu = document.getElementById('btn-menu');
        if (btnMenu) {
            btnMenu.addEventListener('click', toggleMenu);
        }

        const overlay = document.getElementById('menu-overlay');
        if (overlay) {
            overlay.addEventListener('click', cerrarMenu);
        }

        const btnUsuario = document.getElementById('btn-usuario');
        if (btnUsuario) {
            btnUsuario.addEventListener('click', mostrarModalUsuario);
        }

        const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');
        if (btnCerrarSesion) {
            btnCerrarSesion.addEventListener('click', async (e) => {
                e.preventDefault();
                cerrarMenu();
                await Auth.logout();
                mostrarToast('Sesión finalizada.', 'info');
                window.location.hash = '#/login';
            });
        }

        // Cerrar menú al hacer clic en enlaces del menú lateral
        document.querySelectorAll('.menu-lateral__enlace').forEach((enlace) => {
            enlace.addEventListener('click', () => {
                cerrarMenu();
            });
        });

        // Verificar sesión activa antes de la primera carga
        if (API.estaAutenticado()) {
            try {
                await Auth.verificarSesion();
            } catch (e) {
                // Si la sesión no es válida, Auth.verificarSesion ya limpia el token
            }
        }

        // Escuchar cambios de hash
        window.addEventListener('hashchange', cargarRutaActual);

        // Cargar vista inicial
        cargarRutaActual();
    }

    // Auto inicializar al terminar de cargar el DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

    // Exponer API pública
    return {
        mostrarToast,
        navegarA,
        toggleMenu,
        abrirMenu,
        cerrarMenu,
        cargarRutaActual,
        mostrarModalUsuario,
    };
})();
