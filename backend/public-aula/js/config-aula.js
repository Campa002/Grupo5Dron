/**
 * Configuración de la app del aula — Grupo 5: Control de Sistemas y Dron
 *
 * La ÚNICA diferencia entre la web y el APK del aula vive en este archivo (SERVIDOR_AULA y Plataforma).
 * Ningún otro archivo pregunta por Capacitor.
 *
 * SERVIDOR_AULA: dirección de la API del aula que usa el APK.
 *
 * - Desde la web (hosting o XAMPP) NO se usa: la app le habla a la API del mismo servidor
 *   de donde se cargó (la carpeta api/ al lado de aula/), sin configurar nada.
 * - En el APK es la única forma de saber a qué servidor conectarse.
 *
 * Cómo cambiarla (cuando tengamos hosting):
 *   1. Poné la dirección de la API, con https y sin barra al final, por ejemplo:
 *        const SERVIDOR_AULA = 'https://tu-dominio.com/api';
 *      Tiene que ser https: Android no deja que el APK use http.
 *   2. Commiteá y subí el cambio: el CI recompila el APK (artefacto Grupo5Aula-app-debug).
 *   3. Instalá el APK nuevo en los celulares.
 *
 * Vacía (''): el login del APK muestra "Falta configurar el servidor del aula".
 */
// eslint-disable-next-line no-unused-vars
// La IP con HTTPS (certificado de Let's Encrypt para la IP): algunas redes no resuelven sslip.io
const SERVIDOR_AULA = 'https://40.160.138.65/api';

// eslint-disable-next-line no-unused-vars
const Plataforma = {
    /** true en la app instalada (APK). */
    get esApk() {
        return !!(window.Capacitor?.isNativePlatform?.());
    },

    /** Dirección de la API, sin barra al final. Vacía = APK sin SERVIDOR_AULA. */
    urlApi() {
        const url = this.esApk ? String(SERVIDOR_AULA || '').trim() : new URL('../api', window.location.href).href;
        return url.replace(/\/+$/, '');
    },
};
