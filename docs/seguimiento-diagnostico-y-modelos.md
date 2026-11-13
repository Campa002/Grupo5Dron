# Seguimiento: IA del Tello, diagnóstico del A06 y elección del modelo

## ¿El Tello trae IA que podamos usar? (para el profe)

El Tello tiene un procesador de visión Intel Movidius Myriad 2, pero lo usa solo para su propio vuelo (sobre todo para mantenerse quieto mirando el piso). El SDK que da DJI (1.3, por WiFi) solo permite mandarle comandos de texto y recibir sus datos y su video: no deja cargarle programas ni modelos. Por eso la detección (personas, caras y objetos) corre en el celular, sobre el video que manda el Tello.

## Por qué el Galaxy A06 quedaba en "buscando persona"

No se pudo medir en el celular desde acá; estas son las causas posibles, de la más a la menos probable, y cómo las distingue el **Diagnóstico** que ahora tiene la pantalla de seguimiento:

| Causa posible | Qué pasaba | Qué hace ahora la app | Cómo se ve en el diagnóstico |
| :--- | :--- | :--- | :--- |
| La placa de video (GPU Mali) calcula mal | Las GPU Mali no escriben números de 32 bits y TensorFlow usa 16 bits: algunos drivers dan puntajes bajísimos | Apaga el empaquetado de WebGL en esas GPU (desde el 6/11) y el diagnóstico prueba una **foto conocida** con la GPU y, si falla, con el procesador | "Foto de prueba" en rojo y la conclusión "La placa de video de este celular calcula mal" |
| La persona estaba cerca: no entraba el cuerpo | COCO-SSD reconoce mal a una persona de la que se ve solo la cara o el pecho | Ahora busca también la **cara** con BlazeFace (de cerca da 85 a 95 %) | "Persona en la imagen": persona baja pero cara alta |
| Imagen deformada o negra | Antes, la imagen vertical llegaba aplastada (arreglado el 6/11); una cámara que no manda imagen da negro | Respeta la proporción; el diagnóstico mide el brillo y si la imagen cambia | "Brillo" o "La imagen se mueve" en rojo |
| Poca confianza o lejos | Con poca luz o lejos, los puntajes quedan por debajo del umbral | Reglas de RAC: 75 % y 8 seguidas; el diagnóstico dice cuánto da | Conclusión "Ve una persona, pero con poca confianza" |
| Muy lento | Si analiza menos de 1 o 2 imágenes por segundo, tarda mucho en juntar 8 detecciones seguidas | Muestra los FPS sobre el video | "Velocidad" en rojo |

Qué hacer en clase: guía de pruebas, C2 y C3 (con la cámara del celular) y D3 (con el video del Tello). El texto de "Copiar diagnóstico" alcanza para saber cuál es la causa.

## YOLO o COCO-SSD

Comparación de COCO-SSD lite (el que usamos) con un YOLO chico exportado a TensorFlow.js con entrada de 320 px. Los FPS en el A06 son **estimados** (no se pudo probar en el celular): salen de la cantidad de cálculo de cada modelo y de los ~5 FPS que daba COCO-SSD en el A06.

| | COCO-SSD lite (MobileNet v2) | YOLOv8n (320 px) | YOLO11n (320 px) |
| :--- | :--- | :--- | :--- |
| Cálculo por imagen | ~0,8 GFLOPs (300 × 300) | ~2,2 GFLOPs | ~1,6 GFLOPs |
| FPS estimados en el A06 | ~5 (medido el 6/11) | ~2 a 3 | ~2,5 a 3,5 |
| Tamaño en float16 | 9 MB (el nuestro) | ~6 MB | ~5 MB |
| Precisión en COCO (mAP) | ~22 | ~37 a 640 px; bastante menos a 320 | ~39 a 640 px; menos a 320 |
| Personas lejanas o chicas | Regular | Mejor | Mejor |
| Integración | Librería oficial de TF.js, ya andando | Hay que escribir el decodificador y el NMS | Igual que YOLOv8n |
| Licencia | Apache 2.0 | AGPL-3.0 (Ultralytics) | AGPL-3.0 |

**Recomendación: seguir con COCO-SSD + BlazeFace.**
- El problema del A06 no parece ser la precisión del modelo sino la placa de video o la imagen (ver arriba): YOLO no lo arregla y en ese celular iría más lento (2 a 3 FPS contra 5).
- Para seguir a una persona a 2 o 3 m, la cara con BlazeFace (270 KB, rápido) mejora más que cambiar de detector.
- YOLO es AGPL: obliga a publicar el código de toda la app que lo use (se puede, pero hay que decidirlo).
- Volver a mirarlo solo si, después de la prueba en clase, COCO-SSD da puntajes bajos también con el procesador (CPU) sobre imágenes buenas.

## Reglas del seguimiento (como RAC)

- Una detección **cuenta** si tiene 75 % o más (en "Mis objetos", si se parece 75 % o más a tus fotos).
- Se **confirma** con 8 detecciones seguidas que cuentan, del mismo candidato ("Confirmando n/8").
- Se **pierde** con 3 fallas en las últimas 5 (falla: no aparece o no llega al 75 %). Perdido = el dron quieto (`rc 0 0 0 0`).
- Después de perderlo, solo se retoma algo cerca de donde estaba durante 5 s; si no, hay que volver a elegir (Iniciar seguimiento o tocar un recuadro). En "Mis objetos" se lo busca en cualquier lugar.
- Tamaño ideal del recuadro para unos 3 m de distancia: 7,5 % del alto de la imagen si es la **cara**, 55 % si es el **cuerpo** (se ajustan en Config. Dron, modo técnico).
- Todo esto está probado con recorridos inventados en `tests/rac.test.js`, `tests/seguimiento.test.js` y `tests/control-real.test.js`.
