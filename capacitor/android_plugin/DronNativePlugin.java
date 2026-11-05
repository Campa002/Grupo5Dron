package ar.edu.eest1vl.grupo5dron.plugins;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * Plugin Nativo Capacitor: DronNative
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * Contrato con el JS (DronAdaptadores.DronNativo en dron-adaptadores.js). Si cambiás algo acá, cambialo allá.
 *  1. enviarComando({host, puerto, mensaje, timeoutMs}) -> {respuesta, host, puerto, error?}
 *     Nunca rechaza por falta de respuesta: resuelve con respuesta = "timeout" y el detalle en error.
 *  2. enviarSinRespuesta({host, puerto, mensaje}) -> {enviado}. Socket y executor reutilizados (rc ~15 Hz).
 *  3. iniciarEscucha({puerto}) / detenerEscucha({puerto}).
 *     Eventos: "telemetria" {raw, puerto} por cada paquete,
 *              "videoPaquete" {data (Base64), tamano (bytes), paquetes} agrupando ~30 ms de video (puerto 11111).
 *  4. vincularRedWifi() -> {vinculada, motivo}. Timeout de 5 s. Un solo callback de red a la vez.
 *  5. info() -> {version, sdkAndroid, redVinculada}.
 */
@CapacitorPlugin(name = "DronNative")
public class DronNativePlugin extends Plugin {

    private static final String TAG = "DronNative";
    private static final String VERSION = "2.1.0";

    private static final int PUERTO_VIDEO = 11111;
    // Agrupar el video evita cientos de eventos por segundo a través del puente de Capacitor
    private static final int INTERVALO_VIDEO_MS = 30;
    private static final int MAX_LOTE_VIDEO = 256 * 1024;

    private final ConcurrentHashMap<Integer, Thread> socketListeners = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, DatagramSocket> activeSockets = new ConcurrentHashMap<>();

    // Socket y executor reutilizados para enviarSinRespuesta (bucle rc ~15 Hz)
    private DatagramSocket rcSocket = null;
    private ExecutorService rcExecutor = null;

    // Executor para enviarComando (cada comando espera su respuesta en su propio hilo)
    private ExecutorService pluginExecutor = null;

    // Red WiFi del Tello
    private volatile boolean redVinculada = false;
    private Network redTello = null;
    private ConnectivityManager.NetworkCallback callbackRed = null;

    // ----------------------------------------------------------------
    // enviarComando: envía UDP y espera la respuesta del dron
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

        try {
            getExecutor().execute(() -> {
                DatagramSocket socket = null;
                try {
                    socket = new DatagramSocket();
                    socket.setSoTimeout(timeoutMs);

                    InetAddress address = InetAddress.getByName(host);
                    byte[] bufferEnvio = mensaje.getBytes("UTF-8");
                    socket.send(new DatagramPacket(bufferEnvio, bufferEnvio.length, address, puerto));
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
                    Log.w(TAG, "Sin respuesta a \"" + mensaje + "\": " + e.getMessage());
                    JSObject ret = new JSObject();
                    ret.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
                    ret.put("respuesta", "timeout");
                    ret.put("host", host);
                    ret.put("puerto", puerto);
                    call.resolve(ret);
                } finally {
                    if (socket != null) socket.close();
                }
            });
        } catch (RejectedExecutionException e) {
            call.reject("El plugin se está cerrando: " + e.getMessage());
        }
    }

    // ----------------------------------------------------------------
    // enviarSinRespuesta: fire-and-forget para el bucle rc y emergency
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

        // Resolver de inmediato (no se espera respuesta)
        call.resolve(new JSObject().put("enviado", true));

        final DatagramSocket sock;
        final ExecutorService ejecutor;
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
            sock = rcSocket;
            ejecutor = rcExecutor;
        }

        try {
            ejecutor.execute(() -> {
                try {
                    byte[] data = mensaje.getBytes("UTF-8");
                    sock.send(new DatagramPacket(data, data.length, InetAddress.getByName(host), puerto));
                } catch (Exception e) {
                    // No se registra cada error: a 15 por segundo llenaría logcat
                }
            });
        } catch (RejectedExecutionException ignorada) {
            // El plugin se está cerrando
        }
    }

    // ----------------------------------------------------------------
    // iniciarEscucha: telemetría (8890) o video (11111)
    // ----------------------------------------------------------------
    @PluginMethod
    public void iniciarEscucha(PluginCall call) {
        final int puerto = call.getInt("puerto", 8890);

        if (activeSockets.containsKey(puerto)) {
            call.resolve(new JSObject().put("puerto", puerto).put("activo", true).put("mensaje", "Ya estaba escuchando"));
            return;
        }

        try {
            final DatagramSocket socket = new DatagramSocket(puerto);
            final boolean esVideo = (puerto == PUERTO_VIDEO);
            if (esVideo) {
                // Despierta cada 30 ms aunque no lleguen datos, para enviar el lote acumulado
                socket.setSoTimeout(INTERVALO_VIDEO_MS);
            }
            activeSockets.put(puerto, socket);

            Thread thread = new Thread(() -> {
                byte[] buffer = new byte[4096];
                ByteArrayOutputStream lote = new ByteArrayOutputStream(64 * 1024);
                int paquetesLote = 0;
                long ultimoEnvio = SystemClock.elapsedRealtime();
                Log.i(TAG, "Escuchando UDP en el puerto " + puerto + (esVideo ? " (video)" : " (telemetría)"));

                while (!Thread.currentThread().isInterrupted() && !socket.isClosed()) {
                    try {
                        DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                        socket.receive(packet);
                        if (esVideo) {
                            lote.write(packet.getData(), packet.getOffset(), packet.getLength());
                            paquetesLote++;
                        } else {
                            String texto = new String(packet.getData(), packet.getOffset(), packet.getLength(), "UTF-8");
                            JSObject evento = new JSObject();
                            evento.put("raw", texto);
                            evento.put("puerto", puerto);
                            notifyListeners("telemetria", evento);
                        }
                    } catch (SocketTimeoutException sinDatos) {
                        // Pasaron 30 ms sin paquetes: se envía lo acumulado más abajo
                    } catch (Exception e) {
                        if (socket.isClosed()) break;
                        Log.w(TAG, "Error recibiendo en el puerto " + puerto + ": " + e.getMessage());
                    }

                    if (esVideo && paquetesLote > 0) {
                        long ahora = SystemClock.elapsedRealtime();
                        if (ahora - ultimoEnvio >= INTERVALO_VIDEO_MS || lote.size() >= MAX_LOTE_VIDEO) {
                            JSObject evento = new JSObject();
                            evento.put("data", Base64.encodeToString(lote.toByteArray(), Base64.NO_WRAP));
                            evento.put("tamano", lote.size());
                            evento.put("paquetes", paquetesLote);
                            notifyListeners("videoPaquete", evento);
                            lote.reset();
                            paquetesLote = 0;
                            ultimoEnvio = ahora;
                        }
                    }
                }
            });

            socketListeners.put(puerto, thread);
            thread.setDaemon(true);
            thread.start();

            call.resolve(new JSObject().put("puerto", puerto).put("activo", true));
        } catch (Exception e) {
            Log.e(TAG, "Error abriendo el puerto " + puerto + ": " + e.getMessage());
            call.reject("No se pudo abrir el puerto " + puerto + ": " + e.getMessage());
        }
    }

    // ----------------------------------------------------------------
    // detenerEscucha: cierra el listener UDP de un puerto
    // ----------------------------------------------------------------
    @PluginMethod
    public void detenerEscucha(PluginCall call) {
        int puerto = call.getInt("puerto", 8890);
        cerrarEscucha(puerto);
        Log.i(TAG, "Escucha UDP detenida en el puerto " + puerto);
        call.resolve(new JSObject().put("puerto", puerto).put("activo", false));
    }

    private void cerrarEscucha(int puerto) {
        Thread thread = socketListeners.remove(puerto);
        DatagramSocket socket = activeSockets.remove(puerto);
        if (thread != null) thread.interrupt();
        if (socket != null) socket.close();
    }

    // ----------------------------------------------------------------
    // vincularRedWifi: usar el WiFi del Tello aunque no tenga internet (timeout 5 s)
    // ----------------------------------------------------------------
    @PluginMethod
    public void vincularRedWifi(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve(new JSObject().put("vinculada", true).put("motivo", "Android < 6.0 no requiere vincular la red"));
            return;
        }

        final ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        synchronized (this) {
            // Si ya está vinculada y la red sigue viva, no se pide otra
            if (redTello != null && cm.getNetworkCapabilities(redTello) != null && redTello.equals(cm.getBoundNetworkForProcess())) {
                call.resolve(new JSObject().put("vinculada", true).put("motivo", "Red WiFi ya vinculada"));
                return;
            }
            // Un solo pedido de red a la vez: liberar el anterior
            liberarCallbackRed(cm);
        }

        // Sin removeCapability(INTERNET), Android ignora el WiFi del Tello porque no tiene internet
        NetworkRequest request = new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build();

        final boolean[] respondido = {false};
        final Handler handler = new Handler(Looper.getMainLooper());

        final ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // También se llama si el WiFi se reconecta: se vuelve a vincular
                boolean bound = cm.bindProcessToNetwork(network);
                synchronized (DronNativePlugin.this) {
                    redTello = bound ? network : null;
                    redVinculada = bound;
                }
                Log.i(TAG, "bindProcessToNetwork(WiFi): " + bound);
                synchronized (respondido) {
                    if (respondido[0]) return;
                    respondido[0] = true;
                }
                handler.removeCallbacksAndMessages(null);
                call.resolve(new JSObject()
                    .put("vinculada", bound)
                    .put("motivo", bound ? "Red WiFi vinculada" : "bindProcessToNetwork devolvió false"));
            }

            @Override
            public void onLost(Network network) {
                Log.w(TAG, "Red WiFi perdida");
                synchronized (DronNativePlugin.this) {
                    if (network.equals(redTello)) {
                        redTello = null;
                        redVinculada = false;
                        cm.bindProcessToNetwork(null);
                    }
                }
            }
        };

        handler.postDelayed(() -> {
            synchronized (respondido) {
                if (respondido[0]) return;
                respondido[0] = true;
            }
            synchronized (DronNativePlugin.this) {
                if (callbackRed == callback) liberarCallbackRed(cm);
                redVinculada = false;
            }
            call.resolve(new JSObject().put("vinculada", false).put("motivo", "Timeout: no apareció una red WiFi en 5 s"));
        }, 5000);

        synchronized (this) {
            callbackRed = callback;
        }
        try {
            cm.requestNetwork(request, callback);
        } catch (Exception e) {
            handler.removeCallbacksAndMessages(null);
            synchronized (this) {
                if (callbackRed == callback) callbackRed = null;
            }
            synchronized (respondido) {
                if (respondido[0]) return;
                respondido[0] = true;
            }
            call.resolve(new JSObject().put("vinculada", false).put("motivo", "requestNetwork falló: " + e.getMessage()));
        }
    }

    /** Debe llamarse con el lock de this tomado. */
    private void liberarCallbackRed(ConnectivityManager cm) {
        if (callbackRed != null) {
            try {
                cm.unregisterNetworkCallback(callbackRed);
            } catch (Exception ignorada) {
                // ya estaba liberado
            }
            callbackRed = null;
        }
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
        for (Integer puerto : activeSockets.keySet()) {
            cerrarEscucha(puerto);
        }

        synchronized (this) {
            if (rcSocket != null && !rcSocket.isClosed()) rcSocket.close();
            rcSocket = null;
            if (rcExecutor != null) rcExecutor.shutdownNow();
            rcExecutor = null;
            if (pluginExecutor != null) pluginExecutor.shutdownNow();
            pluginExecutor = null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                liberarCallbackRed(cm);
                if (redTello != null) cm.bindProcessToNetwork(null);
            }
            redTello = null;
            redVinculada = false;
        }
    }

    private synchronized ExecutorService getExecutor() {
        if (pluginExecutor == null || pluginExecutor.isShutdown()) {
            pluginExecutor = Executors.newCachedThreadPool();
        }
        return pluginExecutor;
    }
}
