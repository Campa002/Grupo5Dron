<!-- Mis objetos — Grupo 5: Control de Sistemas y Dron -->
<div class="objetos-pagina">
    <header class="mb-4">
        <p class="etiqueta">Seguimiento</p>
        <h1 class="h3 fw-bold text-uppercase">Mis objetos</h1>
        <p class="text-body-secondary mb-0">Cargá de 3 a 15 fotos de un objeto y ponele nombre. El dron lo va a buscar y seguir.</p>
    </header>

    <!-- 01 — Agregar -->
    <section class="mb-5">
        <p class="etiqueta">01 — Agregar</p>
        <h2 class="h5 fw-bold text-uppercase">Nuevo objeto</h2>
        <p class="small text-body-secondary">
            Sacale fotos desde distintos lados y con buena luz. La app busca el objeto en cada foto; si no lo encuentra, usa la foto entera.
        </p>
        <button id="btn-agregar-objeto" class="btn btn-primary">Agregar objeto</button>

        <form id="form-objeto" hidden novalidate>
            <div class="mb-3">
                <label class="form-label" for="objeto-nombre">Nombre</label>
                <input id="objeto-nombre" class="form-control" type="text" maxlength="40" placeholder="Ej: mochila roja" autocomplete="off">
            </div>
            <div class="d-flex flex-wrap gap-2 mb-2">
                <label class="btn btn-outline-secondary flex-fill" for="objeto-galeria">Elegir de la galería</label>
                <label class="btn btn-outline-secondary flex-fill" for="objeto-camara">Sacar foto</label>
            </div>
            <input id="objeto-galeria" class="visually-hidden" type="file" accept="image/*" multiple>
            <input id="objeto-camara" class="visually-hidden" type="file" accept="image/*" capture="environment">
            <p id="objeto-cuenta" class="small mb-2" role="status">Todavía no hay fotos (de 3 a 15).</p>
            <ul id="objeto-fotos" class="fotos-objeto"></ul>
            <div id="objeto-error" class="alert alert-danger mb-2" role="alert" hidden></div>
            <p id="objeto-progreso" class="small text-body-secondary mb-2" hidden></p>
            <div class="d-flex flex-wrap gap-2">
                <button type="submit" id="btn-guardar-objeto" class="btn btn-primary flex-fill">Guardar objeto</button>
                <button type="button" id="btn-cancelar-objeto" class="btn btn-outline-secondary flex-fill">Cancelar</button>
            </div>
        </form>
        <div id="objeto-resultado" class="alert alert-info mt-2" hidden></div>
    </section>

    <!-- 02 — Guardados -->
    <section class="mb-5">
        <p class="etiqueta">02 — Guardados</p>
        <h2 class="h5 fw-bold text-uppercase">Objetos guardados</h2>
        <p class="small text-body-secondary">Para seguir uno, elegilo en "¿Qué seguir?" en la cabina o en Seguimiento.</p>
        <ul id="lista-objetos" class="list-group">
            <li class="list-group-item small text-body-secondary">Cargando...</li>
        </ul>
    </section>
</div>
