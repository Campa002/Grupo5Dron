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

// Captura de códigos largos (aires acondicionados): los controles de aire mandan el estado completo
// (temperatura, modo, ventilador...) en 200 a 600 pulsos. El buffer por defecto de la librería (100)
// los cortaba. 1024 pulsos y 50 ms de silencio para dar la trama por terminada, como el ejemplo
// IRrecvDumpV2 de IRremoteESP8266 para aires.
const uint16_t IR_TAMANO_CAPTURA = 1024;
const uint8_t IR_FIN_TRAMA_MS = 50;

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
    bool hexABytes(const String& hexStr, uint8_t* bytes, uint16_t cantidad);
};

extern IrManager irManager;

#endif // IR_MANAGER_H
