<!-- Vista del Aula — Grupo 5: Control de Sistemas y Dron -->
<div class="aula-pagina">
    <header class="mb-3">
        <p class="etiqueta">Aula</p>
        <h1 class="h3 fw-bold text-uppercase">Control del aula</h1>
        <!-- Estado del equipo del aula (ESP32) -->
        <p id="info-esp32" class="estado-equipo small mb-0"><span class="punto punto--advertencia" aria-hidden="true"></span>Revisando el equipo del aula...</p>
    </header>

    <!-- Los tres aparatos: etiqueta, estado en grande y sus botones -->
    <div class="list-group mb-5">
        <!-- 01 — Luces (relé) -->
        <section class="list-group-item py-3">
            <p class="etiqueta">01 — Luces</p>
            <p class="aparato-estado" data-estado="luces"><span class="punto" aria-hidden="true"></span>Sin órdenes todavía</p>
            <div class="d-flex flex-wrap gap-2">
                <button class="btn btn-primary flex-fill" data-luces="encender">Encender</button>
                <button class="btn btn-outline-secondary flex-fill" data-luces="apagar">Apagar</button>
            </div>
            <p class="small text-body-secondary mt-2 mb-0">Usan 220 V: solo con un docente presente.</p>
        </section>

        <!-- 02 — Proyector y 03 — Aire acondicionado (infrarrojo): los botones los arma aula.js -->
        <section class="list-group-item py-3">
            <p class="etiqueta">02 — Proyector</p>
            <p class="aparato-estado" data-estado="proyector"><span class="punto punto--advertencia" aria-hidden="true"></span>Cargando...</p>
            <div class="d-flex flex-wrap gap-2" data-aparato="proyector"></div>
            <p class="small text-body-secondary mt-2 mb-0" data-falta="proyector" hidden></p>
        </section>

        <section class="list-group-item py-3">
            <p class="etiqueta">03 — Aire acondicionado</p>
            <p class="aparato-estado" data-estado="aire"><span class="punto punto--advertencia" aria-hidden="true"></span>Cargando...</p>
            <div class="d-flex flex-wrap gap-2" data-aparato="aire"></div>
            <p class="small text-body-secondary mt-2 mb-0" data-falta="aire" hidden></p>
        </section>
    </div>

    <!-- 04 — Aprender código (solo docentes y administradores), en tres pasos -->
    <section class="mb-4" id="bloque-aprender" data-paso="1" hidden>
        <p class="etiqueta">04 — Aprender código</p>
        <h2 class="h5 fw-bold text-uppercase">Guardar un botón del control remoto</h2>
        <ol class="list-unstyled pasos mb-0">
            <li class="paso" data-n="1">
                <p class="fw-semibold mb-2">Elegí qué botón guardar</p>
                <div class="row g-2">
                    <div class="col-12 col-sm-6">
                        <label class="form-label small" for="aprender-aparato">Aparato</label>
                        <select id="aprender-aparato" class="form-select"></select>
                    </div>
                    <div class="col-12 col-sm-6">
                        <label class="form-label small" for="aprender-accion">Acción</label>
                        <select id="aprender-accion" class="form-select"></select>
                    </div>
                </div>
            </li>
            <li class="paso" data-n="2">
                <p class="fw-semibold mb-2">Tocá Aprender y esperá el aviso "Escuchando"</p>
                <button id="btn-aprender" class="btn btn-outline-primary w-100">Aprender</button>
            </li>
            <li class="paso" data-n="3">
                <p class="fw-semibold mb-1">Apuntá el control al receptor y apretá el botón una vez</p>
                <p class="small text-body-secondary mb-0">A menos de un metro. En el aire, con la temperatura y el modo que quieras guardar.</p>
            </li>
        </ol>
        <p id="aprender-estado" class="alert alert-secondary small mt-3 mb-0" hidden></p>
    </section>
</div>
