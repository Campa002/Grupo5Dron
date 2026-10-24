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
    const HOSTING_URL_DEFECTO = 'https://REEMPLAZAR-CON-TU-HOSTING.com/api';

    function _resolverBaseUrl() {
        // En Capacitor (APK) el origen no tiene dominio real
        const enCapacitor = window.location.protocol === 'capacitor:' ||
            window.location.hostname === 'localhost' && window.location.protocol !== 'http:' && window.location.protocol !== 'https:';

        if (enCapacitor) {
            const guardada = localStorage.getItem('grupo5dron_api_url');
            return guardada || HOSTING_URL_DEFECTO;
        }
        // En web: relativo al mismo servidor
        return window.location.origin + '/api';
    }

    let _baseUrl = _resolverBaseUrl();

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
        const url = `${BASE_URL}/${endpoint}`;
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

            const datos = await respuesta.json();

            // Si el token expiró, cerrar sesión
            if (respuesta.status === 401 && estaAutenticado()) {
                eliminarToken();
                localStorage.removeItem('grupo5dron_usuario');
                window.location.hash = '#/login';
                throw new Error('Sesión expirada. Iniciá sesión nuevamente.');
            }

            if (!respuesta.ok) {
                throw new Error(datos.mensaje || `Error HTTP ${respuesta.status}`);
            }

            return datos;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('No se pudo conectar con el servidor. Verificá tu conexión.');
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
    };
})();
