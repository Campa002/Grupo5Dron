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

    // Función de limpieza de la página activa (por ejemplo, cerrar escuchas UDP de Prueba Tello)
    let limpiezaPaginaActual = null;

    // Número de navegación: si llega otra mientras esta espera, esta se abandona
    let navegacionActual = 0;

    // Pantallas del módulo del dron (si la sesión vence en una de estas, se sigue en modo sin cuenta)
    const RUTAS_DRON = ['dron', 'prueba-tello', 'sensores', 'config-dron', 'acerca'];

    // Rutas permitidas en el modo "dron sin cuenta": el inicio (con las dos opciones) y las del dron
    const RUTAS_SIN_CUENTA = ['inicio', ...RUTAS_DRON];

    // Modo técnico: muestra lo que sirve para diagnosticar (elementos .solo-tecnico). Arranca apagado.
    const CLAVE_MODO_TECNICO = 'grupo5dron_modo_tecnico';

    /** @returns {boolean} true si el modo técnico está activado en este teléfono */
    function modoTecnico() {
        try { return localStorage.getItem(CLAVE_MODO_TECNICO) === '1'; } catch (_) { return false; }
    }

    /** Activa o desactiva el modo técnico (se guarda en el teléfono y se aplica al instante). */
    function cambiarModoTecnico(activo) {
        try {
            if (activo) localStorage.setItem(CLAVE_MODO_TECNICO, '1');
            else localStorage.removeItem(CLAVE_MODO_TECNICO);
        } catch (_) { /* sin almacenamiento: vale hasta cerrar la app */ }
        document.body.classList.toggle('modo-tecnico', !!activo);
    }

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
            exito: 'check',
            error: 'cruz',
            advertencia: 'alerta',
            info: 'info',
        };

        // Texto plano (textContent): un mensaje que venga del servidor no puede inyectar HTML
        const toast = document.createElement('div');
        toast.className = `toast toast--${tipo}`;
        const icono = document.createElement('span');
        icono.className = `toast__icono ico ico--${iconos[tipo] || 'info'}`;
        icono.setAttribute('aria-hidden', 'true');
        const texto = document.createElement('span');
        texto.className = 'toast__texto';
        texto.textContent = mensaje;
        toast.append(icono, texto);

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
     * Carga y obtiene una plantilla parcial HTML (/pages/*.php).
     * Las páginas son .php pero no dependen de PHP: en el APK no hay PHP y Capacitor las sirve como archivos
     * (build-apk.js les quita cualquier bloque <?php ... ?>). Tienen extensión para que Capacitor
     * no responda index.html en su lugar.
     * @param {string} nombre Nombre de la página (ej: 'inicio')
     * @returns {Promise<string>} Contenido HTML
     */
    async function cargarPlantilla(nombre) {
        if (cachePlantillas[nombre]) {
            return cachePlantillas[nombre];
        }

        try {
            // Sin parámetros en la URL (no llena la caché) y revalidando con el servidor: siempre la versión actual
            const respuesta = await fetch(`/pages/${nombre}.php`, { cache: 'no-cache' });
            if (!respuesta.ok) {
                throw new Error(`No se pudo cargar la vista "${nombre}" (HTTP ${respuesta.status})`);
            }
            const html = await respuesta.text();
            // Una vista es un fragmento: si llega un documento completo (por ejemplo, index.html en vez del archivo),
            // se avisa en lugar de meter la app dentro de sí misma
            if (/<!doctype|<html[\s>]/i.test(html.slice(0, 500))) {
                throw new Error(`La vista "${nombre}" llegó como una página completa: el archivo no se encontró`);
            }
            cachePlantillas[nombre] = html;
            return html;
        } catch (error) {
            return `
                <div class="tarjeta texto-centro" style="padding: var(--espacio-2xl) var(--espacio-md);">
                    <div style="margin-bottom: var(--espacio-sm);">${icono('alerta', 'ico--grande')}</div>
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

        const rutasValidas = ['login', 'inicio', 'aula', 'dron', 'sensores', 'config-dron', 'admin', 'acerca', 'prueba-tello', 'cambiar-password'];
        const destino = rutasValidas.includes(ruta) ? ruta : 'inicio';

        // 1. Control de autenticación (permite usuario cacheado sin conexión)
        const estaAutenticado = API.estaAutenticado() || !!Auth.obtenerUsuario();
        const invitado = !estaAutenticado && Auth.esModoInvitado();
        const esOffline = Auth.esModoSinConexion();

        if (!estaAutenticado && !invitado && destino !== 'login') {
            window.location.hash = '#/login';
            return;
        }

        // Modo dron sin cuenta: inicio y pantallas del dron; el aula y la administración van al login
        if (invitado && destino !== 'login' && !RUTAS_SIN_CUENTA.includes(destino)) {
            mostrarToast('El aula y la administración requieren iniciar sesión.', 'advertencia');
            window.location.hash = '#/login';
            return;
        }

        if (estaAutenticado && destino === 'login') {
            window.location.hash = '#/inicio';
            return;
        }

        // Contraseña temporal: hay que cambiarla antes de seguir (solo con conexión; sin servidor no se puede)
        if (estaAutenticado && !esOffline && Auth.debeCambiarPassword() && destino !== 'cambiar-password') {
            window.location.hash = '#/cambiar-password';
            return;
        }

        // Sin conexión: aula y admin exigen sesión válida conectada
        if (esOffline && (destino === 'aula' || destino === 'admin')) {
            mostrarToast('El aula y administración requieren conexión activa con el servidor.', 'advertencia');
            window.location.hash = '#/inicio';
            return;
        }

        // 2. Control de permisos por rol para /admin
        if (destino === 'admin' && !Auth.esAdmin()) {
            mostrarToast('Se requieren permisos de administrador.', 'advertencia');
            window.location.hash = '#/inicio';
            return;
        }

        // 3. Salir de la cabina con el dron en el aire: confirmar y aterrizar
        if (paginaActual === 'dron' && destino !== 'dron' && typeof Dron !== 'undefined' && Dron.estaEnVuelo && Dron.estaEnVuelo()) {
            if (!confirm('El dron está en vuelo.\n\n¿Aterrizar y salir de la cabina?\n(Cancelar = quedarse en la cabina)')) {
                history.replaceState(null, '', '#/dron');
                return;
            }
        }

        const miNavegacion = ++navegacionActual;

        // 4. Limpieza de página anterior si corresponde
        if (paginaActual === 'aula' && typeof Aula !== 'undefined' && Aula.destruir) {
            Aula.destruir();
        }
        if (paginaActual === 'dron' && typeof Dron !== 'undefined' && Dron.destruir) {
            paginaActual = null;
            await Dron.destruir(); // si estaba en vuelo, aterriza antes de desconectar
        }
        if (limpiezaPaginaActual) {
            const limpiar = limpiezaPaginaActual;
            limpiezaPaginaActual = null;
            try { await limpiar(); } catch (e) { console.warn('[App] Error limpiando la página anterior:', e); }
        }
        if (miNavegacion !== navegacionActual) return;

        // 5. Adaptación visual del layout (header y menú en pantalla de login)
        actualizarEncabezado(destino);

        // 6. Cargar plantilla en el contenedor principal
        const contenedor = document.getElementById('app-contenido');
        if (!contenedor) return;

        contenedor.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div><p>Cargando...</p></div>';

        const html = await cargarPlantilla(destino);
        if (miNavegacion !== navegacionActual) return;
        contenedor.innerHTML = html;
        paginaActual = destino;

        // 7. Actualizar enlaces activos en menú lateral
        actualizarNavegacionActiva(destino);
        cerrarMenu();

        // 8. Inicializar controlador específico de la página
        await inicializarControladorPagina(destino);
    }

    /**
     * Ajusta el header y el menú según la pantalla y el tipo de sesión
     * (login, sesión normal, sin conexión o dron sin cuenta).
     * @param {string} destino ruta actual
     */
    function actualizarEncabezado(destino) {
        const invitado = !API.estaAutenticado() && !Auth.obtenerUsuario() && Auth.esModoInvitado();
        const esOffline = Auth.esModoSinConexion();
        const btnMenu = document.getElementById('btn-menu');
        const btnUsuario = document.getElementById('btn-usuario');
        const indicadorEsp = document.getElementById('indicador-esp32');
        const indicadorOffline = document.getElementById('indicador-offline');
        const iconoOffline = document.getElementById('indicador-offline-icono');
        const textoOffline = document.getElementById('indicador-offline-texto');

        if (destino === 'login') {
            document.body.classList.add('pantalla-login');
            if (btnMenu) btnMenu.style.visibility = 'hidden';
            if (btnUsuario) btnUsuario.style.visibility = 'hidden';
            if (indicadorEsp) indicadorEsp.style.display = 'none';
            if (indicadorOffline) indicadorOffline.style.display = 'none';
        } else {
            document.body.classList.remove('pantalla-login');
            if (btnMenu) btnMenu.style.visibility = 'visible';
            if (btnUsuario) btnUsuario.style.visibility = 'visible';
            if (indicadorEsp) indicadorEsp.style.display = invitado ? 'none' : 'flex';
            if (indicadorOffline) {
                const texto = invitado ? 'Sin cuenta' : 'Modo sin conexión';
                if (iconoOffline) iconoOffline.className = `ico ico--${invitado ? 'dron' : 'senal'}`;
                if (textoOffline) textoOffline.textContent = texto;
                indicadorOffline.title = texto;
                indicadorOffline.setAttribute('aria-label', texto);
                indicadorOffline.style.display = (invitado || esOffline) ? 'inline-flex' : 'none';
            }
        }
        const enlaceSesion = document.getElementById('btn-cerrar-sesion');
        textoConIcono(enlaceSesion, invitado ? 'llave' : 'salir', invitado ? 'Iniciar sesión' : 'Cerrar sesión');
    }

    /**
     * El servidor rechazó el token (401): la sesión venció.
     * En las pantallas del dron se sigue en modo sin cuenta (no se interrumpe un vuelo);
     * en el resto se vuelve al login.
     */
    function manejarSesionVencida() {
        if (!API.estaAutenticado()) return;
        Auth.cerrarSesionLocal();
        const ruta = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim() || 'inicio';
        if (RUTAS_DRON.includes(ruta)) {
            Auth.activarModoInvitado();
            actualizarEncabezado(ruta);
            mostrarToast('Tu sesión venció. Seguís usando el dron en modo sin cuenta; para el aula, iniciá sesión de nuevo.', 'advertencia', 7000);
        } else {
            mostrarToast('Tu sesión venció. Iniciá sesión de nuevo.', 'advertencia', 6000);
            window.location.hash = '#/login';
        }
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
                    limpiezaPaginaActual = inicializarPaginaSensores(contenedorSens);
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

            case 'cambiar-password':
                Auth.inicializarPaginaCambiarPassword();
                break;

            case 'prueba-tello': {
                const contenedorPrueba = document.getElementById('app-contenido');
                if (contenedorPrueba) {
                    limpiezaPaginaActual = inicializarPaginaPruebaTello(contenedorPrueba);
                }
                break;
            }
        }
    }

    /**
     * Configura y puebla los datos dinámicos de la página de inicio.
     */
    async function inicializarPaginaInicio(usuario) {
        const elemNombre = document.getElementById('inicio-nombre-usuario');
        const elemRol = document.getElementById('inicio-rol-usuario');

        // Modo sin cuenta: las dos opciones del informe; el aula lleva al login
        if (!usuario && Auth.esModoInvitado()) {
            if (elemNombre) elemNombre.textContent = 'invitado/a';
            if (elemRol) {
                elemRol.textContent = 'Sin cuenta';
                elemRol.className = 'badge badge--info';
            }
            const accesoAula = document.getElementById('inicio-acceso-aula');
            if (accesoAula) {
                accesoAula.href = '#/login';
                const desc = accesoAula.querySelector('.acceso__desc');
                if (desc) desc.textContent = 'Requiere iniciar sesión: te lleva al login.';
            }
            const tarjetaEsp = document.getElementById('inicio-tarjeta-esp32');
            if (tarjetaEsp) tarjetaEsp.hidden = true;
            return;
        }

        if (elemNombre && usuario) {
            elemNombre.textContent = usuario.nombre || 'Usuario';
        }

        if (elemRol && usuario) {
            const etiquetasRol = {
                admin: 'Administrador',
                docente: 'Docente',
                usuario: 'Estudiante',
            };
            elemRol.textContent = etiquetasRol[usuario.rol] || usuario.rol;
            elemRol.className = `badge badge--${usuario.rol === 'admin' ? 'advertencia' : (usuario.rol === 'docente' ? 'info' : 'exito')}`;
        }

        // Consultar estado rápido del ESP32 para el resumen (omitir si está offline)
        const elemEsp32 = document.getElementById('inicio-esp32-resumen');
        if (elemEsp32) {
            if (Auth.esModoSinConexion()) {
                elemEsp32.innerHTML = '<span class="texto-xs texto-secundario">Modo sin conexión. Estado del ESP32 no disponible.</span>';
                return;
            }
            try {
                const resp = await API.esp32.estado();
                const estado = resp.estado;
                if (estado && estado.en_linea) {
                    elemEsp32.innerHTML = `
                        <div class="flex items-center gap-sm mt-xs">
                            <span class="badge badge--exito"><span class="punto punto--exito" aria-hidden="true"></span>En línea</span>
                            <span>IP: <code>${estado.ip_local || 'N/A'}</code></span>
                            <span>Señal: <strong>${estado.rssi || 'N/A'} dBm</strong></span>
                            <span>FW: v${estado.version_fw || '1.0'}</span>
                        </div>
                    `;
                } else {
                    elemEsp32.innerHTML = `
                        <div class="flex items-center gap-sm mt-xs">
                            <span class="badge badge--error"><span class="punto punto--error" aria-hidden="true"></span>Desconectado</span>
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
     * Escapa texto para insertarlo en HTML (datos que vienen del servidor o del usuario).
     * @param {*} valor
     * @returns {string}
     */
    function escaparHtml(valor) {
        return String(valor ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * HTML de un ícono propio (SVG definido en app.css). Es decorativo: siempre va junto a un
     * texto visible o dentro de un botón con aria-label.
     * @param {string} nombre Por ejemplo 'dron', 'check', 'alerta'
     * @param {string} [clases] Clases extra (por ejemplo 'ico--grande')
     */
    function icono(nombre, clases = '') {
        return `<span class="ico ico--${nombre}${clases ? ' ' + clases : ''}" aria-hidden="true"></span>`;
    }

    /** Pone en `el` un ícono (opcional) y un texto plano (textContent: no interpreta HTML). */
    function textoConIcono(el, nombre, texto) {
        if (!el) return;
        el.replaceChildren();
        if (nombre) {
            const ico = document.createElement('span');
            ico.className = `ico ico--${nombre}`;
            ico.setAttribute('aria-hidden', 'true');
            el.append(ico, ' ');
        }
        el.append(texto);
    }

    /**
     * Pone en `el` un punto de color de estado y un texto plano.
     * @param {string} color 'exito' | 'error' | 'advertencia' | 'acento' | 'alerta' | '' (gris)
     */
    function textoConPunto(el, color, texto) {
        if (!el) return;
        const punto = document.createElement('span');
        punto.className = `punto${color ? ' punto--' + color : ''}`;
        punto.setAttribute('aria-hidden', 'true');
        el.replaceChildren(punto, texto);
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
                    <h3 class="modal__titulo">Perfil de usuario</h3>
                    <button class="modal__cerrar" id="btn-cerrar-modal-user">&times;</button>
                </div>
                <div class="modal__body">
                    <div class="tarjeta mb-md" style="background: var(--color-fondo-claro);">
                        <div class="flex items-center gap-md">
                            <div>${icono('usuario', 'ico--grande')}</div>
                            <div>
                                <h4 style="font-weight: 700;">${escaparHtml(usuario.nombre)}</h4>
                                <p class="texto-sm texto-secundario">${escaparHtml(usuario.email)}</p>
                                <span class="badge badge--info mt-xs">${escaparHtml(String(usuario.rol || '').toUpperCase())}</span>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn--secundario btn--bloque mb-md" id="btn-modal-cambiar-pass">${icono('llave')} Cambiar contraseña</button>
                    <p class="texto-xs texto-secundario">
                        Conectado al servidor de Grupo 5 — EEST N° 1 "Eduardo Ader".
                    </p>
                </div>
                <div class="modal__footer">
                    <button class="btn btn--secundario" id="btn-modal-cancelar">Cerrar</button>
                    <button class="btn btn--peligro" id="btn-modal-logout">${icono('salir')} Cerrar sesión</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        const cerrar = () => modalOverlay.remove();
        document.getElementById('btn-cerrar-modal-user').onclick = cerrar;
        document.getElementById('btn-modal-cancelar').onclick = cerrar;
        document.getElementById('btn-modal-cambiar-pass').onclick = () => {
            cerrar();
            window.location.hash = '#/cambiar-password';
        };
        modalOverlay.onclick = (e) => { if (e.target === modalOverlay) cerrar(); };

        document.getElementById('btn-modal-logout').onclick = async () => {
            cerrar();
            await Auth.logout();
            mostrarToast('Sesión finalizada.', 'info');
            window.location.hash = '#/login';
        };
    }

    /**
     * Inicializa la vista de Sensores (/pages/sensores.php):
     * inclinación en vivo (giroscopio o, si no hay, acelerómetro), demo de detección con la cámara y,
     * en el modo técnico, el diagnóstico de los sensores.
     * @param {HTMLElement} contenedor
     * @returns {Function} limpieza que deja de escuchar los sensores y apaga la cámara al salir de la página
     */
    function inicializarPaginaSensores(contenedor) {
        const q = sel => contenedor.querySelector(sel);
        const btnDiagnosticar = q('#btn-diagnosticar-sensores');
        const panelResultados = q('#panel-resultados-sensores');
        const btnVivo = q('#btn-giro-vivo');
        const estadoVivo = q('#giro-estado');
        const fuenteVivo = q('#giro-fuente');
        let lector = null;

        async function ejecutarDiagnostico() {
            if (!btnDiagnosticar || !panelResultados) return;
            btnDiagnosticar.disabled = true;
            btnDiagnosticar.textContent = 'Diagnosticando...';
            panelResultados.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div><p>Verificando sensores...</p></div>';

            await Sensores.diagnosticar();
            if (!contenedor.isConnected) return;
            const resumen = Sensores.obtenerResumen();
            panelResultados.innerHTML = resumen.map(s => `
                <div class="tarjeta flex items-start gap-md mb-sm">
                    <span style="font-size:1.5rem; flex-shrink:0; line-height:1; color: var(--color-celeste);">${s.icono}</span>
                    <div style="flex:1; min-width:0;">
                        <div class="flex justify-between items-center gap-sm flex-wrap">
                            <strong class="texto-sm">${s.nombre}</strong>
                            <span class="badge ${s.ok ? 'badge--exito' : 'badge--error'}">${icono(s.ok ? 'check' : 'cruz')}${s.estado}</span>
                        </div>
                        <p class="texto-xs texto-secundario mt-xs">${escaparHtml(s.detalle)}</p>
                    </div>
                </div>
            `).join('');

            btnDiagnosticar.disabled = false;
            textoConIcono(btnDiagnosticar, 'recargar', 'Repetir diagnóstico');
        }

        // ---- Inclinación en vivo: del giroscopio o, si el celular no tiene, del acelerómetro ----
        const fmt = v => (typeof v === 'number' ? `${v.toFixed(0)}°` : '--');
        let lecturas = 0;

        function iniciarLecturaVivo() {
            if (lector || !estadoVivo) return;
            lector = new DronGiroscopio.LectorInclinacion({
                onLectura: ({ beta, gamma, alpha }) => {
                    lecturas++;
                    q('#giro-beta').textContent = fmt(beta);
                    q('#giro-gamma').textContent = fmt(gamma);
                    q('#giro-alpha').textContent = alpha === null ? 'No disp.' : fmt(alpha);
                    if (lecturas === 1) textoConIcono(estadoVivo, 'check', 'Recibiendo datos reales. Inclinate para ver cómo cambian.');
                },
                onFuente: (fuente) => {
                    if (fuenteVivo) fuenteVivo.textContent = DronGiroscopio.textoFuente(fuente);
                    if (fuente === 'ninguno') textoConIcono(estadoVivo, 'cruz', 'Sin datos de inclinación.');
                },
            });
            lector.iniciar();
            estadoVivo.textContent = 'Esperando datos del sensor...';
        }

        /** Algunos navegadores piden permiso (iOS 13+ con un toque). Si hace falta el toque, aparece el botón. */
        async function pedirPermisoYLeer() {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    if (await DeviceOrientationEvent.requestPermission() !== 'granted') {
                        textoConIcono(estadoVivo, 'cruz', 'Permiso de los sensores denegado.');
                        return;
                    }
                } catch (_) {
                    estadoVivo.textContent = 'Tocá "Ver lectura en vivo" para dar permiso a los sensores.';
                    if (btnVivo) btnVivo.hidden = false;
                    return;
                }
            }
            if (btnVivo) btnVivo.hidden = true;
            iniciarLecturaVivo();
        }

        // ---- Demo de detección con la cámara (misma tubería que la cabina, solo ensayo) ----
        const btnDemo = q('#btn-demo-seg');
        const btnCopiarDemo = q('#btn-demo-seg-copiar');
        const cajaDemo = q('#demo-seg-caja');
        const videoDemo = q('#demo-seg-video');
        const estadoDemo = q('#demo-seg-estado');
        const chipDemo = q('#demo-seg-chip');
        let demo = null;
        let panelDemo = null;
        let camara = null;
        let paginaCerrada = false;

        /** La caja toma la proporción real de la cámara (vertical en el celular): sin franjas negras a los costados. */
        function ajustarProporcion() {
            const w = videoDemo.videoWidth;
            const h = videoDemo.videoHeight;
            if (w > 0 && h > 0) cajaDemo.style.setProperty('--proporcion', String(w / h));
        }

        function detenerDemo() {
            demo?.desactivar();
            panelDemo?.destruir();
            panelDemo = null;
            camara?.getTracks().forEach(t => t.stop());
            camara = null;
            if (videoDemo) videoDemo.srcObject = null;
            if (cajaDemo) cajaDemo.hidden = true;
            if (chipDemo) { chipDemo.hidden = true; delete chipDemo.dataset.texto; }
            if (btnDemo) { textoConIcono(btnDemo, 'play', 'Probar con la cámara'); btnDemo.disabled = false; }
        }

        async function iniciarDemo() {
            if (typeof DronSeguimiento === 'undefined' || !videoDemo) return;
            if (!navigator.mediaDevices?.getUserMedia) {
                textoConIcono(estadoDemo, 'cruz', 'Este navegador no permite usar la cámara.');
                return;
            }
            btnDemo.disabled = true;
            estadoDemo.textContent = 'Pidiendo permiso para usar la cámara...';
            try {
                camara = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 }, height: { ideal: 720 } },
                    audio: false,
                });
            } catch (e) {
                textoConIcono(estadoDemo, 'cruz', e?.name === 'NotAllowedError'
                    ? 'Permiso de cámara denegado. Habilitalo en los ajustes del teléfono.'
                    : `No se pudo abrir la cámara: ${e?.message || e}`);
                btnDemo.disabled = false;
                return;
            }
            if (paginaCerrada) { detenerDemo(); return; }
            videoDemo.srcObject = camara;
            cajaDemo.hidden = false;
            try { await videoDemo.play(); } catch (_) { /* se reproduce igual al tener datos */ }
            ajustarProporcion();

            if (!demo) {
                demo = new DronSeguimiento({ videoEl: videoDemo, canvasDebug: q('#demo-seg-canvas'), miniatura: q('#demo-seg-miniatura') });
            }
            if (!demo.modeloCargado) {
                estadoDemo.textContent = 'Cargando el modelo de detección...';
                const res = await demo.inicializar();
                if (paginaCerrada) { detenerDemo(); return; }
                if (!res.ok) { textoConIcono(estadoDemo, 'cruz', `No se pudo cargar el modelo: ${res.error}`); detenerDemo(); return; }
                estadoDemo.textContent = res.aviso || '';
            }
            panelDemo = new DronSeguimiento.Panel(q('#demo-seg-panel'));
            demo.onComando = (cmd, info) => {
                q('#demo-seg-cartel').textContent = DronSeguimiento.textoEnsayo(cmd, info);
                panelDemo?.actualizar(info);
                const e = DronSeguimiento.estadoCorto(info);
                if (chipDemo && chipDemo.dataset.texto !== e.texto) {
                    textoConPunto(chipDemo, e.color, e.texto);
                    chipDemo.dataset.texto = e.texto;
                }
                if (chipDemo) chipDemo.hidden = false;
            };
            demo.activar();
            textoConIcono(btnDemo, 'detener', 'Detener');
            btnDemo.disabled = false;
            btnCopiarDemo.hidden = false;
        }

        videoDemo?.addEventListener('loadedmetadata', ajustarProporcion);
        videoDemo?.addEventListener('resize', ajustarProporcion); // el celular giró
        btnDemo?.addEventListener('click', () => (camara ? detenerDemo() : iniciarDemo()));
        btnCopiarDemo?.addEventListener('click', async () => {
            const filas = demo?.registro.length || 0;
            if (!filas) { mostrarToast('Todavía no hay registro.', 'info'); return; }
            const ok = await DronSeguimiento.copiarTexto(demo.registroCSV());
            mostrarToast(ok ? `Registro copiado (${filas} cuadros).` : 'No se pudo copiar el registro.', ok ? 'exito' : 'advertencia');
        });

        btnDiagnosticar?.addEventListener('click', ejecutarDiagnostico);
        btnVivo?.addEventListener('click', pedirPermisoYLeer);
        // El diagnóstico abre la cámara un instante: solo en el modo técnico
        if (modoTecnico()) ejecutarDiagnostico();
        // La lectura arranca sola; si el navegador exige un toque para dar permiso (iOS), aparece el botón
        pedirPermisoYLeer();

        return () => {
            paginaCerrada = true;
            lector?.detener();
            lector = null;
            detenerDemo(); // apaga la cámara al salir de la pantalla
        };
    }

    /**
     * Inicializa la vista de prueba y diagnóstico directo con el DJI Tello.
     * Abre las escuchas de telemetría (8890) y video (11111) mientras la página está abierta.
     * @returns {Function} limpieza que cierra escuchas, oyentes e intervalos al salir de la página
     */
    function inicializarPaginaPruebaTello(contenedor) {
        const q = sel => contenedor.querySelector(sel);
        const badge = q('#tello-entorno-badge');
        const logBox = q('#tello-log-salida');
        const ipInput = q('#tello-ip-prueba');
        const puertoInput = q('#tello-puerto-prueba');
        const cmdInput = q('#tello-cmd-custom');
        const diagPlugin = q('#diag-plugin-info');
        const diagWifi = q('#diag-wifi-status');
        const diagWebCodecs = q('#diag-webcodecs-status');
        const diagLatencia = q('#diag-latencia-cmd');
        const diagTelemetria = q('#diag-telemetria-pps');
        const diagVideoBytes = q('#diag-video-bytes');
        const diagApiUrl = q('#diag-api-url');
        const diagConexion = q('#diag-conexion-estado');
        const diagUserAgent = q('#diag-user-agent');
        const diagErroresBox = q('#diag-errores-salida');
        const diagModelo = q('#diag-modelo');
        const textareaRespaldo = q('#diag-textarea-respaldo');

        const DN = DronAdaptadores.DronNativo;
        const tieneNativo = DN.disponible();
        const PUERTO_TELEMETRIA = 8890;
        const PUERTO_VIDEO = 11111;

        const estadoDiag = {
            pluginInfo: 'No detectado',
            wifi: 'Pendiente',
            webCodecs: 'Verificando...',
            latencias: { command: '--', battery: '--' },
            escuchas: 'ninguna',
            telemetriaPPS: 0,
            telemetriaTotal: 0,
            ultimaTelemetria: 'Ninguna',
            totalBytesVideo: 0,
            totalPaquetesVideo: 0,
            apiUrl: API.getBaseUrl() || '(no configurada)',
            modoSesion: '',
            userAgent: navigator.userAgent,
            modelo: 'Sin verificar',
            modeloDetalle: [],
            errores: [],
        };

        // Recursos a liberar al salir de la página
        const oyentes = [];
        const puertosAbiertos = [];
        let paginaCerrada = false;

        function textoModoSesion() {
            if (Auth.esModoInvitado()) return 'Dron sin cuenta';
            return Auth.esModoSinConexion() ? 'Sin conexión con el servidor (sesión cacheada)' : 'Conectado al servidor';
        }

        function registrarError(err) {
            const hora = new Date().toLocaleTimeString();
            const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
            estadoDiag.errores.push(`[${hora}] ${msg}`);
            if (estadoDiag.errores.length > 20) estadoDiag.errores.shift();
            if (diagErroresBox) diagErroresBox.textContent = estadoDiag.errores.join('\n');
        }

        function agregarLog(tipo, msg) {
            if (!logBox) return;
            const hora = new Date().toLocaleTimeString();
            const prefijo = tipo === 'tx' ? '[TX]' : tipo === 'rx' ? '[RX]' : '[INFO]';
            logBox.textContent += `\n[${hora}] ${prefijo} ${msg}`;
            logBox.scrollTop = logBox.scrollHeight;
        }

        function actualizarUIResumen() {
            if (diagPlugin) diagPlugin.textContent = estadoDiag.pluginInfo;
            if (diagWifi) diagWifi.textContent = estadoDiag.wifi;
            if (diagWebCodecs) diagWebCodecs.textContent = estadoDiag.webCodecs;
            if (diagLatencia) diagLatencia.textContent = `cmd: ${estadoDiag.latencias.command} | bat: ${estadoDiag.latencias.battery}`;
            if (diagTelemetria) diagTelemetria.textContent = `${estadoDiag.telemetriaPPS} pps | escuchas: ${estadoDiag.escuchas} | ${estadoDiag.ultimaTelemetria.slice(0, 35)}`;
            if (diagVideoBytes) diagVideoBytes.textContent = `${estadoDiag.totalBytesVideo.toLocaleString()} bytes (${estadoDiag.totalPaquetesVideo} paquetes UDP)`;
            if (diagApiUrl) diagApiUrl.textContent = estadoDiag.apiUrl;
            if (diagConexion) diagConexion.textContent = estadoDiag.modoSesion;
            if (diagUserAgent) diagUserAgent.textContent = estadoDiag.userAgent;
        }

        // Paquetes por segundo de telemetría
        let conteoTelemetria = 0;
        const intervaloPPS = setInterval(() => {
            estadoDiag.telemetriaPPS = conteoTelemetria;
            conteoTelemetria = 0;
            actualizarUIResumen();
        }, 1000);

        if (badge) {
            textoConPunto(badge, tieneNativo ? 'exito' : 'advertencia', tieneNativo ? 'Plugin nativo activo' : 'Navegador: sin plugin nativo (respuestas simuladas)');
            badge.style.color = tieneNativo ? 'var(--color-exito)' : 'var(--color-advertencia)';
        }

        /** @returns {Promise<{respuesta:string, error:string|null, ms:number}|undefined>} */
        async function enviarPrueba(cmd) {
            cmd = (cmd || '').trim();
            if (!cmd) return undefined;
            const ip = ipInput?.value?.trim() || '192.168.10.1';
            const puerto = parseInt(puertoInput?.value, 10) || 8889;
            agregarLog('tx', `"${cmd}" -> ${ip}:${puerto}`);
            const tInicio = performance.now();

            let respuesta;
            let error = null;
            if (tieneNativo) {
                ({ respuesta, error } = await DN.enviarComando(ip, puerto, cmd, 5000));
            } else {
                await new Promise(r => setTimeout(r, 200));
                respuesta = cmd === 'battery?' ? '85' : 'ok';
            }
            const ms = Math.round(performance.now() - tInicio);
            const sim = tieneNativo ? '' : ' [simulado]';
            agregarLog('rx', `"${respuesta}"${error ? ' (' + error + ')' : ''} en ${ms} ms${sim}`);
            if (cmd === 'command') estadoDiag.latencias.command = `${respuesta} (${ms} ms)${sim}`;
            if (cmd === 'battery?') estadoDiag.latencias.battery = `${respuesta}% (${ms} ms)${sim}`;
            if (tieneNativo && cmd !== 'battery?' && !cmd.endsWith('?') && !DronAdaptadores.esOk(respuesta)) {
                registrarError(`"${cmd}" respondió "${respuesta}"${error ? ' (' + error + ')' : ''}`);
            }
            actualizarUIResumen();
            return { respuesta: String(respuesta ?? ''), error, ms };
        }

        // ---- Prueba en pasos numerados con un resultado claro (vista normal) ----
        const PASOS = ['app', 'command', 'bateria', 'telemetria', 'video'];
        const BATERIA_MINIMA = 20;
        const resultadoPasos = {};
        let probando = false;

        function marcarPaso(id, color, texto) {
            const el = q(`#paso-${id}`);
            if (!el) return;
            textoConPunto(el, color, texto);
            el.closest('.paso-prueba')?.setAttribute('data-estado', color || '');
            resultadoPasos[id] = texto;
        }

        function mostrarResultado(ok, titulo, detalle) {
            const caja = q('#resultado-prueba');
            if (!caja) return;
            caja.className = `resultado-prueba ${ok === null ? '' : ok ? 'resultado-prueba--ok' : 'resultado-prueba--falta'}`;
            caja.replaceChildren();
            const t = document.createElement('span');
            t.className = 'resultado-prueba__titulo';
            t.textContent = titulo;
            caja.append(t);
            if (detalle) {
                const d = document.createElement('span');
                d.className = 'resultado-prueba__detalle';
                d.textContent = detalle;
                caja.append(d);
            }
        }

        /** Espera hasta `ms` a que `condicion()` sea verdadera (o a que se cierre la página). */
        async function esperarHasta(condicion, ms) {
            const fin = Date.now() + ms;
            while (Date.now() < fin && !paginaCerrada) {
                if (condicion()) return true;
                await new Promise(r => setTimeout(r, 200));
            }
            return condicion();
        }

        async function probarTodo() {
            if (probando) return;
            probando = true;
            const btn = q('#btn-probar-todo');
            if (btn) btn.disabled = true;
            PASOS.forEach(p => marcarPaso(p, '', 'Sin probar'));
            mostrarResultado(null, 'Probando...', 'No muevas el celular ni el dron.');
            const faltas = [];
            const avisos = [];
            const terminar = () => {
                if (faltas.length) mostrarResultado(false, 'Todavía no', `Falta: ${faltas.join('; ')}.`);
                else mostrarResultado(true, 'Listo para volar', avisos.length ? `Ojo: ${avisos.join('; ')}.` : 'El dron responde, informa la batería y manda telemetría y video.');
                probando = false;
                if (btn) btn.disabled = false;
            };

            // 01 — App y WiFi del Tello
            if (!tieneNativo) {
                marcarPaso('app', 'error', 'Estás en el navegador: el navegador no puede hablar con el dron.');
                faltas.push('abrir la app instalada en el celular');
                terminar();
                return;
            }
            marcarPaso('app', 'acento', 'Vinculando el WiFi del Tello...');
            const red = await DN.vincularRedWifi();
            if (paginaCerrada) return;
            estadoDiag.wifi = red.vinculada ? `Vinculada (${red.motivo || 'OK'})` : `NO vinculada (${red.motivo || 'sin motivo'})`;
            if (red.vinculada) marcarPaso('app', 'exito', 'WiFi del Tello vinculado.');
            else marcarPaso('app', 'advertencia', `WiFi sin vincular (${red.motivo || 'sin motivo'}). Se prueba igual.`);

            // 02 — Respuesta del dron
            marcarPaso('command', 'acento', 'Enviando "command"...');
            const rc = await enviarPrueba('command');
            if (paginaCerrada) return;
            if (!rc || !DronAdaptadores.esOk(rc.respuesta)) {
                marcarPaso('command', 'error', `No respondió (${rc?.respuesta || 'sin respuesta'}). Prendé el dron y conectá el celular a su WiFi TELLO-XXXXXX.`);
                faltas.push('que el dron responda');
                terminar();
                return;
            }
            marcarPaso('command', 'exito', `Respondió "ok" en ${rc.ms} ms.`);

            // 03 — Batería
            marcarPaso('bateria', 'acento', 'Preguntando la batería...');
            const rb = await enviarPrueba('battery?');
            if (paginaCerrada) return;
            const bat = parseInt(rb?.respuesta, 10);
            if (!Number.isFinite(bat)) {
                marcarPaso('bateria', 'advertencia', `No la informó (${rb?.respuesta || 'sin respuesta'}).`);
                avisos.push('no se pudo leer la batería');
            } else if (bat < BATERIA_MINIMA) {
                marcarPaso('bateria', 'error', `${bat} %: muy baja para volar.`);
                faltas.push(`cargar la batería (${bat} %)`);
            } else {
                marcarPaso('bateria', 'exito', `${bat} %.`);
            }

            // 04 — Telemetría (la cabina no deja despegar sin ella)
            marcarPaso('telemetria', 'acento', 'Esperando telemetría (puerto 8890)...');
            const llegoTel = await esperarHasta(() => estadoDiag.telemetriaTotal > 0, 3000);
            if (paginaCerrada) return;
            if (llegoTel) marcarPaso('telemetria', 'exito', 'Llega telemetría.');
            else {
                marcarPaso('telemetria', 'error', 'No llega. Sin telemetría la cabina no deja despegar.');
                faltas.push('que llegue la telemetría');
            }

            // 05 — Video (no impide volar)
            marcarPaso('video', 'acento', 'Pidiendo el video ("streamon")...');
            const bytesAntes = estadoDiag.totalBytesVideo;
            const rv = await enviarPrueba('streamon');
            if (paginaCerrada) return;
            const llegoVideo = DronAdaptadores.esOk(rv?.respuesta) && await esperarHasta(() => estadoDiag.totalBytesVideo > bytesAntes, 3000);
            if (paginaCerrada) return;
            if (llegoVideo) marcarPaso('video', 'exito', 'Llega video.');
            else {
                marcarPaso('video', 'advertencia', 'No llega video. Se puede volar, pero sin imagen ni seguimiento.');
                avisos.push('no llega video');
            }
            terminar();
        }

        async function abrirEscuchas() {
            if (!tieneNativo) { estadoDiag.escuchas = 'no disponible (navegador)'; return; }
            oyentes.push(DN.escuchar(DN.EVENTO_TELEMETRIA, (data) => {
                const raw = String(data?.raw || '').trim();
                conteoTelemetria++;
                estadoDiag.telemetriaTotal++;
                estadoDiag.ultimaTelemetria = raw;
                if (estadoDiag.telemetriaTotal === 1) agregarLog('rx', `Primera telemetría: ${raw.slice(0, 60)}...`);
            }));
            oyentes.push(DN.escuchar(DN.EVENTO_VIDEO, (data) => {
                estadoDiag.totalBytesVideo += data?.tamano || 0;
                estadoDiag.totalPaquetesVideo += data?.paquetes || 1;
            }));
            for (const p of [PUERTO_TELEMETRIA, PUERTO_VIDEO]) {
                try {
                    await DN.iniciarEscucha(p);
                    if (paginaCerrada) { DN.detenerEscucha(p); continue; }
                    puertosAbiertos.push(p);
                } catch (e) {
                    registrarError(`No se pudo escuchar el puerto ${p}: ${e?.message || e}`);
                }
            }
            estadoDiag.escuchas = puertosAbiertos.join(' y ') || 'ninguna';
            agregarLog('info', `Escuchando UDP en: ${estadoDiag.escuchas}. Mandá "command" para que el Tello empiece a enviar telemetría.`);
        }

        /**
         * Verifica que los archivos del modelo lleguen completos: pide model.json y cada shard y compara
         * los bytes recibidos con los que declara model.json. Detecta si en vez del archivo llega HTML
         * (en el APK, Capacitor responde index.html a las rutas sin extensión).
         */
        async function verificarModelo() {
            const base = './libs/coco-ssd/';
            const caja = q('#diag-modelo-detalle');
            const lineas = [];
            const leer = async (ruta) => {
                const r = await fetch(ruta, { cache: 'no-store' });
                const datos = await r.arrayBuffer();
                const tipo = r.headers.get('content-type') || '(sin tipo)';
                const inicio = new TextDecoder().decode(new Uint8Array(datos.slice(0, 64)));
                return { status: r.status, bytes: datos.byteLength, tipo, datos, esHtml: /text\/html/i.test(tipo) || /<!doctype|<html/i.test(inicio) };
            };
            const bytesPorTipo = { float32: 4, int32: 4, float16: 2, uint16: 2, int16: 2, uint8: 1, int8: 1, bool: 1 };
            if (diagModelo) diagModelo.textContent = 'Verificando...';
            try {
                for (const lib of ['./libs/tfjs/tf.min.js', './libs/coco-ssd/coco-ssd.min.js']) {
                    const r = await leer(lib);
                    lineas.push(`${lib.split('/').pop()}: ${r.bytes.toLocaleString()} bytes · ${r.tipo} · HTTP ${r.status}`);
                }
                const mj = await leer(base + 'model.json');
                lineas.push(`model.json: ${mj.bytes.toLocaleString()} bytes · ${mj.tipo} · HTTP ${mj.status}`);
                if (mj.esHtml) throw new Error('model.json llegó como HTML (no es el archivo del modelo)');
                const modelo = JSON.parse(new TextDecoder().decode(mj.datos));
                let esperado = 0;
                const rutas = [];
                for (const g of modelo.weightsManifest) {
                    rutas.push(...g.paths);
                    for (const w of g.weights) esperado += (w.shape || []).reduce((a, b) => a * b, 1) * (bytesPorTipo[w.dtype] || 4);
                }
                let recibido = 0;
                const problemas = [];
                for (const ruta of rutas) {
                    const r = await leer(base + ruta);
                    recibido += r.bytes;
                    const nota = r.esHtml ? ' ← LLEGÓ HTML (index.html), NO EL ARCHIVO' : (r.status !== 200 ? ` ← HTTP ${r.status}` : '');
                    if (nota) problemas.push(ruta);
                    lineas.push(`${ruta}: ${r.bytes.toLocaleString()} bytes · ${r.tipo}${nota}`);
                }
                estadoDiag.modelo = (!problemas.length && recibido === esperado)
                    ? `OK: ${rutas.length} archivos de pesos, ${recibido.toLocaleString()} bytes (coincide con model.json)`
                    : `FALLA: recibidos ${recibido.toLocaleString()} de ${esperado.toLocaleString()} bytes${problemas.length ? ` · con problemas: ${problemas.join(', ')}` : ''}`;
                if (problemas.length || recibido !== esperado) registrarError(`Modelo: ${estadoDiag.modelo}`);
            } catch (e) {
                estadoDiag.modelo = `FALLA: ${e.message}`;
                registrarError(`Modelo: ${e.message}`);
            }
            estadoDiag.modeloDetalle = lineas;
            if (diagModelo) diagModelo.textContent = estadoDiag.modelo;
            if (caja) caja.textContent = lineas.join('\n') || 'Sin datos.';
        }

        async function ejecutarDiagnosticoCompleto() {
            if (diagPlugin) diagPlugin.textContent = 'Consultando...';
            if (diagWifi) diagWifi.textContent = 'Vinculando...';

            if (tieneNativo) {
                try {
                    const inf = await DN.info();
                    estadoDiag.pluginInfo = `v${inf.version || '?'} (Android SDK ${inf.sdkAndroid || '?'}, red vinculada: ${inf.redVinculada ? 'sí' : 'no'})`;
                } catch (e) {
                    estadoDiag.pluginInfo = `Error: ${e.message}`;
                    registrarError(e);
                }
                const resW = await DN.vincularRedWifi();
                estadoDiag.wifi = resW.vinculada ? `Vinculada (${resW.motivo || 'OK'})` : `NO vinculada (${resW.motivo || 'sin motivo'})`;
                if (!resW.vinculada) registrarError(`vincularRedWifi: ${resW.motivo}`);
            } else {
                estadoDiag.pluginInfo = 'No disponible (navegador)';
                estadoDiag.wifi = 'No disponible (navegador)';
            }

            if (typeof VideoDecoder !== 'undefined') {
                try {
                    const sop = await VideoDecoder.isConfigSupported({ codec: 'avc1.42001f', codedWidth: 960, codedHeight: 720 });
                    estadoDiag.webCodecs = sop.supported ? 'Soportado (H.264 960x720)' : 'H.264 NO soportado';
                } catch (e) {
                    estadoDiag.webCodecs = `Error al verificar: ${e.message}`;
                }
            } else {
                estadoDiag.webCodecs = 'WebCodecs NO disponible en este WebView';
            }

            estadoDiag.apiUrl = API.getBaseUrl() || '(no configurada)';
            estadoDiag.modoSesion = textoModoSesion();
            estadoDiag.userAgent = navigator.userAgent;
            // En el APK los archivos son locales (rápido): se verifica el modelo siempre.
            // En el navegador serían 18 MB por la red: solo con el botón "Verificar modelo".
            if (tieneNativo) await verificarModelo();
            actualizarUIResumen();
            agregarLog('info', 'Diagnóstico general completado.');
        }

        q('#btn-tello-cmd')?.addEventListener('click', () => enviarPrueba('command'));
        q('#btn-tello-bat')?.addEventListener('click', () => enviarPrueba('battery?'));
        q('#btn-tello-streamon')?.addEventListener('click', () => enviarPrueba('streamon'));
        q('#btn-tello-custom')?.addEventListener('click', () => {
            enviarPrueba(cmdInput?.value);
            if (cmdInput) cmdInput.value = '';
        });
        q('#btn-limpiar-log-tello')?.addEventListener('click', () => {
            if (logBox) logBox.textContent = 'Consola limpia. Lista para nuevas pruebas.';
        });
        q('#btn-probar-todo')?.addEventListener('click', probarTodo);
        q('#btn-ejecutar-diagnostico')?.addEventListener('click', ejecutarDiagnosticoCompleto);
        q('#btn-verificar-modelo')?.addEventListener('click', verificarModelo);
        q('#btn-limpiar-errores-diag')?.addEventListener('click', () => {
            estadoDiag.errores = [];
            if (diagErroresBox) diagErroresBox.textContent = 'Sin errores registrados.';
        });

        q('#btn-copiar-diagnostico')?.addEventListener('click', async () => {
            const informe = [
                '========================================',
                'INFORME DE DIAGNÓSTICO — GRUPO 5 DRON',
                `Fecha y hora: ${new Date().toLocaleString()}`,
                '========================================',
                `Resultado: ${q('#resultado-prueba')?.textContent.trim() || 'sin probar'}`,
                ...PASOS.map((p, i) => `  0${i + 1}. ${q(`#paso-${p}`)?.closest('.paso-prueba')?.querySelector('.paso-prueba__nombre')?.textContent || p}: ${resultadoPasos[p] || 'Sin probar'}`),
                '----------------------------------------',
                `• Plugin DronNative:     ${estadoDiag.pluginInfo}`,
                `• Red WiFi vinculada:    ${estadoDiag.wifi}`,
                `• Soporte WebCodecs:     ${estadoDiag.webCodecs}`,
                `• Respuesta "command":   ${estadoDiag.latencias.command}`,
                `• Respuesta "battery?":  ${estadoDiag.latencias.battery}`,
                `• Escuchas UDP abiertas: ${estadoDiag.escuchas}`,
                `• Telemetría (8890):     ${estadoDiag.telemetriaPPS} pps, ${estadoDiag.telemetriaTotal} paquetes en total`,
                `• Última telemetría:     ${estadoDiag.ultimaTelemetria}`,
                `• Video (11111):         ${estadoDiag.totalBytesVideo} bytes en ${estadoDiag.totalPaquetesVideo} paquetes`,
                `• URL de la API:         ${estadoDiag.apiUrl}`,
                `• Sesión:                ${estadoDiag.modoSesion}`,
                `• WebView / UserAgent:   ${estadoDiag.userAgent}`,
                `• Modelo de seguimiento: ${estadoDiag.modelo}`,
                `• Modo técnico:          ${modoTecnico() ? 'activado' : 'apagado'}`,
                ...estadoDiag.modeloDetalle.map(l => `    ${l}`),
                '----------------------------------------',
                'ÚLTIMOS ERRORES REGISTRADOS:',
                estadoDiag.errores.length ? estadoDiag.errores.join('\n') : 'Ninguno.',
                '========================================',
            ].join('\n');

            let copiado = false;
            if (navigator.clipboard?.writeText) {
                try { await navigator.clipboard.writeText(informe); copiado = true; } catch (_) { /* se intenta el respaldo */ }
            }
            if (!copiado && textareaRespaldo) {
                try {
                    textareaRespaldo.value = informe;
                    textareaRespaldo.select();
                    copiado = document.execCommand('copy');
                } catch (_) { /* sin portapapeles */ }
            }
            mostrarToast(copiado ? 'Informe copiado al portapapeles.' : 'No se pudo copiar automáticamente. Revisá los permisos.', copiado ? 'exito' : 'advertencia');
        });

        estadoDiag.modoSesion = textoModoSesion();
        abrirEscuchas().then(ejecutarDiagnosticoCompleto);

        // Limpieza al salir de la página
        return async () => {
            paginaCerrada = true;
            clearInterval(intervaloPPS);
            await Promise.all(oyentes.splice(0).map(h => h.remove()));
            await Promise.all(puertosAbiertos.splice(0).map(p => DN.detenerEscucha(p)));
        };
    }

    /**
     * Inicialización global de la aplicación.
     */
    async function iniciar() {
        document.body.classList.toggle('modo-tecnico', modoTecnico());

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
                const eraInvitado = Auth.esModoInvitado() && !API.estaAutenticado();
                await Auth.logout();
                mostrarToast(eraInvitado ? 'Saliste del modo sin cuenta.' : 'Sesión finalizada.', 'info');
                window.location.hash = '#/login';
            });
        }

        // Cerrar menú al hacer clic en enlaces del menú lateral
        document.querySelectorAll('.menu-lateral__enlace').forEach((enlace) => {
            enlace.addEventListener('click', () => {
                cerrarMenu();
            });
        });

        // Sesión vencida avisada por api.js (401 con sesión iniciada)
        window.addEventListener(API.EVENTO_SESION_VENCIDA, manejarSesionVencida);

        // Verificar sesión activa antes de la primera carga con timeout estricto de 3s
        if (API.estaAutenticado() || Auth.obtenerUsuario()) {
            try {
                await Promise.race([
                    Auth.verificarSesion(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
                ]);
            } catch (e) {
                Auth.setModoSinConexion(true);
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
        icono,
        textoConIcono,
        textoConPunto,
        modoTecnico,
        cambiarModoTecnico,
    };
})();
