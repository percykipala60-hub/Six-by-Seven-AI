package com.sevenai.six;

import android.content.ComponentName;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(name = "SixInterApp")
public class SixInterAppPlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        android.content.Context context = getContext();
        Set<String> selected = selectedApps(context);
        JSObject result = new JSObject();
        JSArray selectedArray = new JSArray();
        JSArray installedArray = new JSArray();
        for (String id : selected) selectedArray.put(id);
        for (String id : InterAppConfig.APP_IDS) {
            if (InterAppConfig.isInstalled(id, context.getPackageManager())) installedArray.put(id);
        }
        result.put("selectedApps", selectedArray);
        result.put("installedApps", installedArray);
        result.put("notificationAccess", hasNotificationAccess(context));
        result.put("overlayAccess", Settings.canDrawOverlays(context));
        result.put("bubbleEnabled", context.getSharedPreferences(InterAppConfig.PREFS, 0)
            .getBoolean(InterAppConfig.BUBBLE_ENABLED, false));
        call.resolve(result);
    }

    @PluginMethod
    public void setSelectedApps(PluginCall call) {
        JSArray requested = call.getArray("appIds");
        if (requested == null) {
            call.reject("La liste des applications est manquante.");
            return;
        }
        Set<String> selected = new HashSet<>();
        try {
            for (int i = 0; i < requested.length(); i++) {
                String id = requested.getString(i);
                if (!InterAppConfig.isKnownApp(id)) {
                    call.reject("Une application choisie n'est pas prise en charge.");
                    return;
                }
                selected.add(id);
            }
            android.content.SharedPreferences.Editor editor =
                getContext().getSharedPreferences(InterAppConfig.PREFS, 0).edit()
                    .putStringSet(InterAppConfig.SELECTED_APPS, selected);
            if (selected.isEmpty()) editor.putBoolean(InterAppConfig.BUBBLE_ENABLED, false);
            editor.apply();
            SixNotificationListener.refresh(getContext());
            call.resolve();
        } catch (JSONException error) {
            call.reject("La sélection des applications est invalide.", error);
        }
    }

    @PluginMethod
    public void requestNotificationAccess(PluginCall call) {
        if (selectedApps(getContext()).isEmpty()) {
            call.reject("Choisis au moins une application avant d'autoriser l'accès.");
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException error) {
            call.reject("Les réglages d'accès aux notifications ne peuvent pas être ouverts.", error);
        }
    }

    @PluginMethod
    public void requestOverlayAccess(PluginCall call) {
        android.content.Context context = getContext();
        if (selectedApps(context).isEmpty() || !hasNotificationAccess(context)) {
            call.reject("Choisis une application et active d'abord l'accès aux notifications Android.");
            return;
        }
        context.getSharedPreferences(InterAppConfig.PREFS, 0)
            .edit().putBoolean(InterAppConfig.BUBBLE_ENABLED, true).apply();
        if (Settings.canDrawOverlays(context)) {
            SixNotificationListener.refresh(context);
            call.resolve();
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + context.getPackageName()));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException error) {
            call.reject("Les réglages de la bulle flottante ne peuvent pas être ouverts.", error);
        }
    }

    @PluginMethod
    public void setBubbleEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled"));
        android.content.Context context = getContext();
        if (enabled && selectedApps(context).isEmpty()) {
            call.reject("Choisis au moins une application avant d'activer la bulle.");
            return;
        }
        if (enabled && !hasNotificationAccess(context)) {
            call.reject("Autorise d'abord l'accès aux notifications dans les réglages Android.");
            return;
        }
        if (enabled && !Settings.canDrawOverlays(context)) {
            call.reject("Autorise d'abord l'affichage de Six par-dessus les autres applications.");
            return;
        }
        context.getSharedPreferences(InterAppConfig.PREFS, 0)
            .edit().putBoolean(InterAppConfig.BUBBLE_ENABLED, enabled).apply();
        SixNotificationListener.refresh(context);
        call.resolve();
    }

    @PluginMethod
    public void getNotifications(PluginCall call) {
        try {
            JSArray items = new JSArray();
            synchronized (NotificationStore.class) {
                JSONArray source = NotificationStore.read(getContext());
                for (int i = 0; i < source.length(); i++) {
                    items.put(new JSObject(source.getJSONObject(i).toString()));
                }
                getContext().getSharedPreferences(InterAppConfig.PREFS, 0)
                    .edit().putInt(InterAppConfig.UNREAD_COUNT, 0).apply();
            }
            JSObject result = new JSObject();
            result.put("items", items);
            SixNotificationListener.refresh(getContext());
            call.resolve(result);
        } catch (JSONException | java.io.IOException error) {
            call.reject("Les notifications locales sont illisibles.", error);
        }
    }

    @PluginMethod
    public void clearNotifications(PluginCall call) {
        try {
            synchronized (NotificationStore.class) {
                NotificationStore.clear(getContext());
                getContext().getSharedPreferences(InterAppConfig.PREFS, 0).edit()
                    .putInt(InterAppConfig.UNREAD_COUNT, 0)
                    .apply();
            }
        } catch (SecurityException error) {
            call.reject("Les notifications locales n'ont pas pu être effacées.", error);
            return;
        }
        SixNotificationListener.refresh(getContext());
        call.resolve();
    }

    @PluginMethod
    public void consumeOpenInbox(PluginCall call) {
        Intent intent = getActivity().getIntent();
        boolean open = "com.sevenai.six.OPEN_NOTIFICATION_INBOX".equals(intent.getAction());
        if (open) intent.setAction(Intent.ACTION_MAIN);
        JSObject result = new JSObject();
        result.put("open", open);
        call.resolve(result);
    }

    private static Set<String> selectedApps(android.content.Context context) {
        Set<String> stored = context.getSharedPreferences(InterAppConfig.PREFS, 0)
            .getStringSet(InterAppConfig.SELECTED_APPS, new HashSet<>());
        return stored == null ? new HashSet<>() : new HashSet<>(stored);
    }

    private static boolean hasNotificationAccess(android.content.Context context) {
        String enabled = Settings.Secure.getString(context.getContentResolver(),
            "enabled_notification_listeners");
        String component = new ComponentName(context, SixNotificationListener.class).flattenToString();
        if (enabled == null) return false;
        for (String entry : enabled.split(":")) {
            if (component.equals(entry)) return true;
        }
        return false;
    }
}
