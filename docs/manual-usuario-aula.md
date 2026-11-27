# Manual de usuario: app del aula

App "Grupo 5 Aula" (o la web `/aula/` del servidor). Controla tres cosas del aula: **luces**, **proyector** y **aire acondicionado**.

## Cómo funciona

El celular manda la orden al servidor por internet. El equipo del aula (un ESP32 en una caja triangular) consulta el servidor cada 2 segundos y la ejecuta:

- **Luces:** con un relé que corta la fase de la lámpara.
- **Proyector y aire:** por infrarrojo, con los códigos de sus controles remotos, que se aprenden una vez por aula. Los dos LEDs de la caja emiten siempre juntos el mismo código: uno apunta al proyector y el otro al aire, y cada aparato responde solo a su código.

## Iniciar sesión

- Email y contraseña. La dirección del servidor no se escribe: la web usa el servidor de donde se abrió y el APK la trae fija.
- Si el APK muestra **"Falta configurar el servidor del aula"**, esa versión todavía no tiene la dirección del servidor y no deja iniciar sesión: usá la web del aula desde el navegador o pedile al administrador el APK nuevo (ver `despliegue-hosting.md`, paso 7).
- En el primer ingreso obliga a cambiar la contraseña.
- Roles: **docente** (usa el aula y aprende códigos), **administrador** (además, la administración) y **usuario** (usa el aula, no aprende códigos).

## Pantalla del aula

- Arriba: **Equipo del aula en línea** (verde) o desconectado (rojo). Si está desconectado, las órdenes no se ejecutan.
- **01 — Luces:** Encender luces / Apagar luces. Si dice que el relé está desactivado, lo tiene que habilitar el administrador.
- **02 — Proyector:** Encender / Apagar.
- **03 — Aire acondicionado:** Encender / Apagar y, cuando están aprendidos, Subir y Bajar temperatura.
- Un botón gris dice que esa acción todavía no tiene código: abajo aparece "Falta aprender: …".
- Al tocar un botón aparece un aviso y, cuando el equipo lo hace, "listo". Si el equipo no responde en 20 segundos, avisa.

## Aprender un código (docentes y administradores)

En **04 — Aprender código**:

1. Elegí el **aparato** (Proyector o Aire acondicionado) y la **acción**.
2. Tocá **Aprender** y esperá "Escuchando".
3. Apuntá el control remoto a la ventanita del receptor de la caja, a menos de un metro, y apretá **una vez** el botón de esa acción.
4. En unos segundos dice "Código guardado (protocolo …, … bits)". Probalo con su botón.

Si dice "No llegó ningún código", probá de nuevo más cerca. Si dice "El equipo del aula no respondió", revisá que esté prendido y con internet.

**Aires acondicionados:** el control manda el estado completo (temperatura, modo, ventilador). Aprendé "Encender" con la temperatura y el modo que querés. "Subir temperatura" deja siempre la temperatura que tenía el control cuando lo aprendiste (no sube de a un grado).

## Administración (solo administradores)

- **Historial:** cada orden con fecha, aparato, acción, estado y resultado.
- **Usuarios:** crear, ver y desactivar cuentas.
- **Configuración:** habilitar o deshabilitar el relé de 220 V (pide confirmación; solo con supervisión docente).

## Cambiar la contraseña

Menú (arriba a la izquierda) → Cambiar contraseña. Arriba del menú figura quién está usando la app; ahí también está Cerrar sesión. "Administración" aparece solo para el administrador.
