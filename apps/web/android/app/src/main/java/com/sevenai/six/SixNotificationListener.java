package com.sevenai.six;

import android.app.Notification;
import android.content.Context;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.view.WindowManager;
import android.widget.TextView;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

public class SixNotificationListener extends NotificationListenerService {
    private static final String TAG = "SixNotifications";
    private static SixNotificationListener instance;
    private WindowManager windowManager;
    private TextView bubble;

    static void refresh(Context context) {
        SixNotificationListener service = instance;
        if (service != null) service.updateBubble();
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        instance = this;
        updateBubble();
    }

    @Override
    public void onListenerDisconnected() {
        removeBubble();
        instance = null;
        super.onListenerDisconnected();
    }

    @Override
    public void onDestroy() {
        removeBubble();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification statusBarNotification) {
        String packageName = statusBarNotification.getPackageName();
        String appId = InterAppConfig.appIdForPackage(packageName);
        if (appId == null || !selectedApps().contains(appId)) return;

        Notification notification = statusBarNotification.getNotification();
        if (notification == null || notification.extras == null
            || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0
            || (notification.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;

        CharSequence titleValue = notification.extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textValue = notification.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (textValue == null) textValue = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
        String title = clean(titleValue, 120);
        String text = clean(textValue, 2000);
        if (title.isEmpty() && text.isEmpty()) return;

        try {
            String appName = getPackageManager().getApplicationLabel(
                getPackageManager().getApplicationInfo(packageName, 0)).toString();
            JSONObject item = new JSONObject();
            item.put("id", statusBarNotification.getKey());
            item.put("appId", appId);
            item.put("appName", appName);
            item.put("title", title);
            item.put("text", text);
            item.put("receivedAt", statusBarNotification.getPostTime());

            android.content.SharedPreferences prefs =
                getSharedPreferences(InterAppConfig.PREFS, MODE_PRIVATE);
            synchronized (NotificationStore.class) {
                boolean added = NotificationStore.upsert(this, item);
                if (added) {
                    prefs.edit().putInt(InterAppConfig.UNREAD_COUNT,
                        prefs.getInt(InterAppConfig.UNREAD_COUNT, 0) + 1).apply();
                }
            }
            updateBubble();
        } catch (JSONException | java.io.IOException
            | android.content.pm.PackageManager.NameNotFoundException | SecurityException error) {
            Log.e(TAG, "Could not store a selected app notification locally.", error);
        }
    }

    private Set<String> selectedApps() {
        Set<String> selected = getSharedPreferences(InterAppConfig.PREFS, MODE_PRIVATE)
            .getStringSet(InterAppConfig.SELECTED_APPS, new HashSet<>());
        return selected == null ? new HashSet<>() : new HashSet<>(selected);
    }

    private static String clean(CharSequence value, int limit) {
        if (value == null) return "";
        String text = value.toString().trim();
        return text.length() > limit ? text.substring(0, limit) : text;
    }

    /** La bulle est désormais affichée par BulleService, indépendamment des notifications : on retire l'ancienne. */
    private void updateBubble() {
        removeBubble();
    }

    private void removeBubble() {
        if (bubble != null && windowManager != null) {
            try {
                windowManager.removeView(bubble);
            } catch (WindowManager.BadTokenException error) {
                Log.e(TAG, "Could not remove the floating Six bubble.", error);
            }
        }
        bubble = null;
    }
}
