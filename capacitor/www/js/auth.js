/**
 * Módulo de Autenticación — Grupo 5: Control de Sistemas y Dron
 * 
 * Maneja login, sesión, datos del usuario y cierre de sesión.
 */

// eslint-disable-next-line no-unused-vars
const Auth = (() => {
    'use strict';

    let usuarioActual = null;

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
        document.body.classList.remove('rol-admin', 'rol-docente', 'rol-usuario');
    }

    /**
     * Verifica si la sesión actual es válida consultando al servidor.
     * @returns {Promise<boolean>}
     */
    async function verificarSesion() {
        if (!API.estaAutenticado()) return false;

        try {
            const respuesta = await API.auth.sesion();
            guardarUsuario(respuesta.usuario);
            return true;
        } catch (e) {
            API.eliminarToken();
            localStorage.removeItem('grupo5dron_usuario');
            usuarioActual = null;
            return false;
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

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

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
                App.mostrarToast('¡Bienvenido/a!', 'exito');
                window.location.hash = '#/inicio';
            } catch (error) {
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
    };
})();
