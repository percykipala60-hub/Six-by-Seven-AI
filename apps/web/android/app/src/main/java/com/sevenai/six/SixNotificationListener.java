package com.sevenai.six;

import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
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
    private WindowManager.LayoutParams bubbleParams;
    private float downRawX;
    private float downRawY;
    private int downX;
    private int downY;
    private boolean dragged;

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

    private void updateBubble() {
        android.content.SharedPreferences prefs =
            getSharedPreferences(InterAppConfig.PREFS, MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(InterAppConfig.BUBBLE_ENABLED, false)
            && !selectedApps().isEmpty();
        if (!enabled || !Settings.canDrawOverlays(this)) {
            removeBubble();
            return;
        }
        if (windowManager == null) windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (windowManager == null) return;
        if (bubble == null) {
            bubble = new TextView(this);
            bubble.setTextColor(0xFFFFFFFF);
            bubble.setTextSize(20);
            bubble.setGravity(Gravity.CENTER);
            bubble.setContentDescription("Ouvrir Six et consulter les messages reçus");
            bubble.setElevation(dp(8));
            GradientDrawable background = new GradientDrawable();
            background.setShape(GradientDrawable.OVAL);
            background.setColor(0xFF315BDB);
            bubble.setBackground(background);
            bubbleParams = new WindowManager.LayoutParams(
                dp(56), dp(56),
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT
            );
            bubbleParams.gravity = Gravity.TOP | Gravity.END;
            bubbleParams.x = dp(16);
            bubbleParams.y = dp(180);
            bubble.setOnTouchListener(this::onBubbleTouch);
            try {
                windowManager.addView(bubble, bubbleParams);
            } catch (WindowManager.BadTokenException | SecurityException error) {
                Log.e(TAG, "Could not display the floating Six bubble.", error);
                bubble = null;
                bubbleParams = null;
                return;
            }
        }
        int unread = prefs.getInt(InterAppConfig.UNREAD_COUNT, 0);
        bubble.setText(unread > 0 ? String.valueOf(Math.min(unread, 99)) : "6");
        bubble.setContentDescription(unread > 0
            ? "Ouvrir Six, " + unread + " notifications reçues"
            : "Ouvrir Six");
    }

    private boolean onBubbleTouch(View view, MotionEvent event) {
        if (bubbleParams == null || windowManager == null) return false;
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                downRawX = event.getRawX();
                downRawY = event.getRawY();
                downX = bubbleParams.x;
                downY = bubbleParams.y;
                dragged = false;
                return true;
            case MotionEvent.ACTION_MOVE:
                float dx = event.getRawX() - downRawX;
                float dy = event.getRawY() - downRawY;
                if (Math.abs(dx) + Math.abs(dy) > dp(8)) dragged = true;
                if (dragged) {
                    bubbleParams.x = Math.max(0, downX - Math.round(dx));
                    bubbleParams.y = Math.max(0, downY + Math.round(dy));
                    try {
                        windowManager.updateViewLayout(bubble, bubbleParams);
                    } catch (WindowManager.BadTokenException error) {
                        Log.e(TAG, "Could not move the floating Six bubble.", error);
                        removeBubble();
                    }
                }
                return true;
            case MotionEvent.ACTION_UP:
                if (!dragged) openSix();
                return true;
            case MotionEvent.ACTION_CANCEL:
                return true;
            default:
                return false;
        }
    }

    private void openSix() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) {
            Log.e(TAG, "Six has no launcher activity.");
            return;
        }
        launch.setAction("com.sevenai.six.OPEN_NOTIFICATION_INBOX");
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(launch);
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
        bubbleParams = null;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
