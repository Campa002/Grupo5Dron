/**
 * Pruebas automáticas del seguimiento (selector + controlador), con recorridos sintéticos.
 * No usan el navegador, el modelo ni el dron: se le pasan detecciones inventadas y el tiempo a mano.
 *
 * Ejecutar: node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Seguimiento = require('../backend/public/js/dron-seguimiento.js');

const A = { ...Seguimiento.AJUSTES_POR_DEFECTO };
const C = Seguimiento.Controlador;
const EPS = 1e-9;

/** Una persona centrada en (cx, cy) con altura de recuadro h (todo normalizado). */
function persona(cx, cy, h, score = 0.9) {
    const w = h * 0.4;
    return { clase: 'person', score, x: cx - w / 2, y: cy - h / 2, w, h };
}

const interpolar = (a, b, f) => a + (b - a) * Math.max(0, Math.min(1, f));

/**
 * Corre el seguidor: detecciones a `fps` y control a 15 Hz, durante `durMs`.
 * @param {(t:number) => Array} generar candidatos en el tiempo t
 */
function simular(durMs, generar, { ajustes = A, fps = 8 } = {}) {
    const seg = new Seguimiento.Seguidor(ajustes);
    const registro = [];
    let tDet = 0;
    for (let t = 0; t <= durMs + 1e-6; t += 1000 / 15) {
        while (tDet <= t) {
            seg.procesarDeteccion(generar(tDet), tDet);
            tDet += 1000 / fps;
        }
        const r = seg.tickControl(t);
        registro.push({ t, ...r, objetivo: seg.selector.objetivo ? { ...seg.selector.objetivo } : null });
    }
    return registro;
}

const ultimo = reg => reg[reg.length - 1];
const en = (reg, t) => reg.reduce((m, r) => (Math.abs(r.t - t) < Math.abs(m.t - t) ? r : m));

// ---------------------------------------------------------------------------
test('centrado y a la distancia objetivo: comando quieto (zona muerta)', () => {
    const reg = simular(2000, () => [persona(0.5, 0.5, A.alturaObjetivo)]);
    const { comando, estado } = ultimo(reg);
    assert.equal(estado, 'siguiendo');
    assert.deepEqual(comando, { yaw: 0, ud: 0, fb: 0 });
});

test('dentro de la zona muerta no hay comando', () => {
    const reg = simular(2000, () => [persona(0.5 + A.zonaMuertaX * 0.8, 0.5 - A.zonaMuertaY * 0.8, A.alturaObjetivo + A.zonaMuertaTamano * 0.8)]);
    assert.deepEqual(ultimo(reg).comando, { yaw: 0, ud: 0, fb: 0 });
});

test('persona a la derecha: gira a la derecha (yaw), sin roll y acotado', () => {
    const reg = simular(3000, () => [persona(0.9, 0.5, A.alturaObjetivo)]);
    const { comando } = ultimo(reg);
    assert.ok(comando.yaw > 0, 'yaw positivo');
    assert.ok(comando.yaw <= A.velMaxYaw + EPS, 'yaw acotado');
    assert.deepEqual(Object.keys(comando).sort(), ['fb', 'ud', 'yaw'], 'nunca roll');
    assert.equal(comando.ud, 0);
    assert.equal(comando.fb, 0);
});

test('persona a la izquierda: gira a la izquierda', () => {
    const reg = simular(3000, () => [persona(0.1, 0.5, A.alturaObjetivo)]);
    assert.ok(ultimo(reg).comando.yaw < 0);
});

test('persona que se aleja: avanza; que se acerca: retrocede', () => {
    const lejos = simular(4000, t => [persona(0.5, 0.5, interpolar(A.alturaObjetivo, 0.2, t / 3000))]);
    assert.ok(ultimo(lejos).comando.fb > 0, 'avanza');
    assert.ok(ultimo(lejos).comando.fb <= A.velMaxAvance + EPS, 'avance acotado');
    const cerca = simular(4000, t => [persona(0.5, 0.5, interpolar(A.alturaObjetivo, 0.75, t / 3000))]);
    assert.ok(ultimo(cerca).comando.fb < 0, 'retrocede');
});

test('persona arriba del centro: sube; recuadro cortado arriba: no sube ni baja', () => {
    const arriba = simular(3000, () => [persona(0.5, 0.3, 0.3)]);
    assert.ok(ultimo(arriba).comando.ud > 0, 'sube');
    // Recuadro que empieza en el borde superior (cabeza cortada)
    const cortado = simular(3000, () => [{ clase: 'person', score: 0.9, x: 0.4, y: 0, w: 0.2, h: 0.5 }]);
    assert.equal(ultimo(cortado).comando.ud, 0);
});

test('un falso positivo de un solo cuadro no fija un objetivo', () => {
    const reg = simular(2000, t => (t === 0 ? [persona(0.9, 0.5, 0.45)] : []));
    assert.ok(reg.every(r => r.estado === 'buscando'));
    assert.ok(reg.every(r => r.comando.yaw === 0));
});

test('detecciones por debajo del umbral de confianza se ignoran', () => {
    const reg = simular(2000, () => [persona(0.9, 0.5, 0.45, A.umbralConfianza - 0.05)]);
    assert.equal(ultimo(reg).estado, 'buscando');
    assert.equal(ultimo(reg).comando.yaw, 0);
});

test('cruce de dos personas: no cambia de objetivo', () => {
    // A (más grande, más centrada al inicio) va de 0,4 a 0,8; B va de 0,8 a 0,4. Se cruzan a los 2 s.
    const reg = simular(4500, t => [
        persona(interpolar(0.4, 0.8, t / 4000), 0.5, 0.5),
        persona(interpolar(0.8, 0.4, t / 4000), 0.5, 0.35),
    ]);
    const siguiendo = reg.filter(r => r.objetivo);
    assert.ok(siguiendo.length > 40);
    assert.ok(siguiendo.every(r => r.objetivo.h > 0.45), 'el tamaño del objetivo sigue siendo el de A');
    assert.ok(ultimo(reg).objetivo.cx > 0.7, 'al final el objetivo está donde terminó A');
    assert.ok(reg.every(r => r.estado !== 'perdido'));
});

test('cruce de dos personas del mismo tamaño: sigue a la que venía siguiendo (por la velocidad)', () => {
    const reg = simular(4500, t => [
        persona(interpolar(0.4, 0.8, t / 4000), 0.5, 0.45),
        persona(interpolar(0.8, 0.4, t / 4000), 0.5, 0.45),
    ]);
    assert.ok(ultimo(reg).objetivo.cx > 0.7, 'termina sobre la persona que iba hacia la derecha');
});

test('si desaparece: el comando decae a 0 y después pasa a "perdido"', () => {
    const corte = 2000;
    const reg = simular(5000, t => (t < corte ? [persona(0.9, 0.5, 0.45)] : []));
    assert.ok(en(reg, corte - 70).comando.yaw > 0, 'antes del corte giraba');
    // Vence a los 400 ms, decae en 300 ms y frena (desaceleración 1,5/s): a los 1,0 s del corte ya está en 0
    assert.equal(en(reg, corte + 1000).comando.yaw, 0);
    assert.equal(en(reg, corte + 600).estado, 'perdiendo');
    const primerPerdido = reg.find(r => r.estado === 'perdido');
    assert.ok(primerPerdido, 'pasa a perdido');
    assert.ok(primerPerdido.t >= corte - 125 + A.toleranciaPerdidaMs && primerPerdido.t <= corte + A.toleranciaPerdidaMs + 150,
        `pasa a perdido después de la tolerancia (${Math.round(primerPerdido.t)} ms)`);
    assert.deepEqual(ultimo(reg).comando, { yaw: 0, ud: 0, fb: 0 }, 'queda quieto');
});

test('pérdidas cortas (menores a la tolerancia) no lo dan por perdido', () => {
    // Visible 1 s, oculto 0,6 s, visible 1 s, oculto 0,6 s...
    const reg = simular(6000, t => ((t % 1600) < 1000 ? [persona(0.6, 0.5, 0.45)] : []));
    assert.ok(reg.every(r => r.estado !== 'perdido'));
    assert.ok(reg.some(r => r.estado === 'perdiendo'));
});

test('perdido: no se engancha a otra persona que aparece lejos', () => {
    const reg = simular(9000, t => {
        if (t < 2000) return [persona(0.8, 0.5, 0.45)];
        if (t < 4500) return [];
        return [persona(0.2, 0.5, 0.45)];
    });
    assert.equal(ultimo(reg).estado, 'perdido');
    assert.deepEqual(ultimo(reg).comando, { yaw: 0, ud: 0, fb: 0 });
});

test('perdido: si reaparece cerca y dentro de la ventana, lo retoma', () => {
    const reg = simular(7000, t => (t < 2000 || t >= 4500 ? [persona(0.8, 0.5, 0.45)] : []));
    assert.ok(reg.some(r => r.estado === 'perdido'));
    assert.equal(ultimo(reg).estado, 'siguiendo');
});

test('perdido: pasada la ventana de readquisición, no retoma solo', () => {
    const fin = 2000 + A.toleranciaPerdidaMs + A.ventanaReadquisicionMs + 1000;
    const reg = simular(fin + 2000, t => (t < 2000 || t >= fin ? [persona(0.8, 0.5, 0.45)] : []));
    assert.equal(ultimo(reg).estado, 'perdido');
});

test('aceleración gradual: el comando no cambia más rápido que lo permitido', () => {
    const reg = simular(3000, () => [persona(0.95, 0.15, 0.15)]);
    const dt = 1 / 15;
    for (let i = 1; i < reg.length; i++) {
        for (const eje of ['yaw', 'ud', 'fb']) {
            const salto = Math.abs(reg[i].comando[eje] - reg[i - 1].comando[eje]);
            assert.ok(salto <= A.aceleracionMax * dt + 1e-6, `${eje} saltó ${salto.toFixed(3)} en un paso`);
        }
    }
    assert.ok(ultimo(reg).comando.yaw > 0.25, 'pero llega al valor deseado');
});

test('limitarCambio: al cambiar de sentido primero frena hasta 0', () => {
    let v = 0.3;
    const dt = 1 / 15;
    const valores = [];
    for (let i = 0; i < 30; i++) { v = C.limitarCambio(v, -0.3, dt, A); valores.push(v); }
    const cruce = valores.findIndex(x => x <= 0);
    assert.equal(valores[cruce], 0, 'pasa por 0 exacto');
    assert.ok(valores.every((x, i) => i === 0 || Math.abs(x - valores[i - 1]) <= A.desaceleracionMax * dt + 1e-9));
});

test('factorVencimiento: 1 si la detección es reciente, decae a 0 y queda en 0', () => {
    assert.equal(C.factorVencimiento(0, A), 1);
    assert.equal(C.factorVencimiento(A.vencimientoComandoMs, A), 1);
    const medio = C.factorVencimiento(A.vencimientoComandoMs + A.decaimientoMs / 2, A);
    assert.ok(Math.abs(medio - 0.5) < 1e-9);
    assert.equal(C.factorVencimiento(A.vencimientoComandoMs + A.decaimientoMs + 1, A), 0);
    assert.equal(C.factorVencimiento(60000, A), 0);
});

test('detección atrasada (inferencia trabada): el comando decae aunque el objetivo siga a la derecha', () => {
    // Detecciones solo hasta 1 s; después el modelo "se traba" (no llegan cuadros nuevos)
    const seg = new Seguimiento.Seguidor(A);
    for (let t = 0; t <= 1000; t += 125) seg.procesarDeteccion([persona(0.9, 0.5, 0.45)], t);
    let r;
    for (let t = 0; t <= 2500; t += 1000 / 15) r = seg.tickControl(t);
    assert.deepEqual(r.comando, { yaw: 0, ud: 0, fb: 0 });
});

test('condiciones del control real', () => {
    const ok = { enVuelo: true, alturaCm: 120, bateria: 80, telemetriaOk: true, backend: 'webgl', fps: 8 };
    assert.deepEqual(Seguimiento.condicionesControlReal(ok, A), { ok: true, motivos: [] });
    const casos = [
        [{ enVuelo: false }, 'no está en vuelo'],
        [{ alturaCm: 50 }, 'altura menor'],
        [{ alturaCm: 400 }, 'altura mayor'],
        [{ alturaCm: null }, 'no se conoce la altura'],
        [{ bateria: 20 }, 'batería menor'],
        [{ bateria: null }, 'batería menor'],
        [{ telemetriaOk: false }, 'telemetría'],
        [{ backend: 'cpu' }, 'WebGL'],
        [{ fps: 2 }, 'FPS'],
    ];
    for (const [cambio, texto] of casos) {
        const r = Seguimiento.condicionesControlReal({ ...ok, ...cambio }, A);
        assert.equal(r.ok, false, JSON.stringify(cambio));
        assert.ok(r.motivos.some(m => m.includes(texto)), `${JSON.stringify(cambio)} → ${r.motivos}`);
    }
});

// Generador pseudoaleatorio con semilla (las pruebas tienen que dar siempre lo mismo)
function azar(semilla) {
    let s = semilla >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('recuadro con ruido: no pierde el objetivo y el comando no oscila de signo', () => {
    const r = azar(42);
    const ruido = (a) => (r() - 0.5) * 2 * a;
    const reg = simular(6000, () => [persona(0.75 + ruido(0.02), 0.5 + ruido(0.02), 0.45 + ruido(0.03))]);
    const despues = reg.filter(x => x.t > 1500);
    assert.ok(despues.every(x => x.estado === 'siguiendo'));
    assert.ok(despues.every(x => x.comando.yaw > 0), 'el yaw siempre hacia la derecha');
    assert.ok(despues.every(x => x.comando.ud === 0), 'el ruido vertical queda dentro de la zona muerta');
});

test('detecciones que fallan al azar (30 %): sigue sin pasar a perdido', () => {
    const r = azar(7);
    const reg = simular(8000, () => (r() < 0.7 ? [persona(0.7, 0.5, 0.45)] : []));
    assert.ok(reg.filter(x => x.t > 1000).every(x => x.estado !== 'perdido'));
    assert.ok(ultimo(reg).comando.yaw > 0);
});

test('al empezar elige a la persona grande (cercana), no a una lejana diminuta aunque esté centrada', () => {
    const reg = simular(2000, () => [persona(0.5, 0.5, 0.04), persona(0.25, 0.55, 0.5)]);
    assert.equal(ultimo(reg).estado, 'siguiendo');
    assert.ok(ultimo(reg).objetivo.h > 0.4, 'fijó a la persona grande');
});

test('no fija personas más chicas que el mínimo', () => {
    const reg = simular(2000, () => [persona(0.5, 0.5, A.alturaMinimaFijar * 0.8)]);
    assert.ok(reg.every(r => r.estado === 'buscando'));
});

test('entre dos personas del mismo tamaño elige la más centrada', () => {
    const reg = simular(2000, () => [persona(0.15, 0.5, 0.4), persona(0.55, 0.5, 0.4)]);
    assert.ok(Math.abs(ultimo(reg).objetivo.cx - 0.55) < 0.05);
});

test('validarAjustes: acepta valores en rango y rechaza los de afuera con un mensaje claro', () => {
    const ok = Seguimiento.validarAjustes({ gananciaYaw: '0.8', alturaObjetivo: 0.5, toleranciaPerdidaMs: 2000 });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.ajustes, { gananciaYaw: 0.8, alturaObjetivo: 0.5, toleranciaPerdidaMs: 2000 });

    const mal = Seguimiento.validarAjustes({ velMaxYaw: 0.9, umbralConfianza: 'abc', claveInventada: 5 });
    assert.equal(mal.ok, false);
    assert.ok(mal.errores.some(e => e.includes('Velocidad máxima de giro') && e.includes('entre 5 % y 50 %')), mal.errores.join(' | '));
    assert.ok(mal.errores.some(e => e.includes('Confianza mínima') && e.includes('no es un número')));
    assert.ok(!('claveInventada' in mal.ajustes));
});

test('validarAjustes: controles cruzados (altura mín < máx; fallas ≤ ventana)', () => {
    assert.ok(Seguimiento.validarAjustes({ alturaMinCm: 200, alturaMaxCm: 150 }).errores.some(e => e.includes('altura mínima')));
    assert.ok(Seguimiento.validarAjustes({ perdidaVentana: 3, perdidaMinimo: 5 }).errores.some(e => e.includes('fallas')));
    assert.equal(Seguimiento.validarAjustes({ perdidaVentana: 5, perdidaMinimo: 3 }).ok, true);
});

test('los valores por defecto están dentro de sus propios rangos', () => {
    const editables = Object.fromEntries(Object.keys(Seguimiento.RANGOS).map(k => [k, A[k]]));
    const r = Seguimiento.validarAjustes(editables);
    assert.equal(r.ok, true, r.errores.join(' | '));
    assert.equal(A.confirmacionUmbral, 0.75, 'criterio tipo RAC: 75 %');
    assert.equal(A.confirmacionVentana, 8, 'criterio tipo RAC: 8 detecciones');
    assert.equal(A.perdidaVentana, 5);
    assert.equal(A.perdidaMinimo, 3);
});

test('registro por cuadro: CSV con detección, comando y telemetría', () => {
    const seg = new Seguimiento({ videoEl: { width: 960, height: 720 }, obtenerContexto: () => ({ enVuelo: true, alturaCm: 120, bateria: 77 }) });
    seg.seguidor = new Seguimiento.Seguidor(A);
    seg._tActivacion = 0;
    for (let i = 0; i < 4; i++) {
        const t = i * 125;
        seg.seguidor.procesarDeteccion([persona(0.8, 0.5, 0.45)], t);
        seg.seguidor.tickControl(t);
        seg._registrar(t, { ms: 20, candidatos: [{ ...persona(0.8, 0.5, 0.45) }] });
    }
    const filas = seg.registroCSV().split('\n');
    assert.equal(filas.length, 5);
    assert.ok(filas[0].startsWith('t_ms;estado;personas;inferencia_ms'));
    const ultima = filas[4].split(';');
    assert.equal(ultima[1], 'siguiendo');
    assert.equal(ultima[2], '1');
    assert.equal(ultima[12], '1');   // en vuelo
    assert.equal(ultima[13], '120'); // altura
    assert.equal(ultima[14], '77');  // batería
});
