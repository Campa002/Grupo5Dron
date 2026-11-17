# Manual del programador

## Tecnologías

| Parte | Tecnología |
| :--- | :--- |
| Apps | HTML, CSS y JavaScript sin frameworks; router por hash; Capacitor 5 (Node 20, JDK 17) para el APK |
| Plugin del dron | Java (`capacitor/android_plugin/DronNativePlugin.java`): UDP con el Tello y uso del WiFi sin internet |
| Visión | TensorFlow.js 4.17 con COCO-SSD lite (personas y objetos), BlazeFace (caras) y MobileNet v1 0.25 (Mis objetos), todos locales en `backend/public/libs/` y en float16 |
| Video del Tello | H.264 por UDP, decodificado con WebCodecs (`dron-video.js`) |
| Servidor | PHP 8 + MySQL/MariaDB, JWT para la sesión (`backend/api/`) |
| ESP32 | C++ con Arduino en PlatformIO; IRremoteESP8266 y ArduinoJson |
| Carcasa | OpenSCAD |
| Pruebas | `node --test` (partes puras), Playwright (pantallas), PHP local + MariaDB (API) |

## Estructura y responsabilidades

### App del dron (`backend/public/`)

| Archivo | Qué hace |
| :--- | :--- |
| `index.php` | Esqueleto: menú, scripts (en orden de dependencia) |
| `js/app.js` | Router (`RUTAS_DRON`), Prueba Tello, Sensores, Seguimiento con la cámara, Mis objetos, avisos (`mostrarToast`), íconos |
| `js/dron.js` | Cabina: conexión, despegue, aterrizaje, emergencia, failsafe, botones, inclinación, pasos, misiones, seguimiento y control real |
| `js/dron-adaptadores.js` | `DronNativo` (contrato del plugin), `TelloAdapter` (protocolo del Tello) y `SimulatorDroneAdapter` |
| `js/dron-joystick.js` | Botones de mantener apretado y joysticks |
| `js/dron-giroscopio.js` | Inclinación (giroscopio o acelerómetro) |
| `js/dron-video.js` | Decodificador H.264 |
| `js/dron-caras.js` | BlazeFace: anclas, decodificación y NMS (puros) y detección |
| `js/dron-seguimiento.js` | Tubería del seguimiento: visión, candidatos (cara/cuerpo), `Selector` con reglas de RAC, `Seguidor`, `Controlador`, límites del control real, diagnóstico |
| `js/dron-seguimiento-ui.js` | Tarjetas estilo RAC (estado, confianza, historial, diagnóstico, interruptor de control real) |
| `js/dron-objetos.js` | Mis objetos: huellas con MobileNet e IndexedDB |
| `js/config-dron.js` | Perfiles fijos, modo técnico, ajustes |
| `pages/*.php` | Vistas parciales (HTML sin PHP: en el APK se copian tal cual) |
| `sw.js` | Service worker (solo en el navegador) |

### App del aula (`backend/public-aula/`)

`js/app.js` (router y sesión), `js/api.js` (llamadas al servidor con timeout), `js/auth.js` (sesión y roles), `js/aula.js` (luces, proyector, aire, aprender código, estado del ESP32), `js/admin.js` (historial, usuarios, relé).

### Servidor (`backend/`)

`api/*.php` (un archivo por recurso, con `?action=`), `includes/` (sesión JWT, CORS, ayudas), `config/config.php` (no va al repo), `sql/schema.sql`. Detalle en [api.md](api.md).

### ESP32 (`posibles-implementaciones/aula-esp32/firmware/`)

`main.cpp` (bucle), `api_client.*` (consulta, latido, resultados, códigos), `ir_manager.*` (emitir y aprender), `relay_manager.*`, `wifi_manager.*`, `config.h.example`, `tests/test_hardware.ino`.

## Cómo fluye una orden del aula

1. La app hace `POST comandos.php?action=enviar` → fila `pendiente` en `cola_comandos`.
2. El ESP32 hace `GET esp32.php?action=poll` cada 2 s → recibe las pendientes (pasan a `enviado`), con el código IR si es `ir`.
3. La ejecuta y responde `POST esp32.php?action=resultado` → `ejecutado` o `error` y una fila en `historial`.
4. La app consulta `comandos.php?action=estado` cada 2 s hasta 20 s y avisa.

Aprender: tipo `aprendizaje` → el ESP32 prende el receptor 15 s → `POST esp32.php?action=codigo_ir` guarda el código para esa acción → la app lo ve en `botones.php?action=listar` (cambia `codigo_actualizado_en`).

## Cómo funciona el seguimiento

```
imagen → COCO-SSD + BlazeFace (5-10 FPS) → combinarPersonas (cara o cuerpo) → Selector (75 %, 8, 3 de 5)
      → Controlador (yaw, altura, distancia; tamaño ideal según cara o cuerpo) → bucle a 15 Hz
      → ensayo: se muestra | control real: comandoControlReal (límites) → ejes del rc
```

Las partes puras (`Selector`, `Seguidor`, `Controlador`, `combinarPersonas`, `comandoControlReal`, `conclusionDiagnostico`, decodificación de BlazeFace) no usan el DOM: se prueban en `tests/`.

## Cómo agregar algo

- **Una pantalla nueva en la app del dron:** crear `pages/nombre.php` (solo HTML), agregar `'nombre'` a `RUTAS_DRON` en `app.js` y su `case` en `inicializarControladorPagina`, el enlace en el menú de `index.php` y el archivo en `RECURSOS_ESTATICOS` de `sw.js` (subí `CACHE_NAME`). Corré `python scripts/check_refs.py`.
- **Un archivo JS nuevo:** `<script>` en `index.php` (antes de quien lo usa), en `sw.js`, y que tenga extensión (en el APK, una ruta sin "." devuelve `index.html`).
- **Un ajuste del seguimiento:** valor en `AJUSTES_POR_DEFECTO` y, si se edita en pantalla, su rango en `RANGOS` (aparece solo en Config. Dron, modo técnico).
- **Cambiar los límites del control real:** `LIMITES_CONTROL_REAL` en `dron-seguimiento.js` (y actualizá `tests/control-real.test.js`).
- **Un endpoint:** `case` en el `switch` del archivo de `api/`, con `validarMetodo`, `verificarAutenticacion`/`verificarDocente`/`verificarAdmin` y respuestas con `responderJson`/`responderError`. Documentalo en `api.md`.
- **Una acción del aula:** fila en `botones` (con `accion`) en `schema.sql`; la pantalla la muestra sola. Si es de un aparato nuevo, también una fila en `dispositivos` y su bloque en `pages/aula.php`.
- **Un comando del Tello:** método en `TelloAdapter` usando `enviarComando` (espera "ok") o `enviarSinRespuesta` (para `rc`). Si cambia el contrato con el plugin, cambiá los dos lados.

## Reglas que no hay que romper

- Seguridad de vuelo: EMERGENCIA siempre visible; confirmación y telemetría para despegar; failsafe (freno + aterrizaje y, si no se confirma, ningún comando automático); modos automáticos desactivados al entrar; aterrizar al salir de la cabina en vuelo; control real apagado por defecto y con confirmación.
- Nada externo (CDN, fuentes): el APK anda sin internet.
- Las páginas son `.php` pero sin PHP adentro.
- Sin credenciales en el repo (`config.php`, `config.h` y los keystores están en `.gitignore`).

## Cómo funciona el CI

`.github/workflows/android.yml`, en cada push a `main` y en cada PR:

| Job | Qué hace |
| :--- | :--- |
| Verificar sintaxis y referencias | `node --check`, `php -l`, `check_js.py`, `check_refs.py` y las pruebas de `tests/` |
| Compilar APK Debug del dron | `build-apk.js dron`, Capacitor, copia y registra el plugin `DronNative`, permisos, Gradle; artefacto `Grupo5Dron-app-debug` |
| Compilar APK Debug del aula | `build-apk.js aula`, Capacitor, Gradle; artefacto `Grupo5Aula-app-debug` |
| Compilar firmware ESP32 | PlatformIO con `config.h.example` como `config.h`, y el banco de pruebas |

Firma: si existe el secreto `DEBUG_KEYSTORE_BASE64`, los dos APK salen firmados con esa clave (se instalan encima de la versión anterior); si no, con una clave nueva en cada build.

## Probar en la PC

```bash
node --test tests/seguimiento.test.js tests/rac.test.js tests/control-real.test.js tests/inclinacion.test.js tests/objetos.test.js tests/botones.test.js
```

```bash
python scripts/check_js.py && python scripts/check_refs.py
```

Para la cabina sin dron: perfil "Simulador", o en Playwright un `window.Capacitor.Plugins.DronNative` falso que respete el contrato (`enviarComando`, `enviarSinRespuesta`, `iniciarEscucha`, `addListener`…). Para el aula: PHP + MySQL locales con `/api/` y `/aula/` (ver [despliegue](despliegue-hosting.md)) y el ESP32 simulado con pedidos HTTP a `esp32.php` con el encabezado `X-ESP32-Token`.
