# Historial del proyecto Grupo 5: Control de Sistemas y Dron

Resumen de cómo se llegó al estado actual y por qué se tomó cada decisión. Sirve para no rehacer discusiones ya cerradas.

## 1. Origen

- El informe del grupo (`docs/contexto/informe-grupo5-dron.pdf`) plantea una app con dos módulos (aula por IR con ESP32, y dron) y exige usar sensores reales del celular.
- El código se generó por etapas con Antigravity (agente de Google) entre el 23/10 y el 5/11/2026, con revisión externa en un chat aparte. La cuota de Antigravity se cortó muchas veces y el chat se perdió dos veces; por eso el contexto se reconstruyó a mano.
- Lección aprendida: los reportes de Antigravity varias veces afirmaron cosas que no eran ciertas (bugs inexistentes, archivos "completos" que no compilaban, verificaciones que eran solo contar líneas). Verificá en el código antes de confiar en un reporte.

## 2. Decisiones de tecnología

| Decisión | Por qué |
|---|---|
| Backend PHP 8 + PDO + MySQL | El grupo trabaja mucho con PHP. Se va a subir a un hosting pago tipo cPanel (proveedor sin definir). |
| Frontend PWA vanilla servida por PHP | PHP no genera apps nativas. Una PWA es lo más cercano con el stack del grupo. |
| APK con Capacitor (no "APK de la página") | Un navegador o un APK que solo envuelve la web no puede mandar UDP, y el Tello solo entiende UDP. Además los sensores y la cámara exigen HTTPS, y una página del hosting HTTPS no puede hablar con el Tello por HTTP local. |
| Sin ESP32 para el dron | El Tello tiene WiFi propio: el celular le habla directo. Un ESP32 puente solo serviría para comandos, no para video ni seguimiento, y agregaría una pieza más que falla. Quedó descartado (se evaluó como plan B). |
| ESP32 del aula consulta al servidor (polling) | El servidor está en internet y el ESP32 detrás del router del colegio (NAT): el servidor no puede iniciar la conexión. |
| Plugin nativo en Java, no Kotlin | La plantilla de Capacitor es Java y el workflow no configuraba Kotlin en Gradle. Con Java compila sin tocar Gradle. Confirmado: el APK compiló el 5/11. |
| Capacitor 5.x, Node 20, JDK 17 | Combinación que compila. Actualizar Capacitor cambia los requisitos de Node y JDK. |
| Sin `android-actions/setup-android` | El runner de GitHub ya trae el SDK. La acción fallaba buscando el paquete `tools`. Se quitó el 5/11 y el build pasó. |
| Compilación en GitHub Actions | La PC de Luciano no tiene Android Studio ni Node. |
| Modelo de visión local en `libs/` | En la red del Tello no hay internet: nada de CDN. Se usó `libs/` porque `vendor/` está en `.gitignore` y no llegaba a GitHub. |
| Solo adaptadores Tello y Simulador | El dron real es un Tello. Los adaptadores genéricos (HTTP, UDP/TCP) se movieron a `posibles-implementaciones/adaptadores-genericos/`. |
| Sesión offline con JWT vencido solo para el dron | En el WiFi del Tello no hay internet para revalidar. Se permite entrar a dron, prueba Tello, sensores y config del dron con el usuario cacheado; aula y admin exigen sesión válida. |
| Interfaz | Español, tema oscuro con azul institucional, sin violetas (pedido del grupo). |
| Modo "Usar el dron sin cuenta" (5/11) | Sin hosting no hay login posible desde el APK (solo HTTPS, y CORS con `https://localhost`). En el WiFi del Tello tampoco hay internet. El dron no necesita servidor, así que se puede usar sin cuenta; aula y admin siguen exigiendo login. |
| Failsafe sin emergencia automática (5/11) | Si se pierde la telemetría: freno (`rc 0 0 0 0`) y `land`. Si el `land` no se confirma, se reintenta una vez y se muestra un aviso fijo. Cortar motores solo haría caer el dron desde la altura que tenga; además, sin enlace el Tello aterriza solo a los ~15 s. Por eso, desde que se dispara el failsafe la app no manda ningún comando automático (ni `rc` ni keep-alive): seguir mandándolos impedía ese aterrizaje automático (detectado antes del primer commit). |
| Freno con `rc 0 0 0 0` (5/11) | `stop` es del SDK 2.0 (Tello EDU). El Tello común usa el SDK 1.3. |
| `rc` pausado durante pasos y misiones (5/11) | Para que el `rc 0 0 0 0` continuo no interrumpa los comandos de movimiento. A confirmar con el dron real. |
| Video agrupado cada ~30 ms en el plugin (5/11) | Un evento por cada datagrama UDP (cientos por segundo, en base64) puede saturar el puente de Capacitor. |

## 3. Línea de tiempo

1. **Plan y Etapa 1 (BD + API PHP).** schema.sql con 9 tablas, JWT, roles admin/docente/usuario, CSRF, rate limiting, token de dispositivo para el ESP32.
2. **Etapa 2 (frontend + aula).** app.js (router, toasts), páginas, íconos, Service Worker resiliente. Se sacaron las credenciales de prueba de la pantalla de login.
3. **Etapa 3 (firmware ESP32).** Compiló con PlatformIO. Luego se corrigieron los pines al cableado real.
4. **Etapa 4 (dron).** Joystick, giroscopio, seguimiento, sensores, configuración de perfiles, cabina. Se corrigieron bugs reales: `BASE_URL` vs `_baseUrl` en api.js, nombres de campos de perfiles (`ip_dron` vs `ip`), `DronSeguimiento` nunca instanciado, fuga de listeners del joystick.
5. **Botones de paso, misiones y Prueba Tello.** Probados solo con el simulador (Chrome headless).
6. **Dron confirmado: DJI Ryze Tello** con protectores de hélice Cynova.
7. **Aula en pausa (4/11).** La sigue un compañero. Respaldo: rama `aula-completo` y tag `respaldo-pre-limpieza` (commit `0fe741e`), ambos en GitHub.
8. **Revisión del ZIP (5/11).** Se encontraron bloqueantes que ningún reporte mencionaba:
   - el bucle `rc` llamaba a `sendUdpPacket`, que no existía en el plugin (el dron no se habría movido con joystick ni giroscopio);
   - api.js no detectaba el APK con `androidScheme=https` y apuntaba la API al propio celular;
   - `verificarSesion` borraba la sesión ante cualquier error de red;
   - el plugin Kotlin no compilaba; `vincularRedWifi` podía quedar colgada; Google Fonts externo.
9. **Lote de correcciones de Antigravity (5/11).** Plugin en Java con `enviarSinRespuesta` e `info`, api.js con `isNativePlatform`, sesión offline con AbortController de 3 s, perfiles cacheados con perfil Tello por defecto, panel de diagnóstico con "Copiar informe", failsafe configurable, `/vendor` → `/libs`, modelo COCO-SSD lite descargado, reorganización en `posibles-implementaciones/`, `scripts/check_refs.py`.
10. **CI (5/11).** Primer build falló en `setup-android`; se quitó ese paso y el APK compiló.
11. **"Revisión antes del vuelo": planificada, pero NO la aplicó Antigravity** (se le cortó la cuota). Incluía el contrato JS-plugin centralizado, el video agrupado cada ~30 ms y el job "verificar" en CI. `ultimo-reporte-antigravity.md` es el reporte del lote anterior (punto 9).
12. **Auditoría con Claude Code (5/11).** Se verificó ejecutando: sintaxis, Playwright con Edge, un mock del plugin y login real contra XAMPP. Problemas que no figuraban en ningún reporte:
    - dron.js: los eventos de los botones de paso y de misiones habían quedado pegados dentro del bucle de `_ejecutarMision`. Ningún botón de paso ni de misión funcionaba.
    - Una constante sin definir en el failsafe tiraba un error cada 500 ms. Después de dispararse, la interfaz quedaba en "En vuelo".
    - El TelloAdapter no validaba respuestas: con el dron apagado decía "Conectado" y "En vuelo".
    - Al apagar el giroscopio quedaban valores RC residuales: el dron seguía moviéndose.
    - Los dos joysticks se pisaban entre sí.
    - Salir de la cabina en vuelo no aterrizaba.
    - Prueba Tello nunca abría las escuchas: siempre mostraba 0 pps y 0 bytes.
    - El video no estaba conectado a la cabina.
    - La altura salía en metros con la etiqueta "cm", y la batería y el RSSI mostraban valores inventados.
    - Los perfiles del servidor nunca se mostraban (`datos` contra `perfiles`).
    - Faltaban unas 40 clases CSS: la cabina no era usable en horizontal y la emergencia no estaba fija.
    - CORS no incluía `https://localhost`.
    - La contraseña real del seed es `password`, no `Admin1234!`.
13. **Fase 1 con Claude Code (5/11).** Bloqueantes de seguridad y de la primera prueba:
    - modo sin cuenta;
    - cabina rehecha (emergencia fija; en horizontal joystick | video | joystick);
    - pasos y misiones arreglados, con el `rc` pausado;
    - freno con `rc 0 0 0 0`;
    - failsafe (con reintento y aviso);
    - ejes RC independientes;
    - validación de respuestas del Tello;
    - aterrizaje al salir de la cabina;
    - Prueba Tello con escuchas;
    - decodificador de video rehecho y conectado;
    - plugin 2.1.0 (video agrupado, un solo callback de red);
    - contrato centralizado en `DronNativo`;
    - job "verificar" en CI.

    Quedó probado en navegador y con el mock. Falta la prueba con el dron.
14. **Fase 2 con Claude Code (5/11).** Funciones:
    - contrato de perfiles con la API corregido, con perfiles locales fijos (Tello y Simulador);
    - permisos iguales a los de la API (crear y editar: admin y docente; eliminar: admin);
    - `api.js` con timeout de 10 s; un 401 = sesión vencida (en el aula, login; en el dron, modo sin cuenta);
    - cambio obligatorio de la contraseña temporal del seed (endpoint `cambiar_mi_password`);
    - plantilla de comandos fuera del formulario;
    - CORS con `https://localhost` en el ejemplo y contraseña del seed bien documentada.
15. **Fase 3 con Claude Code (5/11).** Interfaz:
    - inicio con las dos opciones del informe también en modo sin cuenta;
    - clases CSS que faltaban y `[hidden]` global;
    - contraste ≥ 4,5:1;
    - header con botones de 44 px y badge compacto;
    - modal de perfiles con el componente común;
    - Prueba Tello y formularios con controles de 44 px;
    - giroscopio en vivo en Sensores;
    - Acerca con datos técnicos reales (pines GPIO25/19/4, sin "MVC" ni "drones HTTP") y sin los roles inventados de los integrantes.
16. **Fase 4 con Claude Code (5/11).** Limpieza:
    - service worker con "primero la red" (no más estilos viejos estando online), sin service worker en el APK, y plantillas sin `?v=Date.now()`;
    - avisos (toasts) con texto plano;
    - borrado el CSS y el JS sin uso de la cabina vieja y de los módulos del dron;
    - sin logs de depuración.
17. **Auditoría del seguimiento (6/11).**
    - Medido: COCO-SSD empaquetado = SSDLite MobileNetV2 (4,5 M parámetros, 18 MB float32), TensorFlow.js 4.17.0, coco-ssd 2.2.3.
    - En la PC con WebGL: ~20 ms por inferencia; con CPU: ~1,5 s (inutilizable). En el celular hay que medirlo.
    - Problemas encontrados:
      - saltaba entre personas (tomaba la primera de cada cuadro);
      - centraba con roll en vez de yaw;
      - no tenía control de distancia, zona muerta, aceleración gradual ni vencimiento de comandos;
      - se podía activar en tierra;
      - si no cargaba el modelo, el modo "color" mandaba comandos;
      - sin aviso de WebGL o CPU.
    - Plan aprobado: S0 a S2 antes de la primera prueba con el Tello; S3 (control real) y S4 ("Mis objetos") después.
    - Criterio de "Mis objetos" tomado de RAC: confirmar con umbral del 75 % y 8 detecciones consecutivas; dar por perdido con una ventana más corta (3 de 5). Los dos valores, editables.
    - S0 aplicado: el seguimiento queda solo en ensayo.
18. **Seguimiento S1 (6/11).** Tubería nueva, todavía solo en ensayo. Las pruebas encontraron y corrigieron dos errores de diseño:
    - en un cruce de dos personas del mismo tamaño se pasaba a la otra, porque predecía con la posición suavizada (atrasada); ahora predice con la detección cruda y su velocidad;
    - con la foto de prueba, el criterio "la más centrada" fijaba a una persona lejana diminuta (3 % del alto), que en control real haría avanzar a fondo; ahora fija la más grande y exige al menos el 12 % del alto.
    - Medido en la PC: la inferencia tarda lo mismo con cualquier ancho (17 a 19 ms con WebGL), y 320 px pierde personas lejanas chicas. Se eligió 480 px por defecto (en el celular hay que medirlo).
    - "Despegar" ahora se muestra deshabilitado ("Esperando telemetría…") hasta el primer paquete, en vez de rechazar el toque.
19. **Seguimiento S2 (6/11).**
    - Panel en el video, ajustes editables (24, con validación), "Copiar registro" en CSV y demo con la cámara del celular en Sensores.
    - Probado con una cámara falsa de Edge que transmite una foto real con personas: detecta con WebGL a ~10 FPS y fija a una persona.
    - Pendiente de la prueba real: con una persona parada, la altura tiende a bajar hacia su centro (la cintura); ajustar en S3 con el dron.
20. **Firma fija del APK debug (6/11).**
    - El workflow instala el keystore del secreto `DEBUG_KEYSTORE_BASE64` en la ubicación por defecto de Gradle y verifica la firma con `apksigner`; sin secreto, usa la clave por defecto.
    - Probado en local con un keystore generado con el mismo comando que usa Luciano: sin secreto, secreto inválido, secreto válido, y la huella de `keytool` coincide con el SHA-256 que imprime `apksigner`.
    - Decisión: alias `androiddebugkey` y contraseña `android` (los que Gradle usa para debug), así no hay que tocar la configuración de Gradle. La protección es que el archivo es privado.
21. **Modelo de seguimiento roto en el APK (6/11).**
    - Síntoma en el celular: "byte length of Float32Array should be a multiple of 4"; en la PC andaba.
    - Causa: los shards del modelo no tenían extensión (`group1-shard1of5`) y Capacitor 5.7.8 responde index.html (6 KB) a toda ruta sin "." (html5mode, activado por defecto). Desactivar html5mode no sirve: Capacitor deja de servir esos archivos.
    - No eran los finales de línea: git ya los trataba como binarios y los tamaños coincidían con `model.json` (18.034.528 bytes).
    - Arreglo: shards renombrados a `.bin` y `paths` de `model.json`.
    - Se agregaron: un paso de CI que lista el modelo en el repo, en www, en los assets y en el APK; "Verificar modelo" en Prueba Tello; y un `.gitattributes` preventivo.
    - Verificado en el navegador emulando la regla de Capacitor: reproduce el mismo error con los nombres viejos y carga bien con los nuevos.
22. **Sin emojis (6/11).** Íconos SVG propios en `app.css` (sin librerías), puntos de estado en CSS, EMERGENCIA roja en mayúsculas. Queda solo 🧭 del giroscopio. En el aula se cambiaron solo textos e íconos.
23. **Páginas .html → .php (6/11).** Pedido de Luciano: que no haya archivos .html en el proyecto.
    - Las diez vistas de `pages/` pasaron a `.php` con el mismo contenido; `app.js` las pide como `/pages/x.php`; `sw.js` v8.
    - En el APK no hay PHP: `build-apk.js` copia las páginas con el mismo nombre y les quita cualquier bloque PHP; si quedara alguno, el build falla.
    - Capacitor 5.7.8 sirve los archivos con extensión desde los assets (no cae en index.html). El content-type de `.php` lo decide Android (`URLConnection.guessContentTypeFromName`); a `fetch().text()` no le importa. `cargarPlantilla` además rechaza una respuesta que sea una página completa.
    - Verificado emulando a Capacitor (www/ generado, rutas sin "." → index.html) con tres content-types distintos para `.php`.
24. **Primera prueba del APK en un celular (6/11): Samsung Galaxy A06, Android 16, sin el dron.** Plugin 2.1.0 activo, WebCodecs H.264 960x720, modelo OK, TensorFlow en WebGL. Tres problemas y sus arreglos:
    - Detección: casi nunca veía personas (~5 FPS, ~190 ms). COCO-SSD reduce todo a 300×300 sin respetar la proporción: la cámara vertical (9:16) le llegaba aplastada. Ahora se completa a un cuadrado con bordes (de 1:1 a 4:3 se usa tal cual: el Tello no cambia). En la PC sube la confianza (81 → 95 %) pero también detectaba estirada, y con texturas de 16 bits forzadas también detecta: la causa en el A06 hay que confirmarla con la miniatura "lo que ve el modelo" (modo técnico) y el brillo del cuadro. El ancho de análisis (300/320/480) y el modelo en float16 no cambian los FPS en la PC; float16 da las mismas detecciones con la mitad de tamaño (18 → 9 MB), pero no se aplicó porque no mejora los FPS.
    - Interfaz minimalista con el estilo de racvision.org (proyecto RAC del grupo) y nuestros colores. Lo de diagnóstico pasó a un "Modo técnico" (Config. Dron, arranca apagado). "Mis objetos" se oculta hasta S4. Sensores ya no muestra GPS, vibración, red ni pantalla.
    - El A06 no tiene giroscopio ni magnetómetro: deviceorientation llega vacío. La inclinación ahora sale del acelerómetro (accelerationIncludingGravity, filtrada) si en 0,7 s no hay orientación; sin giro vertical. Con giroscopio todo sigue igual.
25. **Inclinación según la pantalla y modelo en float16 (6/11).** Decisiones de Luciano.
    - Antes, en horizontal la inclinación quedaba rotada 90° (usaba los ejes del teléfono). Ahora es respecto de la pantalla en vertical y en las dos horizontales; en vertical natural no cambia nada. Si la pantalla gira con la inclinación activada, se apaga con los ejes en cero y hay que volver a activarla (recalibra).
    - El acelerómetro usa ahora la inversa exacta de la convención de deviceorientation, así coincide con el giroscopio también en inclinaciones grandes.
    - Modelo en float16 con `scripts/modelo_float16.py`: 18 → 9 MB, 3 shards `.bin`. En la PC, mismas detecciones y puntajes que float32 salvo diferencias de milésimas (dos personas en el límite de 0,50 en una foto).
26. **Sentido del avance por inclinación invertido (6/11).** Decisión de Luciano: inclinar el celular hacia adelante (el borde de arriba de la pantalla hacia abajo) avanza, como empujar un joystick. Antes avanzaba al levantar el borde de arriba hacia uno. "Invertir avance" en el modo técnico vuelve al sentido anterior. Probado con el simulador y el plugin falso en 0°, 90° y 270°, con giroscopio y acelerómetro, en los dos sentidos.
27. **Sin login de entrada y sin "Acerca de" (6/11).** Decisión de Luciano: el login sobraba para el dron.
    - La app abre en el inicio; el dron se usa sin cuenta sin tocar ningún botón (se sacó "Usar el dron sin cuenta" y su flag). Aula y administración piden iniciar sesión al entrar y después vuelven a la pantalla pedida, también pasando por el cambio de contraseña obligatorio. El backend no cambió: aula y admin siguen exigiendo sesión válida.
    - Sesión vencida: en el inicio y en el dron se sigue sin cuenta; en el aula y la administración pide login y vuelve.
    - Se borró la página Acerca (y su ícono y estilos). `#/acerca` va al inicio.

## 4. Hardware

### Dron
- DJI Ryze Tello. Batería ~13 min. Para pruebas: protectores puestos, espacio abierto, sin flips.
- Se prueba con un celular Android (iPhone no sirve para este camino).

### Aula (en pausa, referencia para no romperla)
- ESP32 DevKit en protoboard. Cableado real: relé GPIO25, emisor IR KY-005 GPIO19, receptor IR KY-022 GPIO4 (a 3V3), LED integrado GPIO2 como indicador. Un solo relé.
- El informe original ponía el LED IR en GPIO35: error, ese pin es solo de entrada.
- Para más alcance IR: transistor 2N2222/BC337 y LEDs de 940 nm de haz angosto (por ejemplo TSAL6100). El alcance real depende mucho del receptor del equipo; conviene acercar el emisor.
- Fuente Hi-Link HLK-5M05 (220 V a 5 V 1 A): no va en protoboard; necesita fusible, caja aislante y supervisión docente. Para pruebas, USB.
- El control mini IR de 17 teclas (NEC) sirve para probar el receptor.

## 5. Riesgos abiertos (se resuelven con la prueba real)

- `vincularRedWifi`: si Android acepta el WiFi del Tello sin internet. Si falla, alternativa: desactivar datos móviles y "mantener conexión" a mano.
- Video: si el WebView soporta WebCodecs/H.264 y si el puente de Capacitor aguanta el flujo (el plugin agrupa los paquetes cada ~30 ms). El decodificador se probó en Edge con H.264 real cortado en paquetes de 1460 bytes, pero no con el stream del Tello.
- Si el `rc` continuo interrumpe los pasos (por eso se pausa) y la unidad real de `vgx`/`vgy` en la telemetría.
- Firma del APK: cada build de CI usa otra clave debug, así que para actualizar hay que desinstalar la versión anterior.
- Seguimiento: rendimiento de COCO-SSD en el celular sobre el video del Tello. Hay modo por color de respaldo. Sigue marcado EXPERIMENTAL.
- Failsafe: comportamiento real al perder telemetría en vuelo.
- Firmware del aula: el certificado raíz configurado (ISRG Root X1) solo sirve si el hosting usa Let's Encrypt, y el ESP32 necesita hora por NTP para validar HTTPS.

## 6. Pendientes

La lista única y actualizada está en `CLAUDE.md`, sección "Próximos pasos". No dupliques pendientes acá.
