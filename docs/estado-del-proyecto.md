# Estado del proyecto al 17/11/2026

Revisión de todo el repo (código, CI, firmware, carcasa y documentación) contra lo que tiene que hacer el proyecto completo. Hecha sobre la rama `mejoras-entrega`, que sale de `prueba-en-clase` con `interfaz-bootstrap` adentro.

## Cómo leer la tabla

- **Hecho y verificado:** anda, y dice cómo se comprobó en esta revisión.
- **Hecho sin verificar:** el código está, pero falta probarlo con el celular, el dron o el circuito.
- **A medias o con errores:** falta una parte o hay algo que anda mal.
- **Falta:** no existe.
- **Sobra:** está en el sistema y no lo pide nada, o está repetido (lista al final).

Lo que se comprobó en esta revisión, en una PC, sin celular, sin dron y sin circuito:

- 107 pruebas automáticas (`node --test`), `check_refs.py`, `check_js.py`, `node --check` y `php -l`: todo bien.
- Navegador (Edge) a 360, 412 y 740 px: las dos apps y la portada, sin errores de consola y sin scroll horizontal.
- La web del dron en la raíz y en una subcarpeta (`/dron/`), con su service worker (40 archivos guardados).
- La cabina con el Simulador (conecta, despega, queda "En vuelo", seguir persona, lista de objetos).
- La cabina con el plugin nativo simulado: usa el perfil DJI Tello y manda `command` y `streamon`.
- El aula con PHP 8.2 y MariaDB locales: ingreso, cambio de contraseña obligatorio, pantalla del aula y administración.
- `build-apk.js` arma las dos carpetas `www/` y `armar-paquete-servidor.py` arma el ZIP (82 archivos, 9 MB, sin secretos).

No se pudo comprobar acá: las corridas del CI (los dos APK y el firmware), porque la cuenta de esta PC no puede subir al repo.

## Ramas y pull requests

| Rama o PR | Estado |
|---|---|
| `main` | Tiene los PR #1 y #2 (mergeados). Último cambio: 6/11. |
| `prueba-en-clase` (PR #5, abierto, "NO MERGEAR") | 11 commits más que `main`. Contiene los PR #3 y #4. |
| PR #3 (Etapa A) y PR #4 (carcasa) | Borradores sin mergear, pero su contenido ya está dentro de `prueba-en-clase`. |
| `interfaz-bootstrap` (PR #6, abierto) | 6 commits más que `prueba-en-clase`. **No estaba adentro de `prueba-en-clase`.** |
| `mejoras-entrega` (esta rama) | Sale de `prueba-en-clase` + `interfaz-bootstrap`. Falta subirla y abrir su PR. |

En esta PC `prueba-en-clase` ya se adelantó hasta `interfaz-bootstrap` (avance directo, sin conflictos). Falta subirlo a GitHub: hace falta entrar con la cuenta Campa002.

## A. Módulo dron

| Punto | Estado | Detalle |
|---|---|---|
| A1 Conexión y estado | A medias | Conecta por los tres puertos y muestra conectado, en vuelo, batería y altura. **Falta la señal WiFi**: no se le pregunta al Tello. Si el dron se apaga estando en tierra, sigue diciendo "Conectado" (ver "Para consultar"). |
| A2 Mando | Hecho sin verificar | Despegar, aterrizar, EMERGENCIA fija y botones de mantener apretado con Lenta, Normal y Rápida. Verificado con 12 pruebas y con el Simulador. Falta probar la versión actual con el dron (la última prueba real fue el 6/11). |
| A3 Inclinación | Hecho sin verificar | Giroscopio o acelerómetro y zona muerta de 3°. Se prende con el botón "Inclinación": la posición del celular en ese momento es "quieto" (ya no hay botón Calibrar). Si gira la pantalla se apaga. Verificado con 18 pruebas con sensores simulados. Falta probar el sentido en el Galaxy A06. |
| A4 Video en vivo | Hecho sin verificar | El plugin recibe el video y la app lo decodifica. No tiene prueba automática. Falta el dron. |
| A5 Seguimiento estilo RAC | Hecho sin verificar | Cara con BlazeFace y cuerpo de respaldo, objetos de COCO-SSD en español, objetos propios con fotos, etiqueta con nombre y porcentaje, estado, confianza e historial, reglas 75 % / 8 / 3 de 5. En el piso solo marca el objetivo; en vuelo lo sigue despacio si se toca Seguir en el aire y se cumplen las condiciones (perdido, queda quieto). Verificado con 108 pruebas automáticas (son de toda la app). Falta el celular (detección en el A06) y el dron. |
| A6 Seguridad de vuelo | A medias | Failsafe, confirmación de despegue y freno están. Hay cinco casos donde la seguridad queda floja (ver "Para consultar"). No se tocaron. |
| A7 Sin login | Hecho y verificado | La app del dron no tiene ingreso ni llama al servidor (revisado en el código y en el navegador: ningún pedido a `/api`). |

## B. Módulo aula

| Punto | Estado | Detalle |
|---|---|---|
| Circuito (relé 26, IR 18, receptor 15, USB-C, consulta por HTTPS) | Hecho sin verificar | Los pines coinciden con el circuito soldado. El firmware consulta cada 2 s. Por defecto **no valida el certificado HTTPS** y el certificado de ejemplo está roto. Falta probar con el ESP32. |
| B1 Solo luces, proyector y aire | Hecho y verificado | La base, la API y la pantalla tienen solo esas tres cosas. Verificado en el navegador. |
| B2 Aprender códigos | Hecho sin verificar | El recorrido completo está, con códigos largos de aire. Falta probarlo con el ESP32 y los controles reales. |
| B3 Usuarios y roles | A medias | Ingreso, tres roles y cambio obligatorio para las cuentas iniciales: verificado. Pero los usuarios que crea el admin **no** quedan obligados a cambiar la contraseña, y el historial y el estado se pueden leer con cualquier rol llamando a la API. En Administración no hay sección "equipo". |
| B4 Estado del equipo e historial | A medias | Están. Con XAMPP el equipo puede figurar siempre "sin conexión" por la zona horaria (ver "Para consultar"). El historial no muestra quién dio la orden. |
| B5 Carcasa 3D | Hecho sin verificar | Triangular, con rótulas, separación de 220 V y entrada USB-C. Está en el repo con los STL. Falta imprimirla y medirla. |

## C. Plataformas

| Punto | Estado | Detalle |
|---|---|---|
| Web del aula | Hecho y verificado | Completa contra la API (probada en local). |
| APK del aula | Hecho sin verificar | `SERVIDOR_AULA` apunta al servidor, que ya responde por HTTPS y acepta al APK (CORS probado). Falta compilarlo en el CI y probarlo en el celular. |
| Web del dron con Simulador | Hecho y verificado | **Arreglado en esta rama:** antes quedaba con el perfil Tello y un error. Ahora arranca sola con el Simulador y avisa que es la versión web. |
| APK del dron con el Tello | Hecho sin verificar | Compila en el CI. Falta probar la versión actual con el dron. |
| Portada con accesos y descargas | Hecho y verificado | **Nueva en esta rama.** Falta subir los APK al servidor: hoy solo existen 14 días como archivos del CI. |

## D. Requisitos técnicos y de estilo

| Punto | Estado | Detalle |
|---|---|---|
| PHP 8 + PDO + MySQL | Hecho y verificado | Todas las consultas con datos de afuera van preparadas. |
| PWA vanilla con páginas .php | Hecho y verificado | `check_refs.py` pasa. La web del aula no tiene service worker. |
| APK con Capacitor 5, Node 20, JDK 17 en GitHub Actions | Hecho sin verificar | Los cuatro trabajos del CI existen. **Arreglado:** el CI no corría en los PR hacia `prueba-en-clase`. |
| Clave de debug fija | A medias | Solo es fija si está cargado el secreto `DEBUG_KEYSTORE_BASE64` (pendiente). |
| Firmware con PlatformIO | Hecho sin verificar | Lo compila el CI. |
| Interfaz en español, oscura, azul, sin violetas ni emojis | Hecho y verificado | **Arreglado:** quedaba "Inclinación: ON / OFF" en inglés. Los avisos emergentes todavía traen la sombra de Bootstrap. |
| Bootstrap local, sin CDN | Hecho y verificado | Ninguna dirección externa en las dos apps. |
| Modo técnico con 5 toques | Hecho y verificado | Probado en el navegador. |
| Sin secretos en el repo | Hecho y verificado | Revisado el historial de todas las ramas: solo valores de ejemplo. |
| HTTPS | A medias | **Arreglado en parte:** la portada ahora fuerza HTTPS y las carpetas internas quedan cerradas. El firmware sigue sin validar el certificado. |
| JWT | Hecho y verificado | Firma y vencimiento correctos. No impide arrancar con la clave de ejemplo. |
| CSRF | A medias | El código existe pero no se usa. Hoy no hay riesgo real porque la sesión no va en cookies. |
| Límite de intentos de ingreso | A medias | Es por cuenta, no por dirección. Tiene un error después de los 15 minutos (ver "Para consultar"). |
| Token del ESP32 | Hecho y verificado | Se compara en tiempo constante. |

## E. Entregables

| Punto | Estado | Detalle |
|---|---|---|
| Dos webs y dos APK en el servidor | A medias | Las dos webs y la API están en el servidor donde está RAC, con Docker y HTTPS: `https://grupo5.40-160-138-65.sslip.io/` (también por la IP, http://40.160.138.65:8086/, sin candado). Probado desde afuera en el navegador. Faltan los dos APK: salen del CI. |
| Firmware y carcasa | Hecho sin verificar | En el repo. |
| README | A medias | No nombra Bootstrap, el modo técnico ni la portada. |
| Manuales de usuario (dron y aula) | Hecho | Falta explicar la web del dron con el Simulador. |
| Manual del programador | A medias | No nombra Bootstrap ni `SERVIDOR_AULA`. |
| Documentación de la API | Hecho | Las acciones coinciden con el código. |
| Plan de pruebas con resultados reales | **Falta** | La columna "Resultado" está vacía en todas las filas. |
| Limitaciones y mejoras | Hecho | Le faltan: sin hosting, firma pendiente. |
| Correcciones del informe | Hecho | Falta aplicarlas al informe. |
| Guía de despliegue | Hecho | **Rehecha en esta rama**, paso a paso. |

## Para consultar: errores que no se tocaron

Son de vuelo o de la lógica del aula. Están comprobados leyendo el código, no en vuelo ni con el circuito.

**Vuelo**

1. EMERGENCIA no responde mientras el dron aterriza al salir de la cabina (hasta 20 s).
2. Las preguntas de confirmación (despegar y salir de la cabina en vuelo) tapan EMERGENCIA y frenan los envíos mientras están abiertas.
3. Con la inclinación activa, si la app pasa a segundo plano los ejes no vuelven a cero.
4. Después de un failsafe con el WiFi caído, la cabina queda trabada sin botón Reconectar.
5. Si el dron se apaga en tierra, sigue diciendo "Conectado (en tierra)".
6. Falta mostrar la señal WiFi: hay que agregar una pregunta periódica al Tello (`wifi?`).
7. Si se toca "Seguir persona" en vuelo por primera vez, la carga del modelo puede trabar la app unos segundos y disparar el aterrizaje de seguridad. Visto en esta revisión con el Simulador en una PC sin placa de video (16 s trabada). Falta medirlo en el celular. Posible arreglo: cargar el modelo al entrar a la cabina.

**Aula**

1. Con XAMPP el equipo figura "sin conexión" aunque esté andando: la API no fija la zona horaria y PHP y MySQL quedan con horas distintas.
2. Las órdenes viejas no vencen: si el ESP32 estaba apagado, al prenderse ejecuta todo lo pendiente (por ejemplo, prende las luces una hora después).
3. Un usuario creado por el admin no queda obligado a cambiar la contraseña.
4. El primer ingreso después de los 15 minutos de bloqueo se rechaza aunque la contraseña esté bien.
5. Historial, pendientes, configuración y estado se pueden leer con cualquier rol llamando a la API.
6. "Desactivar" sobre un usuario ya inactivo dice "Usuario no encontrado", y no hay forma de reactivarlo.

## Sobra

- **En la app del dron:** "Por pasos" y "Automático" (misiones) ya se sacaron de la cabina (guardados en `posibles-implementaciones/pasos-y-misiones/`). Quedan los joysticks, 29 ajustes del seguimiento y las pantallas técnicas de sensores y seguimiento con la cámara. Nada de eso está en la lista, pero se usa para probar.
- **En el servidor:** `dron-perfiles.php` y la tabla `perfiles_dron` (sin uso), el código de CSRF que nadie llama y cuatro acciones de la API que la app no usa.
- **Archivos viejos:** `docs/contexto/ultimo-reporte-antigravity.md`, `capacitor/README.md` (describe otro proyecto), `posibles-implementaciones/herramientas/` (roto), `posibles-implementaciones/adaptadores-genericos/` (nadie lo carga), `scripts/check_js.py` (repite lo que hace `node --check`).
- **Carcasa:** la versión anterior con fuente HLK (1,6 MB). Se guardó a propósito como mejora futura.
- **Mal ubicado:** el firmware y la carcasa están en `posibles-implementaciones/` y son parte real del proyecto.
- **Repetido en el código:** tres funciones para escapar HTML, dos para copiar al portapapeles y el bloque técnico del seguimiento escrito dos veces.

## Lo que pide el informe y no está en la lista

- Una sola app con una pantalla para elegir Aula o Dron. Hoy son dos apps; en la web lo cubre la portada.
- Ventiladores y "otros equipos". Hoy hay solo luces, proyector y aire.
- LED infrarrojo en GPIO 35 y receptor TSOP1838. Lo real es GPIO 18 con BC337 y KY-022.

Todo eso ya está anotado en `docs/correcciones-informe.md`.
