<div class="login-contenedor">
    <form id="form-cambiar-password" novalidate>
        <p class="etiqueta">Cuenta</p>
        <h1 class="h3 fw-bold text-uppercase">Cambiar contraseña</h1>
        <p class="text-body-secondary mb-4">Grupo 5 · EEST N° 1</p>

        <div id="aviso-cambio-obligatorio" class="alert alert-warning small" style="display:none;">
            Tu cuenta tiene una contraseña temporal. Para seguir, elegí una nueva.
        </div>

        <div class="mb-3">
            <label class="form-label" for="password-actual">Contraseña actual</label>
            <input class="form-control" id="password-actual" type="password" autocomplete="current-password" required>
        </div>

        <div class="mb-3">
            <label class="form-label" for="password-nueva">Nueva contraseña (mínimo 8 caracteres)</label>
            <input class="form-control" id="password-nueva" type="password" autocomplete="new-password" minlength="8" required>
        </div>

        <div class="mb-4">
            <label class="form-label" for="password-repetida">Repetí la nueva contraseña</label>
            <input class="form-control" id="password-repetida" type="password" autocomplete="new-password" minlength="8" required>
        </div>

        <button type="submit" class="btn btn-primary w-100">Guardar contraseña</button>
    </form>
</div>
