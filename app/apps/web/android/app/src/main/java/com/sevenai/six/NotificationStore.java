package com.sevenai.six;

import android.content.Context;
import android.util.AtomicFile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

final class NotificationStore {
    private static final String FILE_NAME = "six-notifications.json";

    private NotificationStore() {}

    static synchronized JSONArray read(Context context) throws IOException, JSONException {
        AtomicFile file = file(context);
        if (!file.getBaseFile().exists()) return new JSONArray();
        return new JSONArray(new String(file.readFully(), StandardCharsets.UTF_8));
    }

    static synchronized void write(Context context, JSONArray notifications) throws IOException {
        AtomicFile file = file(context);
        FileOutputStream stream = file.startWrite();
        try {
            stream.write(notifications.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(stream);
        } catch (IOException error) {
            file.failWrite(stream);
            throw error;
        }
    }

    static synchronized boolean upsert(Context context, JSONObject notification)
        throws IOException, JSONException {
        JSONArray previous = read(context);
        JSONArray next = new JSONArray();
        boolean replaced = false;
        String id = notification.optString("id");
        for (int i = 0; i < previous.length(); i++) {
            JSONObject old = previous.optJSONObject(i);
            if (old == null) continue;
            if (id.equals(old.optString("id"))) {
                if (!replaced) {
                    next.put(notification);
                    replaced = true;
                }
            } else {
                next.put(old);
            }
        }
        if (!replaced) next.put(notification);
        while (next.length() > InterAppConfig.MAX_NOTIFICATIONS) {
            JSONArray trimmed = new JSONArray();
            for (int i = 1; i < next.length(); i++) trimmed.put(next.get(i));
            next = trimmed;
        }
        write(context, next);
        return !replaced;
    }

    static synchronized void clear(Context context) {
        file(context).delete();
    }

    private static AtomicFile file(Context context) {
        return new AtomicFile(new File(context.getNoBackupFilesDir(), FILE_NAME));
    }
}
