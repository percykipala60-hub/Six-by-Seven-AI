package com.sevenai.six;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Connexion avec Apple ou Google dans l'app Android. Dans la WebView, window.open ouvrait la page du
 * fournisseur à part et la session restait dans le navigateur. Ici, la page s'ouvre dans le navigateur
 * du téléphone et Supabase renvoie vers six://auth : MainActivity reçoit ce lien et le passe à l'app
 * web (jetons de session), qui ouvre la session. Retour dans Six sans s'être connecté : réponse vide.
 */
@CapacitorPlugin(name = "SixAuth")
public class SixAuthPlugin extends Plugin {
    private static SixAuthPlugin instance;
    private PluginCall enAttente;
    private final Handler principal = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        instance = this;
    }

    /** { url } : page de connexion du fournisseur (https). Renvoie { url } : le lien six://auth… ou "". */
    @PluginMethod
    public void ouvrir(PluginCall call) {
        String adresse = call.getString("url", "");
        if (adresse == null || !adresse.startsWith("https://")) {
            call.reject("Adresse de connexion invalide.");
            return;
        }
        terminer(""); // une connexion précédente restée ouverte
        call.setKeepAlive(true);
        enAttente = call;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(adresse));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            enAttente = null;
            call.setKeepAlive(false);
            call.reject("Aucun navigateur pour ouvrir la connexion.");
        }
    }

    /** Lien six://auth… reçu par MainActivity (app déjà ouverte). */
    static boolean recevoir(Uri lien) {
        if (lien == null || !"six".equals(lien.getScheme()) || !"auth".equals(lien.getHost())) return false;
        if (instance != null) instance.terminer(lien.toString());
        return true;
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // Le lien six://auth arrive avant onResume. S'il n'est pas venu, la personne est revenue
        // sans se connecter : on libère le bouton (petit délai, le temps que le lien soit traité).
        principal.postDelayed(() -> terminer(""), 800);
    }

    private void terminer(String url) {
        PluginCall call = enAttente;
        if (call == null) return;
        enAttente = null;
        JSObject resultat = new JSObject();
        resultat.put("url", url);
        call.resolve(resultat);
        call.setKeepAlive(false);
    }
}
