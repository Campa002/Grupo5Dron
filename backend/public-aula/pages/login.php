<div class="login-contenedor">
    <form id="form-login" class="login-form tarjeta" novalidate>
        <div class="login-form__logo"><span class="ico ico--rayo" aria-hidden="true"></span></div>
        <p class="etiqueta texto-centro">EEST N° 1 · Vicente López</p>
        <h2 class="login-form__titulo">Grupo 5</h2>
        <p class="login-form__subtitulo">Control del aula</p>

        <div id="aviso-offline-login" class="alerta alerta--advertencia mb-md" style="display:none; font-size:0.85rem;">
            <span class="ico ico--alerta" aria-hidden="true"></span> El primer ingreso requiere conexión a internet para autenticar con el servidor.
        </div>

        <div id="contenedor-api-url" class="campo mb-md" style="display:none;">
            <label class="campo__label" for="login-api-url">URL del servidor</label>
            <input class="campo__input" id="login-api-url" type="url" placeholder="https://mihosting.com/api" autocomplete="url">
            <span class="campo__ayuda">
                Ingresá la dirección base de la API del servidor (requerido en APK).
            </span>
        </div>

        <div class="campo mb-md">
            <label class="campo__label" for="login-email">Correo electrónico</label>
            <input class="campo__input" id="login-email" type="email" placeholder="usuario@grupo5dron.local" required autocomplete="email">
        </div>

        <div class="campo mb-md">
            <label class="campo__label" for="login-password">Contraseña</label>
            <input class="campo__input" id="login-password" type="password" placeholder="••••••••" required autocomplete="current-password">
        </div>

        <button type="submit" class="btn btn--primario btn--bloque mt-lg">Ingresar</button>
    </form>
</div>
