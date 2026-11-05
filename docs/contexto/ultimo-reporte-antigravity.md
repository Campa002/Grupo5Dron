# Último reporte de Antigravity (5/11/2026)

Resumen final que entregó Antigravity tras aplicar los lotes 1 a 5. Quedó commiteado en `main` (commit `f85d371`).
Ojo: es lo que Antigravity DICE que hizo. Verificalo en el código antes de darlo por cierto.
Antigravity NO aplicó la tanda siguiente ("revisión antes del vuelo"). La aplicó Claude Code en la Fase 1 (5/11): ver el historial, §3, puntos 12 y 13.
Verificado el 5/11: `php -l` pasa en `dron-perfiles.php` y `schema.sql` importa sin errores en MySQL.

---

Lote 1 listo: `DronNativePlugin.java` y `dron-adaptadores.js` sincronizados con bucle rc (`enviarSinRespuesta`), detección nativa en `api.js`, sesión offline con `AbortController` (3 s) y perfiles cacheados con fallback offline.

Lote 2 listo: Panel de diagnóstico para pruebas de campo implementado en `#/prueba-tello` (info del plugin, Wi-Fi vinculado, WebCodecs, latencia de comandos, telemetría PPS, bytes de video, últimos 20 errores y copia de informe) y timeout de failsafe configurable en Config. Dron.

Lote 3 listo: `/vendor/` migrado a `/libs/`, Google Fonts removido reemplazado por fuentes del sistema, TensorFlow.js y modelo COCO-SSD lite_mobilenet_v2 descargados localmente (19.11 MB en `backend/public/libs/`) y `dron-seguimiento.js` actualizado.

Lote 4 listo: Carpetas reorganizadas en `posibles-implementaciones/`, `capacitor/www/` y `android_template/` eliminados, `.gitignore` y `README.md` actualizados, y `scripts/check_refs.py` verificó con éxito 65 referencias estáticas existentes.

Lote 5 listo: Adaptadores HTTP y UDP/TCP genéricos trasladados a `posibles-implementaciones/adaptadores-genericos/`, selector y fábrica limitados a Tello y Simulador, y `dron-perfiles.php` junto a `schema.sql` configurados para admitir exclusivamente `tello|simulador`.

---

### Resumen Final de Entrega

#### 1. Cambios por archivo
- `.github/workflows/android.yml`: Paso 2 actualizado a Node 20; paso 8 actualizado para copiar `DronNativePlugin.java` sin referencias a Kotlin; paso 13 agregado para informar el tamaño final del APK compilado.
- `capacitor/package.json`: Removido `tsc --noEmit` del script de build y eliminada la dependencia de `typescript`.
- `capacitor/android_plugin/DronNativePlugin.java`: Plugin nativo reescrito en Java (`@CapacitorPlugin(name = "DronNative")`). Implementa `enviarComando` (sincrónico con respuesta), `enviarSinRespuesta` (fire-and-forget para bucle rc a 15 Hz reutilizando `DatagramSocket` y `ExecutorService` de 1 hilo), `iniciarEscucha` / `detenerEscucha`, `vincularRedWifi` (timeout 5 s con `removeCapability(NET_CAPABILITY_INTERNET)`) e `info()`.
- `backend/public/js/dron-adaptadores.js`: Eliminadas todas las referencias a `sendUdpPacket`. El bucle rc de `TelloAdapter` ahora usa `enviarSinRespuesta({host, puerto, mensaje})` y el resto de operaciones usan `enviarComando`. Se eliminaron las clases de adaptadores genéricos HTTP y UDP/TCP (movidos a `posibles-implementaciones`).
- `backend/public/js/api.js`: Detección nativa con `window.Capacitor?.isNativePlatform?.()`. En APK devuelve `localStorage.getItem('grupo5dron_api_url')` o cadena vacía. Corregido bug donde `peticion()` referenciaba `BASE_URL` en vez de `_baseUrl`.
- `backend/public/js/auth.js`: `verificarSesion` distingue 401/403 (cierre de sesión) de errores de red/timeout vía `AbortController` de 3 s (mantiene usuario cacheado y activa `modoSinConexion = true`). Inicialización de login enlaza el campo dinámico "URL del servidor" y alerta si falta conexión previa.
- `backend/public/pages/login.html`: Agregados contenedor `#contenedor-api-url` y alerta `#aviso-offline-login`.
- `backend/public/index.php`: Removidos preconnects y stylesheet de Google Fonts. Actualizados scripts a `/libs/tfjs/tf.min.js` y `/libs/coco-ssd/coco-ssd.min.js`. Agregado badge `#indicador-offline` en el header.
- `backend/public/css/app.css`: Tipografía principal reconfigurada a pila nativa del sistema (`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', ...`).
- `backend/public/sw.js`: Rutas estáticas actualizadas de `/vendor/` a `/libs/`.
- `backend/public/js/app.js`: Control de rutas en modo offline: permite `dron`, `prueba-tello`, `sensores` y `config-dron` con usuario cacheado; bloquea `aula` y `admin` exigiendo conexión activa. Resumen de ESP32 no bloquea en offline. Timeout garantizado de 3 s al arranque. Panel completo de diagnóstico y botón "Copiar informe" en `#prueba-tello`.
- `backend/public/js/config-dron.js`: Fallback a perfil por defecto DJI Tello cuando no hay conexión. Configuración del timeout de failsafe guardada en `localStorage` (`grupo5dron_failsafe_timeout_ms`). Selector de perfiles limitado exclusivamente a `tello` y `simulador`.
- `backend/public/js/dron.js`: Failsafe de telemetría toma el timeout dinámico configurado desde `localStorage` (3500 ms por defecto).
- `backend/public/js/dron-seguimiento.js`: Carga del modelo actualizada a `./libs/coco-ssd/model.json` y fallback robusto a detección por color si el modelo de red neuronal no está disponible.
- `backend/public/libs/`: Descargados localmente `tf.min.js`, `coco-ssd.min.js`, `model.json` y los 5 archivos shard de pesos binarios (`group1-shard1of5` a `shard5of5`).
- `backend/api/dron-perfiles.php`: Endpoints `crear`, `actualizar`, `listar` y `obtener` sanitizan y fuerzan que cualquier perfil sea `tello` o `simulador`.
- `backend/sql/schema.sql`: Columna `tipo_adaptador` redefinida como `ENUM('tello', 'simulador') NOT NULL DEFAULT 'tello'`. Semilla actualizada sin perfiles HTTP.
- `posibles-implementaciones/`: Creada estructura con `README.md`, subcarpetas `aula-esp32/firmware/`, `herramientas/` (`build_www.py` y `generate_icons.ps1`) y `adaptadores-genericos/` (`adaptadores-genericos.js`).
- `scripts/build-apk.js`: Actualizado para copiar `'libs'` en lugar de `'vendor'`.
- `scripts/check_js.py`: Añadido soporte de expresiones regulares JS en el análisis léxico para evitar falsos positivos con barras diagonales.
- `scripts/check_refs.py`: Creado y ejecutado; valida contra disco cada script, link, ruta de sw.js y página de router.
- `.gitignore` y `README.md`: Rutas de firmware actualizadas a `posibles-implementaciones/`, agregado `capacitor/www/` al ignore y árbol de directorios actualizado.

#### 2. Decisiones tomadas
- **Fallback de perfil DJI Tello offline**: Si un estudiante abre la app por primera vez directamente conectado a la red Wi-Fi del Tello (sin haber hecho nunca sync con la API PHP ni configurado perfiles), `ConfigDron` provee automáticamente un perfil virtual oficial de DJI Tello (`192.168.10.1`, puertos 8889, 8890, 11111) para que la cabina no quede bloqueada con "sin perfil seleccionado".
- **Léxico en `scripts/check_js.py`**: El analizador de sintaxis fallaba en `app.js` (`/^\//`) y `config-dron.js` (`/'/g`) porque interpretaba las barras de RegExp como comentarios de línea `//`. Se le agregó reconocimiento de literales RegExp tras prefijos sintácticos para brindar chequeos certeros.

#### 3. Lo que quedó sin hacer y por qué
- **Ejecución local de `php -l`**: El binario `php` no está instalado en el PATH de este equipo Windows (`CommandNotFoundException`). La lógica de `dron-perfiles.php` fue revisada manualmente respetando estrictamente la sintaxis de PHP 8. En GitHub Actions o en el servidor de hosting se puede verificar con `php -l backend/api/dron-perfiles.php`.

#### 4. Lo que requiere validación en Android o Dron Real
- **`vincularRedWifi()` en Android 10+**: La llamada `ConnectivityManager.bindProcessToNetwork` depende del hardware del celular y de los permisos en tiempo de ejecución de Android.
- **Flujo de Video H.264 (puerto 11111)**: El reensamblado NAL de paquetes y la decodificación por hardware con `VideoDecoder` requiere que el Tello esté emitiendo video tras `streamon`.
- **Failsafe de 3500 ms**: La desconexión real de telemetría y el frenado automático `rc 0 0 0 0` + `land` requiere vuelo real con el Tello.

---

### Comandos Git para realizar el Commit

Ejecutá en PowerShell desde la raíz del proyecto:

```powershell
git add .
git commit -m "refactor(dron): modularizacion, soporte offline, plugin java y diagnostico tello"
```
