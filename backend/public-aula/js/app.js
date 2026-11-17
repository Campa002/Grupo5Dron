/**
 * Aplicación del Aula (router y orquestador)
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * App separada de la del dron (Etapa A). Usa la misma API PHP y la misma base de datos.
 * Todo pide iniciar sesión (docente o admin); después del login se vuelve a la pantalla pedida.
 */

// eslint-disable-next-line no-unused-vars
const App = (() => {
    'use strict';

    // Caché en memoria de las plantillas parciales
    const cachePlantillas = {};

    // Página activa actual
    let paginaActual = null;

    // Número de navegación: si llega otra mientras esta espera, esta se abandona
    let navegacionActual = 0;

    // Rutas que no piden sesión
    const RUTAS_SIN_SESION = ['login'];

    // Rutas que existen (cualquier otra va al aula)
    const RUTAS_VALIDAS = [...RUTAS_SIN_SESION, 'aula', 'admin', 'cambiar-password'];

    /**
     * Muestra una notificación emergente (Toast) en pantalla.
     * @param {string} mensaje Texto a mostrar
     * @param {string} tipo 'exito' | 'error' | 'advertencia' | 'info'
     * @param {number} duracion Milisegundos visible (por defecto 3500 ms)
     */
    function mostrarToast(mensaje, tipo = 'info', duracion = 3500) {
        const contenedor = document.getElementById('toast-contenedor');
        if (!contenedor) return;

        const iconos = { exito: 'bi-check-lg', error: 'bi-x-lg', advertencia: 'bi-exclamation-triangle', info: 'bi-info-circle' };

        // Texto plano (textContent): un mensaje que venga del servidor no puede inyectar HTML
        const toast = document.createElement('div');
        toast.className = `toast show toast--${tipo}`;
        const ico = document.createElement('i');
        ico.className = `bi ${iconos[tipo] || iconos.info}`;
        ico.setAttribute('aria-hidden', 'true');
        const texto = document.createElement('span');
        texto.textContent = mensaje;
        toast.append(ico, texto);
        contenedor.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('saliendo');
            setTimeout(() => toast.remove(), 300);
        }, duracion);
    }

    function abrirMenu() {
        document.getElementById('menu-lateral')?.classList.add('abierto');
    }

    function cerrarMenu() {
        document.getElementById('menu-lateral')?.classList.remove('abierto');
    }

    function toggleMenu() {
        document.getElementById('menu-lateral')?.classList.toggle('abierto');
    }

    /**
     * Carga una vista parcial (pages/*.php). Ruta relativa: la web del aula puede vivir en una subcarpeta
     * del hosting (por ejemplo /aula/). En el APK no hay PHP: build-apk.js les quita los bloques PHP.
     * @param {string} nombre Nombre de la página (ej: 'aula')
     * @returns {Promise<string>} Contenido HTML
     */
    async function cargarPlantilla(nombre) {
        if (cachePlantillas[nombre]) return cachePlantillas[nombre];
        try {
            const respuesta = await fetch(`pages/${nombre}.php`, { cache: 'no-cache' });
            if (!respuesta.ok) throw new Error(`No se pudo cargar la vista "${nombre}" (HTTP ${respuesta.status})`);
            const html = await respuesta.text();
            // Una vista es un fragmento: si llega un documento completo, el archivo no se encontró
            if (/<!doctype|<html[\s>]/i.test(html.slice(0, 500))) {
                throw new Error(`La vista "${nombre}" llegó como una página completa: el archivo no se encontró`);
            }
            cachePlantillas[nombre] = html;
            return html;
        } catch (error) {
            return `
                <div class="alert alert-danger">
                    <p class="fw-semibold mb-1">Error cargando la página</p>
                    <p class="small mb-3">${escaparHtml(error.message)}</p>
                    <button class="btn btn-primary" onclick="App.cargarRutaActual()">Reintentar</button>
                </div>`;
        }
    }

    /** Pantalla para cuando no hay conexión con el servidor (el aula no funciona sin él). */
    function plantillaSinConexion() {
        return `
            <div class="alert alert-warning">
                <p class="fw-semibold mb-1">Sin conexión con el servidor</p>
                <p class="small mb-3">El aula necesita internet para mandar las órdenes al ESP32. Revisá la conexión y volvé a intentar.</p>
                <button class="btn btn-primary" onclick="location.reload()">Reintentar</button>
            </div>`;
    }

    /**
     * Router: analiza el hash actual y monta la vista correspondiente.
     */
    async function cargarRutaActual() {
        const hash = window.location.hash || '#/aula';
        const ruta = hash.replace(/^#\/?/, '').split('?')[0].trim() || 'aula';

        if (!RUTAS_VALIDAS.includes(ruta)) history.replaceState(null, '', '#/aula');
        const destino = RUTAS_VALIDAS.includes(ruta) ? ruta : 'aula';

        const conSesion = API.estaAutenticado() || !!Auth.obtenerUsuario();

        // Sin sesión: todo pide iniciar sesión, y después se vuelve a la pantalla pedida
        if (!conSesion && !RUTAS_SIN_SESION.includes(destino)) {
            Auth.recordarDestino(destino);
            window.location.hash = '#/login';
            return;
        }
        if (conSesion && destino === 'login') {
            window.location.hash = '#/aula';
            return;
        }

        // Contraseña temporal: hay que cambiarla antes de seguir (solo con conexión)
        if (conSesion && !Auth.esModoSinConexion() && Auth.debeCambiarPassword() && destino !== 'cambiar-password') {
            window.location.hash = '#/cambiar-password';
            return;
        }

        if (destino === 'admin' && !Auth.esAdmin()) {
            mostrarToast('Se requieren permisos de administrador.', 'advertencia');
            window.location.hash = '#/aula';
            return;
        }

        const miNavegacion = ++navegacionActual;

        if (paginaActual === 'aula' && typeof Aula !== 'undefined' && Aula.destruir) Aula.destruir();

        actualizarEncabezado(destino);

        const contenedor = document.getElementById('app-contenido');
        if (!contenedor) return;

        // Con la sesión guardada pero sin servidor, el aula y la administración no funcionan
        if (conSesion && Auth.esModoSinConexion() && destino !== 'login') {
            contenedor.innerHTML = plantillaSinConexion();
            paginaActual = null;
            actualizarNavegacionActiva(destino);
            cerrarMenu();
            return;
        }

        contenedor.innerHTML = '<div class="text-center py-5 text-body-secondary"><div class="spinner-border mb-3" aria-hidden="true"></div><p>Cargando...</p></div>';
        const html = await cargarPlantilla(destino);
        if (miNavegacion !== navegacionActual) return;
        contenedor.innerHTML = html;
        paginaActual = destino;

        actualizarNavegacionActiva(destino);
        cerrarMenu();
        await inicializarControladorPagina(destino);
    }

    const NOMBRE_ROL = { admin: 'administrador', docente: 'docente', usuario: 'usuario' };

    /**
     * Ajusta el header y el menú: en el login no hay menú. Arriba del menú, quién está usando la app;
     * "Administración" solo para el admin (body.rol-admin).
     * @param {string} destino ruta actual
     */
    function actualizarEncabezado(destino) {
        const enLogin = destino === 'login';
        const btnMenu = document.getElementById('btn-menu');
        if (btnMenu) btnMenu.style.visibility = enLogin ? 'hidden' : 'visible';
        const usuario = Auth.obtenerUsuario();
        const menuUsuario = document.getElementById('menu-usuario');
        if (menuUsuario) menuUsuario.textContent = usuario ? `${usuario.nombre} · ${NOMBRE_ROL[usuario.rol] || usuario.rol}` : '';
        document.body.classList.toggle('rol-admin', Auth.esAdmin());
    }

    /** El servidor rechazó el token (401): la sesión venció. Se pide iniciar sesión y se vuelve ahí. */
    function manejarSesionVencida() {
        if (!API.estaAutenticado()) return;
        Auth.cerrarSesionLocal();
        const ruta = window.location.hash.replace(/^#\/?/, '').split('?')[0].trim() || 'aula';
        Auth.recordarDestino(ruta);
        mostrarToast('Tu sesión venció. Iniciá sesión de nuevo.', 'advertencia', 6000);
        window.location.hash = '#/login';
    }

    /** Resalta el link actual en el menú lateral. */
    function actualizarNavegacionActiva(pagina) {
        document.querySelectorAll('.menu-lateral__enlace').forEach((enlace) => {
            enlace.classList.toggle('activo', enlace.dataset.pagina === pagina);
        });
    }

    /** Inicializa la lógica JS de cada vista luego de inyectar el HTML. */
    async function inicializarControladorPagina(pagina) {
        switch (pagina) {
            case 'login':
                Auth.inicializarPaginaLogin();
                break;
            case 'aula':
                if (typeof Aula !== 'undefined' && Aula.inicializar) await Aula.inicializar();
                break;
            case 'admin':
                if (typeof Admin !== 'undefined' && Admin.inicializar) Admin.inicializar();
                break;
            case 'cambiar-password':
                Auth.inicializarPaginaCambiarPassword();
                break;
        }
    }

    /**
     * Escapa texto para insertarlo en HTML.
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

    /** Cierra la sesión y vuelve al login. */
    async function cerrarSesion() {
        await Auth.logout();
        mostrarToast('Sesión finalizada.', 'info');
        window.location.hash = '#/login';
    }

    /** Inicialización global de la aplicación. */
    async function iniciar() {
        document.getElementById('btn-menu')?.addEventListener('click', toggleMenu);
        document.getElementById('menu-overlay')?.addEventListener('click', cerrarMenu);
        document.getElementById('btn-cerrar-sesion')?.addEventListener('click', async (e) => {
            e.preventDefault();
            cerrarMenu();
            await cerrarSesion();
        });
        document.querySelectorAll('.menu-lateral__enlace').forEach((enlace) => {
            enlace.addEventListener('click', cerrarMenu);
        });

        // Sesión vencida avisada por api.js (401 con sesión iniciada)
        window.addEventListener(API.EVENTO_SESION_VENCIDA, manejarSesionVencida);

        // Verificar la sesión guardada antes de la primera carga (como mucho 3 s)
        if (API.estaAutenticado() || Auth.obtenerUsuario()) {
            try {
                await Promise.race([
                    Auth.verificarSesion(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
                ]);
            } catch (e) {
                Auth.setModoSinConexion(true);
            }
        }

        window.addEventListener('hashchange', cargarRutaActual);
        cargarRutaActual();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

    return {
        mostrarToast,
        cargarRutaActual,
        cerrarMenu,
    };
})();
