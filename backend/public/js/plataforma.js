/**
 * Plataforma — Grupo 5: Control de Sistemas y Dron (app del DRON)
 *
 * La ÚNICA diferencia entre la web y el APK vive en este archivo. El resto de la app es igual.
 *  - Web (navegador): un navegador no puede mandar UDP, así que no puede hablar con el Tello.
 *    Usa siempre el Simulador y la cabina muestra AVISO_WEB.
 *  - APK (Capacitor): trae el plugin nativo DronNative y maneja el Tello real.
 * Ningún otro archivo pregunta por Capacitor.
 */
// eslint-disable-next-line no-unused-vars
const Plataforma = {
    /** true en la app instalada (o con el plugin simulado de las pruebas). Se evalúa cada vez. */
    get esApk() {
        return !!(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.Plugins?.DronNative);
    },

    /** Plugin nativo DronNative (UDP y WiFi del Tello), o null en el navegador. */
    pluginDron() {
        return window.Capacitor?.Plugins?.DronNative || null;
    },

    AVISO_WEB: 'Estás en la versión web: el dron real solo se maneja desde la app del celular.',
};
