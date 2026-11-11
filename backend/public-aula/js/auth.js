/**
 * Módulo de Autenticación — Grupo 5: Control de Sistemas y Dron
 * 
 * Maneja login, sesión, datos del usuario y cierre de sesión (app del aula).
 */

// eslint-disable-next-line no-unused-vars
const Auth = (() => {
    'use strict';

    let usuarioActual = null;
    let modoSinConexion = false;

    function esModoSinConexion() {
        return modoSinConexion;
    }

    function setModoSinConexion(val) {
        modoSinConexion = !!val;
    }

    // ------------------------------------------------------------
    // La app del aula pide iniciar sesión para todo. Si se entra a una
    // pantalla sin sesión, después del login se vuelve a esa pantalla.
    // ------------------------------------------------------------

    // Pantalla que se pidió antes del login (solo las que exigen sesión)
    const CLAVE_DESTINO = 'grupo5dron_destino_login';
    const DESTINOS_CON_SESION = ['aula', 'admin'];

    /** Recuerda a dónde volver después de iniciar sesión. */
    function recordarDestino(ruta) {
        try {
            if (DESTINOS_CON_SESION.includes(ruta)) sessionStorage.setItem(CLAVE_DESTINO, ruta);
        } catch (_) { /* sin almacenamiento: vuelve al inicio */ }
    }

    /** Devuelve (y olvida) la pantalla a la que hay que volver; si no hay, el aula. */
    function tomarDestino() {
        let ruta = null;
        try {
            ruta = sessionStorage.getItem(CLAVE_DESTINO);
            sessionStorage.removeItem(CLAVE_DESTINO);
        } catch (_) { /* nada */ }
        return DESTINOS_CON_SESION.includes(ruta) ? ruta : 'aula';
    }

    /**
     * Intenta recuperar la sesión del usuario desde localStorage.
     * @returns {Object|null} Datos del usuario o null
     */
    function obtenerUsuario() {
        if (usuarioActual) return usuarioActual;

        const datos = localStorage.getItem('grupo5dron_usuario');
        if (datos) {
            try {
                usuarioActual = JSON.parse(datos);
                return usuarioActual;
            } catch (e) {
                localStorage.removeItem('grupo5dron_usuario');
            }
        }
        return null;
    }

    /**
     * Guarda los datos del usuario en memoria y localStorage.
     * @param {Object} usuario
     */
    function guardarUsuario(usuario) {
        usuarioActual = usuario;
        localStorage.setItem('grupo5dron_usuario', JSON.stringify(usuario));

        // Aplicar clase de rol al body
        document.body.classList.remove('rol-admin', 'rol-docente', 'rol-usuario');
        document.body.classList.add(`rol-${usuario.rol}`);
    }

    /**
     * Realiza el login.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<Object>} Datos del usuario
     */
    async function login(email, password) {
        const respuesta = await API.auth.login(email, password);

        API.guardarToken(respuesta.token);
        guardarUsuario(respuesta.usuario);

        return respuesta.usuario;
    }

    /**
     * Borra la sesión guardada en el dispositivo (sin llamar al servidor).
     * La usa app.js cuando el servidor avisa que la sesión venció.
     */
    function cerrarSesionLocal() {
        API.eliminarToken();
        localStorage.removeItem('grupo5dron_usuario');
        usuarioActual = null;
        modoSinConexion = false;
        document.body.classList.remove('rol-admin', 'rol-docente', 'rol-usuario');
    }

    /**
     * Cierra la sesión del usuario.
     */
    async function logout() {
        try {
            await API.auth.logout();
        } catch (e) {
            // Ignorar errores al cerrar sesión
        }
        cerrarSesionLocal();
    }

    /** true si el usuario tiene que cambiar la contraseña (cuentas del seed o reseteadas). */
    function debeCambiarPassword() {
        return !!obtenerUsuario()?.debe_cambiar_password;
    }

    /**
     * Verifica si la sesión actual es válida consultando al servidor.
     * @returns {Promise<boolean>}
     */
    async function verificarSesion() {
        if (!API.estaAutenticado()) {
            return false;
        }

        try {
            // 3 s como máximo, para no trabar el arranque sin internet. El 401 se maneja acá (sin aviso global).
            const respuesta = await API.auth.sesion({ timeoutMs: 3000, sinAvisoSesion: true });
            guardarUsuario(respuesta.usuario);
            modoSinConexion = false;
            return true;
        } catch (e) {
            if (e.status === 401 || e.status === 403) {
                // Token rechazado explícitamente por el servidor
                API.eliminarToken();
                localStorage.removeItem('grupo5dron_usuario');
                usuarioActual = null;
                modoSinConexion = false;
                return false;
            }

            // Error de red, timeout o sin conexión
            console.warn('[Auth] No se pudo verificar sesión con el servidor (modo offline):', e.message);
            modoSinConexion = true;
            const usuarioCacheado = obtenerUsuario();
            // Mantener token y usuario si existen
            return !!usuarioCacheado;
        }
    }

    /**
     * Verifica si el usuario tiene un rol específico.
     * @param {string} rol
     * @returns {boolean}
     */
    function tieneRol(rol) {
        const usuario = obtenerUsuario();
        return usuario && usuario.rol === rol;
    }

    /**
     * Verifica si el usuario es admin.
     * @returns {boolean}
     */
    function esAdmin() {
        return tieneRol('admin');
    }

    /**
     * Verifica si el usuario es al menos docente.
     * @returns {boolean}
     */
    function esDocente() {
        const usuario = obtenerUsuario();
        return usuario && (usuario.rol === 'admin' || usuario.rol === 'docente');
    }

    /**
     * Inicializa el módulo de login en la página.
     */
    function inicializarPaginaLogin() {
        const form = document.getElementById('form-login');
        if (!form) return;

        const contApiUrl = document.getElementById('contenedor-api-url');
        const inputApiUrl = document.getElementById('login-api-url');
        const avisoOffline = document.getElementById('aviso-offline-login');

        // En APK o si no hay baseUrl configurada, mostrar campo de URL del servidor
        const esNativo = API.esNativo && API.esNativo();
        if (contApiUrl && (esNativo || !API.getBaseUrl())) {
            contApiUrl.style.display = 'block';
            if (inputApiUrl) {
                inputApiUrl.value = API.getBaseUrl() || '';
                inputApiUrl.addEventListener('change', () => {
                    API.setBaseUrl(inputApiUrl.value);
                });
            }
        }

        // Si no hay usuario cacheado y no hay conexión con el servidor
        if (avisoOffline) {
            if (!obtenerUsuario() && (!navigator.onLine || modoSinConexion)) {
                avisoOffline.style.display = 'block';
            } else {
                avisoOffline.style.display = 'none';
            }
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (inputApiUrl && inputApiUrl.value.trim()) {
                API.setBaseUrl(inputApiUrl.value.trim());
            }

            if (esNativo && !API.getBaseUrl()) {
                App.mostrarToast('Ingresá la URL del servidor antes de iniciar sesión.', 'advertencia');
                inputApiUrl?.focus();
                return;
            }

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const btnSubmit = form.querySelector('button[type="submit"]');

            if (!email || !password) {
                App.mostrarToast('Completá email y contraseña.', 'advertencia');
                return;
            }

            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Iniciando sesión...';

            try {
                await login(email, password);
                modoSinConexion = false;
                if (debeCambiarPassword()) {
                    // El destino pedido queda guardado: se va ahí después de cambiar la contraseña
                    App.mostrarToast('Antes de seguir, cambiá la contraseña temporal.', 'advertencia', 6000);
                    window.location.hash = '#/cambiar-password';
                } else {
                    App.mostrarToast('¡Bienvenido/a!', 'exito');
                    window.location.hash = '#/' + tomarDestino();
                }
            } catch (error) {
                if (avisoOffline && !obtenerUsuario()) {
                    avisoOffline.style.display = 'block';
                }
                App.mostrarToast(error.message, 'error');
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Ingresar';
            }
        });
    }

    /**
     * Inicializa la página de cambio de contraseña (#/cambiar-password).
     */
    function inicializarPaginaCambiarPassword() {
        const form = document.getElementById('form-cambiar-password');
        if (!form) return;
        const aviso = document.getElementById('aviso-cambio-obligatorio');
        if (aviso) aviso.style.display = debeCambiarPassword() ? 'flex' : 'none';

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const actual = document.getElementById('password-actual').value;
            const nueva = document.getElementById('password-nueva').value;
            const repetida = document.getElementById('password-repetida').value;
            const btn = form.querySelector('button[type="submit"]');

            if (!actual || !nueva || !repetida) { App.mostrarToast('Completá los tres campos.', 'advertencia'); return; }
            if (nueva.length < 8) { App.mostrarToast('La nueva contraseña debe tener al menos 8 caracteres.', 'advertencia'); return; }
            if (nueva !== repetida) { App.mostrarToast('Las contraseñas nuevas no coinciden.', 'advertencia'); return; }
            if (nueva === actual) { App.mostrarToast('La nueva contraseña tiene que ser distinta de la actual.', 'advertencia'); return; }

            btn.disabled = true;
            btn.textContent = 'Guardando...';
            try {
                await API.auth.cambiarMiPassword(actual, nueva);
                const usuario = obtenerUsuario();
                if (usuario) guardarUsuario({ ...usuario, debe_cambiar_password: false });
                App.mostrarToast('Contraseña actualizada.', 'exito');
                window.location.hash = '#/' + tomarDestino();
            } catch (error) {
                App.mostrarToast(error.message, 'error', 6000);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Guardar contraseña';
            }
        });
    }

    return {
        obtenerUsuario,
        guardarUsuario,
        login,
        logout,
        verificarSesion,
        tieneRol,
        esAdmin,
        esDocente,
        inicializarPaginaLogin,
        esModoSinConexion,
        setModoSinConexion,
        recordarDestino,
        tomarDestino,
        cerrarSesionLocal,
        debeCambiarPassword,
        inicializarPaginaCambiarPassword,
    };
})();
