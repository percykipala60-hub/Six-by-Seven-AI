package com.sevenai.six;

import java.util.HashMap;
import java.util.Map;

final class InterAppConfig {
    static final String PREFS = "six_inter_app_local";
    static final String SELECTED_APPS = "selected_apps";
    static final String BUBBLE_ENABLED = "bubble_enabled";
    static final String UNREAD_COUNT = "unread_count";
    static final int MAX_NOTIFICATIONS = 25;
    static final String[] APP_IDS = {
        "whatsapp", "instagram", "messenger", "telegram", "messages",
        "linkedin", "tiktok", "facebook", "gmail"
    };
    private static final Map<String, String[]> PACKAGES = new HashMap<>();

    static {
        PACKAGES.put("whatsapp", new String[]{"com.whatsapp", "com.whatsapp.w4b"});
        PACKAGES.put("instagram", new String[]{"com.instagram.android"});
        PACKAGES.put("messenger", new String[]{"com.facebook.orca"});
        PACKAGES.put("telegram", new String[]{"org.telegram.messenger"});
        PACKAGES.put("messages", new String[]{"com.google.android.apps.messaging", "com.samsung.android.messaging"});
        PACKAGES.put("linkedin", new String[]{"com.linkedin.android"});
        PACKAGES.put("tiktok", new String[]{"com.zhiliaoapp.musically"});
        PACKAGES.put("facebook", new String[]{"com.facebook.katana"});
        PACKAGES.put("gmail", new String[]{"com.google.android.gm"});
    }

    private InterAppConfig() {}

    static boolean isKnownApp(String appId) {
        return PACKAGES.containsKey(appId);
    }

    static String appIdForPackage(String packageName) {
        for (Map.Entry<String, String[]> entry : PACKAGES.entrySet()) {
            for (String candidate : entry.getValue()) {
                if (candidate.equals(packageName)) return entry.getKey();
            }
        }
        return null;
    }

    static boolean isInstalled(String appId, android.content.pm.PackageManager packageManager) {
        String[] candidates = PACKAGES.get(appId);
        if (candidates == null) return false;
        for (String candidate : candidates) {
            try {
                packageManager.getApplicationInfo(candidate, 0);
                return true;
            } catch (android.content.pm.PackageManager.NameNotFoundException ignored) {
                // Continue: some networks have multiple Android package variants.
            }
        }
        return false;
    }
}
