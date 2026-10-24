/**
 * Implementación del Cliente API REST HTTPS
 * Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

#include "api_client.h"
#include "config.h"
#include "wifi_manager.h"
#include "ir_manager.h"
#include "relay_manager.h"

ApiClient apiClient;

ApiClient::ApiClient() {}

void ApiClient::iniciar() {
    Serial.println("[API] Inicializando cliente HTTPS...");
    configurarSeguridad();
    http.setReuse(true);
    http.setTimeout(HTTP_TIMEOUT_MS);
}

void ApiClient::configurarSeguridad() {
    String url = API_URL;
    if (url.startsWith("https://")) {
        #if CLIENT_INSECURE_MODE
            Serial.println("[API] ⚠️ Modo HTTPS configurado en INSECURE (sin validación de certificado SSL).");
            secureClient.setInsecure();
        #else
            Serial.println("[API] Modo HTTPS configurado con certificado raíz CA.");
            secureClient.setCACert(ROOT_CA_CERT);
        #endif
    }
}

void ApiClient::pollComandos() {
    if (!wifiManager.estaConectado()) {
        return;
    }

    String url = String(API_URL) + "?action=poll";

    bool iniciada = false;
    if (url.startsWith("https://")) {
        iniciada = http.begin(secureClient, url);
    } else {
        WiFiClient plainClient;
        iniciada = http.begin(plainClient, url);
    }

    if (!iniciada) {
        Serial.println("[API] ⚠️ Error al inicializar conexión HTTP para polling.");
        return;
    }

    http.addHeader("X-ESP32-Token", ESP32_TOKEN);
    http.addHeader("User-Agent", String("ESP32-Grupo5Dron/") + FIRMWARE_VERSION);

    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();

        // Reservar memoria para documento JSON
        DynamicJsonDocument doc(4096);
        DeserializationError err = deserializeJson(doc, payload);

        if (err) {
            Serial.printf("[API] ⚠️ Error parseando respuesta JSON de poll: %s\n", err.c_str());
            http.end();
            return;
        }

        if (doc["error"] == false) {
            int cantidad = doc["cantidad"] | 0;
            if (cantidad > 0) {
                Serial.printf("\n[API] 📥 Recibidos %d comandos pendientes para ejecutar:\n", cantidad);
                JsonArray comandos = doc["comandos"].as<JsonArray>();
                for (JsonObject cmd : comandos) {
                    procesarComando(cmd);
                }
            }
        }
    } else if (httpCode > 0) {
        if (httpCode != HTTP_CODE_OK) {
            Serial.printf("[API] Polling respondió con código HTTP: %d\n", httpCode);
        }
    } else {
        Serial.printf("[API] ⚠️ Fallo en polling HTTPS: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
}

void ApiClient::procesarComando(JsonObject cmd) {
    int comandoId = cmd["id"] | 0;
    String tipo = cmd["tipo"] | "ir";
    int botonId = cmd["boton_id"] | 0;

    Serial.printf("[API] -> Procesando Comando ID: %d | Tipo: %s\n", comandoId, tipo.c_str());

    if (tipo == "ir") {
        String protocolo = cmd["protocolo"] | "NEC";
        String codigoHex = cmd["codigo"] | "";
        int bits = cmd["bits"] | 32;
        uint32_t frecuencia = cmd["frecuencia"] | 38000;

        // Verificar si viene raw_data en JSON
        uint16_t* rawArray = nullptr;
        size_t rawLen = 0;

        if (cmd.containsKey("raw_data") && cmd["raw_data"].is<JsonArray>()) {
            JsonArray rawJson = cmd["raw_data"].as<JsonArray>();
            rawLen = rawJson.size();
            if (rawLen > 0) {
                rawArray = new uint16_t[rawLen];
                for (size_t i = 0; i < rawLen; i++) {
                    rawArray[i] = rawJson[i].as<uint16_t>();
                }
            }
        }

        bool exito = irManager.emitirComando(protocolo, codigoHex, bits, rawArray, rawLen, frecuencia);

        if (rawArray != nullptr) {
            delete[] rawArray;
        }

        if (exito) {
            reportarResultado(comandoId, "ejecutado", "Comando IR (" + protocolo + " " + codigoHex + ") emitido con éxito.");
        } else {
            reportarResultado(comandoId, "error", "Fallo al emitir la trama IR.");
        }

    } else if (tipo == "rele") {
        // Parametros: {"accion": "encender"|"apagar", "canal": 1|2}
        JsonObject params = cmd["parametros"];
        String accion = params["accion"] | "apagar";
        int canal = params["canal"] | 1;

        bool exito = false;
        if (accion == "encender") {
            exito = relayManager.activar(canal);
        } else {
            exito = relayManager.desactivar(canal);
        }

        if (exito) {
            String msg = "Relé canal " + String(canal) + " " + (accion == "encender" ? "encendido" : "apagado") + " exitosamente.";
            reportarResultado(comandoId, "ejecutado", msg);
        } else {
            reportarResultado(comandoId, "error", "No se pudo conmutar el canal de relé solicitado.");
        }

    } else if (tipo == "aprendizaje") {
        irManager.activarModoAprendizaje(botonId);
        reportarResultado(comandoId, "ejecutado", "Modo aprendizaje activado en el ESP32 para botón ID " + String(botonId));

    } else {
        Serial.printf("[API] ⚠️ Tipo de comando desconocido: %s\n", tipo.c_str());
        reportarResultado(comandoId, "error", "Tipo de comando no soportado: " + tipo);
    }
}

bool ApiClient::enviarHeartbeat() {
    if (!wifiManager.estaConectado()) {
        return false;
    }

    String url = String(API_URL) + "?action=heartbeat";

    bool iniciada = false;
    if (url.startsWith("https://")) {
        iniciada = http.begin(secureClient, url);
    } else {
        WiFiClient plainClient;
        iniciada = http.begin(plainClient, url);
    }

    if (!iniciada) return false;

    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-ESP32-Token", ESP32_TOKEN);

    StaticJsonDocument<256> doc;
    doc["dispositivo_id"] = DISPOSITIVO_ID;
    doc["ip_local"] = wifiManager.obtenerIP();
    doc["rssi"] = wifiManager.obtenerRSSI();
    doc["version_fw"] = FIRMWARE_VERSION;
    doc["modo_aprendizaje"] = irManager.estaEnModoAprendizaje() ? 1 : 0;

    String body;
    serializeJson(doc, body);

    int httpCode = http.POST(body);
    bool exito = (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED);

    if (exito) {
        Serial.printf("[API] 💓 Heartbeat enviado correctamente (IP: %s | RSSI: %d dBm)\n",
                      wifiManager.obtenerIP().c_str(), wifiManager.obtenerRSSI());
    } else {
        Serial.printf("[API] ⚠️ Error enviando heartbeat: HTTP %d (%s)\n", 
                      httpCode, http.errorToString(httpCode).c_str());
    }

    http.end();
    return exito;
}

bool ApiClient::reportarResultado(int comandoId, const String& estado, const String& resultado) {
    if (!wifiManager.estaConectado()) {
        return false;
    }

    String url = String(API_URL) + "?action=resultado";

    bool iniciada = false;
    if (url.startsWith("https://")) {
        iniciada = http.begin(secureClient, url);
    } else {
        WiFiClient plainClient;
        iniciada = http.begin(plainClient, url);
    }

    if (!iniciada) return false;

    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-ESP32-Token", ESP32_TOKEN);

    StaticJsonDocument<256> doc;
    doc["comando_id"] = comandoId;
    doc["estado"] = estado;
    doc["resultado"] = resultado;

    String body;
    serializeJson(doc, body);

    int httpCode = http.POST(body);
    bool ok = (httpCode == HTTP_CODE_OK);

    if (ok) {
        Serial.printf("[API] ✓ Resultado de comando ID %d reportado como '%s'\n", comandoId, estado.c_str());
    } else {
        Serial.printf("[API] ⚠️ Error reportando resultado: HTTP %d\n", httpCode);
    }

    http.end();
    return ok;
}

bool ApiClient::enviarCodigoIr(int botonId, const String& protocolo, const String& codigo, 
                               int bits, const uint16_t* rawData, size_t rawLen, int frecuencia) {
    if (!wifiManager.estaConectado()) {
        Serial.println("[API] ⚠️ No se puede subir código IR: WiFi desconectado.");
        return false;
    }

    String url = String(API_URL) + "?action=codigo_ir";

    bool iniciada = false;
    if (url.startsWith("https://")) {
        iniciada = http.begin(secureClient, url);
    } else {
        WiFiClient plainClient;
        iniciada = http.begin(plainClient, url);
    }

    if (!iniciada) return false;

    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-ESP32-Token", ESP32_TOKEN);

    DynamicJsonDocument doc(4096);
    doc["boton_id"] = botonId;
    doc["protocolo"] = protocolo;
    doc["codigo"] = codigo;
    doc["bits"] = bits;
    doc["frecuencia"] = frecuencia;

    if (rawData != nullptr && rawLen > 0) {
        JsonArray rawJson = doc.createNestedArray("raw_data");
        for (size_t i = 0; i < rawLen; i++) {
            rawJson.add(rawData[i]);
        }
    }

    String body;
    serializeJson(doc, body);

    Serial.printf("[API] 📤 Subiendo código capturado para botón ID %d (%u bytes JSON)...\n", botonId, body.length());

    int httpCode = http.POST(body);
    bool ok = (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED);

    if (ok) {
        Serial.println("[API] ✓ ¡Código IR guardado en el servidor exitosamente!");
    } else {
        Serial.printf("[API] ⚠️ Error al guardar código IR: HTTP %d\n", httpCode);
    }

    http.end();
    return ok;
}
