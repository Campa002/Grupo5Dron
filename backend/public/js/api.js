/**
 * Cliente API — Grupo 5: Control de Sistemas y Dron
 * 
 * Módulo para comunicarse con la API REST del backend.
 * Maneja autenticación JWT, peticiones y errores.
 */

// eslint-disable-next-line no-unused-vars
const API = (() => {
    'use strict';

    // ============================================================
    // URL base de la API
    // ============================================================
    //
    // En el navegador web: usa window.location.origin + '/api' (sin cambios).
    // En el APK Capacitor: el origen es capacitor://localhost, por lo que
    //   se lee la URL del hosting desde localStorage (clave 'grupo5dron_api_url').
    //   Si no está configurada, se usa HOSTING_URL_DEFECTO como fallback.
    //
    // Para configurar la URL desde la app, llamar:
    //   API.setBaseUrl('https://tuhosting.com/api')
    //
    function esNativo() {
        return !!(window.Capacitor?.isNativePlatform?.());
    }

    function _resolverBaseUrl() {
        if (esNativo()) {
            return localStorage.getItem('grupo5dron_api_url') || '';
        }
        return window.location.origin + '/api';
    }

    let _baseUrl = _resolverBaseUrl();

    function setBaseUrl(nuevaUrl) {
        _baseUrl = (nuevaUrl || '').trim().replace(/\/+$/, '');
        if (_baseUrl) {
            localStorage.setItem('grupo5dron_api_url', _baseUrl);
        } else {
            localStorage.removeItem('grupo5dron_api_url');
        }
    }

    function getBaseUrl() {
        return _baseUrl;
    }

    /**
     * Obtiene el token JWT almacenado.
     * @returns {string|null}
     */
    function obtenerToken() {
        return localStorage.getItem('grupo5dron_token');
    }

    /**
     * Guarda el token JWT.
     * @param {string} token
     */
    function guardarToken(token) {
        localStorage.setItem('grupo5dron_token', token);
    }

    /**
     * Elimina el token JWT.
     */
    function eliminarToken() {
        localStorage.removeItem('grupo5dron_token');
    }

    /**
     * Verifica si hay un token almacenado.
     * @returns {boolean}
     */
    function estaAutenticado() {
        return !!obtenerToken();
    }

    /**
     * Realiza una petición HTTP a la API.
     * @param {string} endpoint - Ruta relativa (ej: 'auth.php?action=login')
     * @param {Object} opciones - Opciones de fetch
     * @returns {Promise<Object>} Respuesta JSON
     */
    async function peticion(endpoint, opciones = {}) {
        if (!_baseUrl) {
            throw new Error('URL del servidor no configurada. Por favor, ingresá la URL del servidor.');
        }
        const url = `${_baseUrl}/${endpoint.replace(/^\/+/, '')}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(opciones.headers || {}),
        };

        // Agregar token si existe
        const token = obtenerToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const respuesta = await fetch(url, {
                ...opciones,
                headers,
            });

            let datos = {};
            try {
                datos = await respuesta.json();
            } catch (_) {}

            // Si el token expiró con 401 explícito del servidor
            if ((respuesta.status === 401 || respuesta.status === 403) && estaAutenticado()) {
                const err = new Error(datos.mensaje || 'Sesión expirada o no autorizada.');
                err.status = respuesta.status;
                throw err;
            }

            if (!respuesta.ok) {
                const err = new Error(datos.mensaje || `Error HTTP ${respuesta.status}`);
                err.status = respuesta.status;
                throw err;
            }

            return datos;
        } catch (error) {
            if (error.name === 'AbortError') {
                const err = new Error('Tiempo de espera agotado al conectar con el servidor.');
                err.name = 'AbortError';
                err.status = 0;
                throw err;
            }
            if (error.name === 'TypeError' && error.message && error.message.includes('fetch')) {
                const err = new Error('No se pudo conectar con el servidor. Verificá tu conexión.');
                err.status = 0;
                throw err;
            }
            throw error;
        }
    }

    /**
     * Petición GET.
     */
    function get(endpoint) {
        return peticion(endpoint, { method: 'GET' });
    }

    /**
     * Petición POST con cuerpo JSON.
     */
    function post(endpoint, datos) {
        return peticion(endpoint, {
            method: 'POST',
            body: JSON.stringify(datos),
        });
    }

    /**
     * Petición PUT con cuerpo JSON.
     */
    function put(endpoint, datos) {
        return peticion(endpoint, {
            method: 'PUT',
            body: JSON.stringify(datos),
        });
    }

    /**
     * Petición DELETE.
     */
    function eliminar(endpoint) {
        return peticion(endpoint, { method: 'DELETE' });
    }

    // ============================================================
    // Endpoints específicos
    // ============================================================

    // --- Autenticación ---
    const auth = {
        login: (email, password) => post('auth.php?action=login', { email, password }),
        sesion: () => get('auth.php?action=sesion'),
        logout: () => post('auth.php?action=logout', {}),
        registro: (datos) => post('auth.php?action=registro', datos),
    };

    // --- Dispositivos ---
    const dispositivos = {
        listar: () => get('dispositivos.php?action=listar'),
        obtener: (id) => get(`dispositivos.php?action=obtener&id=${id}`),
        crear: (datos) => post('dispositivos.php?action=crear', datos),
        actualizar: (id, datos) => put(`dispositivos.php?action=actualizar&id=${id}`, datos),
        eliminar: (id) => eliminar(`dispositivos.php?action=eliminar&id=${id}`),
    };

    // --- Botones ---
    const botones = {
        listar: (dispositivoId) => get(`botones.php?action=listar&dispositivo_id=${dispositivoId}`),
        crear: (datos) => post('botones.php?action=crear', datos),
        actualizar: (id, datos) => put(`botones.php?action=actualizar&id=${id}`, datos),
        eliminar: (id) => eliminar(`botones.php?action=eliminar&id=${id}`),
        guardarCodigoIr: (datos) => post('botones.php?action=guardar_codigo_ir', datos),
        eliminarCodigoIr: (id) => eliminar(`botones.php?action=eliminar_codigo_ir&id=${id}`),
    };

    // --- Comandos ---
    const comandos = {
        enviar: (datos) => post('comandos.php?action=enviar', datos),
        estado: (id) => get(`comandos.php?action=estado&id=${id}`),
        historial: (limite) => get(`comandos.php?action=historial&limite=${limite || 50}`),
        pendientes: () => get('comandos.php?action=pendientes'),
    };

    // --- ESP32 ---
    const esp32 = {
        estado: () => get('esp32.php?action=estado'),
    };

    // --- Perfiles de Dron ---
    const perfilesDron = {
        listar: () => get('dron-perfiles.php?action=listar'),
        obtener: (id) => get(`dron-perfiles.php?action=obtener&id=${id}`),
        crear: (datos) => post('dron-perfiles.php?action=crear', datos),
        actualizar: (id, datos) => put(`dron-perfiles.php?action=actualizar&id=${id}`, datos),
        eliminar: (id) => eliminar(`dron-perfiles.php?action=eliminar&id=${id}`),
    };

    // --- Configuración ---
    const configuracion = {
        obtener: () => get('config.php?action=obtener'),
        obtenerClave: (clave) => get(`config.php?action=obtener&clave=${clave}`),
        actualizar: (datos) => put('config.php?action=actualizar', datos),
    };

    // --- Usuarios ---
    const usuarios = {
        listar: () => get('usuarios.php?action=listar'),
        obtener: (id) => get(`usuarios.php?action=obtener&id=${id}`),
        actualizar: (id, datos) => put(`usuarios.php?action=actualizar&id=${id}`, datos),
        eliminar: (id) => eliminar(`usuarios.php?action=eliminar&id=${id}`),
        cambiarPassword: (id, password) => put(`usuarios.php?action=cambiar_password&id=${id}`, { password }),
    };

    // API pública del módulo
    return {
        obtenerToken,
        guardarToken,
        eliminarToken,
        estaAutenticado,
        get,
        post,
        put,
        eliminar,
        auth,
        dispositivos,
        botones,
        comandos,
        esp32,
        perfilesDron,
        configuracion,
        usuarios,
        setBaseUrl,
        getBaseUrl,
        esNativo,
    };
})();
