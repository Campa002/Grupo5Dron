package ar.edu.eest1vl.grupo5dron.plugins;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Plugin Nativo Capacitor: DronNative
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * Funcionalidades:
 *  1. enviarComando: UDP con espera de respuesta (command, takeoff, land, battery?, etc.)
 *  2. enviarSinRespuesta: UDP fire-and-forget para bucle rc (~15 pps), socket y executor reutilizados.
 *  3. iniciarEscucha / detenerEscucha: listeners UDP para telemetría (8890) y video (11111).
 *  4. vincularRedWifi: bind a WiFi sin internet con timeout de 5 s.
 *  5. info: versión del plugin, SDK Android y estado de la red.
 */
@CapacitorPlugin(name = "DronNative")
public class DronNativePlugin extends Plugin {

    private static final String TAG = "DronNative";
    private static final String VERSION = "2.0.0";

    private final ConcurrentHashMap<Integer, Thread> socketListeners = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, DatagramSocket> activeSockets = new ConcurrentHashMap<>();

    // Socket y executor reutilizados para enviarSinRespuesta (bucle rc ~15 pps)
    private DatagramSocket rcSocket = null;
    private ExecutorService rcExecutor = null;

    private boolean redVinculada = false;

    // ----------------------------------------------------------------
    // enviarComando: envía UDP y espera respuesta del dron
    // ----------------------------------------------------------------
    @PluginMethod
    public void enviarComando(PluginCall call) {
        final String host = call.getString("host", "192.168.10.1");
        final int puerto = call.getInt("puerto", 8889);
        final String mensaje = call.getString("mensaje", "");
        final int timeoutMs = call.getInt("timeoutMs", 5000);

        if (mensaje.isEmpty()) {
            call.reject("El mensaje a enviar no puede estar vacío");
            return;
        }

        getExecutor().execute(() -> {
            DatagramSocket socket = null;
            try {
                socket = new DatagramSocket();
                socket.setSoTimeout(timeoutMs);

                InetAddress address = InetAddress.getByName(host);
                byte[] bufferEnvio = mensaje.getBytes("UTF-8");
                DatagramPacket paqueteEnvio = new DatagramPacket(bufferEnvio, bufferEnvio.length, address, puerto);

                socket.send(paqueteEnvio);
                Log.d(TAG, "TX -> " + host + ":" + puerto + " : " + mensaje);

                byte[] bufferRecv = new byte[2048];
                DatagramPacket paqueteRecv = new DatagramPacket(bufferRecv, bufferRecv.length);

                socket.receive(paqueteRecv);
                String respuesta = new String(paqueteRecv.getData(), 0, paqueteRecv.getLength(), "UTF-8").trim();
                Log.d(TAG, "RX <- " + host + ":" + puerto + " : " + respuesta);

                JSObject ret = new JSObject();
                ret.put("respuesta", respuesta);
                ret.put("host", host);
                ret.put("puerto", puerto);
                call.resolve(ret);
            } catch (Exception e) {
                Log.w(TAG, "Fallo enviando comando UDP: " + e.getMessage());
                JSObject ret = new JSObject();
                ret.put("error", e.getMessage());
                ret.put("respuesta", "timeout");
                call.resolve(ret);
            } finally {
                if (socket != null) {
                    socket.close();
                }
            }
        });
    }

    // ----------------------------------------------------------------
    // enviarSinRespuesta: fire-and-forget para bucle rc (~15/s)
    // Reutiliza UN solo DatagramSocket y UN ExecutorService de 1 hilo.
    // ----------------------------------------------------------------
    @PluginMethod
    public void enviarSinRespuesta(PluginCall call) {
        final String host = call.getString("host", "192.168.10.1");
        final int puerto = call.getInt("puerto", 8889);
        final String mensaje = call.getString("mensaje", "");

        if (mensaje.isEmpty()) {
            call.reject("El mensaje no puede estar vacío");
            return;
        }

        // Resolver la promesa de inmediato (fire-and-forget)
        call.resolve(new JSObject().put("enviado", true));

        // Crear executor y socket si no existen
        synchronized (this) {
            if (rcExecutor == null || rcExecutor.isShutdown()) {
                rcExecutor = Executors.newSingleThreadExecutor();
            }
            if (rcSocket == null || rcSocket.isClosed()) {
                try {
                    rcSocket = new DatagramSocket();
                } catch (Exception e) {
                    Log.e(TAG, "No se pudo crear rcSocket: " + e.getMessage());
                    return;
                }
            }
        }

        final DatagramSocket sock = rcSocket;
        rcExecutor.execute(() -> {
            try {
                InetAddress address = InetAddress.getByName(host);
                byte[] data = mensaje.getBytes("UTF-8");
                DatagramPacket pkt = new DatagramPacket(data, data.length, address, puerto);
                sock.send(pkt);
            } catch (Exception e) {
                // No logear cada error: a 15/s llenaría logcat
            }
        });
    }

    // ----------------------------------------------------------------
    // iniciarEscucha: listener UDP para telemetría (8890) o video (11111)
    // ----------------------------------------------------------------
    @PluginMethod
    public void iniciarEscucha(PluginCall call) {
        final int puerto = call.getInt("puerto", 8890);

        if (activeSockets.containsKey(puerto)) {
            call.resolve(new JSObject().put("mensaje", "Socket ya activo en puerto " + puerto));
            return;
        }

        try {
            final DatagramSocket socket = new DatagramSocket(puerto);
            activeSockets.put(puerto, socket);

            Thread thread = new Thread(() -> {
                byte[] buffer = new byte[4096];
                Log.i(TAG, "Iniciada escucha UDP en puerto " + puerto);

                while (!Thread.currentThread().isInterrupted() && !socket.isClosed()) {
                    try {
                        DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                        socket.receive(packet);

                        if (puerto == 11111) {
                            // Video H.264: reenviar como Base64
                            byte[] dataBytes = new byte[packet.getLength()];
                            System.arraycopy(packet.getData(), packet.getOffset(), dataBytes, 0, packet.getLength());
                            String base64Str = Base64.encodeToString(dataBytes, Base64.NO_WRAP);

                            JSObject evento = new JSObject();
                            evento.put("data", base64Str);
                            evento.put("tamano", packet.getLength());
                            notifyListeners("videoPaquete", evento);
                        } else {
                            // Telemetría de estado (8890)
                            String texto = new String(packet.getData(), packet.getOffset(), packet.getLength(), "UTF-8");
                            JSObject evento = new JSObject();
                            evento.put("raw", texto);
                            evento.put("puerto", puerto);
                            notifyListeners("telemetria", evento);
                        }
                    } catch (Exception e) {
                        if (socket.isClosed()) break;
                        Log.w(TAG, "Excepción en receive puerto " + puerto + ": " + e.getMessage());
                    }
                }
            });

            socketListeners.put(puerto, thread);
            thread.setDaemon(true);
            thread.start();

            JSObject ret = new JSObject();
            ret.put("puerto", puerto);
            ret.put("activo", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error abriendo socket en puerto " + puerto + ": " + e.getMessage());
            call.reject("No se pudo abrir socket en puerto " + puerto + ": " + e.getMessage());
        }
    }

    // ----------------------------------------------------------------
    // detenerEscucha: cierra el listener UDP de un puerto
    // ----------------------------------------------------------------
    @PluginMethod
    public void detenerEscucha(PluginCall call) {
        int puerto = call.getInt("puerto", 8890);
        Thread thread = socketListeners.remove(puerto);
        DatagramSocket socket = activeSockets.remove(puerto);

        if (thread != null) thread.interrupt();
        if (socket != null) socket.close();

        Log.i(TAG, "Detenida escucha UDP en puerto " + puerto);
        call.resolve(new JSObject().put("puerto", puerto).put("activo", false));
    }

    // ----------------------------------------------------------------
    // vincularRedWifi: bind a WiFi sin internet, timeout 5 s
    // ----------------------------------------------------------------
    @PluginMethod
    public void vincularRedWifi(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            // Android < 6 no requiere bindProcess
            call.resolve(new JSObject()
                .put("vinculada", true)
                .put("motivo", "Android < 6.0 no requiere bindProcess"));
            return;
        }

        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        // removeCapability(NET_CAPABILITY_INTERNET) para que acepte WiFi sin salida a internet
        // Probado: sin removeCapability, Android ignora el WiFi del Tello porque no tiene internet.
        // Con removeCapability funciona: Android acepta la red WiFi aunque no tenga INTERNET.
        NetworkRequest request = new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build();

        final boolean[] respondido = {false};

        // Timeout de 5 s con Handler: si no aparece WiFi, resolvemos con vinculada=false
        Handler handler = new Handler(Looper.getMainLooper());
        Runnable timeoutRunnable = () -> {
            synchronized (respondido) {
                if (!respondido[0]) {
                    respondido[0] = true;
                    redVinculada = false;
                    JSObject ret = new JSObject();
                    ret.put("vinculada", false);
                    ret.put("motivo", "Timeout: no se encontró red WiFi en 5 s");
                    call.resolve(ret);
                }
            }
        };
        handler.postDelayed(timeoutRunnable, 5000);

        cm.requestNetwork(request, new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                synchronized (respondido) {
                    if (respondido[0]) return;
                    respondido[0] = true;
                }
                handler.removeCallbacks(timeoutRunnable);

                boolean bound = cm.bindProcessToNetwork(network);
                redVinculada = bound;
                Log.i(TAG, "bindProcessToNetwork(WiFi): " + bound);

                JSObject ret = new JSObject();
                ret.put("vinculada", bound);
                ret.put("motivo", bound ? "Red WiFi vinculada" : "bindProcessToNetwork devolvió false");
                call.resolve(ret);
            }

            @Override
            public void onLost(Network network) {
                Log.w(TAG, "Red Wi-Fi perdida");
                redVinculada = false;
                cm.bindProcessToNetwork(null);
            }
        });
    }

    // ----------------------------------------------------------------
    // info: diagnóstico del plugin
    // ----------------------------------------------------------------
    @PluginMethod
    public void info(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("version", VERSION);
        ret.put("sdkAndroid", Build.VERSION.SDK_INT);
        ret.put("redVinculada", redVinculada);
        call.resolve(ret);
    }

    // ----------------------------------------------------------------
    // Limpieza al destruir
    // ----------------------------------------------------------------
    @Override
    protected void handleOnDestroy() {
        // Cerrar todos los sockets de escucha
        for (Integer puerto : activeSockets.keySet()) {
            DatagramSocket s = activeSockets.remove(puerto);
            Thread t = socketListeners.remove(puerto);
            if (t != null) t.interrupt();
            if (s != null) s.close();
        }

        // Cerrar socket y executor del bucle rc
        synchronized (this) {
            if (rcSocket != null && !rcSocket.isClosed()) {
                rcSocket.close();
                rcSocket = null;
            }
            if (rcExecutor != null && !rcExecutor.isShutdown()) {
                rcExecutor.shutdownNow();
                rcExecutor = null;
            }
        }
    }

    // Executor de Capacitor para enviarComando (no confundir con rcExecutor)
    private ExecutorService pluginExecutor;
    private ExecutorService getExecutor() {
        if (pluginExecutor == null || pluginExecutor.isShutdown()) {
            pluginExecutor = Executors.newCachedThreadPool();
        }
        return pluginExecutor;
    }
}

