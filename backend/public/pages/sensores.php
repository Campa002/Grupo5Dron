<!-- Vista de Sensores — Grupo 5: Control de Sistemas y Dron -->
<div class="sensores-pagina">
    <header class="mb-4">
        <p class="etiqueta">Sensores del celular</p>
        <h1 class="h3 fw-bold text-uppercase">Sensores</h1>
        <p class="text-body-secondary mb-0">Probá la inclinación del celular. No hace falta el dron. El seguimiento con la cámara está en "Seguimiento".</p>
    </header>

    <!-- 01 — Inclinación en vivo (giroscopio o, si no hay, acelerómetro) -->
    <section class="mb-5" id="panel-giro-vivo">
        <p class="etiqueta">01 — Inclinación</p>
        <h2 class="h5 fw-bold text-uppercase">Inclinación en vivo</h2>
        <p class="small text-body-secondary">Inclinate con el celular y mirá cómo cambian los números: así se va a mover el dron.</p>
        <div class="row text-center g-2 mb-3">
            <div class="col">
                <div class="border rounded py-3">
                    <span class="d-block fs-2 fw-bold font-monospace" id="giro-beta">--</span>
                    <span class="small text-body-secondary">Adelante / atrás</span>
                </div>
            </div>
            <div class="col">
                <div class="border rounded py-3">
                    <span class="d-block fs-2 fw-bold font-monospace" id="giro-gamma">--</span>
                    <span class="small text-body-secondary">Costados</span>
                </div>
            </div>
            <div class="col">
                <div class="border rounded py-3">
                    <span class="d-block fs-2 fw-bold font-monospace" id="giro-alpha">--</span>
                    <span class="small text-body-secondary">Giro (brújula)</span>
                </div>
            </div>
        </div>
        <p id="giro-fuente" class="small mb-1">Buscando el sensor de inclinación...</p>
        <p id="giro-estado" class="small text-body-secondary mb-2">Preparando el sensor...</p>
        <button id="btn-giro-vivo" class="btn btn-outline-secondary" hidden>Ver lectura en vivo</button>
    </section>

    <!-- Modo técnico: diagnóstico de los sensores -->
    <section class="mb-5 solo-tecnico">
        <p class="etiqueta">Modo técnico</p>
        <h2 class="h5 fw-bold text-uppercase">Diagnóstico de sensores</h2>
        <p class="small text-body-secondary">Escucha los sensores de verdad durante un segundo y medio (que el navegador tenga la función no alcanza).</p>
        <button id="btn-diagnosticar-sensores" class="btn btn-outline-secondary mb-3">Ejecutar diagnóstico</button>
        <div id="panel-resultados-sensores" class="list-group">
            <p class="small text-body-secondary mb-0">Sin diagnosticar.</p>
        </div>
    </section>
</div>
