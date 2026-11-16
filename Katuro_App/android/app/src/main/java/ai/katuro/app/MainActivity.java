package ai.katuro.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Share → KaTuro (KaturoSharePlugin): registered before the bridge starts.
        registerPlugin(KaturoSharePlugin.class);
        super.onCreate(savedInstanceState);
        KaturoSharePlugin.receive(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        KaturoSharePlugin.receive(intent);
    }
}
