import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.input.InputManager;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Process;
import android.os.SystemClock;
import android.util.Base64;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.Surface;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.FileWriter;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.util.concurrent.atomic.AtomicReference;

public class ScreenAgent {
    private static int devW = 1080;
    private static int devH = 1920;
    private static int outW = 540;
    private static int outH = 960;
    private static volatile int jpegQuality = 78;
    private static volatile long minFrameIntervalMs = 33;

    // Strong static references prevent ART GC from finalizing the SurfaceControl
    // BinderProxy token or ImageReader while main() blocks in server.accept().
    private static IBinder virtualDisplay;
    private static ImageReader imageReader;
    private static Surface readerSurface;
    private static HandlerThread readerThread;
    private static Handler readerHandler;
    private static ImageReader.OnImageAvailableListener imageListener;
    private static ServerSocket serverSocket;

    private static Bitmap reusableRawBmp;
    private static Bitmap reusableOutBmp;
    private static Canvas reusableOutCanvas;
    private static Rect srcCropRect;
    private static Rect dstCropRect;
    private static final ByteArrayOutputStream reusableBaos = new ByteArrayOutputStream(65536);
    private static long lastEncodeMs = 0;
    private static boolean drainScheduled = false;

    private static Object imGlobalInstance;
    private static Method injectInputEventMethod;
    private static Method setDisplayIdMethod;
    private static KeyCharacterMap keyCharMap;
    private static final AtomicReference<byte[]> latestJpeg = new AtomicReference<>(null);
    private static final Object frameSignal = new Object();
    private static long downTime = 0;

    private static final Runnable drainRunnable = new Runnable() {
        @Override
        public void run() {
            drainScheduled = false;
            captureLatestFrame(imageReader, true);
        }
    };

    private static void captureLatestFrame(ImageReader r, boolean force) {
        if (r == null) return;
        long now = SystemClock.uptimeMillis();
        long elapsed = now - lastEncodeMs;
        if (!force && latestJpeg.get() != null && elapsed < minFrameIntervalMs) {
            // Defer instead of acquiring & discarding so the final settled frame is never lost.
            if (!drainScheduled && readerHandler != null) {
                drainScheduled = true;
                readerHandler.postDelayed(drainRunnable, Math.max(1L, minFrameIntervalMs - elapsed));
            }
            return;
        }

        Image img = null;
        try {
            img = r.acquireLatestImage();
            if (img == null) return;
            lastEncodeMs = SystemClock.uptimeMillis();

            Image.Plane plane = img.getPlanes()[0];
            ByteBuffer buf = plane.getBuffer();
            buf.rewind();
            int rowStride = plane.getRowStride();
            int pixelStride = plane.getPixelStride();
            int bufWidth = rowStride / pixelStride;

            if (reusableRawBmp == null || reusableRawBmp.getWidth() != bufWidth || reusableRawBmp.getHeight() != outH) {
                if (reusableRawBmp != null) reusableRawBmp.recycle();
                reusableRawBmp = Bitmap.createBitmap(bufWidth, outH, Bitmap.Config.ARGB_8888);
            }
            reusableRawBmp.copyPixelsFromBuffer(buf);

            Bitmap toEncode = reusableRawBmp;
            if (bufWidth != outW) {
                if (reusableOutBmp == null || reusableOutBmp.getWidth() != outW || reusableOutBmp.getHeight() != outH) {
                    if (reusableOutBmp != null) reusableOutBmp.recycle();
                    reusableOutBmp = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
                    reusableOutCanvas = new Canvas(reusableOutBmp);
                    srcCropRect = new Rect(0, 0, outW, outH);
                    dstCropRect = new Rect(0, 0, outW, outH);
                }
                reusableOutCanvas.drawBitmap(reusableRawBmp, srcCropRect, dstCropRect, null);
                toEncode = reusableOutBmp;
            }

            reusableBaos.reset();
            toEncode.compress(Bitmap.CompressFormat.JPEG, jpegQuality, reusableBaos);
            latestJpeg.set(reusableBaos.toByteArray());
            synchronized (frameSignal) {
                frameSignal.notifyAll();
            }
        } catch (Throwable t) {
            t.printStackTrace();
        } finally {
            if (img != null) img.close();
        }
    }

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8889;
        if (args.length >= 3) {
            devW = Integer.parseInt(args[1]);
            devH = Integer.parseInt(args[2]);
            outW = Math.max(270, devW / 2);
            outH = Math.max(480, devH / 2);
        }

        try (FileWriter fw = new FileWriter("/data/local/tmp/qa-screen-agent.pid")) {
            fw.write(String.valueOf(Process.myPid()));
        } catch (Throwable ignored) {}

        try {
            imGlobalInstance = InputManager.class.getMethod("getInstance").invoke(null);
            injectInputEventMethod = InputManager.class.getMethod("injectInputEvent", InputEvent.class, int.class);
        } catch (Throwable t) {
            Class<?> imGlobal = Class.forName("android.hardware.input.InputManagerGlobal");
            imGlobalInstance = imGlobal.getMethod("getInstance").invoke(null);
            injectInputEventMethod = imGlobal.getMethod("injectInputEvent", InputEvent.class, int.class);
        }

        try {
            setDisplayIdMethod = InputEvent.class.getMethod("setDisplayId", int.class);
        } catch (Throwable ignored) {}

        try {
            keyCharMap = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD);
        } catch (Throwable ignored) {}

        readerThread = new HandlerThread("ScreenReader");
        readerThread.start();
        readerHandler = new Handler(readerThread.getLooper());

        imageReader = ImageReader.newInstance(outW, outH, PixelFormat.RGBA_8888, 4);
        readerSurface = imageReader.getSurface();

        imageListener = new ImageReader.OnImageAvailableListener() {
            @Override
            public void onImageAvailable(ImageReader r) {
                captureLatestFrame(r, false);
            }
        };
        imageReader.setOnImageAvailableListener(imageListener, readerHandler);

        final Class<?> sc = Class.forName("android.view.SurfaceControl");
        Method createDisplay = sc.getMethod("createDisplay", String.class, boolean.class);
        if (Process.myUid() == 0) {
            try {
                virtualDisplay = (IBinder) createDisplay.invoke(null, "qa-studio", true);
            } catch (Throwable ignored) {
                virtualDisplay = null;
            }
        }
        if (virtualDisplay == null) {
            virtualDisplay = (IBinder) createDisplay.invoke(null, "qa-studio", false);
        }

        Method openTx = sc.getMethod("openTransaction");
        Method closeTx = sc.getMethod("closeTransaction");
        openTx.invoke(null);
        try {
            sc.getMethod("setDisplaySurface", IBinder.class, Surface.class).invoke(null, virtualDisplay, readerSurface);
            sc.getMethod("setDisplayProjection", IBinder.class, int.class, Rect.class, Rect.class)
              .invoke(null, virtualDisplay, 0, new Rect(0, 0, devW, devH), new Rect(0, 0, outW, outH));
            sc.getMethod("setDisplayLayerStack", IBinder.class, int.class).invoke(null, virtualDisplay, 0);
        } finally {
            closeTx.invoke(null);
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try {
                if (virtualDisplay != null) {
                    sc.getMethod("destroyDisplay", IBinder.class).invoke(null, virtualDisplay);
                    virtualDisplay = null;
                }
            } catch (Throwable ignored) {}
            try {
                if (imageReader != null) {
                    imageReader.close();
                    imageReader = null;
                }
            } catch (Throwable ignored) {}
        }));

        serverSocket = new ServerSocket();
        serverSocket.setReuseAddress(true);
        serverSocket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 8);
        System.out.println("QA_SCREEN_AGENT_READY port=" + port + " size=" + outW + "x" + outH);
        System.out.flush();

        while (true) {
            final Socket client = serverSocket.accept();
            client.setTcpNoDelay(true);
            new Thread(() -> handleClient(client)).start();
        }
    }

    private static void handleClient(Socket client) {
        try {
            final DataOutputStream out = new DataOutputStream(client.getOutputStream());
            final boolean[] running = {true};

            Thread writer = new Thread(() -> {
                try {
                    byte[] lastSent = null;
                    while (running[0]) {
                        byte[] frame;
                        synchronized (frameSignal) {
                            while (running[0]) {
                                frame = latestJpeg.get();
                                if (frame != null && frame != lastSent) {
                                    break;
                                }
                                frameSignal.wait(1000);
                            }
                            frame = latestJpeg.get();
                        }
                        if (!running[0]) break;
                        if (frame != null && frame != lastSent) {
                            lastSent = frame;
                            out.writeInt(frame.length);
                            out.write(frame);
                            out.flush();
                        }
                    }
                } catch (Throwable ignored) {
                    running[0] = false;
                }
            });
            writer.start();

            BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), "UTF-8"));
            String line;
            while ((line = in.readLine()) != null) {
                handleCommand(line.trim());
            }
            running[0] = false;
            synchronized (frameSignal) { frameSignal.notifyAll(); }
        } catch (Throwable ignored) {
        } finally {
            try { client.close(); } catch (Throwable ignored) {}
        }
    }

    private static void injectEvent(InputEvent event) {
        try {
            if (setDisplayIdMethod != null) {
                setDisplayIdMethod.invoke(event, 0);
            }
            injectInputEventMethod.invoke(imGlobalInstance, event, 0);
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    private static void handleCommand(String cmd) {
        if (cmd.isEmpty()) return;
        String[] parts = cmd.split(" ");
        try {
            if ("TOUCH".equals(parts[0]) && parts.length >= 4) {
                int action = Integer.parseInt(parts[1]);
                float x = Float.parseFloat(parts[2]);
                float y = Float.parseFloat(parts[3]);
                long now = SystemClock.uptimeMillis();
                if (action == MotionEvent.ACTION_DOWN) {
                    downTime = now;
                }
                MotionEvent.PointerProperties[] props = { new MotionEvent.PointerProperties() };
                props[0].id = 0;
                props[0].toolType = MotionEvent.TOOL_TYPE_FINGER;
                MotionEvent.PointerCoords[] coords = { new MotionEvent.PointerCoords() };
                coords[0].x = x;
                coords[0].y = y;
                coords[0].pressure = (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) ? 0.0f : 1.0f;
                coords[0].size = 1.0f;
                MotionEvent ev = MotionEvent.obtain(
                    downTime, now, action, 1, props, coords,
                    0, 0, 1.0f, 1.0f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0
                );
                injectEvent(ev);
                ev.recycle();
            } else if ("KEY".equals(parts[0]) && parts.length >= 2) {
                int code = Integer.parseInt(parts[1]);
                long now = SystemClock.uptimeMillis();
                KeyEvent down = new KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0, 0, KeyCharacterMap.VIRTUAL_KEYBOARD, 0, 0, InputDevice.SOURCE_KEYBOARD);
                KeyEvent up = new KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0, 0, KeyCharacterMap.VIRTUAL_KEYBOARD, 0, 0, InputDevice.SOURCE_KEYBOARD);
                injectEvent(down);
                injectEvent(up);
            } else if ("TEXT".equals(parts[0]) && parts.length >= 2 && keyCharMap != null) {
                String text = new String(Base64.decode(parts[1], Base64.NO_WRAP), "UTF-8");
                KeyEvent[] events = keyCharMap.getEvents(text.toCharArray());
                if (events != null) {
                    for (KeyEvent e : events) {
                        injectEvent(e);
                    }
                }
            } else if ("SCROLL".equals(parts[0]) && parts.length >= 5) {
                float x = Float.parseFloat(parts[1]);
                float y = Float.parseFloat(parts[2]);
                float hScroll = Float.parseFloat(parts[3]);
                float vScroll = Float.parseFloat(parts[4]);
                long now = SystemClock.uptimeMillis();
                MotionEvent.PointerProperties[] props = { new MotionEvent.PointerProperties() };
                props[0].id = 0;
                props[0].toolType = MotionEvent.TOOL_TYPE_MOUSE;
                MotionEvent.PointerCoords[] coords = { new MotionEvent.PointerCoords() };
                coords[0].x = x;
                coords[0].y = y;
                coords[0].setAxisValue(MotionEvent.AXIS_HSCROLL, hScroll);
                coords[0].setAxisValue(MotionEvent.AXIS_VSCROLL, vScroll);
                MotionEvent ev = MotionEvent.obtain(
                    now, now, MotionEvent.ACTION_SCROLL, 1, props, coords,
                    0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_MOUSE, 0
                );
                injectEvent(ev);
                ev.recycle();
            } else if ("QUALITY".equals(parts[0]) && parts.length >= 2) {
                int q = Math.max(20, Math.min(95, Integer.parseInt(parts[1])));
                jpegQuality = q;
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }
}
