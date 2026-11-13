# Carcasa triangular del equipo del aula (versión 2: sin fuente, alimentada por USB-C)

Caja de base triangular (triángulo rectángulo isósceles) para el ESP32, el relé de las luces, el receptor KY-022 y la plaquita del BC337. Entra justo en una esquina o se apoya en una mesa. Las dos cápsulas de los LEDs IR van en rótulas sobre la tapa y se apuntan a mano: una al proyector y otra al aire.

- Archivo paramétrico: `carcasa_aula.scad` (OpenSCAD 2021.01 o más nuevo).
- Para imprimir: `para-imprimir/` (solo los STL finales y `LEEME.txt` con la configuración y los tiempos).
- Vistas: `vistas/`.
- La versión anterior (dos pisos con la fuente HLK-5M05 y fusible) quedó guardada en `version-anterior-dos-pisos-con-HLK/`. Ver "Mejoras futuras" en `docs/limitaciones-y-mejoras.md`.

![Frente: prensacables de la lámpara abajo, USB-C con su precinto y ventanita del receptor](vistas/frente.png)

## Qué cambió en la versión 2 (13/11)

- **Sin fuente HLK-5M05, fusible ni portafusible.** El ESP32 se alimenta por su USB-C con un cargador de celular enchufado a la pared (5 V, 1 A o más; ver el README del firmware). El pin VIN del ESP32 sigue alimentando el relé y los LEDs IR.
- **Los 220 V que quedan son solo los de la lámpara:** entran por un prensacables, pasan por el relé (COM y NO) y salen por el otro. Los protege la térmica del aula.
- **USB-C accesible desde afuera:** ventana en el frente a la altura del conector, y debajo dos ranuras para un precinto que sujeta el cable del cargador (así no se sale solo si alguien lo tira).
- **Imprime más rápido:** paredes, piso, bandeja y tapa de 2 mm (antes 3), triángulo más chico (lo justo para el relé), 60 mm de alto (antes 70) y sin ranuras de ventilación, cuna de la fuente ni leyenda grabada. Con la configuración rápida del LEEME, todo tarda unas **6 h 45 min** (antes, solo el cuerpo tardaba unas 10 h).
- **Sigue en dos pisos.** Se probó volver a uno solo: el relé (50 × 26 mm) y el ESP32 (51,5 × 28,3 mm) no tienen ninguna ubicación posible juntos en el triángulo (se probaron todas las posiciones cada 2 mm). Los dos pisos además mantienen la separación de 220 V.

## Medidas finales (medidas sobre los STL)

| Pieza | Medidas (mm) | Círculo que ocupa en la cama |
| :--- | :--- | :---: |
| Cuerpo | 137 × 72 × 60 alto | Ø137 |
| Bandeja | 118 × 63 × 33 alto | Ø118 |
| Tapa (con las rótulas) | 137 × 69 × 23 | Ø137 |
| Cápsula y tapón | Ø20 × 15 | Ø20 |
| Soporte | 48 × 26 × 24 | Ø48 |

- **Armada:** la caja mide 60 mm de alto; con las rótulas y las cápsulas, unos 89 mm.
- **Por dentro:** frente de 136 mm y fondo de 68 mm; piso de abajo (220 V) de 22,5 mm; piso de arriba (baja tensión) de 31 mm.
- Cada pieza es un solo sólido cerrado. La vista `"choques"` sale **vacía**: el relé, las tuercas de los PG7, el ESP32, su conector USB-C con la ficha del cable, la plaquita y el KY-022 no tocan el cuerpo ni la bandeja.

## Cómo es

![Interior: verde = baja tensión, rojo = 220 V](vistas/interior.png)

- **Piso de abajo (220 V):** solo el relé, atornillado a 4 postes, con su bornera (COM, NO, NC) hacia el frente, y los 2 prensacables PG7 en el frente, uno a cada lado.
- **Bandeja:** se saca para armar. Separa los pisos y tiene un solo paso de 7 mm, justo arriba de los pines de baja tensión del relé (5 V, GND e IN). La traban contra la repisa dos columnas y el tope de atrás del ESP32, que llegan justo a la tapa.
- **Piso de arriba (baja tensión):**
  - ESP32 sobre dos tacos de 25 mm (lugar para las fichas hembra y el cable doblado), con el USB-C contra el frente;
  - plaquita del BC337 en 4 postes, a la izquierda;
  - KY-022 parado contra el frente, en una ranura, con el receptor en su ventanita.
- **Tapa:** con las dos rótulas; se atornilla con 3 tornillos M3 en las esquinas. El cable de cada cápsula entra por un agujero de 6 mm justo debajo de su rótula.

![Corte: relé abajo, bandeja y ESP32 arriba](vistas/corte.png)

### USB-C y precinto

- La ventana (13 × 8,5 mm) llega hasta arriba: la cierra la tapa. Entra la ficha de cualquier cable USB-C.
- **Para que el cable no se salga:** pasá un precinto chico por una ranura, rodeá el cable y volvé por la otra ranura; ajustalo. Así, si alguien tira del cable, tira del precinto y no del conector del ESP32.
- El tope de atrás del ESP32 evita que la placa se corra al enchufar.

### LEDs IR: cápsulas con rótula y cable soldado

- Cada LED va en una bola de 20 mm; el cable sale derecho por abajo, baja por un embudo dentro de la rótula y entra a la caja por el agujero de la tapa, curvándose suave.
- La bola gira **50° para cualquier lado** (comprobado en OpenSCAD) y queda apuntando por un apriete de 0,1 mm (`rotula_apriete`).
- **Alivio de tensión:** adentro, un precinto alrededor del cable justo debajo del agujero de la tapa, y un poco de cable enrollado.
- **Los 2 LEDs emiten siempre juntos el mismo código** (están en serie con un solo BC337). Es a propósito: una cápsula apunta al proyector y la otra al aire; cada aparato responde solo a su código.

![Rótula con la bola girada 45°](vistas/rotula_giro.png)

### Seguridad de 220 V

- El armado con 220 V se hace con el profe. Todo desenchufado (y la térmica del aula baja) mientras se trabaja.
- Los 220 V quedan solo en el piso de abajo y en la bornera del relé. Al piso de arriba sube únicamente el cable de baja tensión del relé, por el paso de la bandeja.
- Ningún borne ni tornillo de 220 V queda accesible desde afuera: los cables entran por prensacables ajustados.

## Conexiones de 220 V (solo la fase de la lámpara)

```
Fase que viene del circuito de la lámpara ──PG7 izquierdo──> COM del relé
NO del relé ──PG7 derecho──> fase hacia la lámpara
NC del relé: libre (aislado)
Neutro: no entra a la caja (sigue directo a la lámpara)
```

- Con el relé apagado (al arrancar y si se corta todo), la lámpara queda apagada.
- El relé SRD-05VDC-SL-C aguanta 10 A a 250 V. Para lámparas comunes del aula sobra; si el circuito de las luces pasa de unos 1000 W, consultá con el profe antes.
- Si el cable es fino y el PG7 no aprieta, sumale termocontraíble hasta unos 4 mm de grosor.

## Medidas para confirmar con calibre

Las variables marcadas `(CALIBRE)` en `carcasa_aula.scad` vienen con medidas típicas. Medí tus piezas y cambiá las que no coincidan:

| Pieza | Qué medir | Variable | Valor por defecto |
| :--- | :--- | :--- | :--- |
| ESP32 (NodeMCU 30 pines) | ancho y largo de la placa | `esp32` | 28,3 × 51,5 |
| | alto de las fichas hembra con el cable doblado | `esp32_bajo` | 25 |
| | ancho y alto de la ficha USB-C del cable | `usb_ventana` | 13 × 8,5 |
| Relé | ancho y largo de la placa, alto del relé | `rele`, `rele_alto` | 26 × 50, 17 |
| | agujeros, desde una esquina | `rele_agujeros` | (3,3) (23,3) (3,47) (23,47) |
| KY-022 | ancho y alto de la plaquita | `ky022` | 18,5 × 15 |
| | altura del centro del receptor y cuánto sobresale | `ky022_z`, `ky022_separacion` | 9 y 5 |
| Plaquita del BC337 | ancho y profundidad | `perf` | 30 × 20 |
| Prensacables PG7 | diámetro de la rosca y tuerca entre puntas | `pg7`, `pg7_tuerca` | 12,7 y 22 |
| LED IR de 5 mm | cuerpo y pestaña | `led_d`, `led_pestana` | 5 y 5,8 |
| Cable de cada LED | grosor | `cable_agujero` | 6 |

La tolerancia de los encastres es `holgura = 0.3`. Si tu impresora deja las piezas justas, subila a 0,4.

## Cómo cambiar las medidas

1. Abrí `carcasa_aula.scad` y cambiá los números de arriba del archivo.
2. Elegí qué ver con `pieza`: `"cuerpo"`, `"bandeja"`, `"tapa"`, `"capsula"`, `"tapon"`, `"soporte"`, o las vistas `"ensamble"`, `"interior"`, `"corte"`, `"frente"`, `"rotula_giro"` y `"choques"` (tiene que salir vacía).
3. Exportá cada pieza (F6 y F7). Desde la consola, todo de una vez:

```bash
for p in cuerpo bandeja tapa capsula tapon soporte; do openscad --export-format binstl -o para-imprimir/$p.stl -D "pieza=\"$p\"" carcasa_aula.scad; done
```

## Impresión

Todo lo de la impresión está en `para-imprimir/LEEME.txt`: PETG o ASA, capa de 0,28 mm, 15 % de relleno, 2 perímetros, sin soportes. Total estimado: unas 6 h 45 min.

## Lista de compras

Ya no hace falta fusible, portafusible ni la fuente HLK-5M05. Lo nuevo es el cargador USB-C y los 2 prensacables. Lo demás conseguilo solo si no lo tienen.

| Qué | Medida | Cantidad |
| :--- | :--- | :---: |
| Cargador de celular | 5 V, **1 A o más** (mejor 2 A), enchufe de pared | 1 |
| Cable USB-C | el del cargador o uno corto de buena calidad, de 1 a 2 m | 1 |
| Prensacables PG7 con tuerca | rosca PG7 (12,5 mm), para cable de 3 a 6,5 mm | 2 |
| Tornillos para la tapa | M3 × 12, autorroscantes para plástico | 3 |
| Tornillos para el relé | M3 × 6, autorroscantes | 4 |
| Tornillos para la plaquita del BC337 | M2,5 × 6 o M3 × 6, autorroscantes | 4 |
| Tornillos y tarugos para fijarla | tornillo de 4 mm × 30 con tarugo de 6 mm | 2 |
| Cable de la fase de la lámpara | 1 mm² (o 0,75 mm²) | el largo de la instalación |
| Cable de cada LED | 2 hilos finos (por ejemplo 2 × 0,25 mm²), de no más de 5 mm de grosor | 1,5 m por LED |
| Precintos chicos | 2,5 mm de ancho | 5 (uno para el cable USB-C) |
| Termocontraíble | 3 mm y 6 mm | 30 cm de cada uno |

## Armado

1. **Antes de empezar:** la HLK-5M05 queda desconectada: desoldala, o cortá y aislá sus cables con termocontraíble. Su fusible tampoco va.
2. **Prueba en seco, sin 220 V:** presentá el relé en sus postes (bornera hacia el frente), la bandeja en su repisa, el ESP32 en sus tacos con el USB-C en la ventana, el KY-022 en su ranura y la plaquita en sus postes.
3. **Piso de baja tensión (bandeja):**
   - atornillá la plaquita y poné el ESP32 y el KY-022;
   - pasá el cable de cada LED por el agujero de la tapa y por la rótula, soldá el LED (ánodo = pata larga), pasalo por la bola desde abajo y fijalo con plástico caliente;
   - encastrá la bola y poné el precinto de alivio de tensión abajo de la tapa.
4. **Piso de 220 V (con el profe, todo desenchufado):**
   - atornillá el relé;
   - pasá la fase por los PG7 y conectala como en el dibujo de arriba;
   - pasá 5 V, GND e IN del relé a la bandeja, solo por el paso de cables.
5. **Cierre:** revisá que ningún cable de 220 V pase al piso de arriba, apoyá la bandeja, atornillá la tapa y ajustá los PG7.
6. **USB-C:** enchufá el cable y sujetalo con el precinto por las dos ranuras.
7. **Fijación:** en la mesa, o atornillada a la pared (por el piso) o a una esquina (por los lados cortos). Siempre con el frente a la vista.
