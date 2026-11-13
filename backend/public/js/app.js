/**
 * Aplicación del Dron (router y orquestador)
 * Grupo 5: Control de Sistemas y Dron
 *
 * App separada de la del aula (Etapa A): no tiene login ni usa el servidor. Funciona sin internet.
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

// eslint-disable-next-line no-unused-vars
const App = (() => {
    'use strict';

    // Caché en memoria de las plantillas parciales para rendimiento instantáneo
    const cachePlantillas = {};

    // Página activa actual
    let paginaActual = null;

    // Función de limpieza de la página activa (por ejemplo, cerrar escuchas UDP de Prueba Tello)
    let limpiezaPaginaActual = null;

    // Número de navegación: si llega otra mientras esta espera, esta se abandona
    let navegacionActual = 0;

    // Pantallas del dron
    const RUTAS_DRON = ['dron', 'seguimiento', 'prueba-tello', 'sensores', 'config-dron', 'objetos'];

    // Rutas que existen (cualquier otra, por ejemplo la vieja #/acerca o #/aula, va al inicio)
    const RUTAS_VALIDAS = ['inicio', ...RUTAS_DRON];

    // Modo técnico: muestra lo que sirve para diagnosticar (elementos .solo-tecnico). Arranca apagado.
    const CLAVE_MODO_TECNICO = 'grupo5dron_modo_tecnico';

    /** @returns {boolean} true si el modo técnico está activado en este teléfono */
    function modoTecnico() {
        try { return localStorage.getItem(CLAVE_MODO_TECNICO) === '1'; } catch (_) { return false; }
    }

    /** Activa o desactiva el modo técnico (se guarda en el teléfono y se aplica al instante). */
    function cambiarModoTecnico(activo) {
        try {
            if (activo) localStorage.setItem(CLAVE_MODO_TECNICO, '1');
            else localStorage.removeItem(CLAVE_MODO_TECNICO);
        } catch (_) { /* sin almacenamiento: vale hasta cerrar la app */ }
        document.body.classList.toggle('modo-tecnico', !!activo);
    }

    /**
     * Muestra una notificación emergente (Toast) en pantalla.
     * 
     * @param {string} mensaje Texto a mostrar
     * @param {string} tipo 'exito' | 'error' | 'advertencia' | 'info'
     * @param {number} duracion Milisegundos visible (por defecto 3500ms)
     */
    function mostrarToast(mensaje, tipo = 'info', duracion = 3500) {
        const contenedor = document.getElementById('toast-contenedor');
        if (!contenedor) return;

        const iconos = {
            exito: 'check',
            error: 'cruz',
            advertencia: 'alerta',
            info: 'info',
        };

        // Texto plano (textContent): un mensaje que venga del servidor no puede inyectar HTML
        const toast = document.createElement('div');
        toast.className = `toast toast--${tipo}`;
        const icono = document.createElement('span');
        icono.className = `toast__icono ico ico--${iconos[tipo] || 'info'}`;
        icono.setAttribute('aria-hidden', 'true');
        const texto = document.createElement('span');
        texto.className = 'toast__texto';
        texto.textContent = mensaje;
        toast.append(icono, texto);

        contenedor.appendChild(toast);

        // Auto eliminar tras la duración con animación
        setTimeout(() => {
            toast.classList.add('saliendo');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duracion);
    }

    /**
     * Navega programáticamente a una ruta hash.
     * @param {string} ruta Ej: '#/inicio'
     */
    function navegarA(ruta) {
        if (!ruta.startsWith('#/')) {
            ruta = '#/' + ruta.replace(/^\//, '');
        }
        window.location.hash = ruta;
    }

    /**
     * Alterna la visibilidad del menú lateral.
     */
    function toggleMenu() {
        const menu = document.getElementById('menu-lateral');
        if (menu) {
            menu.classList.toggle('abierto');
        }
    }

    /**
     * Abre el menú lateral.
     */
    function abrirMenu() {
        const menu = document.getElementById('menu-lateral');
        if (menu) {
            menu.classList.add('abierto');
        }
    }

    /**
     * Cierra el menú lateral.
     */
    function cerrarMenu() {
        const menu = document.getElementById('menu-lateral');
        if (menu) {
            menu.classList.remove('abierto');
        }
    }

    /**
     * Carga y obtiene una plantilla parcial HTML (/pages/*.php).
     * Las páginas son .php pero no dependen de PHP: en el APK no hay PHP y Capacitor las sirve como archivos
     * (build-apk.js les quita cualquier bloque <?php ... ?>). Tienen extensión para que Capacitor
     * no responda index.html en su lugar.
     * @param {string} nombre Nombre de la página (ej: 'inicio')
     * @returns {Promise<string>} Contenido HTML
     */
    async function cargarPlantilla(nombre) {
        if (cachePlantillas[nombre]) {
            return cachePlantillas[nombre];
        }

        try {
            // Sin parámetros en la URL (no llena la caché) y revalidando con el servidor: siempre la versión actual
            const respuesta = await fetch(`/pages/${nombre}.php`, { cache: 'no-cache' });
            if (!respuesta.ok) {
                throw new Error(`No se pudo cargar la vista "${nombre}" (HTTP ${respuesta.status})`);
            }
            const html = await respuesta.text();
            // Una vista es un fragmento: si llega un documento completo (por ejemplo, index.html en vez del archivo),
            // se avisa en lugar de meter la app dentro de sí misma
            if (/<!doctype|<html[\s>]/i.test(html.slice(0, 500))) {
                throw new Error(`La vista "${nombre}" llegó como una página completa: el archivo no se encontró`);
            }
            cachePlantillas[nombre] = html;
            return html;
        } catch (error) {
            return `
                <div class="tarjeta texto-centro" style="padding: var(--espacio-2xl) var(--espacio-md);">
                    <div style="margin-bottom: var(--espacio-sm);">${icono('alerta', 'ico--grande')}</div>
                    <h3 class="mb-sm">Error cargando la página</h3>
                    <p class="texto-sm texto-secundario mb-lg">${error.message}</p>
                    <button class="btn btn--primario" onclick="App.cargarRutaActual()">Reintentar</button>
                </div>
            `;
        }
    }

    /**
     * Router SPA: analiza el hash actual y monta la vista correspondiente.
     */
    async function cargarRutaActual() {
        const hash = window.location.hash || '#/inicio';
        const ruta = hash.replace(/^#\/?/, '').split('?')[0].trim() || 'inicio';

        // Una ruta que no existe (por ejemplo, la vieja #/acerca o #/aula) va al inicio sin error
        if (!RUTAS_VALIDAS.includes(ruta)) history.replaceState(null, '', '#/inicio');
        const destino = RUTAS_VALIDAS.includes(ruta) ? ruta : 'inicio';

        // 1. Salir de la cabina con el dron en el aire: confirmar y aterrizar
        if (paginaActual === 'dron' && destino !== 'dron' && typeof Dron !== 'undefined' && Dron.estaEnVuelo && Dron.estaEnVuelo()) {
            if (!confirm('El dron está en vuelo.\n\n¿Aterrizar y salir de la cabina?\n(Cancelar = quedarse en la cabina)')) {
                history.replaceState(null, '', '#/dron');
                return;
            }
        }

        const miNavegacion = ++navegacionActual;

        // 2. Limpieza de página anterior si corresponde
        if (paginaActual === 'dron' && typeof Dron !== 'undefined' && Dron.destruir) {
            paginaActual = null;
            await Dron.destruir(); // si estaba en vuelo, aterriza antes de desconectar
        }
        if (limpiezaPaginaActual) {
            const limpiar = limpiezaPaginaActual;
            limpiezaPaginaActual = null;
            try { await limpiar(); } catch (e) { console.warn('[App] Error limpiando la página anterior:', e); }
        }
        if (miNavegacion !== navegacionActual) return;

        // 3. Cargar plantilla en el contenedor principal
        const contenedor = document.getElementById('app-contenido');
        if (!contenedor) return;

        contenedor.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div><p>Cargando...</p></div>';

        const html = await cargarPlantilla(destino);
        if (miNavegacion !== navegacionActual) return;
        contenedor.innerHTML = html;
        paginaActual = destino;

        // 4. Actualizar enlaces activos en menú lateral
        actualizarNavegacionActiva(destino);
        cerrarMenu();

        // 5. Inicializar controlador específico de la página
        await inicializarControladorPagina(destino);
    }

    /**
     * Resalta el link actual en el menú lateral.
     */
    function actualizarNavegacionActiva(pagina) {
        document.querySelectorAll('.menu-lateral__enlace').forEach((enlace) => {
            const dataPagina = enlace.dataset.pagina;
            enlace.classList.toggle('activo', dataPagina === pagina);
        });
    }

    /**
     * Inicializa la lógica JS de cada vista luego de inyectar el HTML.
     */
    async function inicializarControladorPagina(pagina) {
        switch (pagina) {
            case 'dron':
                if (typeof Dron !== 'undefined' && Dron.inicializar) {
                    const contenedorDron = document.getElementById('app-contenido');
                    await Dron.inicializar(contenedorDron);
                }
                break;

            case 'sensores': {
                const contenedorSens = document.getElementById('app-contenido');
                if (typeof Sensores !== 'undefined' && contenedorSens) {
                    limpiezaPaginaActual = inicializarPaginaSensores(contenedorSens);
                }
                break;
            }

            case 'config-dron': {
                const contenedorCfg = document.getElementById('app-contenido');
                if (typeof ConfigDron !== 'undefined' && contenedorCfg) {
                    await ConfigDron.inicializar(contenedorCfg);
                }
                break;
            }

            case 'seguimiento': {
                const contenedorSeg = document.getElementById('app-contenido');
                if (typeof DronSeguimiento !== 'undefined' && typeof DronPantallaSeguimiento !== 'undefined' && contenedorSeg) {
                    limpiezaPaginaActual = inicializarPaginaSeguimiento(contenedorSeg);
                }
                break;
            }

            case 'objetos': {
                const contenedorObj = document.getElementById('app-contenido');
                if (typeof DronObjetos !== 'undefined' && contenedorObj) {
                    limpiezaPaginaActual = inicializarPaginaObjetos(contenedorObj);
                }
                break;
            }

            case 'prueba-tello': {
                const contenedorPrueba = document.getElementById('app-contenido');
                if (contenedorPrueba) {
                    limpiezaPaginaActual = inicializarPaginaPruebaTello(contenedorPrueba);
                }
                break;
            }
        }
    }

    /**
     * Escapa texto para insertarlo en HTML.
     * @param {*} valor
     * @returns {string}
     */
    function escaparHtml(valor) {
        return String(valor ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * HTML de un ícono propio (SVG definido en app.css). Es decorativo: siempre va junto a un
     * texto visible o dentro de un botón con aria-label.
     * @param {string} nombre Por ejemplo 'dron', 'check', 'alerta'
     * @param {string} [clases] Clases extra (por ejemplo 'ico--grande')
     */
    function icono(nombre, clases = '') {
        return `<span class="ico ico--${nombre}${clases ? ' ' + clases : ''}" aria-hidden="true"></span>`;
    }

    /** Pone en `el` un ícono (opcional) y un texto plano (textContent: no interpreta HTML). */
    function textoConIcono(el, nombre, texto) {
        if (!el) return;
        el.replaceChildren();
        if (nombre) {
            const ico = document.createElement('span');
            ico.className = `ico ico--${nombre}`;
            ico.setAttribute('aria-hidden', 'true');
            el.append(ico, ' ');
        }
        el.append(texto);
    }

    /**
     * Pone en `el` un punto de color de estado y un texto plano.
     * @param {string} color 'exito' | 'error' | 'advertencia' | 'acento' | 'alerta' | '' (gris)
     */
    function textoConPunto(el, color, texto) {
        if (!el) return;
        const punto = document.createElement('span');
        punto.className = `punto${color ? ' punto--' + color : ''}`;
        punto.setAttribute('aria-hidden', 'true');
        el.replaceChildren(punto, texto);
    }

    /**
     * Inicializa la vista de Sensores (/pages/sensores.php):
     * inclinación en vivo (giroscopio o, si no hay, acelerómetro) y, en el modo técnico, el diagnóstico de los sensores.
     * @param {HTMLElement} contenedor
     * @returns {Function} limpieza que deja de escuchar los sensores al salir de la página
     */
    function inicializarPaginaSensores(contenedor) {
        const q = sel => contenedor.querySelector(sel);
        const btnDiagnosticar = q('#btn-diagnosticar-sensores');
        const panelResultados = q('#panel-resultados-sensores');
        const btnVivo = q('#btn-giro-vivo');
        const estadoVivo = q('#giro-estado');
        const fuenteVivo = q('#giro-fuente');
        let lector = null;

        async function ejecutarDiagnostico() {
            if (!btnDiagnosticar || !panelResultados) return;
            btnDiagnosticar.disabled = true;
            btnDiagnosticar.textContent = 'Diagnosticando...';
            panelResultados.innerHTML = '<div class="cargando"><div class="cargando__spinner"></div><p>Verificando sensores...</p></div>';

            await Sensores.diagnosticar();
            if (!contenedor.isConnected) return;
            const resumen = Sensores.obtenerResumen();
            panelResultados.innerHTML = resumen.map(s => `
                <div class="tarjeta flex items-start gap-md mb-sm">
                    <span style="font-size:1.5rem; flex-shrink:0; line-height:1; color: var(--color-celeste);">${s.icono}</span>
                    <div style="flex:1; min-width:0;">
                        <div class="flex justify-between items-center gap-sm flex-wrap">
                            <strong class="texto-sm">${s.nombre}</strong>
                            <span class="badge ${s.ok ? 'badge--exito' : 'badge--error'}">${icono(s.ok ? 'check' : 'cruz')}${s.estado}</span>
                        </div>
                        <p class="texto-xs texto-secundario mt-xs">${escaparHtml(s.detalle)}</p>
                    </div>
                </div>
            `).join('');

            btnDiagnosticar.disabled = false;
            textoConIcono(btnDiagnosticar, 'recargar', 'Repetir diagnóstico');
        }

        // ---- Inclinación en vivo: del giroscopio o, si el celular no tiene, del acelerómetro ----
        const fmt = v => (typeof v === 'number' ? `${v.toFixed(0)}°` : '--');
        let lecturas = 0;

        function iniciarLecturaVivo() {
            if (lector || !estadoVivo) return;
            lector = new DronGiroscopio.LectorInclinacion({
                onLectura: ({ beta: betaTel, gamma: gammaTel, alpha }) => {
                    lecturas++;
                    // Respecto de la pantalla, como en la cabina (vertical y las dos horizontales)
                    const { beta, gamma } = DronGiroscopio.inclinacionEnPantalla(betaTel, gammaTel, DronGiroscopio.anguloPantalla());
                    q('#giro-beta').textContent = fmt(beta);
                    q('#giro-gamma').textContent = fmt(gamma);
                    q('#giro-alpha').textContent = alpha === null ? 'No disp.' : fmt(alpha);
                    if (lecturas === 1) textoConIcono(estadoVivo, 'check', 'Recibiendo datos reales. Inclinate para ver cómo cambian.');
                },
                onFuente: (fuente) => {
                    if (fuenteVivo) fuenteVivo.textContent = DronGiroscopio.textoFuente(fuente);
                    if (fuente === 'ninguno') textoConIcono(estadoVivo, 'cruz', 'Sin datos de inclinación.');
                },
            });
            lector.iniciar();
            estadoVivo.textContent = 'Esperando datos del sensor...';
        }

        /** Algunos navegadores piden permiso (iOS 13+ con un toque). Si hace falta el toque, aparece el botón. */
        async function pedirPermisoYLeer() {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    if (await DeviceOrientationEvent.requestPermission() !== 'granted') {
                        textoConIcono(estadoVivo, 'cruz', 'Permiso de los sensores denegado.');
                        return;
                    }
                } catch (_) {
                    estadoVivo.textContent = 'Tocá "Ver lectura en vivo" para dar permiso a los sensores.';
                    if (btnVivo) btnVivo.hidden = false;
                    return;
                }
            }
            if (btnVivo) btnVivo.hidden = true;
            iniciarLecturaVivo();
        }

        btnDiagnosticar?.addEventListener('click', ejecutarDiagnostico);
        btnVivo?.addEventListener('click', pedirPermisoYLeer);
        // El diagnóstico abre la cámara un instante: solo en el modo técnico
        if (modoTecnico()) ejecutarDiagnostico();
        // La lectura arranca sola; si el navegador exige un toque para dar permiso (iOS), aparece el botón
        pedirPermisoYLeer();

        return () => {
            lector?.detener();
            lector = null;
        };
    }

    /**
     * Inicializa la pantalla de Seguimiento con la cámara del celular (/pages/seguimiento.php), estilo RAC.
     * Misma tubería y mismas tarjetas que la cabina, pero con la cámara: nunca se manda nada al dron.
     * @param {HTMLElement} contenedor
     * @returns {Function} limpieza que apaga la cámara y el seguimiento al salir de la página
     */
    function inicializarPaginaSeguimiento(contenedor) {
        const q = sel => contenedor.querySelector(sel);
        const video = q('#seg-video');
        const caja = q('#seg-caja');
        const aviso = q('#seg-aviso');
        const estadoTexto = q('#seg-estado');
        const chipEstado = q('#seg-chip-estado');
        const cartel = q('#seg-cartel');
        let objetosGuardados = [];
        let camara = null;
        let paginaCerrada = false;
        let panelTecnico = null;
        const seg = new DronSeguimiento({ videoEl: video, canvasDebug: q('#seg-canvas'), miniatura: q('#seg-miniatura') });

        /** La caja toma la proporción real de la cámara (vertical en el celular): sin franjas negras a los costados. */
        function ajustarProporcion() {
            if (video.videoWidth > 0 && video.videoHeight > 0) caja.style.setProperty('--proporcion', String(video.videoWidth / video.videoHeight));
        }

        async function abrirCamara() {
            if (camara) return true;
            if (!navigator.mediaDevices?.getUserMedia) {
                textoConIcono(estadoTexto, 'cruz', 'Este navegador no permite usar la cámara.');
                return false;
            }
            estadoTexto.textContent = 'Pidiendo permiso para usar la cámara...';
            try {
                camara = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 }, height: { ideal: 720 } },
                    audio: false,
                });
            } catch (e) {
                textoConIcono(estadoTexto, 'cruz', e?.name === 'NotAllowedError'
                    ? 'Permiso de cámara denegado. Habilitalo en los ajustes del teléfono.'
                    : `No se pudo abrir la cámara: ${e?.message || e}`);
                return false;
            }
            if (paginaCerrada) { cerrarCamara(); return false; }
            video.srcObject = camara;
            try { await video.play(); } catch (_) { /* se reproduce igual al tener datos */ }
            ajustarProporcion();
            aviso.hidden = true;
            estadoTexto.textContent = '';
            return true;
        }

        function cerrarCamara() {
            camara?.getTracks().forEach(t => t.stop());
            camara = null;
            video.srcObject = null;
            aviso.hidden = false;
        }

        async function preparar() {
            if (seg.modeloCargado) return true;
            estadoTexto.textContent = 'Preparando el detector...';
            const res = await seg.inicializar();
            if (paginaCerrada) return false;
            if (!res.ok) { textoConIcono(estadoTexto, 'cruz', `No se pudo preparar el seguimiento: ${res.error}`); return false; }
            estadoTexto.textContent = res.aviso || '';
            return true;
        }

        async function iniciar() {
            pantalla.setCargando(true);
            const ok = (await abrirCamara()) && (await preparar());
            pantalla.setCargando(false);
            if (!ok || paginaCerrada) { if (!paginaCerrada) cerrarCamara(); return; }
            panelTecnico?.destruir();
            panelTecnico = new DronSeguimiento.Panel(q('#seg-panel'));
            seg.activar();
            pantalla.setActivo(true);
        }

        function detener() {
            seg.desactivar();
            panelTecnico?.destruir();
            panelTecnico = null;
            cerrarCamara();
            chipEstado.hidden = true;
            delete chipEstado.dataset.texto;
            cartel.textContent = '';
            pantalla.setActivo(false);
        }

        const pantalla = new DronPantallaSeguimiento.Pantalla({
            contenedor: q('#seg-tarjetas'),
            cajaVideo: caja,
            chipFps: q('#seg-chip-fps'),
            fuente: 'camara',
            fuenteTamano: () => [video.videoWidth, video.videoHeight],
            onIniciar: iniciar,
            onDetener: detener,
            onTocar: (x, y) => seg.elegirEnPunto(x, y),
            onDiagnosticar: async () => {
                // Para diagnosticar hace falta imagen: se abre la cámara si estaba apagada
                if (!(await abrirCamara())) return { items: [{ ok: false, titulo: 'Llega imagen', detalle: 'No se pudo abrir la cámara.' }], conclusion: 'No llega imagen: revisá el permiso de la cámara.' };
                const r = await seg.diagnosticar(q('#seg-foto-prueba'));
                if (!seg.activo && !paginaCerrada) cerrarCamara();
                return r;
            },
        });

        seg.onComando = (cmd, info) => {
            cartel.textContent = DronSeguimiento.textoEnsayo(cmd, info);
            pantalla.actualizar(info, `Comando que calcularía: ${DronSeguimiento.textoRc({ lr: 0, ...cmd })} (no se manda)`);
            panelTecnico?.actualizar(info);
            const e = DronSeguimiento.estadoCorto(info);
            if (chipEstado.dataset.texto !== e.texto) {
                textoConPunto(chipEstado, e.color, e.texto);
                chipEstado.dataset.texto = e.texto;
            }
            chipEstado.hidden = info.estado === 'apagado';
        };
        seg.onEstado = (nuevo, anterior, info) => pantalla.cambioDeEstado(nuevo, anterior, info);

        /** "¿Qué seguir?": una persona o un objeto guardado; si está andando, vuelve a empezar. */
        const sel = pantalla.selectQueSeguir;
        sel.addEventListener('change', async () => {
            const objeto = objetosGuardados.find(o => o.id === sel.value) || null;
            const res = await seg.elegirObjeto(objeto);
            if (!res.ok) {
                mostrarToast(res.error, 'advertencia', 7000);
                sel.value = 'persona';
                await seg.elegirObjeto(null);
            }
            if (seg.activo) { seg.desactivar(); seg.activar(); }
        });
        if (typeof DronObjetos !== 'undefined') llenarQueSeguir(sel).then(lista => { objetosGuardados = lista; });

        q('#btn-seg-cpu')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const salida = q('#seg-resultado-cpu');
            btn.disabled = true;
            salida.hidden = false;
            salida.textContent = 'Probando en el procesador: puede tardar unos segundos...';
            const r = await seg.probarCuadroEnCpu();
            if (paginaCerrada) return;
            salida.textContent = DronSeguimiento.textoPruebaCpu(r, 'person');
            btn.disabled = false;
        });
        q('#btn-seg-copiar')?.addEventListener('click', async () => {
            const filas = seg.registro.length;
            if (!filas) { mostrarToast('Todavía no hay registro: iniciá el seguimiento un rato.', 'info'); return; }
            const ok = await DronSeguimiento.copiarTexto(seg.registroCSV());
            mostrarToast(ok ? `Registro copiado (${filas} cuadros).` : 'No se pudo copiar el registro.', ok ? 'exito' : 'advertencia');
        });
        video.addEventListener('loadedmetadata', ajustarProporcion);
        video.addEventListener('resize', ajustarProporcion); // el celular giró

        return () => {
            paginaCerrada = true;
            seg.desactivar();
            seg.onComando = null;
            panelTecnico?.destruir();
            pantalla.destruir();
            cerrarCamara(); // apaga la cámara al salir de la pantalla
        };
    }

    /**
     * Inicializa "Mis objetos" (/pages/objetos.php): alta con 3 a 15 fotos, lista y borrado.
     * @param {HTMLElement} contenedor
     * @returns {Function} limpieza (libera las vistas previas de las fotos)
     */
    function inicializarPaginaObjetos(contenedor) {
        const q = sel => contenedor.querySelector(sel);
        const form = q('#form-objeto');
        const btnAgregar = q('#btn-agregar-objeto');
        const inputNombre = q('#objeto-nombre');
        const listaFotos = q('#objeto-fotos');
        const cuenta = q('#objeto-cuenta');
        const error = q('#objeto-error');
        const progreso = q('#objeto-progreso');
        const resultado = q('#objeto-resultado');
        const lista = q('#lista-objetos');
        let fotos = []; // {archivo, url}
        let guardando = false;

        const mostrarError = (texto) => { error.textContent = texto; error.hidden = !texto; };

        function liberarFotos() {
            fotos.forEach(f => URL.revokeObjectURL(f.url));
            fotos = [];
        }

        function dibujarFotos() {
            listaFotos.replaceChildren(...fotos.map((f, i) => {
                const li = document.createElement('li');
                const img = document.createElement('img');
                img.src = f.url;
                img.alt = `Foto ${i + 1}`;
                const quitar = document.createElement('button');
                quitar.type = 'button';
                quitar.className = 'fotos-objeto__quitar';
                quitar.setAttribute('aria-label', `Quitar la foto ${i + 1}`);
                quitar.append(Object.assign(document.createElement('span'), { className: 'ico ico--cruz' }));
                quitar.addEventListener('click', () => {
                    URL.revokeObjectURL(f.url);
                    fotos.splice(i, 1);
                    dibujarFotos();
                });
                li.append(img, quitar);
                return li;
            }));
            const v = DronObjetos.validarFotos(fotos.length);
            cuenta.textContent = fotos.length ? v.mensaje : `Todavía no hay fotos (de ${DronObjetos.MIN_FOTOS} a ${DronObjetos.MAX_FOTOS}).`;
            cuenta.className = `texto-sm mb-sm ${fotos.length && !v.ok ? 'texto-advertencia' : ''}`;
            mostrarError('');
        }

        function agregarArchivos(archivos) {
            for (const archivo of archivos) {
                if (archivo.type && !archivo.type.startsWith('image/')) continue;
                fotos.push({ archivo, url: URL.createObjectURL(archivo) });
            }
            dibujarFotos();
        }

        function cerrarFormulario() {
            liberarFotos();
            form.reset();
            dibujarFotos();
            form.hidden = true;
            btnAgregar.hidden = false;
            progreso.hidden = true;
        }

        async function dibujarLista() {
            let objetos = [];
            try {
                objetos = await DronObjetos.listar();
            } catch (e) {
                lista.replaceChildren(Object.assign(document.createElement('li'), { className: 'texto-sm texto-error', textContent: e.message }));
                return;
            }
            if (!contenedor.isConnected) return;
            if (!objetos.length) {
                lista.replaceChildren(Object.assign(document.createElement('li'), { className: 'texto-sm texto-secundario', textContent: 'Todavía no hay objetos guardados.' }));
                return;
            }
            lista.replaceChildren(...objetos.map(o => {
                const li = document.createElement('li');
                li.className = 'lista-objetos__item';
                const img = document.createElement('img');
                img.src = o.miniatura || '';
                img.alt = '';
                const texto = document.createElement('div');
                texto.className = 'lista-objetos__texto';
                texto.append(Object.assign(document.createElement('strong'), { textContent: o.nombre }),
                    Object.assign(document.createElement('span'), { className: 'texto-xs texto-secundario', textContent: `${o.fotos} fotos` }));
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn btn--secundario btn--icono';
                btn.setAttribute('aria-label', `Borrar «${o.nombre}»`);
                btn.innerHTML = icono('borrar');
                btn.addEventListener('click', async () => {
                    if (!confirm(`¿Borrar «${o.nombre}»?\n\nSe borran sus fotos analizadas de este teléfono.`)) return;
                    try {
                        await DronObjetos.borrar(o.id);
                        mostrarToast(`Se borró «${o.nombre}».`, 'info');
                    } catch (e) {
                        mostrarToast(`No se pudo borrar: ${e.message}`, 'error');
                    }
                    dibujarLista();
                });
                li.append(img, texto, btn);
                return li;
            }));
        }

        btnAgregar.addEventListener('click', () => {
            resultado.hidden = true;
            form.hidden = false;
            btnAgregar.hidden = true;
            inputNombre.focus();
        });
        q('#btn-cancelar-objeto').addEventListener('click', cerrarFormulario);
        for (const sel of ['#objeto-galeria', '#objeto-camara']) {
            const input = q(sel);
            input.addEventListener('change', () => {
                agregarArchivos([...input.files]);
                input.value = ''; // permite volver a elegir las mismas
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (guardando) return;
            const nombre = inputNombre.value.trim();
            if (!nombre) { mostrarError('Ponele un nombre al objeto.'); inputNombre.focus(); return; }
            const v = DronObjetos.validarFotos(fotos.length);
            if (!v.ok) { mostrarError(`No se puede guardar. ${v.mensaje}`); return; }
            guardando = true;
            mostrarError('');
            const botones = form.querySelectorAll('button, input, label.btn');
            botones.forEach(b => { b.disabled = true; b.classList.add('deshabilitado'); });
            progreso.hidden = false;
            try {
                const { objeto, detalle } = await DronObjetos.crearObjeto(nombre, fotos.map(f => f.archivo), (n, total) => {
                    progreso.textContent = `Analizando la foto ${n} de ${total}...`;
                });
                const encontradas = detalle.filter(d => d.encontrado).length;
                resultado.textContent = encontradas
                    ? `Guardado «${objeto.nombre}». Lo encontré en ${encontradas} de ${detalle.length} fotos; en las otras usé la foto entera.`
                    : `Guardado «${objeto.nombre}», pero no lo encontré en ninguna foto: usé las fotos enteras. Si no lo reconoce, puede que después no lo encuentre al seguirlo.`;
                resultado.hidden = false;
                cerrarFormulario();
                dibujarLista();
            } catch (err) {
                mostrarError(`No se pudo guardar: ${err.message}`);
            } finally {
                guardando = false;
                botones.forEach(b => { b.disabled = false; b.classList.remove('deshabilitado'); });
                progreso.hidden = true;
            }
        });

        dibujarFotos();
        dibujarLista();
        return () => liberarFotos();
    }

    /**
     * Llena un selector "¿Qué seguir?" con "Una persona" y los objetos guardados.
     * @returns {Promise<Array>} los objetos (con sus huellas)
     */
    async function llenarQueSeguir(select) {
        let objetos = [];
        try { objetos = await DronObjetos.listar(); } catch (_) { /* sin objetos guardados */ }
        const opciones = [new Option('Una persona', 'persona'), ...objetos.map(o => new Option(o.nombre, o.id))];
        select.replaceChildren(...opciones);
        return objetos;
    }

    /**
     * Inicializa la vista de prueba y diagnóstico directo con el DJI Tello.
     * Abre las escuchas de telemetría (8890) y video (11111) mientras la página está abierta.
     * @returns {Function} limpieza que cierra escuchas, oyentes e intervalos al salir de la página
     */
    function inicializarPaginaPruebaTello(contenedor) {
        const q = sel => contenedor.querySelector(sel);
        const badge = q('#tello-entorno-badge');
        const logBox = q('#tello-log-salida');
        const ipInput = q('#tello-ip-prueba');
        const puertoInput = q('#tello-puerto-prueba');
        const cmdInput = q('#tello-cmd-custom');
        const diagPlugin = q('#diag-plugin-info');
        const diagWifi = q('#diag-wifi-status');
        const diagWebCodecs = q('#diag-webcodecs-status');
        const diagLatencia = q('#diag-latencia-cmd');
        const diagTelemetria = q('#diag-telemetria-pps');
        const diagVideoBytes = q('#diag-video-bytes');
        const diagUserAgent = q('#diag-user-agent');
        const diagErroresBox = q('#diag-errores-salida');
        const diagModelo = q('#diag-modelo');
        const textareaRespaldo = q('#diag-textarea-respaldo');

        const DN = DronAdaptadores.DronNativo;
        const tieneNativo = DN.disponible();
        const PUERTO_TELEMETRIA = 8890;
        const PUERTO_VIDEO = 11111;

        const estadoDiag = {
            pluginInfo: 'No detectado',
            wifi: 'Pendiente',
            red: 'sin dato',
            webCodecs: 'Verificando...',
            latencias: { command: '--', battery: '--' },
            escuchas: 'ninguna',
            telemetriaPPS: 0,
            telemetriaTotal: 0,
            ultimaTelemetria: 'Ninguna',
            totalBytesVideo: 0,
            totalPaquetesVideo: 0,
            userAgent: navigator.userAgent,
            modelo: 'Sin verificar',
            modeloDetalle: [],
            errores: [],
        };

        // Recursos a liberar al salir de la página
        const oyentes = [];
        const puertosAbiertos = [];
        let paginaCerrada = false;

        function textoRed(red) {
            return { wifi: 'WiFi del Tello', datos: 'datos móviles', ninguna: 'ninguna' }[red] || (red ? 'otra red' : 'sin dato');
        }

        function registrarError(err) {
            const hora = new Date().toLocaleTimeString();
            const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
            estadoDiag.errores.push(`[${hora}] ${msg}`);
            if (estadoDiag.errores.length > 20) estadoDiag.errores.shift();
            if (diagErroresBox) diagErroresBox.textContent = estadoDiag.errores.join('\n');
        }

        function agregarLog(tipo, msg) {
            if (!logBox) return;
            const hora = new Date().toLocaleTimeString();
            const prefijo = tipo === 'tx' ? '[TX]' : tipo === 'rx' ? '[RX]' : tipo === 'res' ? '[RESULTADO]' : '[INFO]';
            logBox.textContent += `\n[${hora}] ${prefijo} ${msg}`;
            logBox.scrollTop = logBox.scrollHeight;
        }

        function actualizarUIResumen() {
            if (diagPlugin) diagPlugin.textContent = estadoDiag.pluginInfo;
            if (diagWifi) diagWifi.textContent = `${estadoDiag.wifi} · usa: ${estadoDiag.red}`;
            if (diagWebCodecs) diagWebCodecs.textContent = estadoDiag.webCodecs;
            if (diagLatencia) diagLatencia.textContent = `cmd: ${estadoDiag.latencias.command} | bat: ${estadoDiag.latencias.battery}`;
            if (diagTelemetria) diagTelemetria.textContent = `${estadoDiag.telemetriaPPS} pps | escuchas: ${estadoDiag.escuchas} | ${estadoDiag.ultimaTelemetria.slice(0, 35)}`;
            if (diagVideoBytes) diagVideoBytes.textContent = `${estadoDiag.totalBytesVideo.toLocaleString()} bytes (${estadoDiag.totalPaquetesVideo} paquetes UDP)`;
            if (diagUserAgent) diagUserAgent.textContent = estadoDiag.userAgent;
        }

        // Paquetes por segundo de telemetría
        let conteoTelemetria = 0;
        const intervaloPPS = setInterval(() => {
            estadoDiag.telemetriaPPS = conteoTelemetria;
            conteoTelemetria = 0;
            actualizarUIResumen();
        }, 1000);

        if (badge) {
            textoConPunto(badge, tieneNativo ? 'exito' : 'advertencia', tieneNativo ? 'App instalada: lista para hablar con el dron' : 'Estás en el navegador: la prueba no habla con el dron');
            badge.style.color = tieneNativo ? 'var(--color-exito)' : 'var(--color-advertencia)';
        }

        /** @returns {Promise<{respuesta:string, error:string|null, ms:number}|undefined>} */
        async function enviarPrueba(cmd) {
            cmd = (cmd || '').trim();
            if (!cmd) return undefined;
            const ip = ipInput?.value?.trim() || '192.168.10.1';
            const puerto = parseInt(puertoInput?.value, 10) || 8889;
            agregarLog('tx', `"${cmd}" -> ${ip}:${puerto}`);
            const tInicio = performance.now();

            let respuesta;
            let error = null;
            let puertoLocal = null;
            if (tieneNativo) {
                ({ respuesta, error, puertoLocal } = await DN.enviarComando(ip, puerto, cmd, 5000));
            } else {
                await new Promise(r => setTimeout(r, 200));
                respuesta = cmd === 'battery?' ? '85' : 'ok';
            }
            const ms = Math.round(performance.now() - tInicio);
            const sim = tieneNativo ? '' : ' [simulado]';
            agregarLog('res', `"${cmd}": "${respuesta}"${error ? ' (' + error + ')' : ''} en ${ms} ms${puertoLocal ? ` · puerto local ${puertoLocal}` : ''}${sim}`);
            if (cmd === 'command') estadoDiag.latencias.command = `${respuesta} (${ms} ms)${sim}`;
            if (cmd === 'battery?') estadoDiag.latencias.battery = `${respuesta}% (${ms} ms)${sim}`;
            if (tieneNativo && cmd !== 'battery?' && !cmd.endsWith('?') && !DronAdaptadores.esOk(respuesta)) {
                registrarError(`"${cmd}" respondió "${respuesta}"${error ? ' (' + error + ')' : ''}`);
            }
            actualizarUIResumen();
            return { respuesta: String(respuesta ?? ''), error, ms };
        }

        // ---- Prueba en pasos numerados con un resultado claro (vista normal) ----
        const PASOS = ['app', 'command', 'bateria', 'telemetria', 'video'];
        const BATERIA_MINIMA = 20;
        const resultadoPasos = {};
        let probando = false;

        function marcarPaso(id, color, texto) {
            const el = q(`#paso-${id}`);
            if (!el) return;
            textoConPunto(el, color, texto);
            el.closest('.paso-prueba')?.setAttribute('data-estado', color || '');
            resultadoPasos[id] = texto;
        }

        function mostrarResultado(ok, titulo, detalle) {
            const caja = q('#resultado-prueba');
            if (!caja) return;
            caja.className = `resultado-prueba ${ok === null ? '' : ok ? 'resultado-prueba--ok' : 'resultado-prueba--falta'}`;
            caja.replaceChildren();
            const t = document.createElement('span');
            t.className = 'resultado-prueba__titulo';
            t.textContent = titulo;
            caja.append(t);
            if (detalle) {
                const d = document.createElement('span');
                d.className = 'resultado-prueba__detalle';
                d.textContent = detalle;
                caja.append(d);
            }
        }

        /** Espera hasta `ms` a que `condicion()` sea verdadera (o a que se cierre la página). */
        async function esperarHasta(condicion, ms) {
            const fin = Date.now() + ms;
            while (Date.now() < fin && !paginaCerrada) {
                if (condicion()) return true;
                await new Promise(r => setTimeout(r, 200));
            }
            return condicion();
        }

        async function probarTodo() {
            if (probando) return;
            probando = true;
            const btn = q('#btn-probar-todo');
            if (btn) btn.disabled = true;
            PASOS.forEach(p => marcarPaso(p, '', 'Sin probar'));
            mostrarResultado(null, 'Probando...', 'No muevas el celular ni el dron.');
            const faltas = [];
            const avisos = [];
            const terminar = () => {
                if (faltas.length) mostrarResultado(false, 'Todavía no', `Falta: ${faltas.join('; ')}.`);
                else mostrarResultado(true, 'Listo para volar', avisos.length ? `Ojo: ${avisos.join('; ')}.` : 'El dron responde y manda su batería, sus datos y el video.');
                probando = false;
                if (btn) btn.disabled = false;
            };

            // 01 — App y WiFi del Tello
            if (!tieneNativo) {
                marcarPaso('app', 'error', 'Estás en el navegador: el navegador no puede hablar con el dron.');
                faltas.push('abrir la app instalada en el celular');
                terminar();
                return;
            }
            marcarPaso('app', 'acento', 'Vinculando el WiFi del Tello...');
            const red = await DN.vincularRedWifi();
            if (paginaCerrada) return;
            estadoDiag.wifi = red.vinculada ? `Vinculada (${red.motivo || 'OK'})` : `NO vinculada (${red.motivo || 'sin motivo'})`;
            estadoDiag.red = textoRed(red.red);
            if (red.red === 'wifi') marcarPaso('app', 'exito', 'Usa el WiFi del Tello.');
            else if (red.red === 'datos') marcarPaso('app', 'advertencia', 'Usa los datos móviles, no el WiFi del Tello. Se prueba igual.');
            else marcarPaso('app', 'advertencia', `No encontré el WiFi del Tello (${red.motivo || 'sin motivo'}). Se prueba igual.`);

            // 02 — Respuesta del dron
            marcarPaso('command', 'acento', 'Conectando con el dron...');
            const rc = await enviarPrueba('command');
            if (paginaCerrada) return;
            if (!rc || !DronAdaptadores.esOk(rc.respuesta)) {
                marcarPaso('command', 'error', `No respondió (${rc?.respuesta || 'sin respuesta'}). Prendé el dron y conectá el celular a su WiFi TELLO-XXXXXX. Apagá los datos móviles y volvé a probar.`);
                faltas.push('que el dron responda');
                terminar();
                return;
            }
            marcarPaso('command', 'exito', `Respondió bien (en ${(rc.ms / 1000).toFixed(1)} s).`);

            // 03 — Batería
            marcarPaso('bateria', 'acento', 'Preguntando la batería...');
            const rb = await enviarPrueba('battery?');
            if (paginaCerrada) return;
            const bat = parseInt(rb?.respuesta, 10);
            if (!Number.isFinite(bat)) {
                marcarPaso('bateria', 'advertencia', `No la informó (${rb?.respuesta || 'sin respuesta'}).`);
                avisos.push('no se pudo leer la batería');
            } else if (bat < BATERIA_MINIMA) {
                marcarPaso('bateria', 'error', `${bat} %: muy baja para volar.`);
                faltas.push(`cargar la batería (${bat} %)`);
            } else {
                marcarPaso('bateria', 'exito', `${bat} %.`);
            }

            // 04 — Telemetría (la cabina no deja despegar sin ella)
            marcarPaso('telemetria', 'acento', 'Esperando los datos del dron...');
            const llegoTel = await esperarHasta(() => estadoDiag.telemetriaTotal > 0, 3000);
            if (paginaCerrada) return;
            if (llegoTel) marcarPaso('telemetria', 'exito', 'Llegan los datos del dron (batería, altura).');
            else {
                marcarPaso('telemetria', 'error', 'No llegan. Sin estos datos la cabina no deja despegar.');
                faltas.push('que lleguen los datos del dron');
            }

            // 05 — Video (no impide volar)
            marcarPaso('video', 'acento', 'Pidiendo el video...');
            const bytesAntes = estadoDiag.totalBytesVideo;
            const rv = await enviarPrueba('streamon');
            if (paginaCerrada) return;
            const llegoVideo = DronAdaptadores.esOk(rv?.respuesta) && await esperarHasta(() => estadoDiag.totalBytesVideo > bytesAntes, 3000);
            if (paginaCerrada) return;
            if (llegoVideo) marcarPaso('video', 'exito', 'Llega video.');
            else {
                marcarPaso('video', 'advertencia', 'No llega video. Se puede volar, pero sin imagen ni seguimiento.');
                avisos.push('no llega video');
            }
            terminar();
        }

        async function abrirEscuchas() {
            if (!tieneNativo) { estadoDiag.escuchas = 'no disponible (navegador)'; return; }
            oyentes.push(DN.escuchar(DN.EVENTO_TELEMETRIA, (data) => {
                const raw = String(data?.raw || '').trim();
                conteoTelemetria++;
                estadoDiag.telemetriaTotal++;
                estadoDiag.ultimaTelemetria = raw;
                if (estadoDiag.telemetriaTotal === 1) agregarLog('rx', `Primera telemetría: ${raw.slice(0, 60)}...`);
            }));
            // Cada respuesta que llega del dron, con el puerto que la recibió (debe ser siempre el mismo)
            oyentes.push(DN.escuchar(DN.EVENTO_RESPUESTA, (d) => {
                const para = d?.comando ? `para "${d.comando}"` : 'sin comando esperando';
                agregarLog('rx', `"${d?.texto}" de ${d?.desde} → puerto local ${d?.puertoLocal} (${para})`);
            }));
            oyentes.push(DN.escuchar(DN.EVENTO_VIDEO, (data) => {
                estadoDiag.totalBytesVideo += data?.tamano || 0;
                estadoDiag.totalPaquetesVideo += data?.paquetes || 1;
            }));
            for (const p of [PUERTO_TELEMETRIA, PUERTO_VIDEO]) {
                try {
                    await DN.iniciarEscucha(p);
                    if (paginaCerrada) { DN.detenerEscucha(p); continue; }
                    puertosAbiertos.push(p);
                } catch (e) {
                    registrarError(`No se pudo escuchar el puerto ${p}: ${e?.message || e}`);
                }
            }
            estadoDiag.escuchas = puertosAbiertos.join(' y ') || 'ninguna';
            agregarLog('info', `Escuchando UDP en: ${estadoDiag.escuchas}. Mandá "command" para que el Tello empiece a enviar telemetría.`);
        }

        /**
         * Verifica que los archivos del modelo lleguen completos: pide model.json y cada shard y compara
         * los bytes recibidos con los que declara model.json. Detecta si en vez del archivo llega HTML
         * (en el APK, Capacitor responde index.html a las rutas sin extensión).
         */
        async function verificarModelo() {
            const MODELOS = [['detector (COCO-SSD)', './libs/coco-ssd/'], ['Mis objetos (MobileNet)', './libs/mobilenet/']];
            const caja = q('#diag-modelo-detalle');
            const lineas = [];
            const leer = async (ruta) => {
                const r = await fetch(ruta, { cache: 'no-store' });
                const datos = await r.arrayBuffer();
                const tipo = r.headers.get('content-type') || '(sin tipo)';
                const inicio = new TextDecoder().decode(new Uint8Array(datos.slice(0, 64)));
                return { status: r.status, bytes: datos.byteLength, tipo, datos, esHtml: /text\/html/i.test(tipo) || /<!doctype|<html/i.test(inicio) };
            };
            const bytesPorTipo = { float32: 4, int32: 4, float16: 2, uint16: 2, int16: 2, uint8: 1, int8: 1, bool: 1 };
            if (diagModelo) diagModelo.textContent = 'Verificando...';
            try {
                for (const lib of ['./libs/tfjs/tf.min.js', './libs/coco-ssd/coco-ssd.min.js']) {
                    const r = await leer(lib);
                    lineas.push(`${lib.split('/').pop()}: ${r.bytes.toLocaleString()} bytes · ${r.tipo} · HTTP ${r.status}`);
                }
                let esperado = 0;
                let recibido = 0;
                let archivos = 0;
                const problemas = [];
                for (const [nombre, base] of MODELOS) {
                    const mj = await leer(base + 'model.json');
                    lineas.push(`${nombre} · model.json: ${mj.bytes.toLocaleString()} bytes · ${mj.tipo} · HTTP ${mj.status}`);
                    if (mj.esHtml) throw new Error(`${base}model.json llegó como HTML (no es el archivo del modelo)`);
                    const modelo = JSON.parse(new TextDecoder().decode(mj.datos));
                    const rutas = [];
                    for (const g of modelo.weightsManifest) {
                        rutas.push(...g.paths);
                        // Un peso cuantizado (los modelos están en float16) ocupa lo que su tipo cuantizado, no su dtype
                        for (const w of g.weights) esperado += (w.shape || []).reduce((a, b) => a * b, 1) * (bytesPorTipo[w.quantization?.dtype || w.dtype] || 4);
                    }
                    for (const ruta of rutas) {
                        const r = await leer(base + ruta);
                        recibido += r.bytes;
                        archivos++;
                        const nota = r.esHtml ? ' ← LLEGÓ HTML (index.html), NO EL ARCHIVO' : (r.status !== 200 ? ` ← HTTP ${r.status}` : '');
                        if (nota) problemas.push(base + ruta);
                        lineas.push(`${ruta}: ${r.bytes.toLocaleString()} bytes · ${r.tipo}${nota}`);
                    }
                }
                estadoDiag.modelo = (!problemas.length && recibido === esperado)
                    ? `OK: ${MODELOS.length} modelos, ${archivos} archivos de pesos, ${recibido.toLocaleString()} bytes (coincide con model.json)`
                    : `FALLA: recibidos ${recibido.toLocaleString()} de ${esperado.toLocaleString()} bytes${problemas.length ? ` · con problemas: ${problemas.join(', ')}` : ''}`;
                if (problemas.length || recibido !== esperado) registrarError(`Modelo: ${estadoDiag.modelo}`);
            } catch (e) {
                estadoDiag.modelo = `FALLA: ${e.message}`;
                registrarError(`Modelo: ${e.message}`);
            }
            estadoDiag.modeloDetalle = lineas;
            if (diagModelo) diagModelo.textContent = estadoDiag.modelo;
            if (caja) caja.textContent = lineas.join('\n') || 'Sin datos.';
        }

        async function ejecutarDiagnosticoCompleto() {
            if (diagPlugin) diagPlugin.textContent = 'Consultando...';
            if (diagWifi) diagWifi.textContent = 'Vinculando...';

            if (tieneNativo) {
                try {
                    const inf = await DN.info();
                    const puertoCmd = inf.puertoLocalComandos > 0 ? inf.puertoLocalComandos : 'sin abrir';
                    estadoDiag.pluginInfo = `v${inf.version || '?'} (Android SDK ${inf.sdkAndroid || '?'}, red vinculada: ${inf.redVinculada ? 'sí' : 'no'}, red: ${inf.red || '?'}, puerto local de comandos: ${puertoCmd})`;
                } catch (e) {
                    estadoDiag.pluginInfo = `Error: ${e.message}`;
                    registrarError(e);
                }
                const resW = await DN.vincularRedWifi();
                estadoDiag.wifi = resW.vinculada ? `Vinculada (${resW.motivo || 'OK'})` : `NO vinculada (${resW.motivo || 'sin motivo'})`;
                estadoDiag.red = textoRed(resW.red);
                if (!resW.vinculada) registrarError(`vincularRedWifi: ${resW.motivo}`);
            } else {
                estadoDiag.pluginInfo = 'No disponible (navegador)';
                estadoDiag.wifi = 'No disponible (navegador)';
            }

            if (typeof VideoDecoder !== 'undefined') {
                try {
                    const sop = await VideoDecoder.isConfigSupported({ codec: 'avc1.42001f', codedWidth: 960, codedHeight: 720 });
                    estadoDiag.webCodecs = sop.supported ? 'Soportado (H.264 960x720)' : 'H.264 NO soportado';
                } catch (e) {
                    estadoDiag.webCodecs = `Error al verificar: ${e.message}`;
                }
            } else {
                estadoDiag.webCodecs = 'WebCodecs NO disponible en este WebView';
            }

            estadoDiag.userAgent = navigator.userAgent;
            // En el APK los archivos son locales (rápido): se verifica el modelo siempre.
            // En el navegador serían 9 MB por la red: solo con el botón "Verificar modelo".
            if (tieneNativo) await verificarModelo();
            actualizarUIResumen();
            agregarLog('info', 'Diagnóstico general completado.');
        }

        q('#btn-tello-cmd')?.addEventListener('click', () => enviarPrueba('command'));
        q('#btn-tello-bat')?.addEventListener('click', () => enviarPrueba('battery?'));
        q('#btn-tello-streamon')?.addEventListener('click', () => enviarPrueba('streamon'));
        q('#btn-tello-custom')?.addEventListener('click', () => {
            enviarPrueba(cmdInput?.value);
            if (cmdInput) cmdInput.value = '';
        });
        q('#btn-limpiar-log-tello')?.addEventListener('click', () => {
            if (logBox) logBox.textContent = 'Consola limpia. Lista para nuevas pruebas.';
        });
        q('#btn-probar-todo')?.addEventListener('click', probarTodo);
        q('#btn-ejecutar-diagnostico')?.addEventListener('click', ejecutarDiagnosticoCompleto);
        q('#btn-verificar-modelo')?.addEventListener('click', verificarModelo);
        q('#btn-limpiar-errores-diag')?.addEventListener('click', () => {
            estadoDiag.errores = [];
            if (diagErroresBox) diagErroresBox.textContent = 'Sin errores registrados.';
        });

        q('#btn-copiar-diagnostico')?.addEventListener('click', async () => {
            const informe = [
                '========================================',
                'INFORME DE DIAGNÓSTICO — GRUPO 5 DRON',
                `Fecha y hora: ${new Date().toLocaleString()}`,
                '========================================',
                `Resultado: ${q('#resultado-prueba')?.textContent.trim() || 'sin probar'}`,
                ...PASOS.map((p, i) => `  0${i + 1}. ${q(`#paso-${p}`)?.closest('.paso-prueba')?.querySelector('.paso-prueba__nombre')?.textContent || p}: ${resultadoPasos[p] || 'Sin probar'}`),
                '----------------------------------------',
                `• Plugin DronNative:     ${estadoDiag.pluginInfo}`,
                `• Red WiFi vinculada:    ${estadoDiag.wifi}`,
                `• Red que usa la app:    ${estadoDiag.red}`,
                `• Soporte WebCodecs:     ${estadoDiag.webCodecs}`,
                `• Respuesta "command":   ${estadoDiag.latencias.command}`,
                `• Respuesta "battery?":  ${estadoDiag.latencias.battery}`,
                `• Escuchas UDP abiertas: ${estadoDiag.escuchas}`,
                `• Telemetría (8890):     ${estadoDiag.telemetriaPPS} pps, ${estadoDiag.telemetriaTotal} paquetes en total`,
                `• Última telemetría:     ${estadoDiag.ultimaTelemetria}`,
                `• Video (11111):         ${estadoDiag.totalBytesVideo} bytes en ${estadoDiag.totalPaquetesVideo} paquetes`,
                `• WebView / UserAgent:   ${estadoDiag.userAgent}`,
                `• Modelo de seguimiento: ${estadoDiag.modelo}`,
                `• Modo técnico:          ${modoTecnico() ? 'activado' : 'apagado'}`,
                ...estadoDiag.modeloDetalle.map(l => `    ${l}`),
                '----------------------------------------',
                'ÚLTIMOS ERRORES REGISTRADOS:',
                estadoDiag.errores.length ? estadoDiag.errores.join('\n') : 'Ninguno.',
                '========================================',
            ].join('\n');

            let copiado = false;
            if (navigator.clipboard?.writeText) {
                try { await navigator.clipboard.writeText(informe); copiado = true; } catch (_) { /* se intenta el respaldo */ }
            }
            if (!copiado && textareaRespaldo) {
                try {
                    textareaRespaldo.value = informe;
                    textareaRespaldo.select();
                    copiado = document.execCommand('copy');
                } catch (_) { /* sin portapapeles */ }
            }
            mostrarToast(copiado ? 'Informe copiado al portapapeles.' : 'No se pudo copiar automáticamente. Revisá los permisos.', copiado ? 'exito' : 'advertencia');
        });

        abrirEscuchas().then(ejecutarDiagnosticoCompleto);

        // Limpieza al salir de la página
        return async () => {
            paginaCerrada = true;
            clearInterval(intervaloPPS);
            await Promise.all(oyentes.splice(0).map(h => h.remove()));
            await Promise.all(puertosAbiertos.splice(0).map(p => DN.detenerEscucha(p)));
        };
    }

    /**
     * Inicialización global de la aplicación.
     */
    async function iniciar() {
        document.body.classList.toggle('modo-tecnico', modoTecnico());

        // Enlazar eventos del menú lateral
        const btnMenu = document.getElementById('btn-menu');
        if (btnMenu) {
            btnMenu.addEventListener('click', toggleMenu);
        }

        const overlay = document.getElementById('menu-overlay');
        if (overlay) {
            overlay.addEventListener('click', cerrarMenu);
        }

        // Cerrar menú al hacer clic en enlaces del menú lateral
        document.querySelectorAll('.menu-lateral__enlace').forEach((enlace) => {
            enlace.addEventListener('click', () => {
                cerrarMenu();
            });
        });

        // Escuchar cambios de hash
        window.addEventListener('hashchange', cargarRutaActual);

        // Cargar vista inicial
        cargarRutaActual();
    }

    // Auto inicializar al terminar de cargar el DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

    // Exponer API pública
    return {
        mostrarToast,
        navegarA,
        toggleMenu,
        abrirMenu,
        cerrarMenu,
        cargarRutaActual,
        icono,
        textoConIcono,
        textoConPunto,
        modoTecnico,
        cambiarModoTecnico,
        llenarQueSeguir,
    };
})();
