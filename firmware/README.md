# Firmware ESP32 — Grupo 5: Control de Sistemas y Dron
**EEST N° 1 de Vicente López "Eduardo Ader" — 7° año 2° división**

Este directorio contiene el código fuente en C++ para el microcontrolador ESP32 DevKit v1, encargado de ejecutar comandos infrarrojos (IR) y conmutar relés de potencia de 220V en el aula, reportando su estado y consultando la cola de comandos a la API REST vía HTTPS.

---

## 1. Esquema de Conexiones y Asignación de Pines (GPIO)

| Componente | Pin ESP32 | Modo | Descripción / Circuito |
| :--- | :---: | :---: | :--- |
| **LED Emisor IR (KY-005)** | **GPIO 19** | OUTPUT | Señal en GPIO 19 con resistencia de 100-220 Ω en serie. *(Mejora opcional: transistor NPN 2N2222/BC337 con R=1 kΩ en base hacia 5V para máxima potencia).* |
| **Receptor IR (KY-022)** | **GPIO 19** | INPUT | Módulo KY-022 receptor a 38 kHz. Señal a GPIO 19, VCC a 3.3V y GND a tierra común. |
| **Relé Canal 1** | **GPIO 25** | OUTPUT | Módulo relé 1 canal con optoacoplador y jumper de nivel, alimentado a VIN/5V. Señal en GPIO 25. Corte de 220V del aula. |
| **Relé Canal 2** | *Sin asignar* | — | Deshabilitado por diseño de hardware en protoboard actual. |
| **LED Estado** | **GPIO 2** | OUTPUT | LED azul onboard del ESP32 (indicador de estado WiFi / API). Nunca conectar el relé aquí. |

> [!WARNING]
> **Corrección de Pines Crítica:** El relé **NUNCA** debe conectarse a **GPIO 2** ni a **GPIO 0**, ya que son pines de *strapping* (arranque) del microcontrolador. Un módulo de relé conectado a GPIO 2 puede forzar el pin a un estado indebido durante el encendido e impedir el arranque del ESP32. Por este motivo, se utilizan **GPIO 25** y **GPIO 27**.

### Lógica de Control de Relé: Activo-Bajo vs Activo-Alto
La mayoría de los módulos de relé comerciales para Arduino/ESP32 con optoacoplador funcionan con **lógica activo-bajo** (`LOW` activa el relé, `HIGH` lo apaga).
En [config.h](file:///c:/Users/Alumnos/Desktop/Grupo5Dron/firmware/src/config.h.example) esto se encuentra parametrizado:
```cpp
#define RELAY_ACTIVE_LEVEL   LOW
#define RELAY_INACTIVE_LEVEL HIGH
```
El firmware garantiza que al encender la placa, ambos relés se inicializan inmediatamente en `RELAY_INACTIVE_LEVEL`, permaneciendo **estrictamente apagados** hasta recibir una orden expresa y autorizada desde la API.

---

## 2. Configuración Inicial

1. Copiá el archivo `src/config.h.example` como `src/config.h`:
   ```bash
   cp src/config.h.example src/config.h
   ```
2. Editá `src/config.h` y configurá:
   * `WIFI_SSID` y `WIFI_PASSWORD` con los datos de tu red.
   * `API_URL`: Dirección HTTPS de tu servidor (ej: `https://tu-servidor.com/api/esp32.php`).
   * `ESP32_TOKEN`: Token de autenticación que debe coincidir con `esp32_token` en `backend/config/config.php`.
   * `CLIENT_INSECURE_MODE`: Dejá en `true` solo para pruebas sin certificado SSL. En producción con HTTPS comercial (Let's Encrypt), poné `false` y cargá el certificado raíz en `ROOT_CA_CERT`.

---

## 3. Compilación y Subida

### Opción A: Con PlatformIO (Recomendada)
1. Abrí la carpeta `firmware/` en VS Code con la extensión PlatformIO instalada.
2. Conectá el ESP32 por USB.
3. Compilá y subí el firmware con:
   ```bash
   pio run --target upload
   ```
4. Abrí el monitor serial a 115200 baudios:
   ```bash
   pio device monitor
   ```

### Opción B: Con Arduino IDE
1. Abrí el Arduino IDE.
2. Agregá el paquete de tarjetas ESP32 de Espressif en el Administrador de Tarjetas:
   `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Instalá desde el Gestor de Librerías:
   * **IRremoteESP8266** (de David Conran / Sebastien Warin)
   * **ArduinoJson** (de Benoit Blanchon, versión 6.x)
4. Abrí `src/main.cpp` (o creá un sketch que lo incluya), seleccioná la placa **ESP32 Dev Module** y el puerto COM correspondiente, y hacé clic en **Subir**.

---

## 4. Banco de Pruebas de Hardware ([tests/test_hardware.ino](file:///c:/Users/Alumnos/Desktop/Grupo5Dron/firmware/tests/test_hardware.ino))

Si querés verificar el funcionamiento eléctrico de los componentes (relés, LED emisor y receptor IR) **sin necesidad de conectar a WiFi ni tener el backend encendido**:

1. Subí el sketch [tests/test_hardware.ino](file:///c:/Users/Alumnos/Desktop/Grupo5Dron/firmware/tests/test_hardware.ino) al ESP32.
2. Abrí el Monitor Serial a 115200 baudios.
3. Te aparecerá un menú interactivo:
   * `1`: Conmuta el Relé 1 por 2 segundos y lo apaga.
   * `2`: Conmuta el Relé 2 por 2 segundos y lo apaga.
   * `3`: Emite 5 códigos de prueba infrarrojos NEC en GPIO 19.
   * `4`: Pone el receptor IR en modo escucha en tiempo real para decodificar cualquier control remoto apuntado al sensor en GPIO 4.
   * `5`: Realiza una prueba integral secuencial de todos los periféricos.
