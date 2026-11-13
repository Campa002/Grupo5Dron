<div class="login-contenedor">
    <form id="form-login" novalidate>
        <p class="etiqueta">EEST N° 1 · Vicente López</p>
        <h1 class="h3 fw-bold text-uppercase">Grupo 5 · Aula</h1>
        <p class="text-body-secondary mb-4">Iniciá sesión para controlar el aula.</p>

        <div id="aviso-offline-login" class="alert alert-warning small" style="display:none;">
            El primer ingreso requiere conexión a internet para autenticar con el servidor.
        </div>

        <div id="contenedor-api-url" class="mb-3" style="display:none;">
            <label class="form-label" for="login-api-url">URL del servidor</label>
            <input class="form-control" id="login-api-url" type="url" placeholder="https://mihosting.com/api" autocomplete="url">
            <div class="form-text">Ingresá la dirección base de la API del servidor (requerido en APK).</div>
        </div>

        <div class="mb-3">
            <label class="form-label" for="login-email">Correo electrónico</label>
            <input class="form-control" id="login-email" type="email" placeholder="usuario@grupo5dron.local" required autocomplete="email">
        </div>

        <div class="mb-4">
            <label class="form-label" for="login-password">Contraseña</label>
            <input class="form-control" id="login-password" type="password" required autocomplete="current-password">
        </div>

        <button type="submit" class="btn btn-primary w-100">Ingresar</button>
    </form>
</div>
