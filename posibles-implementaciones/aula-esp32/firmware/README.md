# Firmware ESP32 del aula — Grupo 5: Control de Sistemas y Dron
**EEST N° 1 de Vicente López "Eduardo Ader" — 7° año 2° división**

Código C++ para el ESP32 (NodeMCU de 30 pines) que controla 3 cosas del aula: las **luces** (relé), el **proyector** y el **aire acondicionado** (infrarrojo). También aprende los códigos de los controles remotos de cada aula con el receptor KY-022. Consulta al servidor (API REST, `esp32.php`) los comandos que se mandan desde la app del aula.

> **220 V:** el armado y las pruebas con 220 V se hacen solo con supervisión del profesor, con todo desenchufado mientras se arma. Los 220 V son solo la fase de la lámpara, que pasa por el relé.

---

## 1. Circuito (el que está soldado)

| Pin ESP32 | Conectado a | Función | En `config.h` |
| :--- | :--- | :--- | :--- |
| **GPIO 18** | Resistencia de 330 Ω a la base de un BC337 | Emisor IR | `PIN_IR_SEND` |
| **GPIO 26** | IN del módulo relé | Luces del aula | `PIN_RELE_LUCES` |
| **GPIO 15** | OUT del receptor KY-022 | Receptor IR | `PIN_IR_RECV` |
| **3V3 / GND** | VCC / GND del KY-022 | Alimentación del receptor | — |
| **VIN / GND** | "nudito de 5 V": VCC del relé y los LEDs IR | 5 V que vienen del USB-C del ESP32 | — |
| **GPIO 2** | LED de la placa | Indicador de estado | `PIN_LED_ESTADO` |

**Emisor IR.** Son 2 LEDs IR en serie manejados por un transistor BC337:

```
5 V ── (33 Ω en paralelo con 100 Ω) ── LED IR 1 ── LED IR 2 ── colector BC337
GPIO 18 ── 330 Ω ── base BC337          emisor BC337 ── GND
```

- Corriente de los LEDs: ~80 mA de pico (dos LEDs de ~1,35 V y ~25 Ω). Como la señal IR va pulsada a 38 kHz, el promedio queda en ~25-30 mA. Está dentro de lo que aguantan los LEDs IR de 5 mm (típico: 100 mA continuos).
- Resistencias: la de 33 Ω disipa ~0,12 W de pico y ~0,04 W de promedio; alcanza con 1/4 W.
- Base: (3,3 − 0,75) / 330 ≈ 7,7 mA. Satura bien al BC337 para 80 mA y está dentro de lo que da un pin del ESP32.

**Relé.** Corta solo la fase de la lámpara: COM entra, NO sale y NC queda vacío.

**Receptor KY-022.** Va a 3V3 (su salida queda en 3,3 V, segura para el ESP32). GPIO 15 es un pin de arranque, pero solo decide si se muestran los mensajes de arranque por el puerto serie; el KY-022 en reposo da nivel alto (el normal), así que el ESP32 arranca bien.

**Alimentación (desde el 13/11): por el USB-C, sin fuente.** Ver la sección siguiente.

### Alimentación por USB-C con un cargador de celular

Decidimos no usar la fuente HLK-5M05 ni el fusible: el ESP32 se alimenta por su USB-C con un cargador de celular enchufado a la pared. El pin VIN sigue alimentando el "nudito de 5 V" (relé y LEDs IR), pero ahora esos 5 V vienen del USB a través de la placa.

- **La HLK-5M05 queda desconectada:** desoldala, o cortá sus cables y aislá cada punta con termocontraíble. Nada de 220 V tiene que llegar a ella. El fusible y el portafusible tampoco van.
- **Consumo (aproximado, de hojas de datos):**

  | Qué | Corriente |
  | :--- | :--- |
  | ESP32 con WiFi transmitiendo | ~100 mA promedio, picos de ~350 mA |
  | Relé prendido (bobina SRD-05VDC + LED del módulo) | ~75-90 mA |
  | LEDs IR mientras emiten | ~80 mA de pico (~27 mA promedio, solo durante el código) |
  | KY-022 | ~1 mA |
  | **Peor caso, todo junto** | **~520 mA** |

- **Cargador mínimo: 5 V y 1 A** (mejor 2 A, por margen). Un cable USB-C corto y bueno: los cables finos y largos bajan el voltaje.
- **Ojo con la placa:** en la mayoría de los NodeMCU el USB llega a VIN por un diodo, que baja unos 0,3 V: el relé queda con ~4,7 V (cierra desde ~3,75 V, así que anda). Algunas placas tienen un fusible reseteable de 500 mA en el USB: si con el relé prendido y el WiFi el ESP32 se reinicia, ese es el motivo (en la guía de pruebas, prueba B8).
- **220 V:** quedan solo en la fase de la lámpara (COM y NO del relé), dentro del piso de abajo de la carcasa. Los protege la térmica del aula.
- La versión con la HLK y el fusible queda como mejora futura para una instalación fija (`docs/limitaciones-y-mejoras.md`).

### Nivel del relé: activo en alto o en bajo

Depende del módulo. Se elige con `RELE_ACTIVO_EN_BAJO` en `config.h` (1 = activo en bajo, 0 = activo en alto).

Cómo averiguarlo: con el ESP32 desconectado, alimentá el módulo a 5 V y tocá IN con un cable. Si hace clic al tocar GND, es activo en bajo; si hace clic al tocar 3V3, es activo en alto. Fijate también si tiene un jumper "H/L".

En los dos casos el relé arranca apagado: el firmware escribe el nivel "apagado" antes de configurar el pin, y mientras el ESP32 bootea GPIO 26 queda flotando. Si el módulo es activo en bajo y está alimentado a 5 V, puede que los 3,3 V del ESP32 no alcancen para apagarlo del todo (queda prendido o tiembla); eso se arregla con el jumper o con un transistor, no con el código.

---

## 2. Configuración

1. Copiá `src/config.h.example` como `src/config.h` (nunca subas `config.h` a git: está en `.gitignore`).
2. Completá:
   - `WIFI_SSID` y `WIFI_PASSWORD`;
   - `API_URL`: dirección de `esp32.php`. En el hosting, `https://tu-servidor.com/api/esp32.php`; en clase con XAMPP, `http://IP-de-la-notebook/api/esp32.php`;
   - `ESP32_TOKEN`: el mismo que `esp32_token` en `backend/config/config.php`;
   - `RELE_ACTIVO_EN_BAJO`, según tu módulo (ver arriba);
   - `CLIENT_INSECURE_MODE`: `true` solo para pruebas sin certificado; en el hosting real, `false` con el certificado raíz en `ROOT_CA_CERT`.

---

## 3. Compilar y subir

Con PlatformIO (VS Code con la extensión PlatformIO, abriendo esta carpeta):

```bash
pio run --target upload
pio device monitor
```

El CI de GitHub (job "Compilar firmware ESP32") compila este firmware y el banco de pruebas en cada push y en cada PR, usando `config.h.example` como `config.h`.

---

## 4. Banco de pruebas de hardware (`tests/test_hardware.ino`)

Prueba el relé, el emisor y el receptor sin WiFi ni servidor. Subilo al ESP32, abrí el monitor serie a 115200 baudios y elegí:

- `1`: prende el relé de las luces 2 segundos y lo apaga.
- `2`: emite 5 códigos NEC de prueba por el emisor (mirá los LEDs con la cámara de un celular: tienen que parpadear).
- `3`: modo escucha del receptor: apuntá cualquier control remoto y muestra el protocolo y el código.
- `4`: prueba seguida del relé y del emisor.

Si tu relé es activo en alto, cambiá `RELE_ACTIVO_EN_BAJO` a 0 también en este archivo.

---

## 5. Códigos largos de los aires acondicionados

Los controles de aire no mandan un código corto (como el NEC de 32 bits de un televisor): mandan el **estado completo** del aire (encendido, modo, temperatura, ventilador) en 100 a 400 bits, que son 200 a 600 pulsos.

- **Captura:** el receptor guarda hasta 1024 pulsos y espera 50 ms de silencio para dar el código por terminado (`IR_TAMANO_CAPTURA` e `IR_FIN_TRAMA_MS` en `ir_manager.h`). Antes guardaba 100 y los aires quedaban cortados. Si la señal igual es más larga, el monitor serie avisa "quedó cortada".
- **Qué se guarda:** el protocolo (con los nombres de IRremoteESP8266: `NEC`, `SONY`, `COOLIX`, `DAIKIN`, `GREE`, `MIDEA`, `LG`, `UNKNOWN`…), el código en hexadecimal (en los aires, todos los bytes del estado) y **siempre** la trama cruda completa (los tiempos en microsegundos).
- **Cómo se reenvía:**
  1. si la librería conoce el protocolo, lo manda con ese protocolo (los de aire, con el estado completo en bytes);
  2. si no lo conoce (`UNKNOWN`) o falla, manda la trama cruda tal cual se capturó.
- **Ojo:** como el código lleva el estado completo, el botón "Subir temperatura" deja siempre el aire en la temperatura que tenía el control cuando se aprendió (no sube de a un grado).
- **Hay que probarlo con el aire real de la escuela** (guía de pruebas, A5 y B5).

---

## 6. Primer arranque (paso a paso, para la clase)

1. **Configurar.** Copiá `src/config.h.example` como `src/config.h` y completá WiFi, `API_URL`, `ESP32_TOKEN` y `RELE_ACTIVO_EN_BAJO` (sección 2). El WiFi tiene que ser de 2,4 GHz.
2. **Conectar sin 220 V.** ESP32 por USB a la notebook. El relé sin nada en COM ni NO. La HLK desconectada.
3. **Subir el banco de pruebas.** En PlatformIO no se puede tener dos `setup()` en `src/`: abrí `tests/test_hardware.ino` con el IDE de Arduino (con la librería IRremoteESP8266 instalada y la placa "ESP32 Dev Module"), o copiá su contenido temporalmente en lugar de `src/main.cpp` (sin borrar el resto) y subilo con `pio run --target upload`. Abrí el monitor serie a 115200 (`pio device monitor`).
4. **Probar el hardware** (sección 4):
   - `1` → el relé hace clic dos veces. Si arranca prendido o funciona al revés, es activo en alto: `RELE_ACTIVO_EN_BAJO 0`.
   - `2` → los dos LEDs IR parpadean vistos con la cámara del celular.
   - `3` → apuntá el control del proyector y el del aire: anotá protocolo, bits y pulsos; no tiene que decir "cortada".
5. **Subir el firmware real.** Volvé a dejar `src/main.cpp` como estaba (si lo reemplazaste) y `pio run --target upload`. En el monitor serie: se conecta al WiFi, muestra su IP y manda el latido cada 10 s.
6. **Probar desde la app del aula.** "Equipo del aula en línea"; aprender los códigos (Proyector y Aire) y probarlos; luces con el relé habilitado por el admin (sin 220 V: solo tiene que hacer clic).
7. **Pasar al cargador.** Desenchufá de la notebook y alimentá con el cargador de celular (5 V, 1 A o más). Repetí el paso 6.
8. **220 V, solo con el profe.** Recién ahí se conecta la fase de la lámpara (COM y NO) dentro de la carcasa, con todo desenchufado, y el profe revisa antes de enchufar.
