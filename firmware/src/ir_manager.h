/**
 * Gestor de Señales Infrarrojas (Emisión y Aprendizaje)
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

#ifndef IR_MANAGER_H
#define IR_MANAGER_H

#include <Arduino.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

class IrManager {
public:
    IrManager();
    void iniciar();

    // Emisión de comandos IR
    bool emitirComando(const String& protocolo, const String& codigoHex, int bits, 
                       const uint16_t* rawData = nullptr, size_t rawLen = 0, uint32_t frecuencia = 38000);

    // Modo aprendizaje
    void activarModoAprendizaje(int botonId);
    void cancelarModoAprendizaje();
    void verificarAprendizaje();
    bool estaEnModoAprendizaje() const;

private:
    IRsend emisor;
    IRrecv receptor;
    decode_results resultados;

    bool modoAprendizajeActivo;
    int botonIdObjetivo;
    unsigned long tiempoInicioAprendizaje;

    uint64_t parsearHex(const String& hexStr);
};

extern IrManager irManager;

#endif // IR_MANAGER_H
