# Correcciones del informe

Lo que el informe (`docs/contexto/informe-grupo5-dron.pdf`) dice distinto a lo que se hizo, para corregirlo en la versión final.

| Sección del informe | Dice | Lo que se hizo | Por qué |
| :--- | :--- | :--- | :--- |
| 2. Objetivos específicos y 9. Funcionamiento | Una pantalla principal para elegir entre "Control del Aula" y "Control del Dron" | **Dos apps separadas**: "Grupo 5 — Dron" y "Grupo 5 Aula" | El dron se usa conectado al WiFi del Tello, sin internet ni cuenta; el aula necesita internet y sesión. Juntas, la app del dron quedaba con cosas que no podía usar. (Luciano lo habla con el profe.) |
| 4. Módulo 1, dispositivos | Luces, ventiladores, aire, proyectores y otros equipos | **Solo 3:** luces (relé), proyector (IR) y aire acondicionado (IR) | Alcance acordado el 13/11. |
| 4. Módulo 1, relé | El relé "solo si resulta necesario" | El relé maneja las **luces** (corta la fase de la lámpara), con habilitación del administrador y supervisión docente | Las luces no tienen control infrarrojo. |
| 5. Hardware: LED IR | LED IR en el **GPIO35** del ESP32 | **GPIO18**, por una resistencia de 330 Ω a un transistor **BC337** que maneja **2 LEDs IR en serie** (con 33 Ω en paralelo con 100 Ω) | El GPIO35 es solo de entrada: no puede manejar un LED. Con el transistor, cada LED recibe ~80 mA de pico y llegan más lejos. |
| 5. Hardware: resistencia | 100 Ω × 2 para proteger el LED | 33 Ω en paralelo con 100 Ω en serie con los LEDs, y 330 Ω en la base del BC337 | Corresponde al circuito con transistor. |
| 5. Hardware: receptor IR | TSOP1838 o similar | **KY-022** (con un receptor del tipo 1838) en el **GPIO15**, alimentado a 3,3 V | Es el módulo que se soldó. |
| 5. Hardware: relé | Módulo relé de 1 canal, 1-2 | **Un** relé en el **GPIO26** | El circuito tiene un solo relé. |
| 5. Hardware: alimentación | Cable USB para programar | El ESP32 se alimenta por su **USB-C con un cargador de celular** (5 V, 1 A o más), que también alimenta el relé y los LEDs por VIN | Se descartó la fuente HLK-5M05 y el fusible (13/11); quedan como mejora para una instalación fija. |
| 5. Hardware: armado | Protoboard y cables jumper | Circuito **soldado** en una plaquita perforada, dentro de una **carcasa triangular impresa en 3D** (PETG) con las cápsulas de los LEDs en rótulas orientables | Para dejarlo instalado en el aula. |
| 5. Hardware: ESP32 | "Corre el servidor" | El ESP32 **no** es servidor: **consulta** cada 2 s a un servidor PHP + MySQL en internet | Así funciona detrás del WiFi de la escuela, sin abrir puertos. |
| 6/8. Software (duplicada) | Herramientas sin nombrar ("deberán consignarse en la versión final") | Apps: HTML, CSS y JavaScript con **Capacitor 5** (APK); servidor: **PHP 8 + MySQL** con sesión JWT; ESP32: **C++ (Arduino) con PlatformIO**, librerías **IRremoteESP8266** y **ArduinoJson**; visión: **TensorFlow.js** con **COCO-SSD** (personas y objetos), **BlazeFace** (caras) y **MobileNet** (Mis objetos); video: **WebCodecs** (H.264); plugin propio en **Java** para UDP; carcasa en **OpenSCAD**; CI con **GitHub Actions** | Las secciones 6 y 8 son iguales: dejar una sola. |
| 7. Sensores: giroscopio | Control del dron con el giroscopio | Inclinación del celular con el **giroscopio** y, si el celular no tiene (como el Galaxy A06), con el **acelerómetro** | El celular de prueba no tiene giroscopio. |
| 7. Sensores: cámara | Cámara del teléfono para reconocimiento visual | **Seguimiento** sobre el video **del dron** (la cámara del celular se usa para probarlo sin volar), con detección de personas, caras y objetos | Es lo que pidió el profe ("como RAC"). |
| 4. Módulo 2: dron | "Según el modelo de dron utilizado" | **DJI Ryze Tello** (SDK 1.3 por UDP), sin ESP32 en el dron: el celular habla directo con el dron | — |
| 4. Módulo 2: seguimiento | "Investigar el seguimiento automático" | Hecho estilo RAC (confirmar con 8 detecciones de 75 %, perder con 3 de 5), en **ensayo** por defecto y con **control real experimental** que pide confirmación | Falta probarlo con el dron (guía de pruebas, bloque F). |
| — (no está) | — | ¿El Tello trae IA? Su chip Movidius no se puede programar con el SDK: la detección corre en el celular | Pregunta del profe; ver [seguimiento-diagnostico-y-modelos.md](seguimiento-diagnostico-y-modelos.md). |
