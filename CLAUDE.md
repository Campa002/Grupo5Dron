# Grupo 5: Control de Sistemas y Dron

Contexto permanente para Claude Code. Este archivo se carga en cada sesión.
Historia completa y razones de cada decisión: `docs/contexto/historial-del-proyecto.md` (leelo cuando necesites el porqué de algo).
Informe oficial del proyecto: `docs/contexto/informe-grupo5-dron.pdf`.
La ÚNICA lista de pendientes es la sección "Próximos pasos" de este archivo.

## Con quién trabajás

- Luciano Campanelli ("RETE"), alumno de 7° 2° de la EEST N° 1 de Vicente López "Eduardo Ader".
- Materia: Proyecto de Desarrollo de Software para Plataformas Móviles. Profesores: Piris Eduardo y Figueroa.
- Grupo 5: Demian Barreto, Luciano Campanelli, Ramiro Caballero, Owen Olea.
- Respondé siempre en español rioplatense (voseo). Interfaz, comentarios y mensajes de commit en español.
- Luciano trabaja en Windows (PowerShell o Git Bash).
  - Node está en el PATH.
  - PHP NO está en el PATH: usá `C:\xampp\php\php.exe`.
  - XAMPP tiene Apache y MySQL (usuario `root` sin contraseña). MySQL: `C:\xampp\mysql\bin\mysql.exe`.
  - No hay JDK ni Android Studio: el APK se compila solo en GitHub Actions.

## Objetivo del proyecto (según el informe)

App móvil con una pantalla principal que permite elegir entre "Control del Aula" y "Control del Dron":
- Aula: enviar órdenes a un ESP32 que las ejecuta por infrarrojo (luces, ventiladores, aire, proyectores). Relé de 220 V solo con supervisión docente.
- Dron: control local desde el teléfono, video de la cámara, control con el giroscopio del celular y seguimiento automático de objetos/personas ("función muy importante del sistema").
- Requisito central: uso REAL de sensores físicos del celular (giroscopio y cámara).
- Regla del informe: lo que no está probado NO se presenta como terminado. Cada módulo se verifica antes de darlo por finalizado.

## Alcance actual: SOLO EL DRON

- El módulo del AULA está en pausa y lo continúa un compañero. Su estado completo quedó en la rama `aula-completo` y el tag `respaldo-pre-limpieza`.
- NO modifiques la lógica del aula: `backend/public/js/aula.js`, `backend/public/js/admin.js`, `backend/public/pages/aula.html`, `backend/api/comandos.php`, `dispositivos.php`, `botones.php`, `esp32.php`, ni `posibles-implementaciones/aula-esp32/`.
- El código compartido (`app.js`, `api.js`, `auth.js`, `index.php`, `sw.js`, `app.css`, `login.html`, backend de auth/usuarios/config/perfiles) se puede tocar, pero sin romper el aula. Avisale a Luciano ANTES de cambiar algo compartido.

## Arquitectura

```
Celular (APK Capacitor 5, frontend local en https://localhost)
 ├─ con internet ──HTTPS + JWT──> Hosting PHP 8 + MySQL (login, perfiles, config)
 └─ WiFi del Tello (sin internet) ──UDP──> DJI Ryze Tello 192.168.10.1
```

- Frontend: PWA en HTML/CSS/JS vanilla, en `backend/public/`, router por hash (`#/inicio`, `#/dron`, `#/prueba-tello`, `#/sensores`, `#/config-dron`, `#/aula`, `#/admin`, `#/acerca`, `#/login`).
- El APK empaqueta ese frontend: `scripts/build-apk.js` genera `capacitor/www/` (generado, ignorado por git) con un `index.html` estático a partir de `index.php`.
- Plugin nativo propio `DronNative` en Java (`capacitor/android_plugin/DronNativePlugin.java`) para UDP y para forzar el uso del WiFi del Tello aunque no tenga internet. El navegador solo no puede mandar UDP: por eso existe el APK.
- NO hay ESP32 en el dron. El celular habla directo con el Tello.
- El módulo del dron funciona SIN internet y SIN cuenta:
  - En el login, el botón "Usar el dron sin cuenta" activa el flag `grupo5dron_modo_invitado` en localStorage.
  - Con ese flag se puede entrar a dron, prueba Tello, sensores, config. del dron y acerca. Inicio redirige a la cabina; aula y admin mandan al login.
  - Una sesión cacheada vencida (sin conexión) también permite entrar al dron. Aula y admin siempre exigen sesión válida.
  - Iniciar o cerrar sesión borra el flag.
- El APK no puede loguearse contra un servidor HTTP local: `network_security_config.xml` solo permite HTTP hacia 192.168.10.1 y la página es `https://localhost`. Para loguearse desde el APK hace falta un servidor HTTPS.

## Protocolo del Tello (SDK 1.3, el del Tello común)

- WiFi propio `TELLO-XXXXXX`, IP `192.168.10.1`, sin internet.
- Comandos de texto por UDP al 8889. Primero `command` (responde `ok`). Luego `takeoff`, `land`, `emergency`, `streamon`, `battery?`, `forward/back/left/right/up/down x` (20-500 cm), `cw/ccw x` (grados). El Tello responde `ok` o `error...` al TERMINAR el movimiento.
- `stop` es del SDK 2.0 (Tello EDU): NO usarlo. El freno es `rc 0 0 0 0`.
- `rc a b c d` (roll, pitch, throttle, yaw, -100 a 100) NO recibe respuesta: se manda sin esperar (`enviarSinRespuesta`) a ~15 Hz, solo en vuelo y pausado mientras corre un paso, una misión o un aterrizaje.
- Telemetría: el Tello manda texto por UDP al puerto 8890 del celular (solo después de `command`). `h` viene en cm. La unidad de `vgx`/`vgy` no está documentada (se asume dm/s, a verificar).
- Video: tras `streamon`, H.264 (Annex B) por UDP al puerto 11111 del celular. El plugin lo agrupa cada ~30 ms y `dron-video.js` lo decodifica con WebCodecs.
- Si pasan ~15 s sin comandos, aterriza solo: hay keep-alive (`command` cada 8 s en tierra).
- El Tello común NO tiene posicionamiento absoluto (los mission pads son del Tello EDU). "Ir a un lugar" = movimientos relativos y misiones.

## Contrato del plugin DronNative (v2.1.0)

Fuente de verdad: `DronNativePlugin.java`. Del lado JS, el contrato está centralizado en `DronAdaptadores.DronNativo` (`dron-adaptadores.js`), que usan la cabina y Prueba Tello. Si cambiás algo de un lado, cambialo del otro.
- `enviarComando({host, puerto, mensaje, timeoutMs})` → `{respuesta, host, puerto, error?}`. NUNCA rechaza por falta de respuesta: resuelve con `respuesta: 'timeout'`. Hay que validar que la respuesta sea `ok`.
- `enviarSinRespuesta({host, puerto, mensaje})` → `{enviado}` (para `rc` y `emergency`; socket y executor reutilizados).
- `iniciarEscucha({puerto})` / `detenerEscucha({puerto})`. El puerto 11111 se trata como video, cualquier otro como telemetría.
- Eventos: `telemetria` `{raw, puerto}` y `videoPaquete` `{data (base64), tamano, paquetes}`.
- `vincularRedWifi()` → `{vinculada, motivo}` con timeout de 5 s. Mantiene un solo callback de red; si ya está vinculada no pide otro.
- `info()` → `{version, sdkAndroid, redVinculada}`.
- `addListener` devuelve un handle con `remove()`: guardalo y quitalo al salir (lo hace `DronNativo.escuchar`).
- Registro: `@CapacitorPlugin(name = "DronNative")`, registrado en `MainActivity` por el workflow. Paquete `ar.edu.eest1vl.grupo5dron`.

## Estructura del repo

```
.github/workflows/android.yml   jobs "verificar" (node --check, php -l, check_js, check_refs) y "build-apk"
backend/
  api/            auth, usuarios, config, dron-perfiles (+ endpoints del aula: no tocar)
  config/         config.example.php (config.php real: ignorado por git)
  includes/       auth_middleware, helpers, security (CORS: solo los orígenes de cors_origenes en config.php)
  sql/schema.sql  tablas y seed (perfiles_dron acepta solo tello|simulador)
  public/
    index.php, sw.js, manifest.json, css/app.css (estilos de la cabina acotados a .cabina / body.en-cabina)
    js/dron.js              cabina, pasos, misiones, failsafe, modos giro/seguimiento
    js/dron-adaptadores.js  DronNativo (contrato del plugin), TelloAdapter, SimulatorDroneAdapter
    js/dron-joystick.js, dron-giroscopio.js, dron-seguimiento.js, dron-video.js
    js/config-dron.js       perfiles (cache offline), timeout del failsafe
    js/sensores.js          diagnóstico de sensores del celular
    js/app.js, api.js, auth.js   compartidos (router, modo sin cuenta, Prueba Tello, sesión offline)
    pages/*.html            vistas parciales
    libs/tfjs, libs/coco-ssd  modelo de visión LOCAL (~19 MB, sí va al repo)
capacitor/        capacitor.config.json, package.json, network_security_config.xml, android_plugin/
scripts/          build-apk.js, check_js.py, check_refs.py, generar_hash.php
posibles-implementaciones/  firmware del aula, adaptadores genéricos (HTTP, UDP/TCP), herramientas viejas
docs/contexto/    informe, historial, reportes
```

## Cómo verificar y compilar

- Sintaxis: `node --check archivo.js` y `C:\xampp\php\php.exe -l archivo.php`. Balance de llaves: `python scripts/check_js.py`. Referencias a archivos: `python scripts/check_refs.py`. Los dos devuelven código distinto de 0 si fallan.
- Prueba web local:
  - `php -S 127.0.0.1:8088 -t backend/public` sirve el frontend pero NO `/api` (la API vive en `backend/api/`).
  - Para la API hace falta la junction local (ignorada por git): `cmd /c mklink /J backend\public\api backend\api`, o un router de `php -S` que mapee `/api/*.php` a `backend/api/`.
  - MySQL: base `grupo5dron_db` importada desde `backend/sql/schema.sql`; `backend/config/config.php` local con root sin contraseña.
- Usuarios del seed: la contraseña de todos es `password` y tienen `debe_cambiar_password = 1`: la app obliga a cambiarla en el primer login (`auth.php?action=cambiar_mi_password`). Para volver al estado inicial de la base local, reimportá `schema.sql`.
- CORS: `config.php` tiene que incluir `https://localhost` en `cors_origenes` (ya está en `config.example.php`) para que el APK pueda usar la API.
- Pruebas en navegador: Playwright con Microsoft Edge del sistema (`chromium.launch({ channel: 'msedge' })`). Para el TelloAdapter sin dron, se puede inyectar un mock de `window.Capacitor.Plugins.DronNative` que respete el contrato de arriba.
- APK: se compila en GitHub Actions en cada push a `main`. Artefacto: `Grupo5Dron-app-debug`.
- NO agregues `android-actions/setup-android` al workflow: el SDK ya viene en el runner y esa acción rompió el build.
- Mantené Capacitor 5.x con Node 20 y JDK 17. No actualices Capacitor sin que Luciano lo pida.

## Reglas de trabajo

- Leé el código antes de editarlo y buscá con grep todos los usos de lo que cambiás.
- Cambios puntuales. Respetá los nombres existentes de funciones, IDs, endpoints y tablas.
- Archivos con finales de línea CRLF: si una edición falla, revisá eso.
- Nada de recursos externos (CDN, Google Fonts): el APK tiene que andar sin internet.
- Sin credenciales reales en el repo. `config.php` y `config.h` están en `.gitignore`.
- Seguridad de vuelo. No debilites:
  - el botón de emergencia fijo y siempre visible;
  - la confirmación antes de despegar y el bloqueo del despegue sin telemetría;
  - el failsafe por pérdida de telemetría: freno + `land`, un reintento y aviso fijo. Desde que se dispara, NO sale ningún comando automático (ni `rc` ni keep-alive) para que el Tello pueda aterrizar solo a los ~15 s. Si vuelve la telemetría, reintenta `land`. Decisión de Luciano: NO cortar motores automáticamente;
  - que giroscopio, seguimiento y misiones arranquen desactivados y que al apagarlos sus ejes vuelvan a cero;
  - el aterrizaje al salir de la cabina en vuelo.
- Interfaz en español, tema oscuro con azul institucional, sin violetas.
- Git: Luciano hace commit y push salvo que te pida lo contrario. Nunca uses `git push --force` ni `git reset --hard`.
- No escribas documentación final salvo que te lo pida (se hace al final del proyecto).
- Al terminar una tarea, separá siempre: qué verificaste de verdad, qué solo está escrito y qué necesita el dron o un Android real.

## Criterios de calidad

Gran parte del código lo generó otro agente con poca revisión. No asumas que está bien: verificalo.
- Funciona: cada pantalla carga sin errores en consola y cada botón hace lo que dice. El flujo completo del simulador (conectar, despegar, paso, girar, misión, aterrizar, emergencia) anda de punta a punta.
- Responsive: se usa en celular. Revisá a 360, 390 y 412 px de ancho, en vertical y horizontal (la cabina se usa acostada). Sin scroll horizontal, botones táctiles de al menos 44 px, joysticks que no se superpongan con el video ni con el botón de emergencia.
- Consistente: mismos colores (variables de app.css), mismos componentes y textos en español claro en todas las pantallas.
- Robusto: errores de red con mensajes entendibles, nada que quede colgado esperando para siempre, estados de carga visibles.
- Limpio: sin código muerto, sin funciones duplicadas, sin `console.log` de depuración sueltos, sin archivos referenciados que no existen.

## Estado al 5/11/2026

- Auditoría completa hecha con Claude Code el 5/11. El detalle de lo que se encontró está en el historial (§3, puntos 12 y 13).
- La "revisión antes del vuelo" (contrato JS-plugin centralizado, video agrupado ~30 ms, job "verificar") NO la llegó a aplicar Antigravity; la aplicó Claude Code en la Fase 1.
- Fase 1 aplicada el 5/11 (sin commitear todavía; Luciano commitea, compila y prueba):
  - modo sin cuenta;
  - cabina rehecha: emergencia fija, horizontal con joystick | video | joystick, controles ≥ 44 px;
  - pasos y misiones funcionando, con el `rc` pausado durante las maniobras;
  - failsafe arreglado;
  - ejes RC independientes y ceros al apagar el giroscopio;
  - validación de respuestas del Tello;
  - aterrizar al salir de la cabina en vuelo;
  - Prueba Tello con escuchas reales;
  - video conectado a la cabina;
  - plugin 2.1.0.
- Verificado ejecutando:
  - sintaxis JS/PHP y scripts de chequeo;
  - Playwright + Edge: Simulador de punta a punta, mock del plugin, decodificador de video con H.264 real en paquetes de 1460 bytes, responsive a 360/390/412 en las dos orientaciones;
  - el plugin compila con javac 17 contra stubs de Android y Capacitor.
- SIN probar con hardware: todo lo UDP real, `vincularRedWifi`, video del Tello en el WebView, failsafe en vuelo, seguimiento.
- Fase 2 aplicada el 5/11 (verificada con Playwright contra PHP + MySQL locales):
  - perfiles: contrato con la API corregido; dos perfiles locales fijos (DJI Tello y Simulador) más los del servidor; sin llamadas a la API en modo sin cuenta; crear y editar para admin y docente, eliminar solo admin; la plantilla de comandos salió del formulario;
  - `api.js`: timeout de 10 s y `signal`; un 401 con sesión dispara `grupo5dron:sesion-vencida`: en el aula va al login y en las pantallas del dron pasa a modo sin cuenta;
  - cambio obligatorio de contraseña (`#/cambiar-password`, `auth.php?action=cambiar_mi_password`), también accesible desde el menú de usuario;
  - `https://localhost` en `config.example.php`, y contraseña del seed corregida en el README y en `schema.sql`.

## Próximos pasos (lista única)

1. **Primera prueba real con el Tello.** Commit, APK de CI e instalación (si dice "App no instalada", desinstalar la anterior: cada build de CI firma con otra clave debug). Después: "Usar el dron sin cuenta", `#/prueba-tello` (command, battery?, streamon), "Copiar informe" y pegarlo. Luego la cabina: despegar, aterrizar, paso, freno, giroscopio, failsafe, emergencia.
2. **Corregir lo que salga de esa prueba.** Lo más probable: red sin internet (`vincularRedWifi`), video en el WebView, si el `rc` interfiere con los pasos y la unidad de `vgx`/`vgy`.
3. ~~Fase 2, funciones~~: hecha (ver "Estado").
4. **Fase 3, interfaz fuera de la cabina:**
   - modo sin cuenta: inicio con las dos opciones del informe ("Control del Dron" entra directo y "Control del Aula" lleva al login), en lugar de saltar a la cabina;
   - clases que faltan en app.css (`alerta*`, `campo-formulario*`, utilidades);
   - modal de perfiles sin overlay ni estilos;
   - inputs de Prueba Tello y failsafe de 19 px;
   - badge del header que se parte en 3 líneas y botones del header de menos de 44 px;
   - tabla de Acerca que desborda;
   - contraste;
   - textos (Acerca menciona drones HTTP genéricos);
   - diagnóstico de sensores con lecturas reales del giroscopio.
5. **Fase 4, limpieza:**
   - código muerto y CSS sin uso (`.dron-video`, `.joystick-*`, `.sensor-*`);
   - `console.log` de depuración;
   - `'use strict'` dentro de clases (joystick y giroscopio);
   - `mostrarToast` con `innerHTML`;
   - service worker: no registrarlo en el APK, y las plantillas con `?v=Date.now()` llenan la caché.
6. **Hosting:** subir el backend, importar `schema.sql`, crear `config.php` (con `https://localhost` en CORS) y cambiar las contraseñas del seed.
7. **Al final:** documentación (README, manual de usuario, manual del programador, API, plan de pruebas, limitaciones) y corrección del informe (por ejemplo, el LED IR figura en GPIO35, que es solo de entrada).
