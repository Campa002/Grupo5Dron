package ar.edu.eest1vl.grupo5dron.plugins

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.util.Base64
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap

/**
 * Plugin Nativo Capacitor: DronNative
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * Funcionalidades:
 *  1. Comunicación UDP bidireccional con DJI Ryze Tello (puerto 8889 comandos, 8890 telemetría, 11111 video).
 *  2. Forzado de red Wi-Fi sin Internet vía ConnectivityManager.bindProcessToNetwork.
 *  3. Streaming de paquetes de video en Base64 para reensamblado NAL en JavaScript.
 */
@CapacitorPlugin(name = "DronNative")
class DronNativePlugin : Plugin() {

    private val TAG = "DronNative"
    private val socketListeners = ConcurrentHashMap<Int, Thread>()
    private val activeSockets = ConcurrentHashMap<Int, DatagramSocket>()

    /**
     * Envía un comando UDP y espera la respuesta sincrónica del dron (ej. "command", "battery?", "forward 50").
     */
    @PluginMethod
    fun enviarComando(call: PluginCall) {
        val host = call.getString("host") ?: "192.168.10.1"
        val puerto = call.getInt("puerto") ?: 8889
        val mensaje = call.getString("mensaje") ?: ""
        val timeoutMs = call.getInt("timeoutMs") ?: 5000

        if (mensaje.isEmpty()) {
            call.reject("El mensaje a enviar no puede estar vacío")
            return
        }

        Thread {
            var socket: DatagramSocket? = null
            try {
                socket = DatagramSocket()
                socket.soTimeout = timeoutMs

                val address = InetAddress.getByName(host)
                val bufferEnvio = mensaje.toByteArray(Charsets.UTF_8)
                val paqueteEnvio = DatagramPacket(bufferEnvio, bufferEnvio.size, address, puerto)

                socket.send(paqueteEnvio)
                Log.d(TAG, "TX -> $host:$puerto : $mensaje")

                // Buffer de recepción
                val bufferRecv = ByteArray(2048)
                val paqueteRecv = DatagramPacket(bufferRecv, bufferRecv.size)

                socket.receive(paqueteRecv)
                val respuesta = String(paqueteRecv.data, 0, paqueteRecv.length, Charsets.UTF_8).trim()
                Log.d(TAG, "RX <- $host:$puerto : $respuesta")

                val ret = JSObject()
                ret.put("respuesta", respuesta)
                ret.put("host", host)
                ret.put("puerto", puerto)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.w(TAG, "Fallo enviando comando UDP: ${e.message}")
                val ret = JSObject()
                ret.put("error", e.message)
                ret.put("respuesta", "timeout")
                call.resolve(ret)
            } finally {
                socket?.close()
            }
        }.start()
    }

    /**
     * Inicia un listener UDP en segundo plano para telemetría (8890) o video (11111).
     */
    @PluginMethod
    fun iniciarEscucha(call: PluginCall) {
        val puerto = call.getInt("puerto") ?: 8890

        if (activeSockets.containsKey(puerto)) {
            call.resolve(JSObject().put("mensaje", "Socket ya activo en puerto $puerto"))
            return
        }

        try {
            val socket = DatagramSocket(puerto)
            activeSockets[puerto] = socket

            val thread = Thread {
                val buffer = ByteArray(4096)
                Log.i(TAG, "Iniciada escucha UDP en puerto $puerto")

                while (!Thread.currentThread().isInterrupted && !socket.isClosed) {
                    try {
                        val packet = DatagramPacket(buffer, buffer.size)
                        socket.receive(packet)

                        if (puerto == 11111) {
                            // Video H.264: reenviar como Base64 para el decodificador JS
                            val dataBytes = ByteArray(packet.length)
                            System.arraycopy(packet.data, packet.offset, dataBytes, 0, packet.length)
                            val base64Str = Base64.encodeToString(dataBytes, Base64.NO_WRAP)

                            val evento = JSObject()
                            evento.put("data", base64Str)
                            evento.put("tamano", packet.length)
                            notifyListeners("videoPaquete", evento)
                        } else {
                            // Telemetría de estado (8890)
                            val texto = String(packet.data, packet.offset, packet.length, Charsets.UTF_8)
                            val evento = JSObject()
                            evento.put("raw", texto)
                            evento.put("puerto", puerto)
                            notifyListeners("telemetria", evento)
                        }
                    } catch (e: Exception) {
                        if (socket.isClosed) break
                        Log.w(TAG, "Excepción en receive puerto $puerto: ${e.message}")
                    }
                }
            }

            socketListeners[puerto] = thread
            thread.isDaemon = true
            thread.start()

            val ret = JSObject()
            ret.put("puerto", puerto)
            ret.put("activo", true)
            call.resolve(ret)
        } catch (e: Exception) {
            Log.e(TAG, "Error abriendo socket en puerto $puerto: ${e.message}")
            call.reject("No se pudo abrir socket en puerto $puerto: ${e.message}")
        }
    }

    /**
     * Detiene la escucha UDP en un puerto determinado.
     */
    @PluginMethod
    fun detenerEscucha(call: PluginCall) {
        val puerto = call.getInt("puerto") ?: 8890
        val thread = socketListeners.remove(puerto)
        val socket = activeSockets.remove(puerto)

        thread?.interrupt()
        socket?.close()

        Log.i(TAG, "Detenida escucha UDP en puerto $puerto")
        call.resolve(JSObject().put("puerto", puerto).put("activo", false))
    }

    /**
     * Vincula el proceso actual a la interfaz Wi-Fi aunque no tenga salida a Internet.
     * Evita que Android ignore el WiFi del Tello y enrute los paquetes UDP a la red móvil.
     */
    @PluginMethod
    fun vincularRedWifi(call: PluginCall) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build()

            cm.requestNetwork(request, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    val vinculada = cm.bindProcessToNetwork(network)
                    Log.i(TAG, "bindProcessToNetwork(WiFi): $vinculada")
                    val ret = JSObject()
                    ret.put("vinculada", vinculada)
                    ret.put("modo", "TRANSPORT_WIFI")
                    call.resolve(ret)
                }

                override fun onLost(network: Network) {
                    Log.w(TAG, "Red Wi-Fi perdida")
                    cm.bindProcessToNetwork(null)
                }
            })
        } else {
            call.resolve(JSObject().put("vinculada", true).put("nota", "Android < 6.0 no requiere bindProcess"))
        }
    }
}

