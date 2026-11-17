# Manual de usuario: app del dron

App "Grupo 5 — Dron" para el DJI Ryze Tello. No necesita internet ni cuenta.

## Antes de volar

- Protectores de hélices puestos, batería cargada, 3 × 3 m libres de personas.
- Una persona con el dedo listo en **EMERGENCIA**.
- Prendé el Tello y conectá el celular a su WiFi (`TELLO-…`). Los datos móviles pueden quedar prendidos: la app usa igual el WiFi del Tello.

## Inicio

**Entrar a la cabina** es la opción principal. El menú (arriba a la izquierda) tiene Inicio, Cabina y Configuración.

## Modo técnico (pruebas y diagnóstico)

Lo que sirve para probar y buscar problemas está escondido en el **modo técnico**: Prueba Tello, Sensores, el seguimiento con la cámara del celular, el perfil Simulador, Diagnosticar, los datos de los comandos (rc) y los FPS en pantalla, los registros para copiar, los joysticks, crear misiones y los ajustes avanzados.

- **Para prenderlo:** tocá **5 veces seguidas** el título de la app ("GRUPO 5 · DRON" arriba, o "CABINA · …" dentro de la cabina). Aparece "Modo técnico activado".
- **Para apagarlo:** lo mismo, 5 toques seguidos ("Modo técnico apagado"). Si estabas en una pantalla de prueba, vuelve al inicio; con el modo apagado, la cabina usa siempre el DJI Tello.
- Queda guardado en el celular hasta que lo apagues. Apagado, el usuario no ve nada de esto (lo de seguridad, como el aterrizaje automático, funciona igual).

## Prueba Tello (modo técnico)

Inicio o menú → **Prueba Tello** → **Probar conexión**. Revisa cinco cosas (conexión, respuesta, batería, datos y video) y dice "Listo para volar" o qué falta. **Copiar informe** copia el resultado para mandarlo si algo falla.

## Cabina

Usala con el celular acostado.

- **Arriba:** EMERGENCIA (rojo, siempre visible): apaga los motores en el acto; el dron cae.
- **Sobre el video:** estado de la conexión, batería, altura y, con el seguimiento, su estado (los FPS, solo en el modo técnico).
- **Izquierda:** Despegar (pide confirmación; solo se habilita cuando llegan datos del dron), Aterrizar, y los botones Subir, Bajar y Girar.
- **Derecha:** Inclinación (ON/OFF), **Seguir persona** (atajo; mientras sigue dice **Detener seguimiento**) y los botones Adelante, Atrás, Izquierda y Derecha.
- **Abajo del video:** velocidad Lenta, Normal o Rápida (siempre arranca en Lenta).

**Botones de mantener apretado:** el dron se mueve mientras el botón está apretado y frena al soltarlo. Se pueden combinar con dos dedos. Solo andan en vuelo.

Más abajo (deslizando):

- **01 — Seguimiento:** ver la sección siguiente.
- **02 — Inclinación:** con Inclinación ON, inclinar el celular mueve el dron hacia adelante, atrás y los costados. Sostené el celular como vas a volar y tocá **Calibrar**: esa posición es "quieto".
- **03 — Por pasos:** cada botón mueve la distancia elegida (20 a 100 cm) o gira el ángulo elegido, y deja el dron quieto. El botón rojo del centro frena.
- **04 — Automático (misiones):** una lista de pasos que el dron hace solo. Elegí una, tocá Iniciar; Cancelar la frena. (Crear una nueva, "Nueva", es del modo técnico.)

**Seguridad automática:**
- Si se cortan los datos del dron en vuelo más de 3,5 s, la app frena e intenta aterrizar; si no lo logra, deja de mandar órdenes para que el Tello aterrice solo (unos 15 s).
- Si salís de la cabina en vuelo, aterriza antes.

## Seguimiento (cabina)

Funciona como RAC: busca a una persona (el recuadro va en la **cara**; si no se ve la cara, en el **cuerpo**) o un objeto, y la sigue.

- **Seguir persona:** arranca enseguida con la persona más cercana y centrada.
- **Seguir objeto:** abre la lista de objetos: primero los propios y después los que reconoce la app (en español: botella, mochila, pelota, silla…). Elegí uno y tocá **Seguir este objeto**.
- **Agregar objeto propio** (dentro de Seguir objeto): cargá de 3 a 15 fotos del objeto y ponele nombre; después aparece en la lista. Se hace con el dron en tierra (salir de la cabina en vuelo lo hace aterrizar).
- **Detener** apaga el seguimiento.
- También podés **tocar un recuadro** del video para elegir qué seguir.
- **Estado:**
  - "Buscando objetivo..." (naranja);
  - "Confirmando: Persona (n/8)": necesita 8 detecciones seguidas de 75 % o más;
  - "Siguiendo: Persona" (verde);
  - "Objetivo perdido" (rojo): falló 3 de las últimas 5 detecciones; el dron queda quieto (rc 0 0 0 0).
- **Análisis de confianza:** barras con el porcentaje del objetivo y de los candidatos más fuertes.
- **Historial de detección:** cuándo empezó a seguir y cuándo lo perdió (los últimos 20). **Limpiar** lo vacía.
- **Cartel sobre el video:** dice qué haría el dron (ensayo) o qué está haciendo (control real). El comando exacto (rc) se ve solo en el modo técnico.
- **Diagnosticar** (modo técnico): si queda siempre "Buscando", revisa la imagen, la placa de video, el detector con una foto de prueba y lo que ve, y dice qué falla. **Copiar diagnóstico** lo copia.
- **Seguimiento con la cámara del celular** (modo técnico): la misma pantalla, pero con la cámara del celular y sin dron; nunca le manda nada al dron.

**Ensayo (por defecto):** calcula y muestra lo que haría el dron, pero no lo mueve.

**Control real (experimental), solo en la cabina:**
- Se activa con el interruptor "Control real (experimental)" y pide confirmación **cada vez**.
- Solo se deja activar en vuelo, con datos del dron, altura entre 80 y 250 cm, batería de 30 % o más y al menos 4 detecciones por segundo.
- Se mueve despacio: giro hasta 20 de 100, subir/bajar y avanzar/retroceder hasta 15; nunca de costado.
- Vuelve solo a ensayo si tocás un botón de movimiento, activás la inclinación, se corta la conexión, deja de cumplir las condiciones, la app pasa a segundo plano o salís de la cabina. Frenar, Aterrizar y EMERGENCIA también lo apagan.

## Sensores (modo técnico)

Muestra la inclinación del celular en vivo. Si el celular no tiene giroscopio, usa el acelerómetro (sin giro).

## Configuración

- El dron de la cabina: DJI Tello. En el modo técnico también aparece el Simulador (para practicar sin dron).
- En el modo técnico: tiempo del aterrizaje de seguridad, "Invertir avance" de la inclinación y ajustes del seguimiento.
