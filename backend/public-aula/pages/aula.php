<!-- Vista del Aula — Grupo 5: Control de Sistemas y Dron -->
<div class="aula-pagina">
    <header class="encabezado">
        <p class="etiqueta etiqueta--linea">Aula</p>
        <h2 class="titulo-grande">Control del aula</h2>
        <p class="bajada">Luces, proyector y aire acondicionado. El equipo del aula recibe las órdenes por internet.</p>
    </header>

    <!-- Estado del equipo del aula (ESP32) -->
    <p id="info-esp32" class="aula-equipo"><span class="punto punto--advertencia" aria-hidden="true"></span>Revisando el equipo del aula...</p>

    <!-- 01 — Luces (relé) -->
    <section class="bloque">
        <p class="etiqueta">01 — Luces</p>
        <h3 class="bloque__titulo">Luces</h3>
        <p class="bloque__texto">Se prenden y apagan con el relé (220 V). Lo habilita el administrador, con supervisión docente.</p>
        <div class="par-botones">
            <button class="btn btn--exito" data-luces="encender"><span class="ico ico--luz" aria-hidden="true"></span> Encender luces</button>
            <button class="btn btn--secundario" data-luces="apagar"><span class="ico ico--encender" aria-hidden="true"></span> Apagar luces</button>
        </div>
    </section>

    <!-- 02 — Proyector y 03 — Aire acondicionado (infrarrojo): los botones los arma aula.js -->
    <section class="bloque">
        <p class="etiqueta">02 — Proyector</p>
        <h3 class="bloque__titulo">Proyector</h3>
        <p class="bloque__texto">Por infrarrojo, con el código del control remoto del proyector de esta aula.</p>
        <div class="par-botones" data-aparato="proyector"><p class="texto-xs texto-secundario">Cargando...</p></div>
        <p class="aula-falta texto-xs texto-secundario" data-falta="proyector" hidden></p>
    </section>

    <section class="bloque">
        <p class="etiqueta">03 — Aire acondicionado</p>
        <h3 class="bloque__titulo">Aire acondicionado</h3>
        <p class="bloque__texto">Por infrarrojo. Subir y bajar la temperatura aparecen cuando se aprenden esos códigos.</p>
        <div class="par-botones" data-aparato="aire"><p class="texto-xs texto-secundario">Cargando...</p></div>
        <p class="aula-falta texto-xs texto-secundario" data-falta="aire" hidden></p>
    </section>

    <!-- 04 — Aprender código (solo docentes y administradores) -->
    <section class="bloque" id="bloque-aprender" hidden>
        <p class="etiqueta">04 — Aprender código</p>
        <h3 class="bloque__titulo">Aprender código</h3>
        <p class="bloque__texto">Guarda el código del control remoto de esta aula para un aparato y una acción.</p>
        <div class="aula-aprender">
            <label class="campo">
                <span class="campo__label">Aparato</span>
                <select id="aprender-aparato" class="campo__input"></select>
            </label>
            <label class="campo">
                <span class="campo__label">Acción</span>
                <select id="aprender-accion" class="campo__input"></select>
            </label>
        </div>
        <ol class="aula-pasos texto-sm texto-secundario">
            <li>Tocá Aprender y esperá el aviso de que el equipo está escuchando.</li>
            <li>Apuntá el control remoto a la ventanita del receptor, a menos de un metro.</li>
            <li>Apretá una vez el botón de esa acción. En el aire, con la temperatura y el modo que quieras guardar.</li>
        </ol>
        <div class="par-botones">
            <button id="btn-aprender" class="btn btn--primario"><span class="ico ico--senal" aria-hidden="true"></span> Aprender</button>
        </div>
        <p id="aprender-estado" class="aula-aprender__estado texto-sm" hidden></p>
    </section>
</div>
