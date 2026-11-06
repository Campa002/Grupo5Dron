/**
 * Pruebas automáticas de "Mis objetos": cantidad de fotos, parecido entre huellas y el selector de objetos
 * (criterio tipo RAC: confirmar con 8, perder con 3 de 5; como mucho 3 comparaciones por cuadro; re-verificar cada ~1 s).
 * Sin navegador ni modelos: las huellas y los parecidos se inventan.
 *
 * Ejecutar: node --test tests/
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const DronObjetos = require('../backend/public/js/dron-objetos.js');
const Seguimiento = require('../backend/public/js/dron-seguimiento.js');

const A = { ...Seguimiento.AJUSTES_POR_DEFECTO };

/** Candidato de cualquier clase centrado en (cx, cy), con altura h y parecido `sim` (o sin comparar). */
function cand(cx, cy, h, sim, clase = 'cup', score = 0.8) {
    const w = h * 0.6;
    const c = { clase, score, x: cx - w / 2, y: cy - h / 2, w, h };
    if (sim !== undefined) c.sim = sim;
    return c;
}

// ---------------------------------------------------------------
// Fotos y huellas
// ---------------------------------------------------------------

test('fotos: hace falta de 3 a 15, con un aviso claro', () => {
    assert.equal(DronObjetos.validarFotos(0).ok, false);
    assert.match(DronObjetos.validarFotos(2).mensaje, /al menos 3.*falta 1/);
    assert.equal(DronObjetos.validarFotos(3).ok, true);
    assert.equal(DronObjetos.validarFotos(15).ok, true);
    const muchas = DronObjetos.validarFotos(17);
    assert.equal(muchas.ok, false);
    assert.match(muchas.mensaje, /máximo es 15.*sacá 2/);
});

test('parecido: 1 con la misma huella, 0 con una perpendicular, el mejor de varias', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const c = [Math.SQRT1_2, Math.SQRT1_2, 0];
    assert.equal(DronObjetos.parecido(a, a), 1);
    assert.equal(DronObjetos.parecido(a, b), 0);
    assert.ok(Math.abs(DronObjetos.mejorParecido(c, [a, b]) - Math.SQRT1_2) < 1e-12);
    assert.equal(DronObjetos.mejorParecido(a, [b, c, a]), 1);
});

test('recuadro más grande de las detecciones (o ninguno)', () => {
    assert.equal(DronObjetos.recuadroMasGrande([]), null);
    const r = DronObjetos.recuadroMasGrande([{ bbox: [0, 0, 10, 10] }, { bbox: [5, 5, 30, 20] }, { bbox: [0, 0, 20, 20] }]);
    assert.deepEqual(r.bbox, [5, 5, 30, 20]);
});

// ---------------------------------------------------------------
// Selector de objetos
// ---------------------------------------------------------------

test('buscando: compara como mucho 3 candidatos por cuadro (los de más confianza)', () => {
    const s = new Seguimiento.SelectorObjeto(A, 'taza');
    const cands = [0.6, 0.9, 0.7, 0.95, 0.55].map((score, i) => cand(0.1 + i * 0.2, 0.5, 0.3, undefined, 'cup', score));
    cands.push(cand(0.5, 0.5, 0.3, undefined, 'cup', 0.3)); // debajo de la confianza mínima: nunca
    assert.deepEqual(s.aVerificar(cands, 0).sort(), [1, 2, 3]);
});

test('se fija recién con 8 detecciones seguidas parecidas (75 %)', () => {
    const s = new Seguimiento.SelectorObjeto(A, 'taza');
    for (let i = 0; i < 7; i++) {
        s.actualizar([cand(0.5, 0.5, 0.3, 0.8)], i * 200);
        assert.equal(s.estado, 'buscando', `detección ${i + 1}`);
    }
    s.actualizar([cand(0.5, 0.5, 0.3, 0.8)], 7 * 200);
    assert.equal(s.estado, 'siguiendo');
    assert.ok(Math.abs(s.objetivo.cx - 0.5) < 1e-9);
});

test('un candidato poco parecido (menos de 75 %) no cuenta y corta la confirmación', () => {
    const s = new Seguimiento.SelectorObjeto(A, 'taza');
    for (let i = 0; i < 6; i++) s.actualizar([cand(0.5, 0.5, 0.3, 0.8)], i * 200);
    s.actualizar([cand(0.5, 0.5, 0.3, 0.7)], 1200);   // 70 %: no alcanza
    for (let i = 0; i < 7; i++) s.actualizar([cand(0.5, 0.5, 0.3, 0.8)], 1400 + i * 200);
    assert.equal(s.estado, 'buscando', 'vuelve a contar desde cero');
    s.actualizar([cand(0.5, 0.5, 0.3, 0.8)], 3000);
    assert.equal(s.estado, 'siguiendo');
});

test('entre dos objetos parecidos sigue al más parecido', () => {
    const s = new Seguimiento.SelectorObjeto(A, 'taza');
    for (let i = 0; i < 8; i++) s.actualizar([cand(0.2, 0.5, 0.3, 0.78), cand(0.8, 0.5, 0.3, 0.9)], i * 200);
    assert.equal(s.estado, 'siguiendo');
    assert.ok(Math.abs(s.objetivo.cx - 0.8) < 1e-9);
});

/** Selector ya siguiendo un objeto en (0.5, 0.5), en t = 1400 ms. */
function siguiendo() {
    const s = new Seguimiento.SelectorObjeto(A, 'taza');
    for (let i = 0; i < 8; i++) s.actualizar([cand(0.5, 0.5, 0.3, 0.8)], i * 200);
    assert.equal(s.estado, 'siguiendo');
    return s;
}

test('siguiendo: re-verifica el objetivo cada ~1 s (entre medio lo sigue por posición, sin comparar)', () => {
    const s = siguiendo();
    const otro = cand(0.9, 0.5, 0.3);
    assert.deepEqual(s.aVerificar([otro, cand(0.52, 0.5, 0.3)], 1600), [], 'a los 200 ms no compara');
    assert.deepEqual(s.aVerificar([otro, cand(0.52, 0.5, 0.3)], 2500), [1], 'pasado 1 s compara solo el asociado');
    s.actualizar([otro, cand(0.52, 0.5, 0.3)], 1600);   // sin comparar: se sigue por posición
    assert.equal(s.estado, 'siguiendo');
});

test('se pierde con 3 fallas en las últimas 5 detecciones', () => {
    const s = siguiendo();
    let t = 1400;
    const verificar = sim => { t += 1100; s.actualizar([cand(0.5, 0.5, 0.3, sim)], t); };
    verificar(0.5);                      // falla 1 (no se parece)
    assert.equal(s.estado, 'perdiendo');
    verificar(0.85);                     // acierto
    assert.equal(s.estado, 'siguiendo');
    verificar(0.4);                      // falla 2
    t += 300; s.actualizar([], t);       // falla 3: no aparece
    assert.equal(s.estado, 'perdido');
    assert.equal(s.objetivo, null);
});

test('2 fallas de 5 no alcanzan para perderlo', () => {
    const s = siguiendo();
    let t = 1400;
    for (const sim of [0.5, 0.85, 0.85, 0.5, 0.85, 0.85]) { t += 1100; s.actualizar([cand(0.5, 0.5, 0.3, sim)], t); }
    assert.notEqual(s.estado, 'perdido');
});

test('después de perderlo, lo vuelve a buscar por parecido en cualquier lugar (8 detecciones)', () => {
    const s = siguiendo();
    let t = 1400;
    for (let i = 0; i < 3; i++) { t += 300; s.actualizar([], t); }
    assert.equal(s.estado, 'perdido');
    assert.deepEqual(s.aVerificar([cand(0.1, 0.2, 0.3), cand(0.9, 0.8, 0.3)], t), [0, 1]);
    for (let i = 0; i < 8; i++) { t += 200; s.actualizar([cand(0.9, 0.8, 0.3, 0.9)], t); }
    assert.equal(s.estado, 'siguiendo');
    assert.ok(Math.abs(s.objetivo.cx - 0.9) < 1e-9);
});

test('"No encuentro": sin nada parecido durante 3 s', () => {
    const s = new Seguimiento.SelectorObjeto(A, 'taza');
    s.actualizar([cand(0.5, 0.5, 0.3, 0.2, 'person')], 0);
    assert.equal(s.noEncuentra, false);
    s.actualizar([], 2900);
    assert.equal(s.noEncuentra, false);
    s.actualizar([], 3100);
    assert.equal(s.noEncuentra, true);
    const info = { estado: s.estado, objeto: 'taza', noEncuentra: s.noEncuentra };
    assert.equal(Seguimiento.textoEnsayo({ yaw: 0, ud: 0, fb: 0 }, info), 'No encuentro «taza». Probá con más fotos o más luz.');
    assert.equal(Seguimiento.estadoCorto(info).texto, 'No encuentro «taza»');
    // Aparece algo parecido: se va el aviso
    s.actualizar([cand(0.5, 0.5, 0.3, 0.9)], 3300);
    assert.equal(s.noEncuentra, false);
});

test('con un objeto, el seguidor calcula el mismo control que con una persona (en ensayo)', () => {
    const seg = new Seguimiento.Seguidor(A, new Seguimiento.SelectorObjeto(A, 'taza'));
    // Detecciones cada ~200 ms y control a 15 Hz. Se compara lo que pide el selector, como en la app
    let comparados = 0;
    for (let t = 0; t <= 3000; t += 66) {
        if (t % 198 === 0) {
            const c = [cand(0.8, 0.5, 0.3)];
            for (const i of seg.selector.aVerificar(c, t)) { c[i].sim = 0.9; comparados++; }
            seg.procesarDeteccion(c, t);
        }
        seg.tickControl(t);
    }
    assert.ok(comparados <= 8 + 3, `buscando compara cada cuadro; siguiendo, una vez por segundo (${comparados} comparaciones)`);
    assert.equal(seg.estado, 'siguiendo');
    assert.ok(seg.comando.yaw > 0, 'gira hacia el objeto (a la derecha)');
});
