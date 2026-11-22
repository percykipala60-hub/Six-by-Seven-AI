package com.sevenai.six;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Panneau rapide de Six, ouvert par la bulle ou par le clavier Six, par-dessus la messagerie.
 * Il affiche la page /rapide du site de Six dans une fenêtre en bas de l'écran. Comme cette fenêtre est au premier
 * plan, Android l'autorise à lire le message que l'utilisateur vient de copier ; la page le masque, puis propose
 * trois réponses. La réponse choisie revient ici : écrite par le clavier Six, ou copiée pour la bulle.
 */
public class RapideActivity extends Activity {
    static final String EXTRA_SOURCE = "source";
    static final String SOURCE_CLAVIER = "clavier";
    static final String SOURCE_BULLE = "bulle";
    private static final String TAG = "SixRapide";

    private WebView webView;
    private String source = SOURCE_BULLE;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String demande = getIntent().getStringExtra(EXTRA_SOURCE);
        if (SOURCE_CLAVIER.equals(demande)) source = SOURCE_CLAVIER;

        // Fenêtre en bas de l'écran, sur 78 % de la hauteur, la messagerie reste visible au-dessus.
        Window window = getWindow();
        window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT,
            Math.round(getResources().getDisplayMetrics().heightPixels * 0.78f));
        window.setGravity(Gravity.BOTTOM);
        window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        window.setDimAmount(0.35f);

        FrameLayout cadre = new FrameLayout(this);
        GradientDrawable fond = new GradientDrawable();
        fond.setColor(Color.parseColor("#12151c"));
        float rayon = 24 * getResources().getDisplayMetrics().density;
        fond.setCornerRadii(new float[]{rayon, rayon, rayon, rayon, 0, 0, 0, 0});
        cadre.setBackground(fond);
        cadre.setClipToOutline(true);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.TRANSPARENT);
        WebSettings reglages = webView.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true);
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new Pont(), "SixNatif");
        cadre.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(cadre);
        webView.loadUrl(adresseServeur() + "/rapide");
    }

    /** Adresse du site de Six, la même que celle de l'app (capacitor.config.json, server.url). */
    private String adresseServeur() {
        try (InputStream entree = getAssets().open("capacitor.config.json")) {
            byte[] octets = new byte[entree.available()];
            int lus = entree.read(octets);
            JSONObject config = new JSONObject(new String(octets, 0, Math.max(lus, 0), StandardCharsets.UTF_8));
            String url = config.optJSONObject("server") != null
                ? config.getJSONObject("server").optString("url", "") : "";
            if (!url.isEmpty()) return url.replaceAll("/+$", "");
        } catch (Exception erreur) {
            Log.e(TAG, "Adresse du serveur introuvable dans capacitor.config.json.", erreur);
        }
        return "https://effulgent-jelly-177a12.netlify.app";
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("SixNatif");
            webView.destroy();
        }
        super.onDestroy();
    }

    /** Ce que la page /rapide peut demander à l'app. */
    private final class Pont {
        @JavascriptInterface
        public String lirePressePapiers() {
            ClipboardManager presse = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (presse == null || !presse.hasPrimaryClip()) return "";
            ClipData clip = presse.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return "";
            CharSequence texte = clip.getItemAt(0).coerceToText(RapideActivity.this);
            return texte == null ? "" : texte.toString();
        }

        @JavascriptInterface
        public String source() {
            return source;
        }

        @JavascriptInterface
        public void choisir(String reponse) {
            runOnUiThread(() -> {
                if (SOURCE_CLAVIER.equals(source)) {
                    // Le clavier Six l'écrira dans le champ de la messagerie dès qu'il réapparaît.
                    SixClavier.deposer(reponse);
                } else {
                    ClipboardManager presse = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (presse != null) presse.setPrimaryClip(ClipData.newPlainText("Réponse de Six", reponse));
                    Toast.makeText(RapideActivity.this, "Réponse copiée : colle-la dans ta conversation.",
                        Toast.LENGTH_SHORT).show();
                }
                finish();
            });
        }

        @JavascriptInterface
        public void fermer() {
            runOnUiThread(RapideActivity.this::finish);
        }
    }

    /** Ouvre le panneau depuis la bulle ou le clavier (qui ne sont pas des activités). */
    static void ouvrir(Context context, String source) {
        Intent intent = new Intent(context, RapideActivity.class)
            .putExtra(EXTRA_SOURCE, source)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        context.startActivity(intent);
    }
}
