/**
 * Pruebas del seguimiento estilo RAC: reglas (75 %, 8 seguidas para confirmar, perdido con 3 de 5),
 * recuadro de la cara con el cuerpo de respaldo, elegir tocando un recuadro y el diagnóstico en palabras.
 * Sin navegador ni modelos: las detecciones y las caras se inventan.
 *
 * Ejecutar: node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Seguimiento = require('../backend/public/js/dron-seguimiento.js');
const DronCaras = require('../backend/public/js/dron-caras.js');

const A = { ...Seguimiento.AJUSTES_POR_DEFECTO };
const C = Seguimiento.Controlador;

/** Cuerpo centrado en (cx, cy) con alto h. */
function cuerpo(cx, cy, h, score = 0.9, clase = 'person') {
    const w = h * 0.4;
    return { clase, score, x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Cara arriba de un cuerpo (centrada, en el primer 15 % del alto). */
function caraDe(c, p = 0.95) {
    const h = c.h * 0.14;
    return { x: c.x + c.w / 2 - h / 2, y: c.y + c.h * 0.02, w: h, h, p };
}

const candidatos = (dets, caras = []) => Seguimiento.combinarPersonas(dets, caras, A);

// ---------------------------------------------------------------
// Candidatos: cara o cuerpo
// ---------------------------------------------------------------

test('persona con la cara visible: el recuadro es la cara y la confianza, la mayor de las dos', () => {
    const b = cuerpo(0.5, 0.5, 0.6, 0.62);
    const [c] = candidatos([b], [caraDe(b, 0.93)]);
    assert.equal(c.tipo, 'cara');
    assert.equal(c.conf, 0.93);
    assert.ok(c.h < 0.1, 'recuadro chico: la cara');
    assert.ok(c.cuerpo && Math.abs(c.cuerpo.h - 0.6) < 1e-9, 'guarda el cuerpo para seguirlo si la cara se deja de ver');
});

test('persona de espaldas (sin cara): el recuadro es el cuerpo', () => {
    const [c] = candidatos([cuerpo(0.5, 0.5, 0.6, 0.8)], []);
    assert.equal(c.tipo, 'cuerpo');
    assert.equal(c.conf, 0.8);
    assert.equal(c.cara, null);
});

test('cada cara va a su cuerpo; una cara sin cuerpo (alguien muy cerca) es una persona igual', () => {
    const izq = cuerpo(0.25, 0.5, 0.6);
    const der = cuerpo(0.75, 0.5, 0.6);
    const suelta = { x: 0.45, y: 0.05, w: 0.1, h: 0.1, p: 0.9 };
    const cs = candidatos([izq, der], [caraDe(der), caraDe(izq), suelta]);
    assert.equal(cs.length, 3);
    const [ci, cd, cc] = cs;
    assert.ok(Math.abs(ci.x + ci.w / 2 - 0.25) < 0.01, 'la cara de la izquierda, con su cuerpo');
    assert.ok(Math.abs(cd.x + cd.w / 2 - 0.75) < 0.01, 'la de la derecha, con el suyo');
    assert.equal(cc.tipo, 'cara');
    assert.equal(cc.cuerpo, null);
});

test('una cara de poca probabilidad no reemplaza al cuerpo', () => {
    const b = cuerpo(0.5, 0.5, 0.6, 0.8);
    const [c] = candidatos([b], [caraDe(b, A.umbralCara - 0.1)]);
    assert.equal(c.tipo, 'cuerpo');
});

test('objetos: su recuadro, con el nombre en español', () => {
    const [c] = candidatos([cuerpo(0.5, 0.5, 0.3, 0.78, 'bottle')], []);
    assert.equal(c.tipo, 'objeto');
    assert.equal(Seguimiento.nombreEspanol(c.clase), 'Botella');
    assert.equal(Seguimiento.nombreEspanol('person'), 'Persona');
    assert.equal(Seguimiento.nombreEspanol('cosa-rara'), 'Cosa-rara');
});

// ---------------------------------------------------------------
// Reglas de RAC
// ---------------------------------------------------------------

test('confirma con 8 detecciones seguidas de 75 % o más, mostrando n/8', () => {
    const s = new Seguimiento.Selector(A);
    for (let i = 1; i <= 7; i++) {
        s.actualizar(candidatos([cuerpo(0.5, 0.5, 0.5, 0.8)]), i * 125);
        assert.equal(s.estado, 'confirmando');
        assert.equal(s.confirmaciones, i);
    }
    s.actualizar(candidatos([cuerpo(0.5, 0.5, 0.5, 0.8)]), 8 * 125);
    assert.equal(s.estado, 'siguiendo');
});

test('una detección de menos de 75 % corta la confirmación', () => {
    const s = new Seguimiento.Selector(A);
    for (let i = 0; i < 6; i++) s.actualizar(candidatos([cuerpo(0.5, 0.5, 0.5, 0.8)]), i * 125);
    s.actualizar(candidatos([cuerpo(0.5, 0.5, 0.5, 0.7)]), 750);
    assert.equal(s.confirmaciones, 0);
    assert.equal(s.estado, 'buscando');
});

test('siguiendo: 2 fallas de 5 no alcanzan; la tercera lo da por perdido', () => {
    const s = new Seguimiento.Selector(A);
    let t = 0;
    for (let i = 0; i < 8; i++) s.actualizar(candidatos([cuerpo(0.5, 0.5, 0.5)]), (t += 125));
    assert.equal(s.estado, 'siguiendo');
    s.actualizar([], (t += 125));
    s.actualizar(candidatos([cuerpo(0.5, 0.5, 0.5, 0.6)]), (t += 125)); // 60 %: también es falla
    assert.equal(s.estado, 'perdiendo');
    s.actualizar(candidatos([cuerpo(0.5, 0.5, 0.5)]), (t += 125));
    assert.equal(s.estado, 'siguiendo');
    s.actualizar([], (t += 125));
    assert.equal(s.estado, 'perdido', '3 fallas en las últimas 5');
    assert.equal(s.objetivo, null);
});

test('cambio de cara a cuerpo: sigue al mismo objetivo y usa el tamaño ideal de cada uno', () => {
    // Persona a la distancia ideal: el cuerpo mide alturaObjetivo y su cara, alturaObjetivoCara
    const b = cuerpo(0.5, 0.5, A.alturaObjetivo);
    const f = { x: 0.5 - A.alturaObjetivoCara / 2, y: b.y + 0.01, w: A.alturaObjetivoCara, h: A.alturaObjetivoCara, p: 0.95 };
    const seg = new Seguimiento.Seguidor(A);
    let t = 0;
    for (let i = 0; i < 12; i++) { seg.procesarDeteccion(candidatos([b], [f]), (t += 125)); seg.tickControl(t); }
    assert.equal(seg.estado, 'siguiendo');
    assert.equal(seg.selector.objetivo.tipo, 'cara');
    assert.equal(C.comandoDeseado(seg.selector.objetivo, A).fb, 0, 'con la cara a su tamaño ideal no avanza');
    // Se da vuelta: ya no se ve la cara
    for (let i = 0; i < 6; i++) { seg.procesarDeteccion(candidatos([b], []), (t += 125)); seg.tickControl(t); }
    assert.equal(seg.estado, 'siguiendo', 'no lo pierde al cambiar de recuadro');
    assert.equal(seg.selector.objetivo.tipo, 'cuerpo');
    assert.ok(Math.abs(seg.selector.objetivo.h - A.alturaObjetivo) < 1e-9, 'arranca el suavizado con el cuerpo');
    assert.equal(C.comandoDeseado(seg.selector.objetivo, A).fb, 0, 'con el cuerpo a su tamaño ideal tampoco');
    // Si siguiera usando el tamaño de la cara, el cuerpo parecería "muy cerca" y retrocedería
    assert.ok(C.comandoDeseado({ ...seg.selector.objetivo, tipo: 'cara' }, A).fb < 0);
    // Y vuelve a la cara
    for (let i = 0; i < 3; i++) { seg.procesarDeteccion(candidatos([b], [f]), (t += 125)); seg.tickControl(t); }
    assert.equal(seg.selector.objetivo.tipo, 'cara');
});

test('la cara chica de una persona lejana cuenta como persona grande al elegir (no se elige otra por ser cuerpo)', () => {
    const lejos = cuerpo(0.3, 0.5, 0.3);
    const cerca = cuerpo(0.7, 0.5, 0.35);
    const s = new Seguimiento.Selector(A);
    for (let i = 0; i < 8; i++) s.actualizar(candidatos([lejos, cerca], [caraDe(cerca)]), i * 125);
    assert.equal(s.estado, 'siguiendo');
    assert.ok(s.objetivo.cx > 0.6, 'elige la más grande aunque se la vea por la cara');
});

test('tocar un recuadro elige ese objetivo (aunque haya otro más grande)', () => {
    const grande = cuerpo(0.3, 0.5, 0.7);
    const chica = cuerpo(0.8, 0.5, 0.4);
    const s = new Seguimiento.Selector(A);
    s.sembrar({ x: 0.8, y: 0.5 });
    for (let i = 0; i < 8; i++) s.actualizar(candidatos([grande, chica]), i * 125);
    assert.equal(s.estado, 'siguiendo');
    assert.ok(Math.abs(s.objetivo.cx - 0.8) < 1e-9);
});

test('tocar una botella: la sigue por su clase, con su nombre', () => {
    const botella = cuerpo(0.6, 0.6, 0.3, 0.8, 'bottle');
    const s = new Seguimiento.Selector(A, { tipo: 'clase', clase: 'bottle' });
    for (let i = 0; i < 8; i++) s.actualizar(candidatos([cuerpo(0.2, 0.5, 0.7), botella]), i * 125);
    assert.equal(s.estado, 'siguiendo');
    assert.equal(s.nombre, 'Botella');
    assert.equal(s.objetivo.clase, 'bottle');
});

test('enPunto: el recuadro más chico que contiene el punto; si no hay, el más cercano (o ninguno)', () => {
    const lista = candidatos([cuerpo(0.5, 0.5, 0.8), cuerpo(0.5, 0.5, 0.3, 0.9, 'bottle')]).map(c => ({ ...c }));
    assert.equal(Seguimiento.Selector.enPunto(lista, { x: 0.5, y: 0.5 }).clase, 'bottle');
    assert.equal(Seguimiento.Selector.enPunto(lista, { x: 0.05, y: 0.05 }), null);
});

test('tarjeta de estado como RAC: naranja buscando y confirmando, verde siguiendo, rojo perdido', () => {
    const e = Seguimiento.estadoTarjeta;
    assert.deepEqual([e({ estado: 'buscando' }).titulo, e({ estado: 'buscando' }).color], ['Buscando objetivo...', 'advertencia']);
    assert.equal(e({ estado: 'confirmando', nombre: 'Persona', confirmaciones: 5, confirmacionVentana: 8 }).titulo, 'Confirmando: Persona (5/8)');
    assert.deepEqual([e({ estado: 'siguiendo', nombre: 'Botella' }).titulo, e({ estado: 'siguiendo' }).color], ['Siguiendo: Botella', 'exito']);
    assert.deepEqual([e({ estado: 'perdido' }).titulo, e({ estado: 'perdido' }).color], ['Objetivo perdido', 'error']);
    // Lenguaje simple: dice que el dron queda quieto, sin "rc" (el rc 0 0 0 0 lo prueban control-real y seguimiento)
    assert.match(e({ estado: 'perdido' }).texto, /queda quieto/);
    assert.doesNotMatch(e({ estado: 'perdido' }).texto, /\brc\b/);
});

// ---------------------------------------------------------------
// BlazeFace (decodificación pura)
// ---------------------------------------------------------------

test('BlazeFace: 896 anclas (16×16×2 + 8×8×6) en el centro de cada celda', () => {
    const a = DronCaras.anclas(256);
    assert.equal(a.length, 896);
    assert.deepEqual(a[0], [8, 8]);
    assert.deepEqual(a[1], [8, 8]);
    assert.deepEqual(a[512], [16, 16]);
    assert.deepEqual(a[895], [240, 240]);
});

test('BlazeFace: decodifica una cara en su ancla y descarta las de poca probabilidad', () => {
    const logitos = new Float32Array(896).fill(-10);
    const rec = new Float32Array(896 * 16);
    const i = 512 + (3 * 8 + 4) * 6; // grilla gruesa, fila 3, columna 4 → centro (144, 112)
    logitos[i] = 3;                  // ~95 %
    rec.set([4, -2, 64, 64], i * 16);
    const caras = DronCaras.decodificar(logitos, rec, 256, 0.5);
    assert.equal(caras.length, 1);
    const c = caras[0];
    assert.ok(Math.abs(c.p - 1 / (1 + Math.exp(-3))) < 1e-9);
    assert.ok(Math.abs(c.x + c.w / 2 - 148 / 256) < 1e-6 && Math.abs(c.y + c.h / 2 - 110 / 256) < 1e-6);
    assert.ok(Math.abs(c.w - 0.25) < 1e-9);
});

test('BlazeFace: de varios recuadros superpuestos queda el de más probabilidad', () => {
    const cajas = [
        { x: 0.1, y: 0.1, w: 0.2, h: 0.2, p: 0.8 },
        { x: 0.11, y: 0.1, w: 0.2, h: 0.2, p: 0.9 },
        { x: 0.6, y: 0.6, w: 0.2, h: 0.2, p: 0.7 },
    ];
    const r = DronCaras.sinRepetidos(cajas);
    assert.deepEqual(r.map(c => c.p), [0.9, 0.7]);
    assert.ok(DronCaras.iou(cajas[0], cajas[1]) > 0.8);
    assert.equal(DronCaras.iou(cajas[0], cajas[2]), 0);
});

// ---------------------------------------------------------------
// Diagnóstico (lo que se muestra en pantalla)
// ---------------------------------------------------------------

const DIAG_OK = {
    imagenOk: true, congelada: false, brillo: 120, backend: 'webgl', float32: false,
    pruebaPersona: 0.92, pruebaCara: 0.9, pruebaPersonaCpu: null, personaCuadro: 0.85, caraCuadro: 0.9, ms: 150,
};

test('diagnóstico: todo bien', () => {
    const r = Seguimiento.conclusionDiagnostico(DIAG_OK);
    assert.ok(r.items.every(i => i.ok), JSON.stringify(r.items.filter(i => !i.ok)));
    assert.match(r.conclusion, /Todo anda/);
});

test('diagnóstico: la causa en palabras, en orden', () => {
    const casos = [
        [{ imagenOk: false }, /No llega imagen/],
        [{ congelada: true }, /congelado/],
        [{ brillo: 3 }, /negra/],
        [{ pruebaPersona: 0.05, pruebaPersonaCpu: 0.9 }, /placa de video de este celular calcula mal/],
        [{ pruebaPersona: 0.05, pruebaPersonaCpu: 0.05 }, /no reconoce ni la foto de prueba/],
        [{ personaCuadro: 0, caraCuadro: 0 }, /no ve a nadie/],
        [{ personaCuadro: 0.42, caraCuadro: 0 }, /poca confianza/],
        [{ ms: 400 }, /lento/],
    ];
    for (const [cambio, texto] of casos) {
        const r = Seguimiento.conclusionDiagnostico({ ...DIAG_OK, ...cambio });
        assert.match(r.conclusion, texto, JSON.stringify(cambio));
        assert.ok(r.items.some(i => i.ok === false), `marca algo en rojo: ${JSON.stringify(cambio)}`);
    }
});
