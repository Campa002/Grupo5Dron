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
import java.net.InetSocketAddress;
import java.net.SocketTimeoutException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;

/**
 * Plugin Nativo Capacitor: DronNative
 * Grupo 5: Control de Sistemas y Dron — EEST N° 1 de Vicente López "Eduardo Ader"
 *
 * Contrato con el JS (DronAdaptadores.DronNativo en dron-adaptadores.js). Si cambiás algo acá, cambialo allá.
 *  1. enviarComando({host, puerto, mensaje, timeoutMs}) -> {respuesta, host, puerto, puertoLocal, desde?, error?}
 *     Nunca rechaza por falta de respuesta: resuelve con respuesta = "timeout" (o "cancelado") y el detalle en error.
 *  2. enviarSinRespuesta({host, puerto, mensaje}) -> {enviado} (rc ~15 Hz y emergency).
 *  3. cancelarEsperas({comando?}) -> {canceladas}: los comandos que esperan respuesta (solo los iguales a
 *     "comando", si viene) terminan con "cancelado".
 *  4. iniciarEscucha({puerto}) / detenerEscucha({puerto}).
 *     Eventos: "telemetria" {raw, puerto} por cada paquete,
 *              "videoPaquete" {data (Base64), tamano (bytes), paquetes, perdida, perdidasTotales}
 *                agrupando ~30 ms de video (puerto 11111); perdida = true si antes de estos bytes faltó un paquete,
 *              "respuestaUdp" {texto, desde, puertoLocal, comando, sinEspera} por cada respuesta del dron.
 *  5. vincularRedWifi() -> {vinculada, motivo, red}. Timeout de 5 s. Un solo callback de red a la vez.
 *  6. info() -> {version, sdkAndroid, redVinculada, red, puertoLocalComandos}.
 *  red: "wifi" (WiFi, normalmente el del Tello), "datos" (datos móviles), "ninguna" u "otra".
 *
 * Socket único de comandos: TODO lo que va al Tello (comandos con respuesta, rc y emergency) sale del mismo
 * socket y del mismo puerto local (8889 si está libre). El Tello contesta al IP:puerto que le habló: con un
 * solo socket las respuestas siempre llegan al hilo lector, que se las entrega en orden al comando que espera.
 */
@CapacitorPlugin(name = "DronNative")
public class DronNativePlugin extends Plugin {

    private static final String TAG = "DronNative";
    private static final String VERSION = "2.2.0";

    private static final int PUERTO_LOCAL_COMANDOS = 8889;
    private static final int PUERTO_VIDEO = 11111;
    // Agrupar el video evita cientos de eventos por segundo a través del puente de Capacitor
    private static final int INTERVALO_VIDEO_MS = 30;
    private static final int MAX_LOTE_VIDEO = 256 * 1024;
    // El Tello parte cada cuadro en paquetes de 1460 bytes; el último del cuadro es más chico
    private static final int TAMANO_PAQUETE_VIDEO = 1460;
    // Buffer grande: mientras el hilo arma el lote, los paquetes esperan acá en vez de perderse
    private static final int BUFFER_RECEPCION_VIDEO = 2 * 1024 * 1024;

    private final ConcurrentHashMap<Integer, Thread> socketListeners = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Integer, DatagramSocket> activeSockets = new ConcurrentHashMap<>();

    // ---- Socket único de comandos (todo lo que va al 8889 del Tello) ----
    private DatagramSocket socketComando = null;
    private Network redSocketComando = null;
    // Comandos que esperan respuesta, en el orden en que se mandaron (protegido por "esperas")
    private final ArrayDeque<Espera> esperas = new ArrayDeque<>();
    // Un solo hilo para los envíos sin respuesta: mantiene el orden de los rc
    private ExecutorService envioExecutor = null;
    // Cada comando con respuesta espera en su propio hilo
    private ExecutorService pluginExecutor = null;

    // ---- Red WiFi del Tello ----
    private volatile boolean redVinculada = false;
    private Network redTello = null;
    private ConnectivityManager.NetworkCallback callbackRed = null;
    private PluginCall llamadaVincular = null;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /** Un comando que espera su respuesta. */
    private static final class Espera {
        final String comando;
        final CountDownLatch listo = new CountDownLatch(1);
        String respuesta = null;
        String desde = null;
        boolean cancelada = false;

        Espera(String comando) {
            this.comando = comando;
        }
    }

    // ----------------------------------------------------------------
    // Socket de comandos y su hilo lector
    // ----------------------------------------------------------------

    /** Devuelve el socket de comandos, creándolo (y vinculándolo al WiFi) si hace falta. */
    private synchronized DatagramSocket obtenerSocketComando() throws Exception {
        if (socketComando != null && !socketComando.isClosed()) return socketComando;

        // Vincular automáticamente: si todavía no hay red elegida, buscar el WiFi activo
        if (redTello == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ConnectivityManager cm = conectividad();
            Network wifi = buscarRedWifi(cm);
            if (wifi != null) vincular(cm, wifi);
        }

        DatagramSocket s;
        try {
            s = new DatagramSocket(null);
            s.setReuseAddress(true);
            s.bind(new InetSocketAddress(PUERTO_LOCAL_COMANDOS));
        } catch (Exception ocupado) {
            Log.w(TAG, "Puerto local " + PUERTO_LOCAL_COMANDOS + " ocupado, se usa uno libre: " + ocupado.getMessage());
            s = new DatagramSocket();
        }
        redSocketComando = null;
        if (redTello != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP_MR1) {
            try {
                redTello.bindSocket(s);
                redSocketComando = redTello;
            } catch (Exception e) {
                Log.w(TAG, "No se pudo vincular el socket de comandos al WiFi: " + e.getMessage());
            }
        }
        socketComando = s;
        iniciarLector(s);
        Log.i(TAG, "Socket de comandos en el puerto local " + s.getLocalPort() + (redSocketComando != null ? " (WiFi)" : " (red por defecto)"));
        return s;
    }

    private void iniciarLector(final DatagramSocket s) {
        Thread lector = new Thread(() -> {
            byte[] buffer = new byte[2048];
            while (!s.isClosed()) {
                try {
                    DatagramPacket p = new DatagramPacket(buffer, buffer.length);
                    s.receive(p);
                    String texto = new String(p.getData(), p.getOffset(), p.getLength(), "UTF-8").trim();
                    String desde = p.getAddress().getHostAddress() + ":" + p.getPort();
                    Espera e;
                    synchronized (esperas) {
                        e = esperas.pollFirst();
                        if (e != null) {
                            e.respuesta = texto;
                            e.desde = desde;
                            e.listo.countDown();
                        }
                    }
                    Log.d(TAG, "RX <- " + desde + " (local " + s.getLocalPort() + "): " + texto);
                    JSObject ev = new JSObject();
                    ev.put("texto", texto);
                    ev.put("desde", desde);
                    ev.put("puertoLocal", s.getLocalPort());
                    ev.put("comando", e != null ? e.comando : "");
                    ev.put("sinEspera", e == null);
                    notifyListeners("respuestaUdp", ev);
                } catch (Exception ex) {
                    if (s.isClosed()) break;
                    Log.w(TAG, "Error leyendo respuestas: " + ex.getMessage());
                }
            }
        }, "DronNative-respuestas");
        lector.setDaemon(true);
        lector.start();
    }

    /** Cierra el socket de comandos; el próximo envío crea uno nuevo (por ejemplo, vinculado a otra red). */
    private synchronized void cerrarSocketComando() {
        if (socketComando != null) socketComando.close();
        socketComando = null;
        redSocketComando = null;
    }

    private void enviarPorSocketComando(String host, int puerto, String mensaje) throws Exception {
        DatagramSocket s = obtenerSocketComando();
        byte[] datos = mensaje.getBytes("UTF-8");
        s.send(new DatagramPacket(datos, datos.length, InetAddress.getByName(host), puerto));
    }

    // ----------------------------------------------------------------
    // enviarComando: envía por el socket único y espera la respuesta del dron
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
                final Espera espera = new Espera(mensaje);
                String error = null;
                synchronized (esperas) {
                    esperas.addLast(espera);
                }
                try {
                    enviarPorSocketComando(host, puerto, mensaje);
                    Log.d(TAG, "TX -> " + host + ":" + puerto + " : " + mensaje);
                    espera.listo.await(timeoutMs, TimeUnit.MILLISECONDS);
                } catch (Exception e) {
                    error = e.getClass().getSimpleName() + ": " + e.getMessage();
                }
                synchronized (esperas) {
                    esperas.remove(espera);
                }

                JSObject ret = new JSObject();
                ret.put("host", host);
                ret.put("puerto", puerto);
                ret.put("puertoLocal", puertoLocalComandos());
                if (espera.respuesta != null) {
                    ret.put("respuesta", espera.respuesta);
                    ret.put("desde", espera.desde);
                } else {
                    ret.put("respuesta", espera.cancelada ? "cancelado" : "timeout");
                    ret.put("error", error != null ? error
                        : (espera.cancelada ? "Espera cancelada por la app" : "Sin respuesta en " + timeoutMs + " ms"));
                    Log.w(TAG, "Sin respuesta a \"" + mensaje + "\": " + ret.getString("error"));
                }
                call.resolve(ret);
            });
        } catch (RejectedExecutionException e) {
            call.reject("El plugin se está cerrando: " + e.getMessage());
        }
    }

    // ----------------------------------------------------------------
    // enviarSinRespuesta: para el bucle rc y emergency (mismo socket que los comandos)
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

        final ExecutorService ejecutor;
        synchronized (this) {
            if (envioExecutor == null || envioExecutor.isShutdown()) {
                envioExecutor = Executors.newSingleThreadExecutor();
            }
            ejecutor = envioExecutor;
        }

        try {
            ejecutor.execute(() -> {
                try {
                    enviarPorSocketComando(host, puerto, mensaje);
                } catch (Exception e) {
                    // No se registra cada error: a 15 por segundo llenaría logcat
                }
            });
        } catch (RejectedExecutionException ignorada) {
            // El plugin se está cerrando
        }
    }

    // ----------------------------------------------------------------
    // cancelarEsperas: los comandos que esperan respuesta terminan ya con "cancelado"
    // (por ejemplo, el despegue que se confirmó por la telemetría: su "ok" tardío no debe
    // quedar asignado al comando siguiente)
    // ----------------------------------------------------------------
    @PluginMethod
    public void cancelarEsperas(PluginCall call) {
        final String comando = call.getString("comando", "");
        int n = 0;
        synchronized (esperas) {
            Iterator<Espera> it = esperas.iterator();
            while (it.hasNext()) {
                Espera e = it.next();
                if (!comando.isEmpty() && !comando.equals(e.comando)) continue;
                e.cancelada = true;
                e.listo.countDown();
                it.remove();
                n++;
            }
        }
        call.resolve(new JSObject().put("canceladas", n));
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
                socket.setReceiveBufferSize(BUFFER_RECEPCION_VIDEO);
            }
            synchronized (this) {
                if (redTello != null) vincularSocket(redTello, socket);
            }
            activeSockets.put(puerto, socket);

            Thread thread = new Thread(() -> {
                byte[] buffer = new byte[4096];
                ByteArrayOutputStream lote = new ByteArrayOutputStream(64 * 1024);
                int paquetesLote = 0;
                boolean perdidaLote = false;
                int ultimoTamano = 0;
                long perdidasTotales = 0;
                long ultimoEnvio = SystemClock.elapsedRealtime();
                Log.i(TAG, "Escuchando UDP en el puerto " + puerto + (esVideo ? " (video)" : " (telemetría)"));

                while (!Thread.currentThread().isInterrupted() && !socket.isClosed()) {
                    try {
                        DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                        socket.receive(packet);
                        if (esVideo) {
                            int largo = packet.getLength();
                            byte[] d = packet.getData();
                            int o = packet.getOffset();
                            boolean empiezaNal = largo >= 4 && d[o] == 0 && d[o + 1] == 0
                                && (d[o + 2] == 1 || (d[o + 2] == 0 && d[o + 3] == 1));
                            // Paquete perdido: el cuadro anterior no terminó (último de 1460) y empieza otro,
                            // o el anterior terminó y este no empieza con un código de inicio.
                            boolean perdida = ultimoTamano > 0 && (ultimoTamano == TAMANO_PAQUETE_VIDEO ? empiezaNal : !empiezaNal);
                            ultimoTamano = largo;
                            if (perdida) {
                                perdidasTotales++;
                                // Lo anterior sale en su propio lote: la marca de pérdida va justo antes de estos bytes
                                if (paquetesLote > 0) {
                                    emitirLoteVideo(lote, paquetesLote, perdidaLote, perdidasTotales);
                                    lote.reset();
                                    paquetesLote = 0;
                                    ultimoEnvio = SystemClock.elapsedRealtime();
                                }
                                perdidaLote = true;
                            }
                            lote.write(d, o, largo);
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
                            emitirLoteVideo(lote, paquetesLote, perdidaLote, perdidasTotales);
                            lote.reset();
                            paquetesLote = 0;
                            perdidaLote = false;
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

    private void emitirLoteVideo(ByteArrayOutputStream lote, int paquetes, boolean perdida, long perdidasTotales) {
        JSObject evento = new JSObject();
        evento.put("data", Base64.encodeToString(lote.toByteArray(), Base64.NO_WRAP));
        evento.put("tamano", lote.size());
        evento.put("paquetes", paquetes);
        evento.put("perdida", perdida);
        evento.put("perdidasTotales", perdidasTotales);
        notifyListeners("videoPaquete", evento);
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
    // Red WiFi del Tello
    // ----------------------------------------------------------------

    private ConnectivityManager conectividad() {
        return (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
    }

    /**
     * Busca entre las redes activas la WiFi. Prefiere la que NO tiene internet comprobado (la del Tello):
     * con los datos móviles prendidos, Android usa los datos por defecto y deja el WiFi del Tello de lado.
     */
    @SuppressWarnings("deprecation")
    private Network buscarRedWifi(ConnectivityManager cm) {
        Network conInternet = null;
        try {
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                if (caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
                if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return n;
                if (conInternet == null) conInternet = n;
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudieron listar las redes: " + e.getMessage());
        }
        return conInternet;
    }

    private void vincularSocket(Network red, DatagramSocket s) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP_MR1) return;
        try {
            red.bindSocket(s);
        } catch (Exception e) {
            Log.w(TAG, "bindSocket en el puerto " + s.getLocalPort() + ": " + e.getMessage());
        }
    }

    /** Usa esta red para todo: el proceso y cada socket. Llamar con el lock de this tomado. */
    private void vincular(ConnectivityManager cm, Network red) {
        boolean proceso = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && cm.bindProcessToNetwork(red);
        redTello = red;
        redVinculada = true;
        Log.i(TAG, "WiFi elegido; bindProcessToNetwork: " + proceso);
        // El socket de comandos se recrea vinculado a esta red (mismo puerto local)
        if (socketComando != null && !red.equals(redSocketComando)) cerrarSocketComando();
        for (DatagramSocket s : activeSockets.values()) vincularSocket(red, s);
    }

    /** Llamar con el lock de this tomado. */
    private void desvincular(ConnectivityManager cm) {
        redTello = null;
        redVinculada = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) cm.bindProcessToNetwork(null);
        cerrarSocketComando();
    }

    /** Qué red usan los comandos: "wifi", "datos", "ninguna" u "otra". */
    private String tipoRed(ConnectivityManager cm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return redVinculada ? "wifi" : "otra";
        Network n = redTello != null ? redTello : cm.getActiveNetwork();
        if (n == null) return "ninguna";
        NetworkCapabilities caps = cm.getNetworkCapabilities(n);
        if (caps == null) return "ninguna";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "datos";
        return "otra";
    }

    private synchronized void responderVincular(boolean vinculada, String motivo) {
        if (llamadaVincular == null) return;
        PluginCall c = llamadaVincular;
        llamadaVincular = null;
        handler.removeCallbacksAndMessages(null);
        c.resolve(new JSObject().put("vinculada", vinculada).put("motivo", motivo).put("red", tipoRed(conectividad())));
    }

    // ----------------------------------------------------------------
    // vincularRedWifi: usar el WiFi del Tello aunque no tenga internet y los datos estén prendidos
    // ----------------------------------------------------------------
    @PluginMethod
    public void vincularRedWifi(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve(new JSObject().put("vinculada", true).put("motivo", "Android < 6.0 no requiere vincular la red").put("red", "wifi"));
            return;
        }

        final ConnectivityManager cm = conectividad();

        synchronized (this) {
            // Si ya está vinculada y la red sigue viva, no se pide otra
            if (redTello != null && cm.getNetworkCapabilities(redTello) != null) {
                call.resolve(new JSObject().put("vinculada", true).put("motivo", "Red WiFi ya vinculada").put("red", tipoRed(cm)));
                return;
            }
            // Un pedido anterior sin responder termina ahora
            if (llamadaVincular != null) {
                llamadaVincular.resolve(new JSObject().put("vinculada", false).put("motivo", "Reemplazado por un pedido nuevo").put("red", tipoRed(cm)));
                llamadaVincular = null;
            }

            // 1. El WiFi ya está conectado: se usa directo
            Network wifi = buscarRedWifi(cm);
            if (wifi != null) vincular(cm, wifi);

            // 2. Pedido de red (mantiene el WiFi y lo vuelve a vincular si se reconecta)
            if (callbackRed == null) registrarCallbackRed(cm);

            if (wifi != null) {
                call.resolve(new JSObject().put("vinculada", true).put("motivo", "WiFi encontrado entre las redes activas").put("red", tipoRed(cm)));
                return;
            }
            llamadaVincular = call;
        }

        handler.postDelayed(() -> {
            synchronized (DronNativePlugin.this) {
                if (llamadaVincular == null) return;
                liberarCallbackRed(cm);
            }
            responderVincular(false, "Timeout: no apareció una red WiFi en 5 s");
        }, 5000);
    }

    /** Llamar con el lock de this tomado. */
    private void registrarCallbackRed(final ConnectivityManager cm) {
        // Sin removeCapability(INTERNET), Android ignora el WiFi del Tello porque no tiene internet
        NetworkRequest request = new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build();

        final ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // También se llama si el WiFi se reconecta: se vuelve a vincular
                synchronized (DronNativePlugin.this) {
                    vincular(cm, network);
                }
                responderVincular(true, "Red WiFi vinculada");
            }

            @Override
            public void onLost(Network network) {
                Log.w(TAG, "Red WiFi perdida");
                synchronized (DronNativePlugin.this) {
                    if (network.equals(redTello)) desvincular(cm);
                }
            }
        };

        callbackRed = callback;
        try {
            cm.requestNetwork(request, callback);
        } catch (Exception e) {
            callbackRed = null;
            Log.w(TAG, "requestNetwork falló: " + e.getMessage());
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

    private synchronized int puertoLocalComandos() {
        return socketComando != null && !socketComando.isClosed() ? socketComando.getLocalPort() : -1;
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
        String red;
        try {
            red = tipoRed(conectividad());
        } catch (Exception e) {
            red = "otra";
        }
        ret.put("red", red);
        ret.put("puertoLocalComandos", puertoLocalComandos());
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
        List<Espera> pendientes;
        synchronized (esperas) {
            pendientes = new ArrayList<>(esperas);
            esperas.clear();
        }
        for (Espera e : pendientes) {
            e.cancelada = true;
            e.listo.countDown();
        }

        synchronized (this) {
            cerrarSocketComando();
            if (envioExecutor != null) envioExecutor.shutdownNow();
            envioExecutor = null;
            if (pluginExecutor != null) pluginExecutor.shutdownNow();
            pluginExecutor = null;
            handler.removeCallbacksAndMessages(null);
            llamadaVincular = null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                ConnectivityManager cm = conectividad();
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
