<!-- Mis objetos — Grupo 5: Control de Sistemas y Dron -->
<div class="objetos-pagina">
    <header class="encabezado">
        <p class="etiqueta etiqueta--linea">Seguimiento</p>
        <h2 class="titulo-grande">Mis objetos</h2>
        <p class="bajada">Cargá de 3 a 15 fotos de un objeto y ponele nombre. El dron lo va a buscar y seguir.</p>
    </header>

    <!-- 01 — Agregar -->
    <section class="bloque">
        <p class="etiqueta">01 — Agregar</p>
        <h3 class="bloque__titulo">Nuevo objeto</h3>
        <p class="bloque__texto">
            Sacale fotos desde distintos lados y con buena luz. La app busca el objeto en cada foto; si no lo encuentra, usa la foto entera.
        </p>
        <button id="btn-agregar-objeto" class="btn btn--primario"><span class="ico ico--mas" aria-hidden="true"></span> Agregar objeto</button>

        <form id="form-objeto" class="form-objeto" hidden novalidate>
            <div class="campo">
                <label class="campo__label" for="objeto-nombre">Nombre</label>
                <input id="objeto-nombre" class="campo__input" type="text" maxlength="40" placeholder="Ej: mochila roja" autocomplete="off">
            </div>
            <div class="par-botones mb-sm">
                <label class="btn btn--secundario" for="objeto-galeria"><span class="ico ico--lista" aria-hidden="true"></span> Elegir de la galería</label>
                <label class="btn btn--secundario" for="objeto-camara"><span class="ico ico--camara" aria-hidden="true"></span> Sacar foto</label>
            </div>
            <input id="objeto-galeria" class="entrada-oculta" type="file" accept="image/*" multiple>
            <input id="objeto-camara" class="entrada-oculta" type="file" accept="image/*" capture="environment">
            <p id="objeto-cuenta" class="texto-sm mb-sm" role="status">Todavía no hay fotos (de 3 a 15).</p>
            <ul id="objeto-fotos" class="fotos-objeto"></ul>
            <div id="objeto-error" class="alerta alerta--error mb-sm" role="alert" hidden></div>
            <p id="objeto-progreso" class="texto-sm texto-secundario mb-sm" hidden></p>
            <div class="par-botones">
                <button type="submit" id="btn-guardar-objeto" class="btn btn--primario"><span class="ico ico--guardar" aria-hidden="true"></span> Guardar objeto</button>
                <button type="button" id="btn-cancelar-objeto" class="btn btn--secundario">Cancelar</button>
            </div>
        </form>
        <div id="objeto-resultado" class="alerta alerta--info mt-sm" hidden></div>
    </section>

    <!-- 02 — Guardados -->
    <section class="bloque">
        <p class="etiqueta">02 — Guardados</p>
        <h3 class="bloque__titulo">Objetos guardados</h3>
        <p class="bloque__texto">Para seguir uno, elegilo en "¿Qué seguir?" en la cabina o en Sensores.</p>
        <ul id="lista-objetos" class="lista-objetos">
            <li class="texto-sm texto-secundario">Cargando...</li>
        </ul>
    </section>
</div>
