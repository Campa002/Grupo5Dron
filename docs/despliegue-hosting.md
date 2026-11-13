# Despliegue en el hosting (cPanel)

Pasos genéricos para un hosting con cPanel, PHP 8 y MySQL. El proveedor todavía no está elegido: los nombres de menú pueden cambiar un poco.

**Requisitos del hosting:** PHP 8.0 o más nuevo (con PDO MySQL), MySQL o MariaDB, y **HTTPS** (certificado SSL; la mayoría lo da gratis con "AutoSSL" o "Let's Encrypt"). Sin HTTPS, el APK del aula no puede conectarse.

## 1. Cómo queda en el servidor

```
public_html/
  api/        ← backend/api/
  config/     ← backend/config/      (con config.php; ver el paso 4)
  includes/   ← backend/includes/
  aula/       ← backend/public-aula/ (la web del aula)
  (opcional) la app del dron: el contenido de backend/public/ en la raíz
```

La API busca `../config/` y `../includes/` desde `api/`, por eso van al lado.

## 2. Subir los archivos

1. En cPanel → **Administrador de archivos** → `public_html`.
2. Subí un `.zip` con las carpetas `api`, `config`, `includes` y `aula` (renombrando `public-aula` a `aula`) y usá **Extraer**.
3. **No** subas `config.php` de tu PC, ni `sql/`, ni `scripts/`.

Para que no se pueda leer la configuración desde el navegador, en `public_html/config/` y `public_html/includes/` creá un `.htaccess` con:

```
Require all denied
```

## 3. Crear la base de datos

1. cPanel → **Bases de datos MySQL**:
   - creá la base (por ejemplo `usuario_grupo5`);
   - creá un usuario con una contraseña larga;
   - agregá el usuario a la base con **todos los privilegios**.
2. cPanel → **phpMyAdmin** → elegí la base → **Importar** → `backend/sql/schema.sql`.
3. Revisá que estén las tablas (`usuarios`, `dispositivos`, `botones`, `codigos_ir`, `cola_comandos`, `historial`, `estado_esp32`, `configuracion`…).

## 4. Crear `config.php`

En `public_html/config/`, copiá `config.example.php` como `config.php` y completá:

| Clave | Qué poner |
| :--- | :--- |
| `db.host` | `localhost` (casi siempre) |
| `db.nombre`, `db.usuario`, `db.password` | los del paso 3 (cPanel les agrega un prefijo, por ejemplo `usuario_grupo5`) |
| `seguridad.jwt_secreto` | una clave larga al azar (por ejemplo, 64 caracteres) |
| `seguridad.esp32_token` | otra clave larga al azar: la misma que `ESP32_TOKEN` en `config.h` del ESP32 |
| `seguridad.cors_origenes` | `['https://tu-dominio.com', 'https://localhost']` (`https://localhost` es el APK) |
| `app.url_base` | `https://tu-dominio.com` |
| `app.debug` | `false` |

## 5. Cambiar las contraseñas del seed

Las cuentas iniciales tienen la contraseña `password`. La app obliga a cambiarla en el primer ingreso, pero conviene cambiarlas antes desde la base:

1. En tu PC, generá el hash de cada contraseña nueva:

   ```bash
   php scripts/generar_hash.php "UnaClaveLarga2026!"
   ```

   (En Windows con XAMPP: `C:\xampp\php\php.exe scripts\generar_hash.php "UnaClaveLarga2026!"`.) Copiá el hash que empieza con `$2y$`.
2. En phpMyAdmin → SQL, por cada cuenta:

   ```sql
   UPDATE usuarios SET password_hash = 'PEGAR_EL_HASH', debe_cambiar_password = 0 WHERE email = 'admin@grupo5dron.local';
   ```

3. Si no van a usar alguna cuenta del seed, desactivala: `UPDATE usuarios SET activo = 0 WHERE email = '...';`

## 6. Probar

1. `https://tu-dominio.com/aula/` → tiene que aparecer el login. Entrá con el admin.
2. `https://tu-dominio.com/api/esp32.php?action=estado` sin sesión → tiene que responder un error de autenticación (eso confirma que la API anda).
3. `https://tu-dominio.com/config/config.php` → tiene que dar "Prohibido" (403).

## 7. Configurar la URL en las dos apps

- **Web del aula:** no hace falta nada: usa la API del mismo servidor de donde se cargó (la carpeta `api/` al lado de `aula/`).
- **App del aula (APK):** la dirección del servidor va fija dentro del APK; el usuario no la escribe nunca. Mientras esté vacía, el login del APK muestra "Falta configurar el servidor del aula". Para completarla:
  1. En `backend/public-aula/js/config-aula.js`, cambiá la constante por la dirección de la API, con `https` y sin barra al final:
     ```js
     const SERVIDOR_AULA = 'https://tu-dominio.com/api';
     ```
  2. Commiteá y subí el cambio. El CI recompila el APK: bajá el artefacto `Grupo5Aula-app-debug` de esa corrida.
  3. Instalá el APK nuevo en los celulares (encima del anterior; si Android se queja de la firma, desinstalá el viejo primero).
  4. Abrí la app: el aviso ya no aparece y se puede iniciar sesión.

  Si algún día cambia el dominio, se repiten estos pasos (el APK viejo deja de conectarse).
- **ESP32:** en `config.h`, `API_URL` = `https://tu-dominio.com/api/esp32.php` y `ESP32_TOKEN` igual al de `config.php`. Con `CLIENT_INSECURE_MODE true` se conecta sin verificar el certificado (para empezar); para dejarlo seguro, `false` y el certificado raíz del hosting en `ROOT_CA_CERT`.
- **App del dron:** no usa el servidor.

## 8. Si algo no anda

| Problema | Revisar |
| :--- | :--- |
| Error 500 en la API | Datos de la base en `config.php`; versión de PHP (8.0 o más) en "Seleccionar versión de PHP" |
| El APK dice "Falta configurar el servidor del aula" | Falta completar `SERVIDOR_AULA` en `js/config-aula.js` y recompilar (paso 7), o se instaló un APK viejo |
| El APK dice que no puede conectarse | Que `SERVIDOR_AULA` sea `https://…/api` (con `https`) y que `https://localhost` esté en `cors_origenes` |
| "Equipo del aula desconectado" | `API_URL` y `ESP32_TOKEN` del ESP32; que el ESP32 tenga WiFi con internet |
| El login falla siempre | Que se haya importado `schema.sql`; que la cuenta no esté bloqueada (5 intentos: esperar 15 min) |
