package com.sevenai.six;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;

/**
 * Bulle Six : un rond « 6 » qui reste visible par-dessus toutes les applications, indépendamment de l'accès aux
 * notifications. On copie un message dans sa messagerie, on touche la bulle : le panneau rapide s'ouvre et
 * propose trois réponses. On déplace la bulle en la faisant glisser ; on la glisse tout en bas pour la fermer.
 * Android exige une notification discrète tant que la bulle est affichée.
 */
public class BulleService extends Service {
    private static final String TAG = "SixBulle";
    private static final String CANAL = "six-bulle";
    private static final int NOTIFICATION = 607;

    private WindowManager fenetres;
    private TextView bulle;
    private WindowManager.LayoutParams position;
    private float departX;
    private float departY;
    private int origineX;
    private int origineY;
    private boolean deplacee;

    static void demarrer(Context context) {
        Intent intent = new Intent(context, BulleService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    static void arreter(Context context) {
        context.stopService(new Intent(context, BulleService.class));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!Settings.canDrawOverlays(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        afficherNotification();
        afficherBulle();
        return START_STICKY;
    }

    private void afficherNotification() {
        NotificationManager gestion = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && gestion != null) {
            NotificationChannel canal = new NotificationChannel(CANAL, "Bulle Six",
                NotificationManager.IMPORTANCE_MIN);
            canal.setDescription("Affichée tant que la bulle Six est à l'écran.");
            gestion.createNotificationChannel(canal);
        }
        Intent ouvrir = new Intent(this, RapideActivity.class)
            .putExtra(RapideActivity.EXTRA_SOURCE, RapideActivity.SOURCE_BULLE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent action = PendingIntent.getActivity(this, 0, ouvrir,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder constructeur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CANAL)
            : new Notification.Builder(this);
        Notification notification = constructeur
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Bulle Six active")
            .setContentText("Copie un message, puis touche la bulle.")
            .setContentIntent(action)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION, notification);
        }
    }

    private void afficherBulle() {
        if (bulle != null) return;
        fenetres = (WindowManager) getSystemService(WINDOW_SERVICE);
        if (fenetres == null) return;
        bulle = new TextView(this);
        bulle.setText("6");
        bulle.setTextColor(Color.WHITE);
        bulle.setTextSize(22);
        bulle.setGravity(Gravity.CENTER);
        bulle.setContentDescription("Six : proposer des réponses au message copié");
        bulle.setElevation(dp(8));
        GradientDrawable fond = new GradientDrawable();
        fond.setShape(GradientDrawable.OVAL);
        fond.setColor(Color.parseColor("#12151c"));
        fond.setStroke(dp(2), Color.parseColor("#4d7cfe"));
        bulle.setBackground(fond);
        position = new WindowManager.LayoutParams(
            dp(56), dp(56),
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT);
        position.gravity = Gravity.TOP | Gravity.END;
        position.x = dp(12);
        position.y = dp(220);
        bulle.setOnTouchListener(this::auToucher);
        try {
            fenetres.addView(bulle, position);
        } catch (WindowManager.BadTokenException | SecurityException erreur) {
            Log.e(TAG, "La bulle Six n'a pas pu s'afficher.", erreur);
            bulle = null;
            stopSelf();
        }
    }

    private boolean auToucher(View vue, MotionEvent evenement) {
        switch (evenement.getAction()) {
            case MotionEvent.ACTION_DOWN:
                departX = evenement.getRawX();
                departY = evenement.getRawY();
                origineX = position.x;
                origineY = position.y;
                deplacee = false;
                return true;
            case MotionEvent.ACTION_MOVE:
                float dx = evenement.getRawX() - departX;
                float dy = evenement.getRawY() - departY;
                if (Math.abs(dx) + Math.abs(dy) > dp(8)) deplacee = true;
                if (deplacee) {
                    position.x = Math.max(0, origineX - Math.round(dx));
                    position.y = Math.max(0, origineY + Math.round(dy));
                    fenetres.updateViewLayout(bulle, position);
                }
                return true;
            case MotionEvent.ACTION_UP:
                int hauteur = getResources().getDisplayMetrics().heightPixels;
                if (deplacee && evenement.getRawY() > hauteur - dp(90)) {
                    // Glissée tout en bas : la bulle se ferme (elle se rallume dans Réglages > Bulle Six).
                    getSharedPreferences(InterAppConfig.PREFS, MODE_PRIVATE).edit()
                        .putBoolean(InterAppConfig.BUBBLE_ENABLED, false).apply();
                    stopSelf();
                } else if (!deplacee) {
                    RapideActivity.ouvrir(this, RapideActivity.SOURCE_BULLE);
                }
                return true;
            default:
                return false;
        }
    }

    @Override
    public void onDestroy() {
        if (bulle != null && fenetres != null) {
            try {
                fenetres.removeView(bulle);
            } catch (IllegalArgumentException erreur) {
                Log.e(TAG, "La bulle Six était déjà retirée.", erreur);
            }
        }
        bulle = null;
        super.onDestroy();
    }

    private int dp(int valeur) {
        return Math.round(valeur * getResources().getDisplayMetrics().density);
    }
}
