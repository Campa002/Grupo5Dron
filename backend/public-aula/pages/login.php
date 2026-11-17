<div class="login-contenedor">
    <form id="form-login" novalidate>
        <p class="etiqueta">EEST N° 1 · Vicente López</p>
        <h1 class="h3 fw-bold text-uppercase">Grupo 5 · Aula</h1>
        <p class="text-body-secondary mb-4">Iniciá sesión para controlar el aula.</p>

        <div id="aviso-offline-login" class="alert alert-warning small" style="display:none;">
            El primer ingreso requiere conexión a internet para autenticar con el servidor.
        </div>

        <!-- Solo en el APK sin la constante SERVIDOR_AULA (js/config-aula.js) -->
        <div id="aviso-sin-servidor" class="alert alert-warning" role="alert" hidden>
            <p class="fw-semibold mb-1">Falta configurar el servidor del aula</p>
            <p class="small mb-0">Esta versión de la app todavía no tiene la dirección del servidor, así que no puede iniciar sesión. Mientras tanto, usá la web del aula desde el navegador.</p>
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
