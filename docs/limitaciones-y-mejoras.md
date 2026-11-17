# Limitaciones y mejoras futuras

## Limitaciones

**Dron**
- El Tello común no sabe dónde está (no tiene GPS ni los "mission pads" del Tello EDU): "ir a un lugar" es una lista de movimientos relativos.
- La app del dron necesita el APK: el navegador solo no puede mandar UDP.
- El seguimiento corre en el celular: en uno de gama baja analiza pocas imágenes por segundo, y por eso el control real exige 4 o más.
- El control real es experimental: velocidades bajas fijas, sin esquivar obstáculos y sin moverse de costado. Hay que ajustar ganancias con el dron real.
- La unidad de las velocidades que manda el Tello (`vgx`, `vgy`) no está documentada.
- Sin probar todavía con el dron: todo lo nuevo del 13/11 (seguimiento con cara, control real).

**Aula**
- Una instalación = un aula: la base y la cola de órdenes son de un solo ESP32. Para varias aulas habría que agregar una tabla de aulas (ver mejoras).
- Los aires que mandan el estado completo no "suben de a un grado": el código aprendido deja una temperatura fija.
- El ESP32 consulta el servidor cada 2 s: una orden tarda de 1 a 3 s.
- El APK del aula necesita un servidor con HTTPS; en la red local se usa el navegador.
- Los 2 LEDs IR emiten siempre juntos (es a propósito); si dos aparatos usaran el mismo código, reaccionarían los dos.
- La alimentación por USB-C depende del cargador y del cable: con uno flojo o de menos de 1 A, el ESP32 se puede reiniciar al prender el relé.

**Carcasa**
- Imprime en unas 6 h 45 min (pedido: menos de 5 h). El cuerpo solo tarda 3 h 39: la altura la fija el lugar para las fichas debajo del ESP32 y el relé abajo.
- Medidas típicas: hay que confirmarlas con calibre.

## Mejoras futuras

- **Instalación fija con fuente propia:** volver a la versión con la fuente HLK-5M05 (220 V a 5 V) y un fusible T1A lento solo para la fuente, que quedó guardada en `posibles-implementaciones/aula-esp32/carcasa/version-anterior-dos-pisos-con-HLK/` (su conexionado está en el README de la carcasa del commit 9a169a7, en el historial de git). Así no hace falta un cargador enchufado al lado.
- **Varias aulas:** tabla `aulas` con su ESP32 (`dispositivo_id`), aparatos y cola de órdenes por aula, y un selector de aula en la app.
- **Temperatura del aire de a un grado:** usar los protocolos de aire de IRremoteESP8266 (`IRac`) para armar el código con la temperatura pedida en vez de reenviar uno aprendido.
- **Carcasa más rápida:** placa ESP32 con fichas acodadas (menos altura), o un relé más chico, para volver a un solo piso.
- **Seguimiento:** ajustar ganancias con el dron; si en el A06 la placa de video falla, permitir usar el procesador; probar YOLO solo si COCO-SSD queda corto (ver [seguimiento-diagnostico-y-modelos.md](seguimiento-diagnostico-y-modelos.md)).
- **Respuesta más rápida del aula:** WebSocket o MQTT en lugar de consultar cada 2 s.
- **Notificaciones:** avisar si el equipo del aula se desconecta.
