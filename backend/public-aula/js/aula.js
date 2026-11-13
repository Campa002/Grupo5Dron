/**
 * Módulo Control del Aula — Grupo 5: Control de Sistemas y Dron
 *
 * El aula controla solo 3 cosas:
 *  - Luces: con el relé (GPIO 26), comandos de tipo "rele".
 *  - Proyector y aire acondicionado: por infrarrojo (GPIO 18, los 2 LEDs emiten juntos el mismo código;
 *    cada aparato responde solo al suyo). Comandos de tipo "ir" con el código aprendido de cada acción.
 * "Aprender código" (docentes y administradores): el ESP32 prende el receptor KY-022 (GPIO 15), captura
 * el código del control remoto y lo guarda en el servidor para esa acción.
 */

// eslint-disable-next-line no-unused-vars
const Aula = (() => {
    'use strict';

    const ESPERA_EQUIPO_MS = 20000;   // el ESP32 consulta cada ~2 s: si no tomó la orden en 20 s, no está andando
    const ESPERA_CODIGO_MS = 25000;   // el receptor escucha 15 s (APRENDIZAJE_TIMEOUT_MS) + margen
    const ICONO_ACCION = { encender: 'encender', apagar: 'encender', subir_temp: 'chevron-arriba', bajar_temp: 'chevron-abajo' };
    const ES_TEMPERATURA = a => a === 'subir_temp' || a === 'bajar_temp';

    let dispositivos = [];
    let intervaloEstado = null;
    let aprendiendo = false;
    let destruido = false;

    const $ = sel => document.querySelector(`.aula-pagina ${sel}`);
    const esperar = ms => new Promise(r => setTimeout(r, ms));

    function icono(nombre) {
        const s = document.createElement('span');
        s.className = `ico ico--${nombre}`;
        s.setAttribute('aria-hidden', 'true');
        return s;
    }

    function textoConPunto(el, color, texto) {
        const p = document.createElement('span');
        p.className = `punto punto--${color}`;
        p.setAttribute('aria-hidden', 'true');
        el.replaceChildren(p, texto);
    }

    async function inicializar() {
        destruido = false;
        document.querySelectorAll('.aula-pagina [data-luces]').forEach(b => {
            b.addEventListener('click', () => enviarLuces(b.dataset.luces, b));
        });
        if (Auth.esDocente()) {
            $('#bloque-aprender').hidden = false;
            $('#aprender-aparato').addEventListener('change', llenarAcciones);
            $('#btn-aprender').addEventListener('click', aprender);
        }
        await cargarDispositivos();
        iniciarMonitoreoEstado();
    }

    /** Carga los aparatos (proyector y aire) con sus acciones y si tienen código aprendido. */
    async function cargarDispositivos() {
        try {
            const respuesta = await API.dispositivos.listar();
            if (destruido) return;
            dispositivos = respuesta.dispositivos || [];
            renderizarAparatos();
            if (Auth.esDocente()) llenarAparatos();
        } catch (error) {
            document.querySelectorAll('.aula-pagina [data-aparato]').forEach(c => {
                const p = document.createElement('p');
                p.className = 'texto-sm texto-error';
                p.textContent = `No se pudieron cargar los aparatos: ${error.message}`;
                c.replaceChildren(p);
            });
        }
    }

    function renderizarAparatos() {
        for (const tipo of ['proyector', 'aire']) {
            const caja = $(`[data-aparato="${tipo}"]`);
            const falta = $(`[data-falta="${tipo}"]`);
            if (!caja) continue;
            const disp = dispositivos.find(d => d.tipo === tipo);
            if (!disp) {
                const p = document.createElement('p');
                p.className = 'texto-sm texto-secundario';
                p.textContent = 'Este aparato no está en la base de datos (revisá schema.sql).';
                caja.replaceChildren(p);
                continue;
            }
            const sinCodigo = [];
            const botones = [];
            for (const b of disp.botones || []) {
                if (!b.tiene_codigo_ir) sinCodigo.push(b.nombre.toLowerCase());
                // Subir y bajar la temperatura aparecen solo cuando tienen su código
                if (ES_TEMPERATURA(b.accion) && !b.tiene_codigo_ir) continue;
                const btn = document.createElement('button');
                btn.className = `btn ${b.accion === 'encender' ? 'btn--exito' : 'btn--secundario'}`;
                btn.disabled = !b.tiene_codigo_ir;
                btn.title = b.tiene_codigo_ir ? `Código ${b.protocolo || ''}`.trim() : 'Sin código: hay que aprenderlo';
                btn.append(icono(ICONO_ACCION[b.accion] || 'rayo'), ` ${b.nombre}`);
                btn.addEventListener('click', () => enviarIr(b, disp, btn));
                botones.push(btn);
            }
            caja.replaceChildren(...botones);
            if (falta) {
                falta.hidden = sinCodigo.length === 0;
                falta.textContent = sinCodigo.length
                    ? `Falta aprender: ${sinCodigo.join(', ')}. ${Auth.esDocente() ? 'Usá "04 — Aprender código".' : 'Lo hace un docente.'}`
                    : '';
            }
        }
    }

    /** Envía el código IR de una acción. */
    async function enviarIr(boton, disp, btn) {
        btn.disabled = true;
        try {
            const r = await API.comandos.enviar({ tipo: 'ir', boton_id: boton.id });
            App.mostrarToast(`${disp.nombre}: ${boton.nombre.toLowerCase()}...`, 'info');
            seguirEstadoComando(r.comando_id, `${disp.nombre}: ${boton.nombre.toLowerCase()}`);
        } catch (error) {
            App.mostrarToast(error.message, 'error', 6000);
        } finally {
            setTimeout(() => { btn.disabled = false; }, 1500);
        }
    }

    /** Prende o apaga las luces (relé). */
    async function enviarLuces(accion, btn) {
        btn.disabled = true;
        try {
            const r = await API.comandos.enviar({ tipo: 'rele', parametros: { accion } });
            const texto = accion === 'encender' ? 'Luces: encender' : 'Luces: apagar';
            App.mostrarToast(`${texto}...`, 'info');
            seguirEstadoComando(r.comando_id, texto);
        } catch (error) {
            App.mostrarToast(error.message, 'error', 7000);
        } finally {
            setTimeout(() => { btn.disabled = false; }, 1500);
        }
    }

    /**
     * Espera a que el equipo ejecute un comando (consulta cada 2 s, hasta 20 s).
     * @returns {Promise<{estado:string, resultado?:string}>} estado: ejecutado, error o sin_respuesta
     */
    async function esperarComando(comandoId) {
        const fin = Date.now() + ESPERA_EQUIPO_MS;
        while (Date.now() < fin && !destruido) {
            await esperar(2000);
            try {
                const resp = await API.comandos.estado(comandoId);
                const estado = resp.comando.estado;
                if (estado === 'ejecutado' || estado === 'error') return { estado, resultado: resp.comando.resultado };
            } catch (_) { /* se reintenta */ }
        }
        return { estado: 'sin_respuesta' };
    }

    async function seguirEstadoComando(comandoId, texto) {
        const r = await esperarComando(comandoId);
        if (destruido) return;
        if (r.estado === 'ejecutado') App.mostrarToast(`${texto}: listo.`, 'exito');
        else if (r.estado === 'error') App.mostrarToast(`${texto}: el equipo avisó un error (${r.resultado || 'sin detalle'}).`, 'error', 7000);
        else App.mostrarToast(`${texto}: el equipo del aula no respondió. ¿Está prendido y con internet?`, 'advertencia', 7000);
    }

    // ----------------------------------------------------------------
    // Aprender código
    // ----------------------------------------------------------------

    function llenarAparatos() {
        const sel = $('#aprender-aparato');
        const actual = sel.value;
        sel.replaceChildren(...dispositivos.map(d => new Option(d.nombre, String(d.id))));
        if (actual && dispositivos.some(d => String(d.id) === actual)) sel.value = actual;
        llenarAcciones();
    }

    function llenarAcciones() {
        const sel = $('#aprender-accion');
        const actual = sel.value;
        const disp = dispositivos.find(d => String(d.id) === $('#aprender-aparato').value);
        sel.replaceChildren(...(disp?.botones || []).map(b => new Option(`${b.nombre}${b.tiene_codigo_ir ? ' (ya tiene código)' : ''}`, String(b.id))));
        if (actual && [...sel.options].some(o => o.value === actual)) sel.value = actual;
    }

    function estadoAprender(color, texto) {
        const el = $('#aprender-estado');
        if (!el) return;
        el.hidden = false;
        textoConPunto(el, color, texto);
    }

    async function aprender() {
        if (aprendiendo) return;
        const disp = dispositivos.find(d => String(d.id) === $('#aprender-aparato').value);
        const boton = disp?.botones.find(b => String(b.id) === $('#aprender-accion').value);
        if (!disp || !boton) return;
        const antes = boton.codigo_actualizado_en || null;
        const btn = $('#btn-aprender');
        aprendiendo = true;
        btn.disabled = true;
        try {
            // 1. Pedirle al equipo que prenda el receptor
            const r = await API.comandos.enviar({ tipo: 'aprendizaje', boton_id: boton.id });
            estadoAprender('advertencia', 'Esperando que el equipo del aula prenda el receptor...');
            const cmd = await esperarComando(r.comando_id);
            if (destruido) return;
            if (cmd.estado !== 'ejecutado') {
                estadoAprender('error', 'El equipo del aula no respondió. ¿Está prendido y con internet?');
                return;
            }
            // 2. Esperar el código
            estadoAprender('exito', `Escuchando: apuntá el control del ${disp.nombre.toLowerCase()} al receptor y apretá "${boton.nombre}" (tenés 15 segundos).`);
            const fin = Date.now() + ESPERA_CODIGO_MS;
            while (Date.now() < fin && !destruido) {
                await esperar(1500);
                let lista;
                try { lista = await API.botones.listar(disp.id); } catch (_) { continue; }
                const nuevo = (lista.botones || []).find(b => String(b.id) === String(boton.id));
                if (nuevo && nuevo.codigo_ir_id && nuevo.codigo_actualizado_en !== antes) {
                    estadoAprender('exito', `Código guardado para "${disp.nombre}: ${boton.nombre}" (protocolo ${nuevo.protocolo}, ${nuevo.bits || '?'} bits). Probalo con su botón.`);
                    await cargarDispositivos();
                    return;
                }
            }
            if (!destruido) estadoAprender('error', 'No llegó ningún código. Probá de nuevo, más cerca del receptor y apretando una sola vez.');
        } catch (error) {
            estadoAprender('error', error.message);
        } finally {
            aprendiendo = false;
            if (btn) btn.disabled = false;
        }
    }

    // ----------------------------------------------------------------
    // Estado del equipo del aula (ESP32)
    // ----------------------------------------------------------------

    function iniciarMonitoreoEstado() {
        actualizarEstadoEsp32();
        intervaloEstado = setInterval(actualizarEstadoEsp32, 5000);
    }

    async function actualizarEstadoEsp32() {
        try {
            const resp = await API.esp32.estado();
            const estado = resp.estado;
            if (!estado) return;
            // Insignia "ESP32" del encabezado
            const indicador = document.getElementById('indicador-esp32');
            if (indicador) {
                indicador.className = `indicador indicador--${estado.en_linea ? 'online' : 'offline'}`;
                indicador.title = estado.en_linea ? 'Equipo del aula en línea' : 'Equipo del aula desconectado';
            }
            const info = document.getElementById('info-esp32');
            if (!info) return;
            if (estado.en_linea) {
                textoConPunto(info, 'exito', `Equipo del aula en línea${estado.modo_aprendizaje ? ' · escuchando un código' : ''}`);
            } else {
                textoConPunto(info, 'error', `Equipo del aula desconectado${estado.ultimo_heartbeat ? ` (último aviso: ${estado.ultimo_heartbeat})` : ''}`);
            }
        } catch (_) {
            // Sin datos: se reintenta en el próximo ciclo
        }
    }

    function destruir() {
        destruido = true;
        if (intervaloEstado) {
            clearInterval(intervaloEstado);
            intervaloEstado = null;
        }
    }

    return {
        inicializar,
        destruir,
    };
})();
