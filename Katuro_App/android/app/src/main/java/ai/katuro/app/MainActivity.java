package ai.katuro.app;

import android.content.Intent;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Share → KaTuro (KaturoSharePlugin): registered before the bridge starts.
        registerPlugin(KaturoSharePlugin.class);
        // Online updates of the app (KaturoUpdatePlugin).
        registerPlugin(KaturoUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // Class lists and grades are on screen: Android's recent-apps preview and screenshots stay blank.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        KaturoSharePlugin.receive(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        KaturoSharePlugin.receive(intent);
    }
}
