# Subir el proyecto al servidor, paso a paso

Guía para alguien que nunca subió nada. El hosting todavía no está elegido: los nombres de los menús pueden cambiar un poco según el proveedor.

**Qué tiene que tener el hosting:** PHP 8, MySQL (o MariaDB) y **HTTPS** (candado). Sin HTTPS, el APK del aula y el ESP32 no se conectan.

## Cómo queda en el servidor

```
(carpeta web del hosting: public_html, htdocs o www)
  index.php    la portada, con los accesos y las descargas
  aula/        la web del aula
  dron/        la web del dron (con el simulador)
  api/         lo que usan la web del aula, el APK del aula y el ESP32
  includes/    interna (cerrada)
  config/      interna (cerrada); acá va config.php
  apk/         grupo5-aula.apk y grupo5-dron.apk
```

Todo usa rutas relativas: funciona igual en la raíz del dominio (`https://dominio.com/`) o dentro de una carpeta (`https://dominio.com/grupo5/`).

## 1. Bajar los dos APK

1. En GitHub, entrá al repo → pestaña **Actions** → la última corrida en verde.
2. Abajo, en **Artifacts**, bajá `Grupo5Dron-app-debug` y `Grupo5Aula-app-debug` (son dos `.zip`).
3. Descomprimilos. Adentro de cada uno hay un `app-debug.apk`.
4. En la carpeta del proyecto, creá una carpeta `apk` y copiá los dos archivos con estos nombres exactos:
   - `apk/grupo5-dron.apk`
   - `apk/grupo5-aula.apk`

Si te salteás este paso, todo funciona igual pero la portada dice "El APK todavía no está subido".

## 2. Armar el paquete

En la carpeta del proyecto, abrí una terminal y corré:

```bash
python scripts/armar-paquete-servidor.py
```

Te deja, en la carpeta `dist`:

- `paquete-servidor.zip`: lo que se sube.
- `base-de-datos.sql`: la base de datos (se importa en el paso 4; **no** se sube a la carpeta web).

El paquete no trae contraseñas, pruebas, documentación ni firmware.

## 3. Subir y descomprimir

1. Entrá al panel del hosting → **Administrador de archivos** → la carpeta web (`public_html` o `htdocs`).
2. Si hay un archivo de bienvenida del hosting (por ejemplo `index2.html` o `default.php`), borralo.
3. **Subir** → elegí `paquete-servidor.zip`.
4. Clic derecho sobre el zip → **Extraer**. Después borrá el zip.

Si el hosting no deja extraer, descomprimí el zip en tu PC y subí las carpetas con un programa de FTP (FileZilla), con los datos de FTP que da el panel.

## 4. Crear la base de datos

1. Panel → **Bases de datos MySQL**:
   - creá una base;
   - creá un usuario con una contraseña larga;
   - agregá el usuario a la base con **todos los privilegios**.
   Anotá los cuatro datos: servidor, nombre de la base, usuario y contraseña (el hosting suele agregarles un prefijo).
2. Panel → **phpMyAdmin** → elegí la base → **Importar** → `dist/base-de-datos.sql` → **Continuar**.
3. Tienen que aparecer las tablas (`usuarios`, `dispositivos`, `botones`, `codigos_ir`, `cola_comandos`, `historial`, `estado_esp32`, `configuracion`…).

## 5. Crear `config.php`

En el Administrador de archivos, entrá a `config/`, copiá `config.example.php` con el nombre `config.php` y editalo:

| Clave | Qué poner |
| :--- | :--- |
| `db.host` | el servidor del paso 4 (`localhost` casi siempre) |
| `db.nombre`, `db.usuario`, `db.password` | los del paso 4 |
| `seguridad.jwt_secreto` | una clave larga inventada, de 64 letras y números al azar |
| `seguridad.esp32_token` | otra clave larga al azar: la misma que `ESP32_TOKEN` en `config.h` del ESP32 |
| `seguridad.cors_origenes` | `['https://tu-dominio.com', 'https://localhost']` (`https://localhost` es el APK: no lo saques) |
| `app.debug` | `false` |

Este archivo tiene contraseñas: **nunca** va al repo ni se manda por chat.

## 6. Activar HTTPS

En el panel, buscá **SSL/TLS**, **Let's Encrypt** o **AutoSSL** y activá el certificado gratis para el dominio. Puede tardar unos minutos. La portada ya manda sola de `http` a `https`.

## 7. Probar

| Abrir | Tiene que pasar |
| :--- | :--- |
| `https://tu-dominio.com/` | La portada, con el candado. |
| "Abrir web del aula" | El ingreso. Entrá con `admin@grupo5dron.local` y la contraseña `password`: te obliga a cambiarla. |
| "Abrir web del dron (simulador)" | La cabina con el aviso de versión web. Despegar funciona con el simulador. |
| Los dos botones de descarga | Bajan los APK. |
| `https://tu-dominio.com/config/config.php` | "Prohibido" (403). Si muestra algo, avisá antes de seguir. |
| `https://tu-dominio.com/api/esp32.php?action=estado` | Un error de "no autorizado": eso confirma que la API anda. |

Cambiá la contraseña de **todas** las cuentas iniciales (admin, docente y usuarios) el mismo día: `password` es pública. Las que no se usen, desactivalas desde Administración.

## 8. Conectar el APK del aula y el ESP32

- **Web del aula y web del dron:** no hay que hacer nada.
- **APK del aula:** la dirección del servidor va fija adentro del APK.
  1. En `backend/public-aula/js/config-aula.js` poné la dirección de la API, con `https` y sin barra al final:
     ```js
     const SERVIDOR_AULA = 'https://tu-dominio.com/api';
     ```
  2. Subí el cambio a GitHub. El CI arma el APK nuevo.
  3. Repetí los pasos 1 a 3 de esta guía para que la portada ofrezca ese APK.
  4. Instalalo: entra directo al ingreso, sin pedir ninguna dirección.
- **ESP32:** en `config.h`, `API_URL` = `https://tu-dominio.com/api/esp32.php` y `ESP32_TOKEN` igual al de `config.php`.
- **APK del dron:** no usa el servidor.

## 9. Actualizar más adelante

Repetí los pasos 1, 2 y 3. Al extraer, aceptá reemplazar los archivos. `config.php` no se pisa porque el paquete no lo trae.

## Si algo no anda

| Problema | Revisar |
| :--- | :--- |
| Error 500 en la API | Los datos de la base en `config.php`; que el hosting use PHP 8 ("Seleccionar versión de PHP"). |
| El APK dice "Falta configurar el servidor del aula" | Falta el paso 8, o se instaló un APK viejo. |
| El APK no se conecta | Que `SERVIDOR_AULA` empiece con `https` y que `https://localhost` esté en `cors_origenes`. |
| "Equipo del aula sin conexión" | `API_URL` y `ESP32_TOKEN` del ESP32; que tenga WiFi con internet; que el hosting no bloquee al ESP32 (algunos gratis lo hacen). |
| El ingreso falla siempre | Que se haya importado la base; que la cuenta no esté bloqueada (5 intentos: esperar 15 minutos). |
| El celular no deja instalar el APK | Activar "Instalar apps desconocidas" para el navegador. Si se queja de la firma, desinstalar la versión anterior. |
