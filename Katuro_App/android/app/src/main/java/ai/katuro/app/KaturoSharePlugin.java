package ai.katuro.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * "Share → KaTuro" from other apps (Messenger, Gmail, Files, Gallery...).
 *
 * MainActivity hands every share intent to receive(); the page asks for the files with
 * take() (on start, and when the "shared" event says new files arrived). Files are read
 * from the sharing app's content URI (Android grants this app temporary read access),
 * up to 25 MB each, and given to the page as base64. Nothing is stored here.
 *
 * Memory: one take() returns at most MAX_BATCH bytes of files (base64 and the bridge copy
 * multiply it several times); the rest stay waiting and the result says "more", so the page
 * asks again. A file is taken off the waiting list only once it has been read.
 */
@CapacitorPlugin(name = "KaturoShare")
public class KaturoSharePlugin extends Plugin {
    private static final long MAX_BYTES = 25L * 1024 * 1024;
    private static final long MAX_BATCH = 30L * 1024 * 1024;
    private static final List<Uri> pending = new ArrayList<>();
    private static KaturoSharePlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Called by MainActivity for the launch intent and for every new intent. */
    static void receive(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else {
            return;
        }
        if (uris.isEmpty()) return;
        synchronized (pending) {
            pending.addAll(uris);
        }
        // Handled once: a later rotation or relaunch must not share the same files again.
        intent.setAction(Intent.ACTION_MAIN);
        if (instance != null) instance.notifyListeners("shared", new JSObject(), true);
    }

    /** → { files: [{ name, mimeType, size, data (base64) }], skipped: [{ name, reason }], more: boolean } */
    @PluginMethod
    public void take(PluginCall call) {
        ContentResolver resolver = getContext().getContentResolver();
        JSArray files = new JSArray();
        JSArray skipped = new JSArray();
        long batch = 0;
        int n = 0;
        while (true) {
            Uri uri;
            synchronized (pending) {
                if (pending.isEmpty()) break;
                uri = pending.get(0);
            }
            long size = sizeOf(resolver, uri);
            // This file would make the batch too big: leave it for the next call (unless it is the first).
            // Unknown size counts as the largest file allowed.
            long counted = size > 0 ? Math.min(size, MAX_BYTES) : MAX_BYTES;
            if (batch > 0 && batch + counted > MAX_BATCH) break;
            synchronized (pending) {
                pending.remove(0);
            }
            n += 1;
            String name = displayName(resolver, uri, n);
            try (InputStream in = resolver.openInputStream(uri)) {
                if (in == null) throw new Exception("cannot open");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[64 * 1024];
                long total = 0;
                int r;
                boolean tooBig = false;
                while ((r = in.read(buf)) != -1) {
                    total += r;
                    if (total > MAX_BYTES) { tooBig = true; break; }
                    out.write(buf, 0, r);
                }
                if (tooBig) {
                    skipped.put(new JSObject().put("name", name).put("reason", "too big to send (up to 25 MB)"));
                    continue;
                }
                batch += total;
                JSObject f = new JSObject();
                f.put("name", name);
                f.put("mimeType", resolver.getType(uri));
                f.put("size", total);
                f.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                files.put(f);
            } catch (Exception e) {
                skipped.put(new JSObject().put("name", name).put("reason", "could not be read"));
            }
        }
        JSObject result = new JSObject();
        result.put("files", files);
        result.put("skipped", skipped);
        synchronized (pending) {
            result.put("more", !pending.isEmpty());
        }
        call.resolve(result);
    }

    /** The file's size when the sharing app tells it, else -1. */
    private static long sizeOf(ContentResolver resolver, Uri uri) {
        try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception ignored) {
            // unknown size: read it and see
        }
        return -1;
    }

    private static String displayName(ContentResolver resolver, Uri uri, int n) {
        try (Cursor c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String s = c.getString(0);
                if (s != null && !s.trim().isEmpty()) return s;
            }
        } catch (Exception ignored) {
            // fall back to the URI's last part
        }
        String last = uri.getLastPathSegment();
        return last != null && !last.isEmpty() ? last : "Shared file " + n;
    }
}
