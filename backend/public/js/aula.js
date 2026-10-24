/**
 * Módulo Control del Aula — Grupo 5: Control de Sistemas y Dron
 * 
 * Muestra dispositivos del aula con sus botones de acción,
 * envía comandos IR/relé y gestiona el modo aprendizaje.
 */

// eslint-disable-next-line no-unused-vars
const Aula = (() => {
    'use strict';

    let dispositivos = [];
    let intervaloEstado = null;

    // Mapa de iconos para tipos de dispositivo
    const ICONOS_TIPO = {
        luz: '💡', ventilador: '🌀', aire: '❄️',
        proyector: '📽️', otro: '🔌', dispositivo: '🎛️',
    };
    const ICONOS_BOTON = {
        'power-on': '🟢', 'power-off': '🔴', 'temp-up': '🔼',
        'temp-down': '🔽', 'speed-up': '⏫', 'speed-down': '⏬',
        'volume-up': '🔊', 'volume-down': '🔉', 'mute': '🔇',
        'cold': '❄️', 'hot': '🔥', 'fan': '🌀',
        'hdmi': '📺', 'vga': '🖥️', 'boton': '⚡',
    };

    /**
     * Inicializa la página del aula.
     */
    async function inicializar() {
        await cargarDispositivos();
        iniciarMonitoreoEstado();
    }

    /**
     * Carga y renderiza los dispositivos del aula.
     */
    async function cargarDispositivos() {
        const contenedor = document.getElementById('lista-dispositivos');
        if (!contenedor) return;

        contenedor.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div><p>Cargando dispositivos...</p></div>';

        try {
            const respuesta = await API.dispositivos.listar();
            dispositivos = respuesta.dispositivos || [];
            renderizarDispositivos(contenedor);
        } catch (error) {
            contenedor.innerHTML = `<div class="tarjeta texto-centro"><p class="texto-error">Error: ${error.message}</p><button class="btn btn--secundario mt-md" onclick="Aula.cargarDispositivos()">Reintentar</button></div>`;
        }
    }

    /**
     * Renderiza la lista de dispositivos.
     */
    function renderizarDispositivos(contenedor) {
        if (dispositivos.length === 0) {
            contenedor.innerHTML = '<div class="tarjeta texto-centro"><p class="texto-secundario">No hay dispositivos configurados.</p><p class="texto-xs texto-secundario mt-sm">Un administrador puede agregarlos desde el panel de administración.</p></div>';
            return;
        }

        contenedor.innerHTML = dispositivos.map((disp) => `
            <div class="dispositivo" id="dispositivo-${disp.id}" data-id="${disp.id}">
                <div class="dispositivo__header" onclick="Aula.toggleDispositivo(${disp.id})">
                    <span class="dispositivo__icono">${ICONOS_TIPO[disp.tipo] || ICONOS_TIPO.dispositivo}</span>
                    <div>
                        <div class="dispositivo__nombre">${disp.nombre}</div>
                        <div class="dispositivo__tipo">${disp.tipo}</div>
                    </div>
                    <span class="dispositivo__flecha">▼</span>
                </div>
                <div class="dispositivo__botones">
                    ${(disp.botones || []).map((btn) => `
                        <button class="dispositivo__btn ${!btn.tiene_codigo_ir ? 'dispositivo__btn--sin-codigo' : ''}"
                                onclick="Aula.enviarComando(${btn.id}, ${disp.id})"
                                title="${btn.tiene_codigo_ir ? 'Enviar comando' : 'Sin código IR asignado'}">
                            <span class="dispositivo__btn-icono">${ICONOS_BOTON[btn.icono] || '⚡'}</span>
                            <span class="dispositivo__btn-nombre">${btn.nombre}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }

    /**
     * Expande/colapsa un dispositivo.
     */
    function toggleDispositivo(id) {
        const elem = document.getElementById(`dispositivo-${id}`);
        if (elem) {
            elem.classList.toggle('expandido');
        }
    }

    /**
     * Envía un comando IR para un botón.
     */
    async function enviarComando(botonId, dispositivoId) {
        try {
            const respuesta = await API.comandos.enviar({
                tipo: 'ir',
                boton_id: botonId,
            });

            App.mostrarToast('Comando enviado ✓', 'exito');

            // Seguir el estado del comando
            seguirEstadoComando(respuesta.comando_id);
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    /**
     * Envía un comando de relé.
     * @param {string} accion - 'encender' o 'apagar'
     * @param {number} canal - Canal del relé (1 o 2)
     */
    async function enviarComandoRele(accion, canal) {
        try {
            await API.comandos.enviar({
                tipo: 'rele',
                parametros: { accion, canal },
            });
            App.mostrarToast(`Relé canal ${canal}: ${accion}`, 'exito');
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    /**
     * Activa el modo aprendizaje IR para un botón.
     */
    async function activarAprendizaje(botonId) {
        if (!Auth.esDocente()) {
            App.mostrarToast('Solo docentes y administradores pueden usar el modo aprendizaje.', 'advertencia');
            return;
        }

        const confirmado = confirm(
            'MODO APRENDIZAJE IR\n\n' +
            '1. Apuntá el control remoto al receptor IR del ESP32.\n' +
            '2. Presioná el botón del control remoto que querés capturar.\n' +
            '3. El ESP32 capturará la señal y la guardará.\n\n' +
            '¿Activar modo aprendizaje?'
        );

        if (!confirmado) return;

        try {
            await API.comandos.enviar({
                tipo: 'aprendizaje',
                boton_id: botonId,
                parametros: { boton_id: botonId },
            });
            App.mostrarToast('Modo aprendizaje activado. Apuntá el control remoto al receptor IR.', 'info');
        } catch (error) {
            App.mostrarToast(error.message, 'error');
        }
    }

    /**
     * Sigue el estado de un comando hasta que se ejecute o falle.
     */
    async function seguirEstadoComando(comandoId) {
        let intentos = 0;
        const maxIntentos = 15;

        const intervalo = setInterval(async () => {
            intentos++;
            if (intentos >= maxIntentos) {
                clearInterval(intervalo);
                return;
            }

            try {
                const resp = await API.comandos.estado(comandoId);
                const estado = resp.comando.estado;

                if (estado === 'ejecutado') {
                    clearInterval(intervalo);
                    App.mostrarToast('✓ Comando ejecutado correctamente', 'exito');
                } else if (estado === 'error') {
                    clearInterval(intervalo);
                    App.mostrarToast(`✗ Error: ${resp.comando.resultado || 'Error desconocido'}`, 'error');
                }
            } catch (e) {
                // Ignorar errores de seguimiento
            }
        }, 2000);
    }

    /**
     * Inicia el monitoreo del estado del ESP32.
     */
    function iniciarMonitoreoEstado() {
        actualizarEstadoEsp32();
        intervaloEstado = setInterval(actualizarEstadoEsp32, 5000);
    }

    /**
     * Detiene el monitoreo.
     */
    function detenerMonitoreo() {
        if (intervaloEstado) {
            clearInterval(intervaloEstado);
            intervaloEstado = null;
        }
    }

    /**
     * Actualiza el indicador del ESP32 en el header.
     */
    async function actualizarEstadoEsp32() {
        try {
            const resp = await API.esp32.estado();
            const estado = resp.estado;
            const indicador = document.getElementById('indicador-esp32');

            if (indicador && estado) {
                indicador.className = `indicador indicador--${estado.en_linea ? 'online' : 'offline'}`;
                indicador.title = estado.en_linea
                    ? `ESP32 en línea — IP: ${estado.ip_local || 'N/A'} — RSSI: ${estado.rssi || 'N/A'} dBm`
                    : `ESP32 desconectado — Último heartbeat: ${estado.ultimo_heartbeat || 'Nunca'}`;
            }

            // Actualizar info en la página del aula si está visible
            const infoEsp = document.getElementById('info-esp32');
            if (infoEsp && estado) {
                infoEsp.innerHTML = `
                    <span class="badge badge--${estado.en_linea ? 'exito' : 'error'}">
                        ${estado.en_linea ? '🟢 En línea' : '🔴 Desconectado'}
                    </span>
                    ${estado.ip_local ? `<span class="texto-xs texto-secundario">IP: ${estado.ip_local}</span>` : ''}
                    ${estado.modo_aprendizaje ? '<span class="badge badge--advertencia">Modo aprendizaje</span>' : ''}
                `;
            }
        } catch (e) {
            // Silenciar errores de monitoreo
        }
    }

    /**
     * Limpia recursos al salir de la página.
     */
    function destruir() {
        detenerMonitoreo();
    }

    return {
        inicializar,
        cargarDispositivos,
        toggleDispositivo,
        enviarComando,
        enviarComandoRele,
        activarAprendizaje,
        destruir,
    };
})();
