<div class="admin-pagina">
    <header class="mb-4">
        <p class="etiqueta">Solo administradores</p>
        <h1 class="h3 fw-bold text-uppercase">Administración</h1>
        <p class="text-body-secondary mb-0">Historial de órdenes, usuarios y habilitación del relé.</p>
    </header>

    <!-- Pestañas de administración (admin.js marca la activa) -->
    <nav class="nav nav-pills nav-fill gap-2 mb-4" aria-label="Secciones">
        <button class="nav-link border admin-tab activo" data-tab="historial">Historial</button>
        <button class="nav-link border admin-tab" data-tab="usuarios">Usuarios</button>
        <button class="nav-link border admin-tab" data-tab="config">Configuración</button>
    </nav>

    <!-- Contenido dinámico inyectado por admin.js -->
    <div id="admin-contenido">
        <div class="text-center py-5 text-body-secondary">
            <div class="spinner-border mb-3" role="status" aria-hidden="true"></div>
            <p>Cargando...</p>
        </div>
    </div>
</div>
