package com.sevenai.six;

import android.content.ComponentName;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SixTheme")
public class SixThemePlugin extends Plugin {
    private static final String[] THEMES = {
        "bleu", "rouge", "rose", "violet", "neon", "jaune", "vert", "ambre", "gris",
        "facebook", "sms", "whatsapp", "linkedin", "telegram", "instagram", "tiktok",
        "google", "claude", "kimi", "pinterest"
    };
    private static final String CLE_ACCENT = "accent-actif";

    /** Dernier accent demandé : évite les appels en double quand l'utilisateur retape la même tuile. */
    private String enCours = null;
    /** Accent déjà appliqué côté système (suivi en mémoire + préférences). */
    private String applique = null;

    @PluginMethod
    public void setLauncherIcon(PluginCall call) {
        String accent = call.getString("accent");
        if (accent == null || !isKnownTheme(accent)) {
            call.reject("Thème d'icône inconnu.");
            return;
        }
        if (accent.equals(enCours) || accent.equals(applique)) {
            call.resolve(); // déjà celui-là : aucun changement système à faire
            return;
        }
        enCours = accent;
        getActivity().runOnUiThread(() -> applyIcon(accent, call));
    }

    private void applyIcon(String accent, PluginCall call) {
        PackageManager manager = getContext().getPackageManager();
        ComponentName selected = component(accent);
        try {
            // On ne touche qu'aux alias dont l'état change : 2 appels système au lieu de 21.
            // Chaque setComponentEnabledSetting notifie tous les lanceurs ; en enchaîner 21
            // d'affilée faisait planter ou relancer l'app sur plusieurs Android.
            String precedent = prefs().getString(CLE_ACCENT, "bleu");
            if (!precedent.equals(accent)) {
                setState(manager, component(precedent), PackageManager.COMPONENT_ENABLED_STATE_DISABLED);
            }
            setState(manager, selected, PackageManager.COMPONENT_ENABLED_STATE_ENABLED);
            prefs().edit().putString(CLE_ACCENT, accent).apply();
            applique = accent;
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Impossible de changer l'icône de Six.", error);
        } finally {
            if (accent.equals(enCours)) enCours = null;
        }
    }

    private void setState(PackageManager manager, ComponentName component, int state) {
        if (manager.getComponentEnabledSetting(component) == state) return;
        manager.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences("six-theme", android.content.Context.MODE_PRIVATE);
    }

    private boolean isKnownTheme(String accent) {
        for (String theme : THEMES) if (theme.equals(accent)) return true;
        return false;
    }

    private ComponentName component(String accent) {
        String className = "Launcher" + Character.toUpperCase(accent.charAt(0)) + accent.substring(1);
        return new ComponentName(getContext(), getContext().getPackageName() + "." + className);
    }
}
