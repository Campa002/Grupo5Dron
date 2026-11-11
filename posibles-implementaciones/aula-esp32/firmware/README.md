# Firmware ESP32 del aula — Grupo 5: Control de Sistemas y Dron
**EEST N° 1 de Vicente López "Eduardo Ader" — 7° año 2° división**

Código C++ para el ESP32 (NodeMCU de 30 pines) que emite códigos infrarrojos (IR), aprende códigos de controles existentes y prende o apaga las luces del aula con un relé. Consulta al servidor (API REST por HTTPS) los comandos que se mandan desde la app del aula.

> **220 V:** el armado y las pruebas con 220 V se hacen solo con supervisión del profesor. Para probar sin 220 V, alimentá el ESP32 por USB.

---

## 1. Circuito (el que está soldado)

| Pin ESP32 | Conectado a | Función | En `config.h` |
| :--- | :--- | :--- | :--- |
| **GPIO 18** | Resistencia de 330 Ω a la base de un BC337 | Emisor IR | `PIN_IR_SEND` |
| **GPIO 26** | IN del módulo relé | Luces del aula | `PIN_RELE_LUCES` |
| **GPIO 15** | OUT del receptor KY-022 | Receptor IR | `PIN_IR_RECV` |
| **3V3 / GND** | VCC / GND del KY-022 | Alimentación del receptor | — |
| **VIN / GND** | +Vo / -Vo de la fuente HLK-5M05 | 5 V para el ESP32, el relé y los LEDs | — |
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

**Fuente.** La HLK-5M05 (5 V, 1 A) alcanza para todo. Ojo: no conectes el USB y la fuente a la vez si tu NodeMCU no tiene diodo entre el USB y VIN.

### Nivel del relé: activo en alto o en bajo

Depende del módulo. Se elige con `RELE_ACTIVO_EN_BAJO` en `config.h` (1 = activo en bajo, 0 = activo en alto).

Cómo averiguarlo: con el ESP32 desconectado, alimentá el módulo a 5 V y tocá IN con un cable. Si hace clic al tocar GND, es activo en bajo; si hace clic al tocar 3V3, es activo en alto. Fijate también si tiene un jumper "H/L".

En los dos casos el relé arranca apagado: el firmware escribe el nivel "apagado" antes de configurar el pin, y mientras el ESP32 bootea GPIO 26 queda flotando. Si el módulo es activo en bajo y está alimentado a 5 V, puede que los 3,3 V del ESP32 no alcancen para apagarlo del todo (queda prendido o tiembla); eso se arregla con el jumper o con un transistor, no con el código.

---

## 2. Configuración

1. Copiá `src/config.h.example` como `src/config.h` (nunca subas `config.h` a git: está en `.gitignore`).
2. Completá:
   - `WIFI_SSID` y `WIFI_PASSWORD`;
   - `API_URL`: dirección de `esp32.php` en el hosting (por ejemplo `https://tu-servidor.com/api/esp32.php`);
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
