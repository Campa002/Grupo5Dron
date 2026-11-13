# Manual de usuario: app del dron

App "Grupo 5 — Dron" para el DJI Ryze Tello. No necesita internet ni cuenta.

## Antes de volar

- Protectores de hélices puestos, batería cargada, 3 × 3 m libres de personas.
- Una persona con el dedo listo en **EMERGENCIA**.
- Prendé el Tello y conectá el celular a su WiFi (`TELLO-…`). Los datos móviles pueden quedar prendidos: la app usa igual el WiFi del Tello.

## Inicio

Tres opciones:

| Opción | Para qué |
| :--- | :--- |
| **01 — Cabina** | Volar: video, botones, inclinación, seguimiento, pasos y misiones. |
| **02 — Prueba Tello** | Revisar la conexión, la batería, los datos y el video sin despegar. |
| **03 — Seguimiento** | Probar el seguimiento con la cámara del celular, sin el dron (nunca le manda nada al dron). |

El menú (arriba a la izquierda) tiene además Sensores, Mis objetos y Config. Dron.

## Prueba Tello

Tocá **Probar conexión**. Revisa cinco cosas (conexión, respuesta, batería, datos y video) y dice "Listo para volar" o qué falta. **Copiar informe** copia el resultado para mandarlo si algo falla.

## Cabina

Usala con el celular acostado.

- **Arriba:** EMERGENCIA (rojo, siempre visible): apaga los motores en el acto; el dron cae.
- **Sobre el video:** estado de la conexión, batería, altura y, con el seguimiento, su estado y los FPS.
- **Izquierda:** Despegar (pide confirmación; solo se habilita cuando llegan datos del dron), Aterrizar, y los botones Subir, Bajar y Girar.
- **Derecha:** Inclinación (ON/OFF), Seguimiento (ON/OFF) y los botones Adelante, Atrás, Izquierda y Derecha.
- **Abajo del video:** velocidad Lenta, Normal o Rápida (siempre arranca en Lenta).

**Botones de mantener apretado:** el dron se mueve mientras el botón está apretado y frena al soltarlo. Se pueden combinar con dos dedos. Solo andan en vuelo.

Más abajo (deslizando):

- **01 — Seguimiento:** ver la sección siguiente.
- **02 — Inclinación:** con Inclinación ON, inclinar el celular mueve el dron hacia adelante, atrás y los costados. Sostené el celular como vas a volar y tocá **Calibrar**: esa posición es "quieto".
- **03 — Por pasos:** cada botón mueve la distancia elegida (20 a 100 cm) o gira el ángulo elegido, y deja el dron quieto. El botón rojo del centro frena.
- **04 — Automático (misiones):** una lista de pasos que el dron hace solo. Elegí una, tocá Iniciar; Cancelar la frena. "Nueva" arma una propia.

**Seguridad automática:**
- Si se cortan los datos del dron en vuelo más de 3,5 s, la app frena e intenta aterrizar; si no lo logra, deja de mandar órdenes para que el Tello aterrice solo (unos 15 s).
- Si salís de la cabina en vuelo, aterriza antes.

## Seguimiento (cabina y pantalla "Seguimiento")

Funciona como RAC: busca a una persona (el recuadro va en la **cara**; si no se ve la cara, en el **cuerpo**) o un objeto, y la sigue.

- **Iniciar seguimiento / Detener.**
- **¿Qué seguir?:** una persona (la más cercana y centrada) o un objeto guardado en "Mis objetos". También podés **tocar un recuadro** del video para elegirlo.
- **Estado:**
  - "Buscando objetivo..." (naranja);
  - "Confirmando: Persona (n/8)": necesita 8 detecciones seguidas de 75 % o más;
  - "Siguiendo: Persona" (verde);
  - "Objetivo perdido" (rojo): falló 3 de las últimas 5 detecciones; el dron queda quieto (rc 0 0 0 0).
- **Análisis de confianza:** barras con el porcentaje del objetivo y de los candidatos más fuertes.
- **Historial de detección:** cuándo empezó a seguir y cuándo lo perdió (los últimos 20). **Limpiar** lo vacía.
- **Comando:** la tarjeta de estado y el cartel sobre el video muestran siempre qué haría (ensayo) o qué se manda (control real).
- **Diagnosticar:** si queda siempre "Buscando", revisa la imagen, la placa de video, el detector con una foto de prueba y lo que ve, y dice qué falla. **Copiar diagnóstico** lo copia.

**Ensayo (por defecto):** calcula y muestra lo que haría el dron, pero no lo mueve.

**Control real (experimental), solo en la cabina:**
- Se activa con el interruptor "Control real (experimental)" y pide confirmación **cada vez**.
- Solo se deja activar en vuelo, con datos del dron, altura entre 80 y 250 cm, batería de 30 % o más y al menos 4 detecciones por segundo.
- Se mueve despacio: giro hasta 20 de 100, subir/bajar y avanzar/retroceder hasta 15; nunca de costado.
- Vuelve solo a ensayo si tocás un botón de movimiento, activás la inclinación, se corta la conexión, deja de cumplir las condiciones, la app pasa a segundo plano o salís de la cabina. Frenar, Aterrizar y EMERGENCIA también lo apagan.

## Sensores

Muestra la inclinación del celular en vivo. Si el celular no tiene giroscopio, usa el acelerómetro (sin giro).

## Mis objetos

Para seguir un objeto propio: cargá de 3 a 15 fotos del objeto, ponele nombre y guardalo. Después aparece en "¿Qué seguir?".

## Config. Dron

- Perfil: DJI Tello o Simulador (para practicar sin dron).
- **Mostrar el modo técnico:** agrega herramientas para diagnosticar (registros para copiar, lo que ve el modelo, prueba en CPU, joysticks, ajustes del seguimiento).
- Tiempo del aterrizaje de seguridad, "Invertir avance" de la inclinación y ajustes del seguimiento (en el modo técnico).
