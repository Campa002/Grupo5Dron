/**
 * Implementación del Gestor de Señales Infrarrojas
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

#include "ir_manager.h"
#include "config.h"
#include "api_client.h"

IrManager irManager;

IrManager::IrManager() 
    : emisor(PIN_IR_LED), 
      receptor(PIN_IR_RECV), 
      modoAprendizajeActivo(false), 
      botonIdObjetivo(0), 
      tiempoInicioAprendizaje(0) {}

void IrManager::iniciar() {
    Serial.println("[IR] Inicializando emisor y receptor infrarrojo...");

    // Inicializar emisor
    emisor.begin();
    Serial.printf("[IR] Emisor IR configurado en GPIO %d\n", PIN_IR_LED);

    // Configurar receptor (inicia apagado hasta que se active el modo aprendizaje)
    receptor.setUnknownThreshold(12); // Umbral mínimo de pulsos para tramas crudas
    Serial.printf("[IR] Receptor IR configurado en GPIO %d (esperando modo aprendizaje)\n", PIN_IR_RECV);
}

uint64_t IrManager::parsearHex(const String& hexStr) {
    String limpia = hexStr;
    limpia.trim();
    if (limpia.startsWith("0x") || limpia.startsWith("0X")) {
        limpia = limpia.substring(2);
    }

    uint64_t valor = 0;
    for (size_t i = 0; i < limpia.length(); i++) {
        char c = limpia.charAt(i);
        uint8_t d = 0;
        if (c >= '0' && c <= '9') d = c - '0';
        else if (c >= 'a' && c <= 'f') d = c - 'a' + 10;
        else if (c >= 'A' && c <= 'F') d = c - 'A' + 10;
        else continue;
        valor = (valor << 4) | d;
    }
    return valor;
}

bool IrManager::emitirComando(const String& protocolo, const String& codigoHex, int bits, 
                              const uint16_t* rawData, size_t rawLen, uint32_t frecuencia) {
    String proto = protocolo;
    proto.toUpperCase();
    proto.trim();

    Serial.printf("[IR] 📡 Emitiendo señal IR -> Protocolo: %s | Código: %s | Bits: %d | Frec: %u Hz\n",
                  proto.c_str(), codigoHex.c_str(), bits, (unsigned int)frecuencia);

    // 1. Emisión RAW si se proporcionó array o el protocolo es RAW
    if (proto == "RAW" && rawData != nullptr && rawLen > 0) {
        uint16_t freqKhz = (frecuencia > 0) ? (frecuencia / 1000) : 38;
        emisor.sendRaw(rawData, rawLen, freqKhz);
        Serial.printf("[IR] ✓ Trama RAW de %u elementos enviada exitosamente.\n", rawLen);
        return true;
    }

    // 2. Emisión por protocolo estándar decodificado
    uint64_t codigo = parsearHex(codigoHex);

    if (proto == "NEC") {
        emisor.sendNEC(codigo, bits > 0 ? bits : 32);
    } else if (proto == "SONY") {
        emisor.sendSony(codigo, bits > 0 ? bits : 12);
    } else if (proto == "RC5") {
        emisor.sendRC5(codigo, bits > 0 ? bits : 12);
    } else if (proto == "RC6") {
        emisor.sendRC6(codigo, bits > 0 ? bits : 20);
    } else if (proto == "SAMSUNG") {
        emisor.sendSAMSUNG(codigo, bits > 0 ? bits : 32);
    } else if (proto == "PANASONIC") {
        emisor.sendPanasonic64(codigo, bits > 0 ? bits : 48);
    } else if (rawData != nullptr && rawLen > 0) {
        // Fallback a RAW si el protocolo no es de los anteriores pero hay trama cruda
        uint16_t freqKhz = (frecuencia > 0) ? (frecuencia / 1000) : 38;
        emisor.sendRaw(rawData, rawLen, freqKhz);
    } else {
        Serial.printf("[IR] ⚠️ Protocolo '%s' no implementado o sin datos RAW disponibles.\n", proto.c_str());
        return false;
    }

    Serial.println("[IR] ✓ Comando IR emitido con éxito!");
    return true;
}

void IrManager::activarModoAprendizaje(int botonId) {
    botonIdObjetivo = botonId;
    modoAprendizajeActivo = true;
    tiempoInicioAprendizaje = millis();

    // Activar receptor
    receptor.enableIRIn();

    Serial.println("============================================================");
    Serial.printf("[IR] 🔴 MODO APRENDIZAJE ACTIVADO para botón ID: %d\n", botonId);
    Serial.printf("[IR] Apuntá el control remoto al receptor (GPIO %d) y presioná el botón...\n", PIN_IR_RECV);
    Serial.printf("[IR] Tiempo límite: %d segundos.\n", APRENDIZAJE_TIMEOUT_MS / 1000);
    Serial.println("============================================================");
}

void IrManager::cancelarModoAprendizaje() {
    if (modoAprendizajeActivo) {
        receptor.disableIRIn();
        modoAprendizajeActivo = false;
        Serial.println("[IR] Modo aprendizaje finalizado o cancelado.");
    }
}

bool IrManager::estaEnModoAprendizaje() const {
    return modoAprendizajeActivo;
}

void IrManager::verificarAprendizaje() {
    if (!modoAprendizajeActivo) {
        return;
    }

    // Verificar timeout de aprendizaje
    if (millis() - tiempoInicioAprendizaje > APRENDIZAJE_TIMEOUT_MS) {
        Serial.println("[IR] ⏰ Tiempo de aprendizaje agotado sin detectar señal válida.");
        cancelarModoAprendizaje();
        return;
    }

    // Comprobar si se decodificó una señal IR
    if (receptor.decode(&resultados)) {
        String protocolo = typeToString(resultados.decode_type);
        protocolo.toUpperCase();

        String codigoHex = "0x" + resultToHexidecimal(&resultados);
        uint16_t bits = resultados.bits;

        Serial.println("\n[IR] 🎯 ¡SEÑAL IR CAPTURADA CON ÉXITO!");
        Serial.printf("[IR] Protocolo detectado: %s\n", protocolo.c_str());
        Serial.printf("[IR] Código Hexadecimal: %s\n", codigoHex.c_str());
        Serial.printf("[IR] Longitud en Bits:   %u\n", bits);

        // Si el protocolo es UNKNOWN o crudo, guardar los tiempos en un array
        uint16_t* rawArray = nullptr;
        uint16_t rawLen = 0;

        if (resultados.rawlen > 0) {
            rawLen = resultados.rawlen - 1;
            rawArray = new uint16_t[rawLen];
            for (uint16_t i = 1; i < resultados.rawlen; i++) {
                rawArray[i - 1] = resultados.rawbuf[i] * kRawTick;
            }
        }

        // Subir código capturado a la API
        Serial.println("[IR] Enviando código capturado a la API del servidor...");
        apiClient.enviarCodigoIr(botonIdObjetivo, protocolo, codigoHex, bits, rawArray, rawLen, 38000);

        if (rawArray != nullptr) {
            delete[] rawArray;
        }

        // Reiniciar receptor y finalizar modo aprendizaje
        receptor.resume();
        cancelarModoAprendizaje();
    }
}
