<!-- Vista del Aula — Grupo 5: Control de Sistemas y Dron -->
<div class="aula-pagina">
    <header class="mb-4">
        <p class="etiqueta">Aula</p>
        <h1 class="h3 fw-bold text-uppercase">Control del aula</h1>
        <p class="text-body-secondary mb-2">Luces, proyector y aire acondicionado. El equipo del aula recibe las órdenes por internet.</p>
        <!-- Estado del equipo del aula (ESP32) -->
        <p id="info-esp32" class="small text-body-secondary mb-0"><span class="punto punto--advertencia" aria-hidden="true"></span>Revisando el equipo del aula...</p>
    </header>

    <div class="list-group mb-5">
        <!-- 01 — Luces (relé) -->
        <section class="list-group-item py-3">
            <p class="etiqueta">01 — Luces</p>
            <h2 class="h5 fw-bold text-uppercase">Luces</h2>
            <p class="small text-body-secondary">Se prenden y apagan con el relé (220 V). Lo habilita el administrador, con supervisión docente.</p>
            <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-success flex-fill" data-luces="encender">Encender luces</button>
                <button class="btn btn-outline-secondary flex-fill" data-luces="apagar">Apagar luces</button>
            </div>
        </section>

        <!-- 02 — Proyector y 03 — Aire acondicionado (infrarrojo): los botones los arma aula.js -->
        <section class="list-group-item py-3">
            <p class="etiqueta">02 — Proyector</p>
            <h2 class="h5 fw-bold text-uppercase">Proyector</h2>
            <p class="small text-body-secondary">Por infrarrojo, con el código del control remoto del proyector de esta aula.</p>
            <div class="d-flex flex-wrap gap-2" data-aparato="proyector"><p class="small text-body-secondary mb-0">Cargando...</p></div>
            <p class="small text-body-secondary mt-2 mb-0" data-falta="proyector" hidden></p>
        </section>

        <section class="list-group-item py-3">
            <p class="etiqueta">03 — Aire acondicionado</p>
            <h2 class="h5 fw-bold text-uppercase">Aire acondicionado</h2>
            <p class="small text-body-secondary">Por infrarrojo. Subir y bajar la temperatura aparecen cuando se aprenden esos códigos.</p>
            <div class="d-flex flex-wrap gap-2" data-aparato="aire"><p class="small text-body-secondary mb-0">Cargando...</p></div>
            <p class="small text-body-secondary mt-2 mb-0" data-falta="aire" hidden></p>
        </section>
    </div>

    <!-- 04 — Aprender código (solo docentes y administradores) -->
    <section class="mb-4" id="bloque-aprender" hidden>
        <p class="etiqueta">04 — Aprender código</p>
        <h2 class="h5 fw-bold text-uppercase">Aprender código</h2>
        <p class="small text-body-secondary">Guarda el código del control remoto de esta aula para un aparato y una acción.</p>
        <div class="row g-2 mb-3">
            <div class="col-12 col-sm-6">
                <label class="form-label small" for="aprender-aparato">Aparato</label>
                <select id="aprender-aparato" class="form-select"></select>
            </div>
            <div class="col-12 col-sm-6">
                <label class="form-label small" for="aprender-accion">Acción</label>
                <select id="aprender-accion" class="form-select"></select>
            </div>
        </div>
        <ol class="small text-body-secondary ps-3">
            <li>Tocá Aprender y esperá el aviso de que el equipo está escuchando.</li>
            <li>Apuntá el control remoto a la ventanita del receptor, a menos de un metro.</li>
            <li>Apretá una vez el botón de esa acción. En el aire, con la temperatura y el modo que quieras guardar.</li>
        </ol>
        <button id="btn-aprender" class="btn btn-primary w-100">Aprender</button>
        <p id="aprender-estado" class="alert alert-secondary small mt-3 mb-0" hidden></p>
    </section>
</div>
