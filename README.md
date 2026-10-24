# Grupo 5: Control de Sistemas y Dron
**EEST N° 1 de Vicente López "Eduardo Ader" — 7° año 2° división**  
*Materia: Proyecto de Desarrollo de Software para Plataformas Móviles*

Sistema integral para el control centralizado de equipamiento del aula (luces, ventiladores, aire acondicionado, proyector y circuito de potencia 220V vía microcontrolador ESP32) y módulo de pilotaje para drones WiFi (con joysticks virtuales dobles, giroscopio móvil y adaptadores genéricos).

---

## 1. Integrantes del Equipo y Docentes

* **Equipo de Desarrollo (Grupo 5):**
  * **Demian Barreto** (Desarrollo Móvil, Sensores & Giroscopio)
  * **Luciano Campanelli** (Backend, Base de Datos & Seguridad)
  * **Ramiro Caballero** (Firmware ESP32, Infrarrojo & Relés)
  * **Owen Olea** (Comunicaciones, Protocolos Dron & Capacitor APK)
* **Profesores a cargo:**
  * **Prof. Eduardo Piris**
  * **Prof. Figueroa**

---

## 2. Estructura del Repositorio

```
Grupo5Dron/
├── backend/                       # Servidor PHP + API REST + PWA
│   ├── api/                       # Endpoints REST (auth, dispositivos, esp32, etc.)
│   ├── config/                    # Configuración de base de datos y credenciales
│   ├── includes/                  # Middleware JWT, seguridad HTTP y helpers
│   ├── public/                    # DocumentRoot público (index.php, CSS, JS, pages)
│   └── sql/                       # Esquema relacional MySQL / MariaDB (schema.sql)
├── firmware/                      # Código C++ para microcontrolador ESP32
│   ├── platformio.ini             # Configuración PlatformIO
│   ├── src/                       # Código fuente (WiFi, HTTPS, IR, Relé, main.cpp)
│   └── tests/                     # Banco de pruebas de hardware sin servidor
├── scripts/                       # Utilidades auxiliares (generador de hash, íconos)
└── docs/                          # Documentación técnica y manuales (Etapa 5)
```

---

## 3. Credenciales Iniciales de Prueba (Seed)

> [!WARNING]
> **ADVERTENCIA DE SEGURIDAD CRÍTICA:**  
> Las credenciales listadas abajo son de uso temporal y exclusivo para entornos de prueba locales. En la base de datos ([schema.sql](file:///c:/Users/Alumnos/Desktop/Grupo5Dron/backend/sql/schema.sql)), todos los usuarios iniciales tienen activada la bandera `debe_cambiar_password = 1`. **Es obligatorio cambiar las contraseñas antes del despliegue en producción o en el aula real.**

| Rol | Correo Electrónico | Contraseña Temporal | Propósito |
| :--- | :--- | :---: | :--- |
| **Administrador** | `admin@grupo5dron.local` | `Admin1234!` | Acceso completo al panel administrativo y configuración. |
| **Docente** | `piris@grupo5dron.local` | `Admin1234!` | Control de aula, modo aprendizaje IR y autorización de relé. |
| **Estudiante** | `demian@grupo5dron.local` | `Admin1234!` | Operación de dispositivos permitidos y telemetría. |
| **Estudiante** | `luciano@grupo5dron.local` | `Admin1234!` | Operación de dispositivos permitidos y telemetría. |

### Cómo regenerar contraseñas seguras por consola:
Podés generar nuevos hashes seguros con el script provisto en la carpeta `scripts/`:
```bash
php scripts/generar_hash.php "TuNuevaClaveSuperSegura123!"
```
El script generará el hash Bcrypt correspondiente y la instrucción SQL lista para actualizar el usuario deseado.

---

## 4. Hardware y Conexiones del ESP32

* **Emisor Infrarrojo:** GPIO 4 (Vía transistor NPN).
* **Receptor Infrarrojo:** GPIO 15 (Módulo VS1838B a 38 kHz).
* **Relé Canal 1 (220V):** GPIO 26 (Corte general / Iluminación).
* **Relé Canal 2 (Aux):** GPIO 27.
* **Protocolo de comunicación:** Polling no bloqueante cada 2 segundos hacia la API REST HTTPS (`WiFiClientSecure`) y autenticación mediante cabecera `X-ESP32-Token`.
