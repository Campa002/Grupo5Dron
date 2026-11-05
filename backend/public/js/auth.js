/**
 * Módulo de Autenticación — Grupo 5: Control de Sistemas y Dron
 * 
 * Maneja login, sesión, datos del usuario y cierre de sesión.
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
    // Modo "dron sin cuenta": permite usar SOLO el módulo del dron
    // (cabina, prueba Tello, sensores, config. del dron y acerca)
    // sin iniciar sesión. El aula y la administración siguen
    // exigiendo una sesión válida.
    // ------------------------------------------------------------
    const CLAVE_MODO_INVITADO = 'grupo5dron_modo_invitado';

    function esModoInvitado() {
        return localStorage.getItem(CLAVE_MODO_INVITADO) === '1';
    }

    function activarModoInvitado() {
        localStorage.setItem(CLAVE_MODO_INVITADO, '1');
    }

    function desactivarModoInvitado() {
        localStorage.removeItem(CLAVE_MODO_INVITADO);
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
        desactivarModoInvitado();

        return respuesta.usuario;
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

        API.eliminarToken();
        localStorage.removeItem('grupo5dron_usuario');
        usuarioActual = null;
        desactivarModoInvitado();
        document.body.classList.remove('rol-admin', 'rol-docente', 'rol-usuario');
    }

    /**
     * Verifica si la sesión actual es válida consultando al servidor.
     * @returns {Promise<boolean>}
     */
    async function verificarSesion() {
        if (!API.estaAutenticado()) {
            return false;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            const respuesta = await API.get('auth.php?action=sesion', { signal: controller.signal });
            clearTimeout(timeoutId);
            guardarUsuario(respuesta.usuario);
            modoSinConexion = false;
            return true;
        } catch (e) {
            clearTimeout(timeoutId);
            const es401o403 = e.status === 401 || e.status === 403 || 
                             (e.message && (e.message.includes('401') || e.message.includes('403') || e.message.includes('expirada')));

            if (es401o403) {
                // Token rechazado explícitamente por el servidor
                API.eliminarToken();
                localStorage.removeItem('grupo5dron_usuario');
                usuarioActual = null;
                modoSinConexion = false;
                return false;
            }

            // Error de red, timeout o sin conexión (ej: conectados al Wi-Fi del dron Tello)
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

        // Usar el dron sin cuenta (por ejemplo, conectado al WiFi del Tello, sin internet)
        document.getElementById('btn-modo-invitado')?.addEventListener('click', () => {
            activarModoInvitado();
            App.mostrarToast('Modo dron sin cuenta: el aula y la administración requieren iniciar sesión.', 'info', 5000);
            window.location.hash = '#/dron';
        });

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
                App.mostrarToast('¡Bienvenido/a!', 'exito');
                window.location.hash = '#/inicio';
            } catch (error) {
                if (avisoOffline && !obtenerUsuario()) {
                    avisoOffline.style.display = 'block';
                }
                App.mostrarToast(error.message, 'error');
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Iniciar sesión';
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
        esModoInvitado,
        activarModoInvitado,
        desactivarModoInvitado,
    };
})();
