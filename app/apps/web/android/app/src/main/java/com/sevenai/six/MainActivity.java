package com.sevenai.six;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SixInterAppPlugin.class);
        registerPlugin(SixThemePlugin.class);
        registerPlugin(SixAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        SixNotificationListener.refresh(this);
        // Bulle activée et autorisée : on la (re)lance au retour dans Six.
        if (getSharedPreferences(InterAppConfig.PREFS, MODE_PRIVATE)
                .getBoolean(InterAppConfig.BUBBLE_ENABLED, false)
            && android.provider.Settings.canDrawOverlays(this)) {
            BulleService.demarrer(this);
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Retour six://auth de la connexion Apple ou Google : passé à l'app web.
        if (SixAuthPlugin.recevoir(intent.getData())) return;
        if ("com.sevenai.six.OPEN_NOTIFICATION_INBOX".equals(intent.getAction())
            && getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new Event('six-open-notification-inbox'))", null
            ));
        }
    }
}
