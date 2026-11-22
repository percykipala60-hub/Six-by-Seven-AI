package com.sevenai.six;

import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.inputmethodservice.InputMethodService;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Clavier Six : un clavier d'appoint, sans lettres. Dans n'importe quelle messagerie, on copie le message reçu,
 * on passe sur le clavier Six et on touche « Réponses de Six » : le panneau rapide propose trois réponses, et
 * celle qu'on touche est écrite directement dans le champ de la messagerie. Le bouton globe revient au clavier
 * habituel.
 */
public class SixClavier extends InputMethodService {
    /** Réponse choisie dans le panneau rapide, en attente d'être écrite dans le champ. */
    private static volatile String enAttente;

    static void deposer(String reponse) {
        enAttente = reponse;
    }

    private TextView etat;

    @Override
    public View onCreateInputView() {
        float dp = getResources().getDisplayMetrics().density;
        LinearLayout barre = new LinearLayout(this);
        barre.setOrientation(LinearLayout.HORIZONTAL);
        barre.setGravity(Gravity.CENTER_VERTICAL);
        barre.setBackgroundColor(Color.parseColor("#12151c"));
        int marge = Math.round(10 * dp);
        barre.setPadding(marge, marge, marge, marge + Math.round(6 * dp));

        TextView globe = bouton("🌐", false, dp);
        globe.setContentDescription("Revenir au clavier habituel");
        globe.setOnClickListener(v -> revenirAuClavier());
        barre.addView(globe, new LinearLayout.LayoutParams(Math.round(52 * dp), Math.round(52 * dp)));

        LinearLayout milieu = new LinearLayout(this);
        milieu.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lpMilieu = new LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        lpMilieu.setMargins(Math.round(10 * dp), 0, 0, 0);

        TextView reponses = bouton("Réponses de Six", true, dp);
        reponses.setContentDescription("Proposer des réponses au message copié");
        reponses.setOnClickListener(v -> RapideActivity.ouvrir(this, RapideActivity.SOURCE_CLAVIER));
        milieu.addView(reponses, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, Math.round(52 * dp)));

        etat = new TextView(this);
        etat.setTextColor(Color.parseColor("#a3abbb"));
        etat.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        etat.setPadding(0, Math.round(6 * dp), 0, 0);
        etat.setText("Copie d’abord le message reçu.");
        milieu.addView(etat);

        barre.addView(milieu, lpMilieu);
        return barre;
    }

    private TextView bouton(String texte, boolean principal, float dp) {
        TextView b = new TextView(this);
        b.setText(texte);
        b.setGravity(Gravity.CENTER);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, principal ? 16 : 20);
        b.setTypeface(Typeface.DEFAULT, principal ? Typeface.BOLD : Typeface.NORMAL);
        b.setTextColor(principal ? Color.parseColor("#12151c") : Color.parseColor("#eef0f5"));
        GradientDrawable fond = new GradientDrawable();
        fond.setCornerRadius(26 * dp);
        fond.setColor(principal ? Color.parseColor("#eef0f5") : Color.parseColor("#252b38"));
        b.setBackground(fond);
        b.setClickable(true);
        b.setFocusable(true);
        return b;
    }

    @Override
    public void onStartInputView(EditorInfo info, boolean restarting) {
        super.onStartInputView(info, restarting);
        ecrireEnAttente();
    }

    @Override
    public void onWindowShown() {
        super.onWindowShown();
        ecrireEnAttente();
    }

    /** Écrit dans le champ la réponse choisie dans le panneau rapide, une seule fois. */
    private void ecrireEnAttente() {
        String reponse = enAttente;
        if (reponse == null) return;
        InputConnection champ = getCurrentInputConnection();
        if (champ == null) return;
        enAttente = null;
        champ.commitText(reponse, 1);
        if (etat != null) etat.setText("Réponse écrite. Relis-la, puis envoie-la toi-même.");
    }

    private void revenirAuClavier() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (!switchToPreviousInputMethod()) afficherChoixClavier();
        } else {
            afficherChoixClavier();
        }
    }

    private void afficherChoixClavier() {
        InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (imm != null) imm.showInputMethodPicker();
    }
}
