<!-- Vista de Sensores — Grupo 5: Control de Sistemas y Dron -->
<div class="sensores-pagina">
    <header class="encabezado">
        <p class="etiqueta etiqueta--linea">Sensores del celular</p>
        <h2 class="titulo-grande">Sensores</h2>
        <p class="bajada">Probá la inclinación del celular. No hace falta el dron. El seguimiento con la cámara está en "Seguimiento".</p>
    </header>

    <!-- 01 — Inclinación en vivo (giroscopio o, si no hay, acelerómetro) -->
    <section class="bloque" id="panel-giro-vivo">
        <p class="etiqueta">01 — Inclinación</p>
        <h3 class="bloque__titulo">🧭 Inclinación en vivo</h3>
        <p class="bloque__texto">Inclinate con el celular y mirá cómo cambian los números: así se va a mover el dron.</p>
        <div class="datos-grandes">
            <div class="dato-grande">
                <span class="dato-grande__valor" id="giro-beta">--</span>
                <span class="dato-grande__etq">Adelante / atrás</span>
            </div>
            <div class="dato-grande">
                <span class="dato-grande__valor" id="giro-gamma">--</span>
                <span class="dato-grande__etq">Costados</span>
            </div>
            <div class="dato-grande">
                <span class="dato-grande__valor" id="giro-alpha">--</span>
                <span class="dato-grande__etq">Giro (brújula)</span>
            </div>
        </div>
        <p id="giro-fuente" class="texto-sm mb-xs">Buscando el sensor de inclinación...</p>
        <p id="giro-estado" class="texto-xs texto-secundario mb-sm">Preparando el sensor...</p>
        <button id="btn-giro-vivo" class="btn btn--secundario" hidden><span class="ico ico--play" aria-hidden="true"></span> Ver lectura en vivo</button>
    </section>

    <!-- Modo técnico: diagnóstico de los sensores -->
    <section class="bloque solo-tecnico">
        <p class="etiqueta">Modo técnico</p>
        <h3 class="bloque__titulo">Diagnóstico de sensores</h3>
        <p class="bloque__texto">Escucha los sensores de verdad durante un segundo y medio (que el navegador tenga la función no alcanza).</p>
        <button id="btn-diagnosticar-sensores" class="btn btn--secundario mb-md">
            <span class="ico ico--buscar" aria-hidden="true"></span> Ejecutar diagnóstico
        </button>
        <div id="panel-resultados-sensores">
            <p class="texto-xs texto-secundario">Sin diagnosticar.</p>
        </div>
    </section>
</div>
