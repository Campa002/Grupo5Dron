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
    : emisor(PIN_IR_SEND), 
      receptor(PIN_IR_RECV, IR_TAMANO_CAPTURA, IR_FIN_TRAMA_MS, true), 
      modoAprendizajeActivo(false), 
      botonIdObjetivo(0), 
      tiempoInicioAprendizaje(0) {}

void IrManager::iniciar() {
    Serial.println("[IR] Inicializando emisor y receptor infrarrojo...");

    // Inicializar emisor
    emisor.begin();
    Serial.printf("[IR] Emisor IR configurado en GPIO %d\n", PIN_IR_SEND);

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

/**
 * Pasa un código en hexadecimal ("0x" + 2 dígitos por byte) a bytes, para los protocolos de aire
 * que guardan el estado completo. Devuelve false si no hay la cantidad justa de dígitos.
 */
bool IrManager::hexABytes(const String& hexStr, uint8_t* bytes, uint16_t cantidad) {
    String limpia = hexStr;
    limpia.trim();
    while (limpia.startsWith("0x") || limpia.startsWith("0X")) limpia = limpia.substring(2);
    if (limpia.length() != (size_t)cantidad * 2) return false;
    for (uint16_t i = 0; i < cantidad; i++) {
        uint8_t b = 0;
        for (uint8_t k = 0; k < 2; k++) {
            char ch = limpia.charAt(i * 2 + k);
            uint8_t d;
            if (ch >= '0' && ch <= '9') d = ch - '0';
            else if (ch >= 'a' && ch <= 'f') d = ch - 'a' + 10;
            else if (ch >= 'A' && ch <= 'F') d = ch - 'A' + 10;
            else return false;
            b = (b << 4) | d;
        }
        bytes[i] = b;
    }
    return true;
}

/**
 * Emite un código aprendido. Orden:
 *  1. Si la librería conoce el protocolo (NEC, SONY, SAMSUNG, y también los de aire: DAIKIN, LG, MIDEA,
 *     COOLIX, GREE, etc.), lo manda con ese protocolo: los de aire, con el estado completo en bytes.
 *  2. Si no lo conoce o falla, manda la trama cruda (los tiempos tal cual se capturaron).
 * Los 2 LEDs IR emiten siempre juntos: cada aparato responde solo a su código.
 */
bool IrManager::emitirComando(const String& protocolo, const String& codigoHex, int bits,
                              const uint16_t* rawData, size_t rawLen, uint32_t frecuencia) {
    String proto = protocolo;
    proto.toUpperCase();
    proto.trim();
    const uint16_t khz = (frecuencia > 0) ? (frecuencia / 1000) : 38;

    Serial.printf("[IR] Emitiendo -> Protocolo: %s | Código: %s | Bits: %d | Crudo: %u | %u Hz\n",
                  proto.c_str(), codigoHex.c_str(), bits, (unsigned int)rawLen, (unsigned int)frecuencia);

    bool enviado = false;
    const decode_type_t tipo = strToDecodeType(proto.c_str());
    if (tipo != UNKNOWN && bits > 0) {
        if (hasACState(tipo)) {
            const uint16_t nbytes = (bits + 7) / 8;
            uint8_t estado[kStateSizeMax];
            if (nbytes <= kStateSizeMax && hexABytes(codigoHex, estado, nbytes)) {
                enviado = emisor.send(tipo, estado, nbytes);
            }
        } else {
            enviado = emisor.send(tipo, parsearHex(codigoHex), bits);
        }
    }

    if (!enviado && rawData != nullptr && rawLen > 0) {
        emisor.sendRaw(rawData, rawLen, khz);
        Serial.printf("[IR] Trama cruda de %u tiempos enviada.\n", (unsigned int)rawLen);
        enviado = true;
    }

    if (enviado) Serial.println("[IR] Código IR emitido.");
    else Serial.printf("[IR] No se pudo emitir: protocolo '%s' sin soporte y sin trama cruda.\n", proto.c_str());
    return enviado;
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

        String codigoHex = resultToHexidecimal(&resultados); // ya viene con "0x"; en los aires, el estado completo
        uint16_t bits = resultados.bits;

        Serial.println("\n[IR] 🎯 ¡SEÑAL IR CAPTURADA CON ÉXITO!");
        Serial.printf("[IR] Protocolo detectado: %s\n", protocolo.c_str());
        Serial.printf("[IR] Código Hexadecimal: %s\n", codigoHex.c_str());
        Serial.printf("[IR] Longitud en Bits:   %u\n", bits);
        if (resultados.overflow) {
            Serial.printf("[IR] ATENCIÓN: la señal es más larga que %u pulsos y quedó cortada.\n", IR_TAMANO_CAPTURA);
        }

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
