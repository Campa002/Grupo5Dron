/**
 * Configuración de la app del aula — Grupo 5: Control de Sistemas y Dron
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
const SERVIDOR_AULA = '';
