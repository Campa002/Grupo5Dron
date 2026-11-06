<div class="inicio-pagina">
    <header class="encabezado">
        <p class="etiqueta etiqueta--linea">Grupo 5 · EEST N° 1 Vicente López</p>
        <h2 class="titulo-grande">Control de sistemas y dron</h2>
        <p class="bajada">
            Hola, <span id="inicio-nombre-usuario">Usuario</span> <span id="inicio-rol-usuario" class="badge badge--info">Rol</span>
        </p>
    </header>

    <!-- Las dos opciones del informe -->
    <div class="inicio-opciones mb-lg">
        <a href="#/aula" id="inicio-acceso-aula" class="opcion">
            <span class="etiqueta">01 — Aula</span>
            <span class="opcion__icono"><span class="ico ico--aula" aria-hidden="true"></span></span>
            <span class="opcion__titulo">Control del Aula</span>
            <span class="acceso__desc opcion__desc">Luces, ventiladores, aire y proyectores por infrarrojo.</span>
            <span class="opcion__ir">Entrar <span class="ico ico--ir" aria-hidden="true"></span></span>
        </a>
        <a href="#/dron" class="opcion">
            <span class="etiqueta">02 — Dron</span>
            <span class="opcion__icono"><span class="ico ico--dron" aria-hidden="true"></span></span>
            <span class="opcion__titulo">Control del Dron</span>
            <span class="opcion__desc">Video, joysticks, inclinación del celular y seguimiento.</span>
            <span class="opcion__ir">Entrar <span class="ico ico--ir" aria-hidden="true"></span></span>
        </a>
    </div>

    <!-- Modo técnico: accesos a las herramientas y estado del ESP32 -->
    <div class="solo-tecnico">
        <p class="etiqueta">Modo técnico</p>
        <div class="grilla-accesos mb-lg">
            <a href="#/sensores" class="acceso">
                <span class="acceso__icono" style="font-size: 2.2rem;"><span class="ico ico--sensores" aria-hidden="true"></span></span>
                <span class="acceso__titulo">Sensores</span>
                <span class="acceso__desc">Inclinación y detección</span>
            </a>
            <a href="#/prueba-tello" class="acceso">
                <span class="acceso__icono" style="font-size: 2.2rem;"><span class="ico ico--senal" aria-hidden="true"></span></span>
                <span class="acceso__titulo">Prueba Tello</span>
                <span class="acceso__desc">Conexión, telemetría y video</span>
            </a>
            <a href="#/config-dron" class="acceso">
                <span class="acceso__icono" style="font-size: 2.2rem;"><span class="ico ico--llave-ajuste" aria-hidden="true"></span></span>
                <span class="acceso__titulo">Config. Dron</span>
                <span class="acceso__desc">Perfiles y ajustes</span>
            </a>
            <a href="#/admin" class="acceso solo-admin">
                <span class="acceso__icono" style="font-size: 2.2rem;"><span class="ico ico--engranaje" aria-hidden="true"></span></span>
                <span class="acceso__titulo">Administración</span>
                <span class="acceso__desc">Dispositivos, usuarios, códigos IR</span>
            </a>
            <a href="#/acerca" class="acceso">
                <span class="acceso__icono" style="font-size: 2.2rem;"><span class="ico ico--info" aria-hidden="true"></span></span>
                <span class="acceso__titulo">Acerca de</span>
                <span class="acceso__desc">Integrantes Grupo 5 y docentes</span>
            </a>
        </div>

        <!-- Estado del ESP32 del aula -->
        <div class="tarjeta" id="inicio-tarjeta-esp32">
            <div class="flex justify-between items-center mb-sm">
                <div class="tarjeta__titulo" style="margin-bottom: 0;">Estado del ESP32 del Aula</div>
                <button class="btn btn--secundario btn--icono" onclick="Aula.actualizarEstadoEsp32 ? Aula.actualizarEstadoEsp32() : location.reload()" title="Actualizar" aria-label="Actualizar"><span class="ico ico--recargar" aria-hidden="true"></span></button>
            </div>
            <div id="inicio-esp32-resumen" class="texto-sm texto-secundario">
                Consultando estado del microcontrolador...
            </div>
        </div>
    </div>
</div>
