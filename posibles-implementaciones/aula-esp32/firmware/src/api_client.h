/**
 * Cliente API REST HTTPS para ESP32 — Grupo 5: Control de Sistemas y Dron
 * EEST N° 1 de Vicente López "Eduardo Ader" — 7° 2°
 */

#ifndef API_CLIENT_H
#define API_CLIENT_H

#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

class ApiClient {
public:
    ApiClient();
    void iniciar();

    // Métodos principales del protocolo ESP32
    void pollComandos();
    bool enviarHeartbeat();
    bool reportarResultado(int comandoId, const String& estado, const String& resultado);
    bool enviarCodigoIr(int botonId, const String& protocolo, const String& codigo, 
                        int bits, const uint16_t* rawData, size_t rawLen, int frecuencia);

private:
    WiFiClientSecure secureClient;
    HTTPClient http;

    void configurarSeguridad();
    void procesarComando(JsonObject cmd);
};

extern ApiClient apiClient;

#endif // API_CLIENT_H
