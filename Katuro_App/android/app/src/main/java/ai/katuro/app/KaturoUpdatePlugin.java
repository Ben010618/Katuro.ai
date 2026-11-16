package ai.katuro.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Online updates of the KaTuro App without the Play Store (installed by USB first).
 *
 *   current()                 → { versionName, versionCode }
 *   fetchText({ url })         → { text }   the update file (KaTuro's GitHub releases)
 *   install({ url, sha256, versionCode })
 *       downloads the new APK, checks its SHA-256 and that it is a newer KaTuro App, then opens
 *       Android's "update this app?" screen. Android itself only installs it over the current app
 *       when it is signed with the same key (so the teacher's data stays).
 *
 * Only https addresses on github.com / *.githubusercontent.com are fetched.
 */
@CapacitorPlugin(name = "KaturoUpdate")
public class KaturoUpdatePlugin extends Plugin {
    private static final int TIMEOUT_MS = 20000;
    private static final long MAX_APK = 120L * 1024 * 1024;
    /** One download at a time. */
    private static final AtomicBoolean DOWNLOADING = new AtomicBoolean(false);

    @PluginMethod
    public void current(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("versionName", info.versionName);
            r.put("versionCode", versionCodeOf(info));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("The app version could not be read.");
        }
    }

    @PluginMethod
    public void fetchText(PluginCall call) {
        String url = call.getString("url", "");
        if (!allowed(url)) { call.reject("Not an update address.", "BAD_URL"); return; }
        try {
            HttpURLConnection c = open(url);
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16 * 1024];
                int r;
                while ((r = in.read(buf)) != -1) {
                    out.write(buf, 0, r);
                    if (out.size() > 256 * 1024) throw new Exception("too big");
                }
                JSObject res = new JSObject();
                res.put("text", out.toString("UTF-8"));
                call.resolve(res);
            } finally {
                c.disconnect();
            }
        } catch (Exception e) {
            call.reject("The update information could not be downloaded. Check the internet connection.", "OFFLINE");
        }
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url", "");
        String sha = call.getString("sha256", "").toLowerCase();
        long wantCode = call.getLong("versionCode", 0L);
        if (!allowed(url) || sha.length() != 64) { call.reject("Not an update address.", "BAD_URL"); return; }

        // Android 8+: the teacher allows "Install unknown apps" for KaTuro once.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(allow);
            call.reject("Allow KaTuro to install updates, then tap Update again.", "NEEDS_PERMISSION");
            return;
        }

        // The download runs on its own thread, so Share and notifications keep working meanwhile.
        if (!DOWNLOADING.compareAndSet(false, true)) { call.reject("The update is already downloading.", "BUSY"); return; }
        new Thread(() -> {
            try { download(call, url, sha, wantCode); } finally { DOWNLOADING.set(false); }
        }, "KaTuro update").start();
    }

    private void download(PluginCall call, String url, String sha, long wantCode) {
        File dir = new File(getContext().getCacheDir(), "updates");
        dir.mkdirs();
        // Each download gets its own file; old ones are removed only after an hour, so an APK
        // Android's install screen may still be reading is never deleted under it.
        File[] old = dir.listFiles();
        long now = System.currentTimeMillis();
        if (old != null) for (File f : old) if (now - f.lastModified() > 3600000L) f.delete();
        File apk = new File(dir, "KaTuro-update-" + wantCode + "-" + now + ".apk");
        try {
            HttpURLConnection c = open(url);
            long total = c.getContentLengthLong();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long got = 0;
            long lastReport = 0;
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                byte[] buf = new byte[64 * 1024];
                int r;
                while ((r = in.read(buf)) != -1) {
                    got += r;
                    if (got > MAX_APK) throw new Exception("too big");
                    digest.update(buf, 0, r);
                    out.write(buf, 0, r);
                    if (got - lastReport > 512 * 1024) {
                        lastReport = got;
                        JSObject p = new JSObject();
                        p.put("received", got);
                        p.put("total", total);
                        notifyListeners("progress", p);
                    }
                }
            } finally {
                c.disconnect();
            }
            if (!hex(digest.digest()).equals(sha)) {
                apk.delete();
                call.reject("The download was damaged. Try again.", "BAD_FILE");
                return;
            }
            PackageManager pm = getContext().getPackageManager();
            PackageInfo info = pm.getPackageArchiveInfo(apk.getAbsolutePath(), 0);
            PackageInfo mine = pm.getPackageInfo(getContext().getPackageName(), 0);
            if (info == null || !getContext().getPackageName().equals(info.packageName)) {
                apk.delete();
                call.reject("The download is not the KaTuro App.", "BAD_FILE");
                return;
            }
            if (versionCodeOf(info) <= versionCodeOf(mine) || (wantCode > 0 && versionCodeOf(info) != wantCode)) {
                apk.delete();
                call.reject("This is not a newer version of the KaTuro App.", "NOT_NEWER");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(install);
            JSObject res = new JSObject();
            res.put("started", true);
            call.resolve(res);
        } catch (Exception e) {
            apk.delete();
            call.reject("The update could not be downloaded. Check the internet connection and try again.", "OFFLINE");
        }
    }

    private static boolean allowed(String url) {
        try {
            URL u = new URL(url);
            String host = u.getHost().toLowerCase();
            return "https".equals(u.getProtocol()) && (host.equals("github.com") || host.endsWith(".githubusercontent.com"));
        } catch (Exception e) {
            return false;
        }
    }

    /** Opens an https connection, following GitHub's redirects only to allowed hosts. */
    private static HttpURLConnection open(String url) throws Exception {
        String next = url;
        for (int hop = 0; hop < 5; hop++) {
            if (!allowed(next)) throw new Exception("redirect to a host that is not allowed");
            HttpURLConnection c = (HttpURLConnection) new URL(next).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setRequestProperty("User-Agent", "KaTuro-App");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null) throw new Exception("redirect without a place");
                next = new URL(new URL(next), loc).toString();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new Exception("HTTP " + code);
            }
            return c;
        }
        throw new Exception("too many redirects");
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }
}
