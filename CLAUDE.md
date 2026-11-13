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

App móvil con una pantalla principal que permite elegir entre "Control del Aula" y "Control del Dron" (desde la Etapa A, 11/11, son dos apps separadas: ver "Arquitectura" y "Próximos pasos", corrección del informe):
- Aula: enviar órdenes a un ESP32 que las ejecuta por infrarrojo (luces, ventiladores, aire, proyectores). Relé de 220 V solo con supervisión docente.
- Dron: control local desde el teléfono, video de la cámara, control con el giroscopio del celular y seguimiento automático de objetos/personas ("función muy importante del sistema").
- Requisito central: uso REAL de sensores físicos del celular (giroscopio y cámara).
- Regla del informe: lo que no está probado NO se presenta como terminado. Cada módulo se verifica antes de darlo por finalizado.

## Alcance actual: dron, y el aula separada (Etapa A)

- Hay DOS apps (Etapa A, 11/11): la del dron (`backend/public/`, APK `capacitor/`) y la del aula (`backend/public-aula/`, APK `capacitor-aula/`). Comparten la API PHP (`backend/api/`) y la base MySQL.
- El código del aula lo había dejado un compañero (rama `aula-completo` y tag `respaldo-pre-limpieza`; `main` ya lo contiene). En la Etapa A Luciano pidió separarlo y alinear el firmware al circuito soldado.
- Lógica del aula: `backend/public-aula/js/aula.js`, `admin.js`, `pages/aula.php`, `admin.php`, `backend/api/comandos.php`, `dispositivos.php`, `botones.php`, `esp32.php` y `posibles-implementaciones/aula-esp32/`. No la cambies sin que Luciano lo pida.
- La tabla `perfiles_dron` y `backend/api/dron-perfiles.php` quedan en el backend, sin uso (decisión de Luciano del 11/11: no tocarlos).

## Arquitectura

```
App del DRON (APK "Grupo 5 — Dron", frontend local en https://localhost, sin login ni API)
 └─ WiFi del Tello (sin internet) ──UDP──> DJI Ryze Tello 192.168.10.1
App del AULA (APK "Grupo 5 Aula", appId ar.edu.eest1vl.grupo5aula, con login)
 └─ con internet ──HTTPS + JWT──> Hosting PHP 8 + MySQL ──(polling)── ESP32 del aula (luces por relé; proyector y aire por IR)
```

- Frontends: PWA en HTML/CSS/JS vanilla, router por hash.
  - Dron, `backend/public/`: `#/inicio`, `#/dron`, `#/seguimiento` (cámara del celular), `#/prueba-tello`, `#/sensores`, `#/config-dron`, `#/objetos`. Cualquier otra ruta (por ejemplo la vieja `#/acerca` o `#/aula`) va al inicio. Rutas absolutas (`/js/...`): va en la raíz del hosting.
  - Aula, `backend/public-aula/`: `#/login`, `#/aula` (la principal), `#/admin`, `#/cambiar-password`. Cualquier otra ruta va a `#/aula`. Rutas relativas (`js/...`, `pages/...`): en el hosting va en una subcarpeta (por ejemplo `/aula/`) y usa la misma `/api/`.
- Cada app tiene su propio `app.css` con solo sus estilos (se separaron sin cambiar ningún estilo calculado: comparado contra `main` con Playwright).
- Los APK empaquetan esos frontends: `node scripts/build-apk.js dron` genera `capacitor/www/` y `node scripts/build-apk.js aula` genera `capacitor-aula/www/` (los dos generados e ignorados por git), con un `index.html` estático a partir de `index.php` y las páginas (`pages/*.php`) con el mismo nombre, sin ningún bloque `<?php ... ?>`.
- Plugin nativo propio `DronNative` en Java (`capacitor/android_plugin/DronNativePlugin.java`) para UDP y para forzar el uso del WiFi del Tello aunque no tenga internet. El navegador solo no puede mandar UDP: por eso existe el APK.
- NO hay ESP32 en el dron. El celular habla directo con el Tello.
- La app del dron funciona SIN internet y SIN cuenta (decisiones de Luciano del 6/11 y del 11/11): no tiene login, ni `api.js`/`auth.js`, ni llama al servidor. Los perfiles son dos, fijos: DJI Tello y Simulador (`ConfigDron`); un id guardado que no sea uno de esos (por ejemplo, de un perfil viejo del servidor) usa el Tello. El service worker (solo en el navegador) atiende únicamente los archivos del dron: `/api/` y la web del aula van directo a la red.
- La app del aula pide iniciar sesión para todo (docente o admin). Después del login (y del cambio de contraseña obligatorio, si corresponde) vuelve a la pantalla pedida (`Auth.recordarDestino` / `Auth.tomarDestino`). Con la sesión guardada pero sin servidor muestra "Sin conexión con el servidor". Administración, solo admin.
- El APK del aula no puede loguearse contra un servidor HTTP local: la página es `https://localhost` y Android bloquea el HTTP. Para loguearse desde el APK hace falta un servidor HTTPS. El APK del dron solo permite HTTP hacia 192.168.10.1 (`network_security_config.xml`).

## Protocolo del Tello (SDK 1.3, el del Tello común)

- WiFi propio `TELLO-XXXXXX`, IP `192.168.10.1`, sin internet.
- Comandos de texto por UDP al 8889. Primero `command` (responde `ok`). Luego `takeoff`, `land`, `emergency`, `streamon`, `battery?`, `forward/back/left/right/up/down x` (20-500 cm), `cw/ccw x` (grados). El Tello responde `ok` o `error...` al TERMINAR el movimiento.
- `stop` es del SDK 2.0 (Tello EDU): NO usarlo. El freno es `rc 0 0 0 0`.
- `rc a b c d` (roll, pitch, throttle, yaw, -100 a 100) NO recibe respuesta: se manda sin esperar (`enviarSinRespuesta`) a ~15 Hz, solo en vuelo y pausado mientras corre un paso, una misión o un aterrizaje. Durante el despegue, si el "ok" no llegó a los 8 s y sigue llegando telemetría, un `rc 0 0 0 0` por segundo (para que no aterrice solo).
- El Tello contesta al IP:puerto que le habló: todo lo que va al 8889 sale de UN socket con el puerto local 8889 (si está libre) y un hilo lector reparte las respuestas en orden a los comandos que esperan. Las respuestas no dicen a qué comando contestan: no mandes dos comandos con respuesta a la vez (`despegar` espera a que termine el anterior).
- Telemetría: el Tello manda texto por UDP al puerto 8890 del celular (solo después de `command`). `h` viene en cm. La unidad de `vgx`/`vgy` no está documentada (se asume dm/s, a verificar).
- Video: tras `streamon`, H.264 (Annex B) por UDP al puerto 11111 del celular. El plugin lo agrupa cada ~30 ms y `dron-video.js` lo decodifica con WebCodecs.
- Si pasan ~15 s sin comandos, aterriza solo: hay keep-alive (`command` cada 8 s en tierra).
- El Tello común NO tiene posicionamiento absoluto (los mission pads son del Tello EDU). "Ir a un lugar" = movimientos relativos y misiones.

## Contrato del plugin DronNative (v2.2.0)

Fuente de verdad: `DronNativePlugin.java`. Del lado JS, el contrato está centralizado en `DronAdaptadores.DronNativo` (`dron-adaptadores.js`), que usan la cabina y Prueba Tello. Si cambiás algo de un lado, cambialo del otro.
- `enviarComando({host, puerto, mensaje, timeoutMs})` → `{respuesta, host, puerto, puertoLocal, desde?, error?}`. NUNCA rechaza por falta de respuesta: resuelve con `respuesta: 'timeout'` (o `'cancelado'`). Hay que validar que la respuesta sea `ok`.
- `enviarSinRespuesta({host, puerto, mensaje})` → `{enviado}` (para `rc` y `emergency`; mismo socket que los comandos).
- `cancelarEsperas({comando?})` → `{canceladas}`: lo usa el despegue confirmado por telemetría para que su "ok" tardío no quede para el comando siguiente.
- `iniciarEscucha({puerto})` / `detenerEscucha({puerto})`. El puerto 11111 se trata como video, cualquier otro como telemetría.
- Eventos: `telemetria` `{raw, puerto}`, `videoPaquete` `{data (base64), tamano, paquetes, perdida, perdidasTotales}` y `respuestaUdp` `{texto, desde, puertoLocal, comando, sinEspera}`.
- `vincularRedWifi()` → `{vinculada, motivo, red}` (`red`: `wifi`, `datos`, `ninguna` u `otra`). Busca el WiFi activo sin internet (`getAllNetworks`), vincula el proceso y cada socket (`network.bindSocket`) y recrea el socket de comandos. Si no lo encuentra, `requestNetwork` con timeout de 5 s. El primer comando también vincula solo.
- `info()` → `{version, sdkAndroid, redVinculada, red, puertoLocalComandos}`.
- `addListener` devuelve un handle con `remove()`: guardalo y quitalo al salir (lo hace `DronNativo.escuchar`).
- Registro: `@CapacitorPlugin(name = "DronNative")`, registrado en `MainActivity` por el workflow. Paquete `ar.edu.eest1vl.grupo5dron`.

## Estructura del repo

```
.github/workflows/android.yml   jobs "verificar" (node --check, php -l, check_js, check_refs, node --test), "build-apk" (dron),
                                "build-apk-aula" y "firmware" (PlatformIO)
backend/
  api/            auth, usuarios, config, comandos, dispositivos, botones, esp32 (+ dron-perfiles, sin uso)
  config/         config.example.php (config.php real: ignorado por git)
  includes/       auth_middleware, helpers, security (CORS: solo los orígenes de cors_origenes en config.php)
  sql/schema.sql  tablas y seed (perfiles_dron acepta solo tello|simulador)
  public/
    index.php, sw.js, manifest.json, css/app.css (estilos de la cabina acotados a .cabina / body.en-cabina)
    js/dron.js              cabina, pasos, misiones, failsafe, modos giro/seguimiento
    js/dron-adaptadores.js  DronNativo (contrato del plugin), TelloAdapter, SimulatorDroneAdapter
    js/dron-joystick.js     botones de mantener apretado (DronBotonesMovimiento, mando por defecto) y joysticks (modo técnico)
    js/dron-giroscopio.js, dron-video.js
    js/dron-seguimiento.js  tubería del seguimiento (COCO-SSD + caras, Selector con reglas de RAC, Controlador, límites del control real, diagnóstico)
    js/dron-caras.js        BlazeFace (libs/blazeface, float16, 270 KB): decodificación pura y detección
    js/dron-seguimiento-ui.js  tarjetas estilo RAC (estado, confianza, historial, diagnóstico, interruptor de control real)
    js/config-dron.js       los dos perfiles fijos, modo técnico, failsafe, sentido del avance y ajustes del seguimiento
    js/sensores.js          diagnóstico de sensores del celular
    js/app.js               router, Prueba Tello, Sensores y Mis objetos
    pages/*.php             vistas parciales (fragmentos HTML; no dependen de PHP)
    libs/tfjs, libs/coco-ssd  modelo de visión LOCAL (pesos en float16, ~10 MB, sí va al repo)
    libs/mobilenet            MobileNet v1 0.25 cortado en la "huella" (256 números) para Mis objetos, float16, 437 KB
    js/dron-objetos.js        Mis objetos: huellas, IndexedDB y alta con 3 a 15 fotos
  public-aula/      app del AULA: index.php, js/ (app, api, auth, aula, admin), pages/ (login, aula, admin, cambiar-password), css/, img/
capacitor/        APK del dron: capacitor.config.json, package.json, network_security_config.xml, android_plugin/
capacitor-aula/   APK del aula: capacitor.config.json, package.json (sin plugin propio)
scripts/          build-apk.js (dron | aula), check_js.py, check_refs.py (las dos apps), ci_firma_debug.sh (firma de los dos APK), generar_hash.php
posibles-implementaciones/  firmware del aula (pines del circuito soldado), carcasa del equipo del aula (aula-esp32/carcasa: OpenSCAD, para-imprimir/ y vistas), adaptadores genéricos (HTTP, UDP/TCP), herramientas viejas
docs/             guía de pruebas en clase, manuales, API, plan de pruebas, limitaciones, correcciones del informe, despliegue, seguimiento
docs/contexto/    informe, historial, reportes
```

## Cómo verificar y compilar

- Sintaxis: `node --check archivo.js` y `C:\xampp\php\php.exe -l archivo.php`. Balance de llaves: `python scripts/check_js.py`. Referencias a archivos: `python scripts/check_refs.py`. Los dos devuelven código distinto de 0 si fallan.
- Prueba web local:
  - `php -S 127.0.0.1:8088 -t backend/public` sirve la app del dron (no necesita la API).
  - El aula necesita la API: armá una carpeta con la app del dron en la raíz, `api` apuntando a `backend/api` y `aula` apuntando a `backend/public-aula` (junctions en Windows: `cmd /c mklink /J`), y serví esa carpeta con `php -S`. Así queda como en el hosting: `/`, `/api/` y `/aula/`.
  - MySQL: base `grupo5dron_db` importada desde `backend/sql/schema.sql`; `backend/config/config.php` local con root sin contraseña.
- Usuarios del seed: la contraseña de todos es `password` y tienen `debe_cambiar_password = 1`: la app obliga a cambiarla en el primer login (`auth.php?action=cambiar_mi_password`). Para volver al estado inicial de la base local, reimportá `schema.sql`.
- CORS: `config.php` tiene que incluir `https://localhost` en `cors_origenes` (ya está en `config.example.php`) para que el APK pueda usar la API.
- Pruebas automáticas: `node --test tests/seguimiento.test.js tests/rac.test.js tests/control-real.test.js tests/inclinacion.test.js tests/objetos.test.js tests/botones.test.js` (107 pruebas; rac: reglas 75/8/3 de 5, cara/cuerpo, tocar recuadro, BlazeFace, diagnóstico; control-real: límites y perdido = quieto) (selector de Mis objetos, seguimiento con recorridos sintéticos, marco con bordes de la imagen analizada, inclinación por acelerómetro con eventos simulados, botones de mantener apretado con eventos de puntero simulados).
- Pruebas en navegador: Playwright con Microsoft Edge del sistema (`chromium.launch({ channel: 'msedge' })`). Para el TelloAdapter sin dron, se puede inyectar un mock de `window.Capacitor.Plugins.DronNative` que respete el contrato de arriba.
- APK: se compilan en GitHub Actions en cada push a `main` y en cada PR. Artefactos: `Grupo5Dron-app-debug` (dron) y `Grupo5Aula-app-debug` (aula).
- Firmware del aula: el job "firmware" lo compila con PlatformIO (usa `config.h.example` como `config.h`) y compila también `tests/test_hardware.ino`. Desde este entorno de Claude no se puede: la red bloquea el registro de PlatformIO.
- Firma de los APK debug (los dos con la misma clave, `scripts/ci_firma_debug.sh`):
  - Si existe el secreto `DEBUG_KEYSTORE_BASE64`, `ci_firma_debug.sh instalar` lo instala como `~/.android/debug.keystore` (alias `androiddebugkey`, contraseña `android`) y `ci_firma_debug.sh verificar` comprueba con `apksigner` que el APK quedó firmado con esa clave.
  - Sin el secreto, o si no es válido, se usa la clave por defecto (cambia en cada build) y el build no falla.
  - El keystore nunca va al repo (`.gitignore`: `*.keystore`, `*.jks`, `*.keystore.b64`).
- NO agregues `android-actions/setup-android` al workflow: el SDK ya viene en el runner y esa acción rompió el build.
- Mantené Capacitor 5.x con Node 20 y JDK 17. No actualices Capacitor sin que Luciano lo pida.

## Reglas de trabajo

- Leé el código antes de editarlo y buscá con grep todos los usos de lo que cambiás.
- Cambios puntuales. Respetá los nombres existentes de funciones, IDs, endpoints y tablas.
- Archivos con finales de línea CRLF: si una edición falla, revisá eso.
- Nada de recursos externos (CDN, Google Fonts): el APK tiene que andar sin internet.
- Todo archivo que use la app tiene que tener extensión. En el APK, Capacitor responde index.html a cualquier ruta sin "." (html5mode). Por eso los shards del modelo son `group1-shardNofM.bin`. Si se cambia el modelo, renombrar los shards y sus `paths` en `model.json`, pasarlo a float16 con `python scripts/modelo_float16.py` y actualizar la lista de `sw.js` (y subir `CACHE_NAME`).
- Las páginas son .php pero no pueden depender de PHP para funcionar en el APK. No hay archivos `.html` en el proyecto (`check_refs.py` falla si aparece uno en `pages/` y avisa si una página trae código PHP). `build-apk.js` quita todo bloque `<?php ... ?>` / `<?= ... ?>` al generar `www/` y falla si queda alguno. Capacitor sirve `/pages/x.php` como archivo porque tiene extensión; `cargarPlantilla` (app.js) no depende del content-type y avisa si en lugar de la vista llega una página completa.
- `.gitattributes` marca como binarios `backend/public/libs/**`, imágenes, `.bin`, `.stl` y keystores (la PC tiene `core.autocrlf=true`).
- Sin credenciales reales en el repo. `config.php` y `config.h` están en `.gitignore`.
- Seguridad de vuelo. No debilites:
  - el botón de emergencia fijo y siempre visible;
  - la confirmación antes de despegar y el bloqueo del despegue sin telemetría;
  - el failsafe por pérdida de telemetría: freno + `land`, un reintento y aviso fijo. Desde que se dispara, NO sale ningún comando automático (ni `rc` ni keep-alive) para que el Tello pueda aterrizar solo a los ~15 s. Si vuelve la telemetría, reintenta `land`. Decisión de Luciano: NO cortar motores automáticamente;
  - que giroscopio, seguimiento y misiones arranquen desactivados y que al apagarlos sus ejes vuelvan a cero;
  - que los botones de movimiento frenen su eje al soltar, al salir del botón, al perder el toque, al pasar a segundo plano o al perder el foco, que arranquen en Lenta y que solo se puedan apretar en vuelo;
  - el seguimiento arranca en ENSAYO; el control real (S3, 13/11) está apagado por defecto, pide confirmación cada vez, solo en vuelo y con las condiciones; límites fijos `LIMITES_CONTROL_REAL` (giro 20, altura y avance 15, nunca roll, zona muerta 4); sin objetivo, rc 0 0 0 0; vuelve a ensayo con botones/joysticks, inclinación, sin conexión, condiciones, segundo plano o al salir;
  - el aterrizaje al salir de la cabina en vuelo.
- Interfaz en español, tema oscuro con azul institucional, sin violetas.
- Diseño (rama `interfaz-bootstrap`, 13/11): Bootstrap 5.3.3 LOCAL (`libs/bootstrap/` en cada app, sin JS de Bootstrap) con `data-bs-theme="dark"` y el azul institucional en las variables `--bs-*` de `app.css`. Usar los componentes tal cual (navbar, list-group, alert, form-switch, progress, badge, table, nav-pills); `app.css` queda chico, solo con lo que Bootstrap no resuelve (cabina, estados sobre la imagen, colores del seguimiento, avisos, menú). Estilo racvision: `.etiqueta` arriba de cada título, títulos en mayúsculas, secciones "01 —", poco texto. `[hidden]` gana siempre (las utilidades `d-flex` usan `!important`). Sin sombras, gradientes ni brillos.
- Modo técnico: lo que sirve para diagnosticar va con la clase `solo-tecnico` (oculta salvo `body.modo-tecnico`). Se activa en Config. Dron (`App.modoTecnico()`, `App.cambiarModoTecnico()`, clave `grupo5dron_modo_tecnico`) y arranca apagado. Lo oculto sigue funcionando (por ejemplo, el failsafe).
- Lenguaje simple (pedido de Luciano del 6/11): en la interfaz normal nada de rc, UDP, telemetría, backend ni FPS; cada sección con una ayuda corta de una o dos líneas. En el modo técnico se pueden usar, con la explicación entre paréntesis, y cada herramienta lleva una línea que dice para qué sirve.
- Sin emojis en la interfaz (el único que queda es 🧭 del giroscopio). Íconos: pocos, de Bootstrap Icons local (solo woff2), desde JS con `App.icono(nombre)` / `App.textoConIcono(el, nombre, texto)` (mapa `ICONOS` en `app.js`; un nombre sin ícono no dibuja nada) y `App.textoConPunto(el, color, texto)` para estados. Íconos decorativos con `aria-hidden` y siempre con texto visible o `aria-label`. Si cambia la lista de archivos de Bootstrap, actualizar `sw.js` (v14).
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

## Etapa C: carcasa del equipo del aula (versión 2 del 13/11, sin fuente)

- `posibles-implementaciones/aula-esp32/carcasa/`: `carcasa_aula.scad` (paramétrico), `para-imprimir/` (STL y `LEEME.txt` con configuración y tiempos), `vistas/`, `README.md` y `version-anterior-dos-pisos-con-HLK/` (versión con HLK y fusible: NO borrar).
- Dos pisos: abajo el relé (bornera al frente) y 2 PG7 para la fase de la lámpara; bandeja con un paso de 7 mm; arriba ESP32 (25 mm debajo para las fichas, USB-C contra el frente con ventana abierta hasta la tapa y ranuras para un precinto), BC337 y KY-022. Tapa con dos rótulas (giran 50°, `rotula_apriete` 0,1).
- Paredes de 2 mm, L = 68, 60 mm de alto, la pieza más grande Ø137. PrusaSlicer 2.7 (0,28 mm, 2 perímetros, 15 %): cuerpo 3 h 39, bandeja 1 h 14, tapa 1 h 16, cápsulas y tapones 9 min; total ~6 h 45 (con las mismas velocidades el cuerpo viejo daba 10 h 21, lo que tardó de verdad).
- Verificado en OpenSCAD: sólidos únicos y cerrados, vista `"choques"` vacía. Sin imprimir ni medir con calibre.

## Estado al 13/11/2026 (rama `prueba-en-clase`, PR #5, "NO MERGEAR: para probar en clase")

- Pedido de Luciano del 13/11: dejar todo listo para probarlo junto en clase. La rama `prueba-en-clase` junta la Etapa A (PR #3), la C (PR #4), la B, el S3, el aula y la documentación. El CI deja los dos APK. Recomendación: después de la clase, mergear solo el PR #5 y cerrar #3 y #4 (quedan contenidos).
- **Etapa B (seguimiento estilo RAC):** BlazeFace local para la cara (cuerpo de respaldo; tamaño ideal 7,5 % cara y 55 % cuerpo, ~3 m); un solo `Selector` para persona, clase tocada y Mis objetos con las reglas 75 % / 8 seguidas / 3 de 5; tocar un recuadro elige; pantalla `#/seguimiento` (cámara del celular, nunca manda nada) y las mismas tarjetas en la cabina (estado, confianza, historial de 20 con Limpiar, FPS, diagnóstico con foto de prueba de la NASA `img/prueba-persona.jpg`). La demo de Sensores se movió a `#/seguimiento`. `sw.js` v13.
- **S3:** control real en la cabina (ver "Reglas de trabajo"). Emergencia, failsafe, freno y despegue sin cambios (al apagarse por ellos, el control real no manda nada extra).
- **Aula:** solo luces (relé), proyector y aire (IR). Base con acciones fijas (`botones.accion`), código hasta 255 y trama cruda MEDIUMTEXT; API sin altas genéricas; aprender solo docente/admin. Arreglos: `esp32.php` incluía `botones.php` y los códigos nunca se guardaban; el firmware cortaba los aires (buffer 100 → 1024, fin de trama 50 ms), reenvía con el protocolo de IRremoteESP8266 o con la trama cruda, y el `WiFiClient` plano se destruía antes de usarse. Firmware 1.1.0.
- **Alimentación:** ESP32 por USB-C con cargador (5 V, 1 A o más; pico calculado ~520 mA). HLK y fusible fuera (mejora futura).
- **Verificado:** 107 pruebas; Chromium con WebGL (SwiftShader) y cámara falsa: sigue la cara al 96 %, historial y diagnóstico sin errores; cabina con mock del Tello: ensayo sin rc, control real dentro de límites, perdido = rc 0 0 0 0, botón y pérdida de conexión vuelven a ensayo y el failsafe aterriza; 360/390/412 vertical y horizontal; aula con PHP 8.3 + MariaDB y ESP32 simulado (aprender, código DAIKIN de 280 bits y 583 tiempos que vuelve igual, luces, permisos); OpenSCAD y PrusaSlicer (carcasa).
- **Sin probar:** todo con el celular, el dron, el ESP32 real, los controles del aula y la impresión. Guía: `docs/guia-pruebas-en-clase.md`.

## Decisiones tomadas sin consultar (13/11)

- Etapa B, S3, aula y documentación como commits en `prueba-en-clase` (no una rama por etapa): Luciano pidió una sola rama para probar. Los PR #3 y #4 quedan como estaban.
- BlazeFace "back" (entrada 256) de @vladmandic/human-models (MIT; original de MediaPipe, Apache 2.0) con decodificador propio: el paquete oficial no anda con ese modelo y el "front" no detecta caras de menos del 20 % del alto.
- Después de "Objetivo perdido" solo se retoma algo cerca de donde estaba durante 5 s; si no, hay que volver a elegir (para que el control real no se enganche solo con otra persona). En Mis objetos se busca en cualquier lugar.
- Tamaño ideal del cuerpo de 45 % a 55 % para que coincida con la cara (7,5 %) a la misma distancia (~3 m).
- Diagnóstico con una foto de dominio público (NASA, astronauta Eileen Collins, de scikit-image) para separar "la GPU calcula mal" de "la cámara no ve".
- Control real: además de lo pedido, exige las condiciones ya definidas (altura 80-250 cm, batería ≥ 30 %, datos del dron, WebGL, ≥ 4 FPS) y vuelve a ensayo si dejan de cumplirse o si se activa la inclinación.
- Aula: una instalación = un aula (sin tabla de aulas). Se sacaron las altas genéricas de aparatos y botones, la tarjeta "Parámetros del ESP32" (no hacía nada) y el giroscopio de la administración del aula. "Subir/Bajar temperatura" aparecen solo con código.
- En clase el aula se prueba con XAMPP en una notebook y el navegador del celular (el APK necesita HTTPS).
- Carcasa: dos pisos (no entra en uno), L = 68, 60 mm de alto; se aceptó 6 h 45 min de impresión.

## Estado al 11/11/2026

- Etapa A: aula separada del dron (11/11). Ver "Arquitectura".
  - App del dron sin aula, administración, login, API ni ESP32; inicio con "Cabina" y "Prueba Tello"; perfiles fijos; Prueba Tello sin URL de la API ni sesión; `sw.js` v12.
  - App del aula nueva en `backend/public-aula/` (login, aula, administración, cambio de contraseña) y APK "Grupo 5 Aula". Se sacaron los botones del canal 2 del relé (el circuito tiene un solo relé).
  - Firmware alineado al circuito soldado: emisor GPIO18 (BC337 con 2 LEDs IR en serie), relé de las luces GPIO26, receptor KY-022 GPIO15. `PIN_IR_SEND`, `PIN_RELE_LUCES`, `PIN_IR_RECV` y `RELE_ACTIVO_EN_BAJO` (1 por defecto) en `config.h.example`. Un solo relé. README del firmware y banco de pruebas actualizados.
  - Verificado: con PHP + MariaDB locales (dron en `/`, API en `/api/`, aula en `/aula/`) y Playwright: las dos apps sin errores de consola, la del dron sin ningún pedido a `/api`, login del aula con cambio de contraseña y vuelta al destino, docente sin administración, 360/412/740 sin scroll; estilos idénticos a `main` en todas las pantallas; `ci_firma_debug.sh` con secreto válido, inválido y sin secreto. El APK del aula y el firmware los compila el CI.
  - Sin probar: los dos APK en el celular, el aula contra el hosting real (HTTPS) y el firmware en el ESP32.

## Estado al 6/11/2026

- Botones de mantener apretado en la cabina (6/11, después de la primera prueba: los joysticks movían el Tello real, pero eran muy sensibles):
  - Adelante, Atrás, Izquierda, Derecha (cruz derecha) y Subir, Bajar, Girar a la izquierda y a la derecha (cruz izquierda). Mientras están apretados, su eje vale la velocidad elegida; al soltar, ese eje vuelve a 0 y el `rc` sale en el acto (`DroneAdapter.enviarEjesYa`). Se combinan con dos dedos; opuestos se anulan.
  - Velocidad: Lenta (rc 20, por defecto y siempre al entrar), Normal (35) y Rápida (50).
  - Frenan también si el dedo sale del botón, si se cancela o pierde el toque, si la app pasa a segundo plano, si la ventana pierde el foco o al salir. Solo se pueden apretar en vuelo; un paso o una misión los sueltan; emergencia y failsafe también. Con la inclinación activa, los de avance y costados quedan bloqueados.
  - Los joysticks siguen, solo en el modo técnico ("Usar joysticks"); al salir de la cabina vuelven los botones.
  - Verificado: `tests/botones.test.js` (12 pruebas); mock del Tello (`rc 0 20 0 0` en Lenta, `rc 0 35 35 0` con Adelante + Subir, `rc 0 0 0 0` al salir del botón, en segundo plano y al perder el foco); simulador de punta a punta; 360/390/412 en vertical y horizontal sin scroll ni superposición, botones de 44 px o más. Sin probar con el dron.

- Primera prueba con el Tello real (TELLO-FCD710, A06) y arreglos (6/11, noche):
  - Resultado: con datos móviles prendidos, "command" sin respuesta; con datos apagados conecta, llegan datos y video (con cuadros rotos) y despega, pero la cabina queda en "Despegando...", sin confirmar `streamon`, los controles no andan y el Tello aterriza solo a los ~15 s.
  - Causa: cada `enviarComando` usaba un socket nuevo (puerto distinto) que se cerraba al terminar, y el `rc` salía de otro. El Tello contesta a un solo destino, así que las respuestas se perdían. Sin el "ok" del takeoff la app no pasaba a "en vuelo", no mandaba `rc` ni keep-alive (la espera de 20 s supera los 15 s del Tello) y el respaldo por telemetría recién se miraba al vencer.
  - Arreglos: plugin 2.2.0 (socket único en el puerto local 8889 con hilo lector; WiFi vinculado aunque haya datos móviles; pérdidas de video marcadas y buffer de 2 MB); despegue confirmado por telemetría (desde los 6 s: 30 cm o más y motores encendidos, por el avance de `time`); `rc 0 0 0 0` por segundo desde los 8 s del despegue; `streamon` confirmado si llega video; registro de comandos con puertos (modo técnico, cabina y Prueba Tello); Prueba Tello dice qué red usa.
  - Verificado: plugin con `javac --release 17` contra stubs y un Tello simulado por UDP (el plugin viejo reproduce las fallas, el nuevo no); cabina con mock del plugin (despegue normal, sin respuesta, sin despegar y sin respuesta a `streamon`); simulador de punta a punta; pruebas de siempre. Sin probar con el dron.

- Detección en el A06 (GPU Mali), Mis objetos y lenguaje simple (6/11, historial §3, punto 28):
  - Si la GPU no puede escribir float32, se apaga el empaquetado de WebGL (`WEBGL_PACK*`, `WEBGL_CONV_IM2COL`): el arreglo conocido para Mali. Modo técnico: "Probar este cuadro en CPU" (mismo cuadro con WebGL y con CPU, lado a lado) y la miniatura con todas las detecciones desde el 10 % (el umbral para seguir sigue en 50 %).
  - Un solo detector en memoria para toda la app (`DronSeguimiento.cargarDetector`).
  - Mis objetos (`#/objetos`): de 3 a 15 fotos; el recuadro más grande del detector o la foto entera; huella con MobileNet; IndexedDB. "¿Qué seguir?" en la cabina y en Sensores. `SelectorObjeto`: confirmar con 8 (75 %), perder con 3 de 5, como mucho 3 comparaciones por cuadro, re-verificación cada ~1 s; "No encuentro «nombre»" a los 3 s. Sigue en ensayo.
  - WASM NO se agregó (propuesto, ver historial).

- Primera prueba del APK en un Samsung Galaxy A06 (Android 16, sin dron, sin giroscopio ni magnetómetro). Arreglos del 6/11 (historial §3, punto 24):
  - Detección: la imagen que va al modelo respeta la proporción (vertical → cuadrado con bordes; 4:3 del Tello sin cambios). `Seguimiento.marcoAnalisis`. Miniatura "lo que ve el modelo", brillo del cuadro y datos de WebGL en el modo técnico; el CSV trae una primera línea con cámara, imagen analizada y backend. La caja de la demo toma la proporción de la cámara.
  - Interfaz minimalista con modo técnico. Inicio: solo Aula y Dron. Cabina: estados, batería y altura sobre el video. Sensores: inclinación y detección. Prueba Tello: cinco pasos y "Listo para volar" o qué falta. "Mis objetos" oculto hasta S4.
  - Inclinación: `LectorInclinacion` (dron-giroscopio.js) usa deviceorientation y, si no llega con datos, el acelerómetro; sin giro vertical y con aviso. El diagnóstico de Sensores escucha los eventos de verdad.
  - Inclinación respecto de la PANTALLA (vertical y las dos horizontales, `inclinacionEnPantalla`); en vertical natural, los mismos valores de siempre. Si la pantalla gira con la inclinación activada, se apaga con los ejes en cero y pide volver a activarla (recalibra). Decisión de Luciano del 6/11.
  - Sentido del avance (decisión de Luciano del 6/11): inclinar hacia adelante (el borde de arriba de la pantalla hacia abajo, alejándose) avanza, como empujar un joystick. "Invertir avance" (modo técnico, Config. Dron, clave `grupo5dron_invertir_avance`) vuelve al sentido anterior; se lee al activar la inclinación.
  - Modelo en float16 (`scripts/modelo_float16.py`): 9.017.328 bytes en 3 shards, mismas detecciones y FPS que float32 en la PC; `sw.js` v9.
- Sin login de entrada y sin "Acerca de" (6/11): ver "Arquitectura". `pages/acerca.php` borrada; `sw.js` v10; `check_refs.py` lee las rutas de `RUTAS_DRON`, `RUTAS_SIN_CUENTA` y `RUTAS_VALIDAS` y falla si no las encuentra.
- Sin probar en el celular: si la detección mejora en el A06 y qué muestra la miniatura; el respaldo por acelerómetro con el sensor real (signos de adelante/atrás y costados).

## Estado al 5/11/2026

- Auditoría completa hecha con Claude Code el 5/11. El detalle de lo que se encontró está en el historial (§3, puntos 12 y 13).
- La "revisión antes del vuelo" (contrato JS-plugin centralizado, video agrupado ~30 ms, job "verificar") NO la llegó a aplicar Antigravity; la aplicó Claude Code en la Fase 1.
- Fase 1 aplicada y commiteada el 5/11:
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
- Fase 3 aplicada el 5/11 (verificada con Playwright a 360/390/412 en las dos orientaciones, con PHP + MySQL locales):
  - modo sin cuenta: "Usar el dron sin cuenta" lleva al inicio con las dos opciones (Dron entra directo; Aula lleva al login); sin la tarjeta del ESP32;
  - app.css: utilidades y `.alerta*` que faltaban, `[hidden]` global, `.campo__ayuda`, inputs y botones de modal de 44 px;
  - contraste ≥ 4,5:1 (botones primario, peligro y éxito, y texto terciario `#8696ab`);
  - header: botones de 44 px, badge compacto (solo el ícono en pantallas de 480 px o menos), título con "…";
  - modal de perfiles con el componente `.modal-overlay` / `.modal`; Prueba Tello con controles de 44 px;
  - Sensores: lectura en vivo del giroscopio (beta, gamma, alpha), con aviso si no llegan datos;
  - Acerca: datos técnicos reales y solo los nombres de los integrantes (los roles los tiene que confirmar Luciano).
- Fase 4 aplicada el 5/11 (verificada con Playwright, con el service worker activo):
  - service worker v6: en el navegador, primero la red para páginas, JS y CSS (la caché solo sin conexión o si la red tarda más de 3 s); en el APK no se registra y se desregistra si había uno; las plantillas se piden sin `?v=` y revalidando;
  - `mostrarToast` con `textContent` (no interpreta HTML);
  - borrado el CSS de la cabina vieja (`.dron-*`, `.joystick-*`, `.btn--emergencia`, `.sensor-camara`, `.barra-progreso`); quedan a propósito utilidades genéricas sin uso (`texto-exito`, `flex-col`, `oculto`, etc.) para el aula;
  - sin `'use strict'` dentro de clases, sin métodos ni opciones sin uso (giroscopio, joystick, sensores, seguimiento) y sin `console.log`/`console.info` de depuración.
- Cuando cambie la lista de archivos de `sw.js` (`RECURSOS_ESTATICOS`), subí `CACHE_NAME`. Para cambios de contenido no hace falta: el service worker pide primero a la red.
- `mostrarModalUsuario` (app.js) escapa el nombre, el email y el rol con `escaparHtml` antes de armar el modal.
- Seguimiento, etapa S2 (6/11):
  - Panel sobre el video (backend, FPS, demora, estado, personas y condiciones del control real); el comando lo muestra el cartel "ENSAYO".
  - Ajustes editables en Config. del dron, guardados en el teléfono (`grupo5dron_seguimiento_ajustes`, rangos en `DronSeguimiento.RANGOS`). Incluyen los de "Mis objetos" con el criterio de RAC (75 % y 8 detecciones; pérdida 3 de 5).
  - "📋 Copiar registro": CSV por cuadro con detección, comando y telemetría; hasta 3000 cuadros.
  - Demo con la cámara del celular en Sensores: misma tubería y panel, en ensayo; apaga la cámara al salir.
  - Capacitor 5.7.8 pide el permiso CAMERA en tiempo de ejecución para el WebView (`BridgeWebChromeClient.onPermissionRequest`).
- Seguimiento, etapa S1 (6/11): `dron-seguimiento.js` es una sola tubería.
  - Visión: COCO-SSD sobre una imagen de 480 px, de 5 a 10 FPS sin superponer, con aviso si TensorFlow no usa WebGL.
  - Selector: fija la persona más grande, con premio por estar centrada; ignora las de menos del 12 % del alto; asocia con la última detección cruda y su velocidad; tolera pérdidas de 1,5 s; después solo retoma cerca de donde estaba durante 5 s.
  - Controlador puro: yaw centra, throttle altura (no actúa si el recuadro está cortado), pitch distancia por la altura del recuadro, nunca roll; zona muerta, límites, aceleración gradual y vencimiento con decaimiento.
  - Bucle a 15 Hz y condiciones para el control real (función pura, se aplica en S3).
  - Pruebas: `tests/seguimiento.test.js` (`node --test`, 25 pruebas, también en CI).
  - "Despegar" queda deshabilitado con "⏳ Esperando telemetría…" hasta el primer paquete.
  - La cancelación por toque de joystick se implementa en S3 con el control real: en ensayo los joysticks siguen funcionando.
- Seguimiento, etapa S0 (6/11): en la cabina "🎯 Ensayo" calcula el comando y lo muestra sobre el video, pero nunca escribe los ejes del rc. Se puede usar en tierra y no interfiere con los joysticks ni con el giroscopio. Auditoría y plan completos del seguimiento: historial, §3, punto 17.

## Próximos pasos (lista única)

1. **Prueba en clase** con `docs/guia-pruebas-en-clase.md` (APK del PR #5: `Grupo5Dron-app-debug` y `Grupo5Aula-app-debug`). Traer los resultados, los informes y diagnósticos copiados.
2. **Corregir lo que salga de la prueba.** En especial: conexión y video del Tello, detección en el A06 (diagnóstico), control real (ganancias), códigos del aire real, si el relé es activo en alto o en bajo (`RELE_ACTIVO_EN_BAJO`), si el ESP32 aguanta con el cargador.
3. **Mergear el PR #5** cuando Luciano lo apruebe y cerrar los PR #3 y #4.
4. **Hosting** (`docs/despliegue-hosting.md`) y probar el APK del aula contra HTTPS.
5. **Firma fija de los APK:** que Luciano cargue el secreto `DEBUG_KEYSTORE_BASE64`.
6. **Imprimir la carcasa** (confirmar medidas con calibre antes) y armarla con el profe.
7. **Informe:** aplicar `docs/correcciones-informe.md` (Luciano habla con el profe lo de las dos apps).
