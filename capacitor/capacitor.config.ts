import { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 *
 * El APK empaqueta el frontend (backend/public) localmente para:
 *  1. Funcionar cuando el teléfono está conectado al WiFi del dron (sin internet)
 *  2. Evitar bloqueos de contenido mixto (HTTPS vs HTTP del dron)
 *
 * La URL de la API del hosting se configura en backend/public/js/api.js
 * mediante la constante BASE_URL (por defecto window.location.origin + '/api').
 * En el APK, el origen es capacitor://localhost, por lo que api.js detecta
 * que está en Capacitor y usa la URL configurada en la variable de entorno
 * GRUPO5_API_URL que se inyecta durante el build, o la constante hardcodeada
 * en api.js si no hay variable de entorno.
 */
const config: CapacitorConfig = {
    appId: 'ar.edu.eest1vl.grupo5dron',
    appName: 'Grupo 5 — Dron',
    webDir: '../backend/public',
    // Configurar el servidor para desarrollo local (remover en producción)
    server: {
        // androidScheme puede ser 'https' o 'http'.
        // Usamos 'https' para evitar mixed-content con la API del hosting.
        androidScheme: 'https',
    },
    android: {
        // Permitir tráfico en texto plano sólo hacia el dron (ver network_security_config.xml)
        // NO se habilita cleartext global para no comprometer la seguridad de la app.
        // El archivo res/xml/network_security_config.xml restringe el cleartext a rangos IP locales.
        allowMixedContent: false,
        // El icono de la app se genera a partir de los assets del PWA
        icon: 'public/img/icon-192.png',
    },
    plugins: {
        // No se requieren plugins de capacitor oficiales adicionales para esta versión.
        // El plugin de UDP/TCP (capacitor-udp-socket o similar) se integrará
        // en una versión futura cuando se valide con hardware real.
        // REQUIERE VALIDACIÓN CON EL DRON REAL antes de publicar en Google Play.
    },
};

export default config;
