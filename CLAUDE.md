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
- NO modifiques la lógica del aula: `backend/public/js/aula.js`, `backend/public/js/admin.js`, `backend/public/pages/aula.php`, `backend/public/pages/admin.php`, `backend/api/comandos.php`, `dispositivos.php`, `botones.php`, `esp32.php`, ni `posibles-implementaciones/aula-esp32/`.
- El código compartido (`app.js`, `api.js`, `auth.js`, `index.php`, `sw.js`, `app.css`, `login.php`, backend de auth/usuarios/config/perfiles) se puede tocar, pero sin romper el aula. Avisale a Luciano ANTES de cambiar algo compartido.

## Arquitectura

```
Celular (APK Capacitor 5, frontend local en https://localhost)
 ├─ con internet ──HTTPS + JWT──> Hosting PHP 8 + MySQL (login, perfiles, config)
 └─ WiFi del Tello (sin internet) ──UDP──> DJI Ryze Tello 192.168.10.1
```

- Frontend: PWA en HTML/CSS/JS vanilla, en `backend/public/`, router por hash (`#/inicio`, `#/dron`, `#/prueba-tello`, `#/sensores`, `#/config-dron`, `#/aula`, `#/admin`, `#/acerca`, `#/login`).
- El APK empaqueta ese frontend: `scripts/build-apk.js` genera `capacitor/www/` (generado, ignorado por git) con un `index.html` estático a partir de `index.php` y copia las páginas (`pages/*.php`) con el mismo nombre, quitándoles cualquier bloque `<?php ... ?>`.
- Plugin nativo propio `DronNative` en Java (`capacitor/android_plugin/DronNativePlugin.java`) para UDP y para forzar el uso del WiFi del Tello aunque no tenga internet. El navegador solo no puede mandar UDP: por eso existe el APK.
- NO hay ESP32 en el dron. El celular habla directo con el Tello.
- El módulo del dron funciona SIN internet y SIN cuenta:
  - En el login, el botón "Usar el dron sin cuenta" activa el flag `grupo5dron_modo_invitado` en localStorage.
  - Con ese flag se puede entrar al inicio (con las dos opciones: Dron entra directo, Aula lleva al login), dron, prueba Tello, sensores, config. del dron y acerca. Aula y admin mandan al login.
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
    pages/*.php             vistas parciales (fragmentos HTML; no dependen de PHP)
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
- Pruebas automáticas: `node --test tests/seguimiento.test.js` (selector y controlador del seguimiento con recorridos sintéticos).
- Pruebas en navegador: Playwright con Microsoft Edge del sistema (`chromium.launch({ channel: 'msedge' })`). Para el TelloAdapter sin dron, se puede inyectar un mock de `window.Capacitor.Plugins.DronNative` que respete el contrato de arriba.
- APK: se compila en GitHub Actions en cada push a `main`. Artefacto: `Grupo5Dron-app-debug`.
- Firma del APK debug:
  - Si existe el secreto `DEBUG_KEYSTORE_BASE64`, el paso 10b lo instala como `~/.android/debug.keystore` (alias `androiddebugkey`, contraseña `android`) y el paso 11b verifica con `apksigner` que el APK quedó firmado con esa clave.
  - Sin el secreto, o si no es válido, se usa la clave por defecto (cambia en cada build) y el build no falla.
  - El keystore nunca va al repo (`.gitignore`: `*.keystore`, `*.jks`, `*.keystore.b64`).
- NO agregues `android-actions/setup-android` al workflow: el SDK ya viene en el runner y esa acción rompió el build.
- Mantené Capacitor 5.x con Node 20 y JDK 17. No actualices Capacitor sin que Luciano lo pida.

## Reglas de trabajo

- Leé el código antes de editarlo y buscá con grep todos los usos de lo que cambiás.
- Cambios puntuales. Respetá los nombres existentes de funciones, IDs, endpoints y tablas.
- Archivos con finales de línea CRLF: si una edición falla, revisá eso.
- Nada de recursos externos (CDN, Google Fonts): el APK tiene que andar sin internet.
- Todo archivo que use la app tiene que tener extensión. En el APK, Capacitor responde index.html a cualquier ruta sin "." (html5mode). Por eso los shards del modelo son `group1-shardNofM.bin`. Si se cambia el modelo, renombrar los shards y sus `paths` en `model.json`.
- Las páginas son .php pero no pueden depender de PHP para funcionar en el APK. No hay archivos `.html` en el proyecto (`check_refs.py` falla si aparece uno en `pages/` y avisa si una página trae código PHP). `build-apk.js` quita todo bloque `<?php ... ?>` / `<?= ... ?>` al generar `www/` y falla si queda alguno. Capacitor sirve `/pages/x.php` como archivo porque tiene extensión; `cargarPlantilla` (app.js) no depende del content-type y avisa si en lugar de la vista llega una página completa.
- `.gitattributes` marca como binarios `backend/public/libs/**`, imágenes, `.bin` y keystores (la PC tiene `core.autocrlf=true`).
- Sin credenciales reales en el repo. `config.php` y `config.h` están en `.gitignore`.
- Seguridad de vuelo. No debilites:
  - el botón de emergencia fijo y siempre visible;
  - la confirmación antes de despegar y el bloqueo del despegue sin telemetría;
  - el failsafe por pérdida de telemetría: freno + `land`, un reintento y aviso fijo. Desde que se dispara, NO sale ningún comando automático (ni `rc` ni keep-alive) para que el Tello pueda aterrizar solo a los ~15 s. Si vuelve la telemetría, reintenta `land`. Decisión de Luciano: NO cortar motores automáticamente;
  - que giroscopio, seguimiento y misiones arranquen desactivados y que al apagarlos sus ejes vuelvan a cero;
  - el seguimiento está SOLO EN ENSAYO (calcula y muestra, no envía) hasta la etapa S3, después de la primera prueba con el Tello;
  - el aterrizaje al salir de la cabina en vuelo.
- Interfaz en español, tema oscuro con azul institucional, sin violetas.
- Sin emojis en la interfaz (el único que queda es 🧭 del giroscopio). Íconos: SVG propios en `app.css` (bloque "ÍCONOS PROPIOS", clases `.ico .ico--nombre`, color `currentColor`), desde JS con `App.icono(nombre)`, `App.textoConIcono(el, nombre, texto)` y `App.textoConPunto(el, color, texto)` para estados. Íconos decorativos con `aria-hidden` y siempre con texto visible o `aria-label`.
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
- Observación para el compañero del aula (no se tocó): en `app.css`, `.dispositivo__botones` tiene padding con `max-height: 0`, así que las tarjetas de dispositivos cerradas muestran una franja de los botones.

## Próximos pasos (lista única)

1. **Primera prueba real con el Tello.** Commit, APK de CI e instalación. Con el secreto de firma cargado, los APK nuevos se instalan encima. La primera vez con la clave fija hay que desinstalar la versión anterior. Después: "Usar el dron sin cuenta", `#/prueba-tello` (command, battery?, streamon), "Copiar informe" y pegarlo. Luego la cabina: despegar, aterrizar, paso, freno, giroscopio, failsafe, emergencia.
2. **Corregir lo que salga de esa prueba.** Lo más probable: red sin internet (`vincularRedWifi`), video en el WebView, si el `rc` interfiere con los pasos y la unidad de `vgx`/`vgy`.
3. ~~Fase 2, funciones~~: hecha (ver "Estado").
4. ~~Fase 3, interfaz~~: hecha (ver "Estado").
5. ~~Fase 4, limpieza~~: hecha (ver "Estado").
6. **Seguimiento v2** (una sola tubería: candidatos → selector de objetivo → suavizado → controlador; ensayo y control real comparten todo):
   - ~~S1~~: hecha (ver "Estado"). Pasan a S3: cancelar el seguimiento real con cualquier toque de joystick y aplicar las condiciones de activación.
   - ~~S2~~: hecha (ver "Estado").
   - ~~Firma fija del APK debug~~: hecha en el workflow. Falta que Luciano genere la clave y cargue el secreto `DEBUG_KEYSTORE_BASE64`.
   - S3 (después de la primera prueba con el Tello): habilitar el control real (con cancelación por toque de joystick y las condiciones de activación) y ajustar ganancias con el dron.
   - S4 (después de la primera prueba): "Mis objetos" (MobileNet local para embeddings, IndexedDB, selector por objeto guardado y por toque con rastreador).
7. **Hosting:** subir el backend, importar `schema.sql` y crear `config.php` (con `https://localhost` en CORS). Cada cuenta del seed pide cambiar `password` en su primer login.
8. **Al final:** documentación (README, manual de usuario, manual del programador, API, plan de pruebas, limitaciones) y corrección del informe (por ejemplo, el LED IR figura en GPIO35, que es solo de entrada).
