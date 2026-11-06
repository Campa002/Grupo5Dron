"""
Pasa los pesos del modelo de seguimiento (COCO-SSD, TensorFlow.js) de float32 a float16.

- Mismo formato que el convertidor de TensorFlow.js (--quantize_float16): cada peso float32 se guarda
  en 2 bytes y en model.json lleva "quantization": {"dtype": "float16"}. TensorFlow.js los vuelve a
  float32 al cargar el modelo: la inferencia es igual de rápida y el archivo pesa la mitad.
- Los pesos int32 quedan como están.
- Shards de 4 MB con extensión .bin (en el APK, Capacitor responde index.html a las rutas sin ".").
- Si el modelo ya está en float16, no hace nada.

Uso (desde la raíz del repo; necesita numpy):
    python scripts/modelo_float16.py [carpeta del modelo]   (por defecto backend/public/libs/coco-ssd)
"""
import json
import os
import sys

import numpy as np

TAMANO_SHARD = 4 * 1024 * 1024


def main():
    carpeta = sys.argv[1] if len(sys.argv) > 1 else os.path.join('backend', 'public', 'libs', 'coco-ssd')
    ruta_json = os.path.join(carpeta, 'model.json')
    with open(ruta_json, encoding='utf-8') as f:
        modelo = json.load(f)

    grupos = modelo['weightsManifest']
    if len(grupos) != 1:
        sys.exit('ERROR: se esperaba un solo grupo de pesos en model.json')
    grupo = grupos[0]
    if any(w.get('quantization') for w in grupo['weights']):
        print('El modelo ya está cuantizado: no se cambia nada.')
        return

    viejos = list(grupo['paths'])
    datos = b''.join(open(os.path.join(carpeta, p), 'rb').read() for p in viejos)

    partes = []
    pos = 0
    for w in grupo['weights']:
        n = int(np.prod(w['shape'])) if w['shape'] else 1
        if w['dtype'] == 'float32':
            valores = np.frombuffer(datos, dtype='<f4', count=n, offset=pos)
            pos += 4 * n
            if np.abs(valores).max(initial=0) > 65504:
                sys.exit(f"ERROR: {w['name']} tiene valores fuera del rango de float16")
            partes.append(valores.astype('<f2').tobytes())
            w['quantization'] = {'dtype': 'float16'}
        elif w['dtype'] == 'int32':
            partes.append(datos[pos:pos + 4 * n])
            pos += 4 * n
        else:
            sys.exit(f"ERROR: tipo no previsto {w['dtype']} en {w['name']}")
    if pos != len(datos):
        sys.exit(f'ERROR: los pesos ocupan {pos} bytes pero los shards tienen {len(datos)}')

    nuevo = b''.join(partes)
    cantidad = (len(nuevo) + TAMANO_SHARD - 1) // TAMANO_SHARD
    nuevos = [f'group1-shard{i + 1}of{cantidad}.bin' for i in range(cantidad)]
    for i, nombre in enumerate(nuevos):
        with open(os.path.join(carpeta, nombre), 'wb') as f:
            f.write(nuevo[i * TAMANO_SHARD:(i + 1) * TAMANO_SHARD])
    for p in viejos:
        if p not in nuevos:
            os.remove(os.path.join(carpeta, p))
    grupo['paths'] = nuevos
    with open(ruta_json, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(modelo, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'Pesos: {len(datos):,} -> {len(nuevo):,} bytes en {cantidad} shards: {", ".join(nuevos)}')


if __name__ == '__main__':
    main()
