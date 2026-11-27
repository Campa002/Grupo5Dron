# Manual de usuario: app del dron

App "Grupo 5 — Dron" para el DJI Ryze Tello. No necesita internet ni cuenta.

## Antes de volar

- Protectores de hélices puestos, batería cargada, 3 × 3 m libres de personas.
- Una persona con el dedo listo en **EMERGENCIA**.
- Prendé el Tello y conectá el celular a su WiFi (`TELLO-…`). Los datos móviles pueden quedar prendidos: la app usa igual el WiFi del Tello.
- Si la app no encuentra el dron, dice "No se encuentra el dron. Prendelo y conectá el celular a su WiFi (TELLO-…)." El detalle técnico (por ejemplo, respuesta: "timeout") se ve solo en el modo técnico.

## Inicio

**Entrar a la cabina** es la opción principal. El menú (arriba a la izquierda) tiene Inicio y Cabina.

## Modo técnico (pruebas y diagnóstico)

Lo que sirve para probar y buscar problemas está escondido en el **modo técnico**: Prueba Tello, Sensores, el seguimiento con la cámara del celular, Configuración, el perfil Simulador, Diagnosticar, los datos de los comandos (rc) y los FPS en pantalla, los registros para copiar, los joysticks y los ajustes avanzados.

- **Para prenderlo:** tocá **5 veces seguidas** el título de la app ("GRUPO 5 · DRON" arriba, o "CABINA · …" dentro de la cabina). Aparece "Modo técnico activado".
- **Para apagarlo:** lo mismo, 5 toques seguidos ("Modo técnico apagado"). Si estabas en una pantalla de prueba, vuelve al inicio; con el modo apagado, la cabina usa siempre el DJI Tello.
- Queda guardado en el celular hasta que lo apagues. Apagado, el usuario no ve nada de esto (lo de seguridad, como el aterrizaje automático, funciona igual).

## Prueba Tello (modo técnico)

Inicio o menú → **Prueba Tello** → **Probar conexión**. Revisa cinco cosas (conexión, respuesta, batería, datos y video) y dice "Listo para volar" o qué falta. **Copiar informe** copia el resultado para mandarlo si algo falla.

## Cabina

Se usa con el celular parado o acostado. Es igual en el APK y en la web (en la web usa el Simulador, no el dron).

- **EMERGENCIA** (rojo, siempre visible): apaga los motores en el acto; el dron cae. Con el celular parado está abajo; acostado, arriba a la derecha.
- **Sobre el video:** estado de la conexión, batería y altura (los FPS, solo en el modo técnico).
- **Velocidad:** Lenta, Normal o Rápida (siempre arranca en Lenta).
- **Fila de arriba**, en dos columnas:
  - **Despegar** (pide confirmación; solo se habilita cuando llegan datos del dron) y **Aterrizar**.
  - **Inclinación: apagada** (ver "Inclinación"), **Seguir persona** y **Seguir objeto** (ver "Seguimiento").
- **Debajo, dos cruces:** "Subir y bajar · Girar" y "Avanzar · De costado". Con el celular acostado, los rótulos de las cruces no se muestran.
- **Abajo (deslizando):** la sección **Seguimiento** (ver más abajo).
- **Pie:** "Volá con supervisión y con 3 × 3 m libres de personas".

**Botones de mantener apretado (las cruces):** el dron se mueve mientras el botón está apretado y frena al soltarlo. Para frenar, soltá. Se pueden combinar con dos dedos. Solo andan en vuelo. Si hace falta bajar el dron, está **Aterrizar**; si algo sale mal, **EMERGENCIA**.

**Seguridad automática:**
- Si se cortan los datos del dron en vuelo más de 3,5 s, la app frena e intenta aterrizar; si no lo logra, deja de mandar órdenes para que el Tello aterrice solo (unos 15 s).
- Si salís de la cabina en vuelo, aterriza antes.

## Inclinación (cabina)

Con la inclinación prendida, inclinar el celular mueve el dron hacia adelante, atrás y los costados.

- Se prende con el botón **Inclinación: apagada** de la fila de arriba.
- No hay que calibrar: al prenderla, la posición del celular en ese momento es "quieto". Aparece "Inclinación prendida: esta posición es quieto". Sostené el celular como vas a volar antes de tocarla.
- Si la pantalla gira, la inclinación se apaga. Hay que volver a prenderla.
- Prender la inclinación detiene el seguimiento. Tocar **Seguir persona** o **Seguir objeto** apaga la inclinación.

## Seguimiento (cabina)

Funciona como RAC: busca a una persona (el recuadro va en la **cara**; si no se ve la cara, en el **cuerpo**) o un objeto, y la sigue.

- **Seguir persona:** arranca enseguida con la persona más cercana y centrada.
- **Seguir objeto:** muestra la lista de objetos en la sección Seguimiento: primero los propios y después los que reconoce la app (en español: botella, mochila, pelota, silla…). Elegí uno y tocá **Seguir este objeto**.
- **Agregar objeto propio** (dentro de la lista de objetos): cargá de 3 a 15 fotos del objeto y ponele nombre; después aparece en la lista. Se hace con el dron en tierra (salir de la cabina en vuelo lo hace aterrizar).
- Mientras sigue, el botón de arriba dice **Detener seguimiento** y **Seguir objeto** no se muestra.
- También podés **tocar un recuadro** del video para elegir qué seguir.

### En el piso

Solo marca el objetivo en el video (recuadro y etiqueta con el nombre y el %). No le manda nada al dron. Aparece "En el piso solo marca el objetivo. Despegá y tocá Seguir para que el dron lo siga."

**Despegar** detiene el seguimiento ("Seguimiento detenido para despegar. En el aire, tocá Seguir..."). Para que el dron siga, tocá **Seguir persona** o **Seguir objeto** ya en el aire.

### En vuelo

- Primero confirma el objetivo: necesita 8 detecciones seguidas de 75 % o más.
- Después lo sigue despacio: gira hasta 20 de 100, sube/baja y avanza/retrocede hasta 15; nunca se mueve de costado.
- Si pierde el objetivo (3 de las últimas 5 detecciones), el dron queda quieto y avisa "Objetivo perdido: el dron queda quieto". Si reaparece cerca en 5 s, lo retoma.
- Tocar **Seguir** en el aire es la orden para que el dron se mueva: no hay otra confirmación.

### Condiciones para mover el dron

- Altura entre 80 y 250 cm.
- Batería de 30 % o más.
- Llegan datos del dron.
- La detección usa la placa de video del celular.
- Al menos 4 detecciones por segundo.

Los primeros segundos después de tocar Seguir dice "Preparando para seguir...". Si no se cumplen las condiciones, no mueve el dron y dice "Todavía no sigue: " y el motivo. Si mientras se prepara despegás, aterrizás, tocás EMERGENCIA o la app pasa a segundo plano, el pedido se cancela: volvé a tocar Seguir. Si dejan de cumplirse mientras lo movía, el seguimiento se detiene, el dron frena y la app dice el motivo. Para seguir de nuevo, tocá Seguir otra vez.

### Qué lo detiene

**Detener seguimiento**, cualquier botón de movimiento (o los joysticks, en el modo técnico), prender la inclinación, **Despegar**, **Aterrizar**, **EMERGENCIA**, el aterrizaje de seguridad, que la app pase a segundo plano, salir de la cabina o que dejen de cumplirse las condiciones.

### Tarjetas de la sección Seguimiento

- **Estado:**
  - "Buscando objetivo..." (naranja);
  - "Confirmando: Persona (n/8)";
  - "Siguiendo: Persona" (verde);
  - "Objetivo perdido" (rojo).
- **Análisis de confianza** (solo mientras sigue): barras con el porcentaje del objetivo y de los candidatos más fuertes.
- **Historial de detección** (solo mientras sigue): cuándo empezó a seguir y cuándo lo perdió (los últimos 20). **Limpiar** lo vacía.
- El comando exacto (rc) se ve solo en el modo técnico.
- **Diagnosticar** (modo técnico): si queda siempre "Buscando", revisa la imagen, la placa de video, el detector con una foto de prueba y lo que ve, y dice qué falla. **Copiar diagnóstico** lo copia.
- **Seguimiento con la cámara del celular** (modo técnico): la misma pantalla, pero con la cámara del celular y sin dron; nunca le manda nada al dron.

## Sensores (modo técnico)

Muestra la inclinación del celular en vivo. Si el celular no tiene giroscopio, usa el acelerómetro (sin giro).

## Configuración (modo técnico)

Solo aparece con el modo técnico (en el menú y como pantalla).

- El dron de la cabina: DJI Tello o el Simulador (para practicar sin dron).
- Tiempo del aterrizaje de seguridad, "Invertir avance" de la inclinación y ajustes del seguimiento.

## Sin probar

Lo de este manual que mueve el dron (la cabina nueva, la inclinación y el seguimiento en vuelo) no se probó todavía con el celular ni con el dron.
