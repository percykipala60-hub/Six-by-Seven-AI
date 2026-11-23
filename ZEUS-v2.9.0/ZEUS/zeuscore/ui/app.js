/* ZEUS — interface web (sans dépendance). */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem("zeus_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("zeus_" + k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
/** Comme el.append(), mais ignore null / undefined / false (append() natif les écrirait en texte « null »). */
function appendAll(el, ...kids) { el.append(...kids.filter((k) => k !== null && k !== undefined && k !== false)); }
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* Marque compacte du logo (le Z, avec le cœur cyan) : en-tête des réponses de ZEUS. Logo complet : logo.svg. */
const BOLT = '<svg viewBox="200 170 600 570" aria-hidden="true"><path d="M316.0 176.0 L786.0 176.0 L786.0 226.0 L448.0 610.0 L786.0 610.0 L684.0 734.0 L214.0 734.0 L214.0 684.0 L552.0 300.0 L214.0 300.0 Z"/><circle cx="500" cy="455" r="70" fill="#00E5FF"/></svg>';

const ICONS = {
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  folder: '<path d="M3 6.5h6l2 2h10v10.5H3z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  list: '<path d="M7 3.5h10v17H7z"/><path d="M10 8h4M10 12h4M10 16h2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  cap: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-5"/><path d="M21.5 9v6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  docs: '<path d="M11.5 20.5H5V3.5h8.5l4 4V11"/><path d="M13.5 3.5v4h4"/><circle cx="16" cy="16" r="3.2"/><path d="M18.3 18.3l2.7 2.7"/>',
};
const NAV_ICONS = { chat: "chat", phone: "phone", dossiers: "folder", validations: "shield", apprendre: "cap", agenda: "calendar", documents: "docs", memoire: "book", taches: "clock", journal: "list", reglages: "gear" };

const TOOL_LABELS = {
  docs_search: "Recherche dans mes documents", docs_read: "Lecture d'un document", docs_list: "Liste de mes documents",
  docs_add_folder: "Ajout d'un dossier à la bibliothèque", docs_remove_folder: "Retrait d'un dossier", docs_reindex: "Mise à jour de la bibliothèque",
  calendar_connect: "Branchement d'un agenda", calendar_feeds: "Agendas branchés", calendar_disconnect: "Débranchement d'un agenda", calendar_sync: "Synchronisation des agendas",
  set_mode: "Changement de rôle", corrections_log: "Corrections vérifiées", flashcard_add: "Cartes mémoire",
  flashcard_due: "Cartes à réviser", flashcard_grade: "Révision", flashcard_stats: "Bilan des cartes",
  flashcard_delete: "Suppression de carte", progress_log: "Résultat noté", progress_report: "Bilan de progression",
  agenda_add: "Agenda", agenda_list: "Agenda", agenda_delete: "Agenda", agenda_export: "Export de l'agenda",
  contact_save: "Contact", contact_find: "Contacts", contact_delete: "Contact supprimé", todo_add: "Tâche ajoutée",
  todo_list: "Tâches", todo_done: "Tâche faite", todo_delete: "Tâche supprimée", invoice_create: "Facture / devis",
  update_plan: "Plan", ask_human: "Question pour toi", enable_tools: "Chargement d'outils", remember: "Mémorisation",
  recall: "Recherche en mémoire", forget: "Oubli", use_skill: "Compétence", save_skill: "Nouvelle compétence",
  schedule_task: "Planification", list_tasks: "Tâches", cancel_task: "Annulation de tâche", delegate: "Sous-agents",
  notify_owner: "Notification", read_file: "Lecture de fichier", write_file: "Écriture de fichier", list_dir: "Dossier",
  share_file: "Fichier remis", edit_file: "Modification de fichier", search_files: "Recherche de fichiers",
  move_path: "Déplacement", copy_path: "Copie", delete_path: "Corbeille", download_file: "Téléchargement",
  look_at_image: "Analyse d'image", run_shell: "Commande", run_python: "Script Python", web_search: "Recherche web",
  fetch_url: "Lecture de page", phone_status: "État du téléphone", phone_screen: "Lecture de l'écran",
  phone_tap: "Toucher", phone_long_press: "Appui long", phone_swipe: "Glisser", phone_scroll: "Défilement",
  phone_type: "Saisie", phone_key: "Touche", phone_open_app: "Ouverture d'appli", phone_open_url: "Ouverture de lien",
  phone_call: "Appel", phone_end_call: "Raccrocher", phone_send_sms: "SMS", phone_send_whatsapp: "WhatsApp",
  phone_notifications: "Notifications", phone_contacts: "Contacts", phone_read_sms: "Lecture des SMS",
  phone_wait: "Attente", phone_wake: "Réveil de l'écran", phone_files: "Fichiers du téléphone", phone_shell: "Commande téléphone",
  phone_install: "Installation d'appli", phone_location: "Position", phone_task: "Agent téléphone",
  computer_open: "Ouverture sur le PC", computer_screenshot: "Capture du PC", computer_input: "Clavier/souris",
  computer_notify: "Notification PC", clipboard: "Presse-papier", system_info: "Infos système",
  dossier_create: "Nouveau dossier", dossier_list: "Dossiers", dossier_get: "Dossier", dossier_attach: "Pièce ajoutée",
  dossier_check: "Vérification du dossier", dossier_update: "Mise à jour du dossier", dossier_relance: "Relance",
  dossier_export: "Export du dossier", procedure_list: "Démarches", procedure_save: "Démarche enregistrée",
  send_email: "E-mail", read_inbox: "Boîte mail", send_telegram: "Telegram", send_whatsapp: "WhatsApp (API)",
  guichet_procedures: "Démarches", guichet_open: "Ouverture de dossier", guichet_status: "État du dossier",
  guichet_note: "Note au dossier", guichet_handoff: "Passage à un agent",
  create_spreadsheet: "Fichier Excel", create_document: "Document Word",
  browser_open: "Ouverture de page", browser_read: "Lecture de page", browser_click: "Clic", browser_type: "Saisie web",
  browser_select: "Choix d'option", browser_scroll: "Défilement web", browser_back: "Page précédente",
  browser_screenshot: "Capture web", browser_tabs: "Onglets",
  phone_settings: "Réglage du téléphone", phone_alarm: "Alarme / minuteur", phone_calendar: "Agenda",
  watch_create: "Nouvelle surveillance", watch_list: "Surveillances", watch_delete: "Surveillance supprimée",
  install_skill: "Installation de compétence",
};
const CHANNEL_ICON = { web: "💻", cli: "⌨️", telegram: "✈️", whatsapp: "🟢", email: "✉️", sms: "📨", mcp: "🔌", scheduler: "⏱", agent: "🤖" };
const CHANNEL_NAME = { telegram: "Telegram", whatsapp: "WhatsApp", email: "E-mail", sms: "SMS", cli: "Terminal", scheduler: "Tâche planifiée", mcp: "Autre IA", agent: "Sous-agent" };
const RISK_TEXT = { read: "Lecture", write: "Modification locale", external: "Action vers l'extérieur", danger: "Action sensible",
  money: "Argent / paiement", catastrophic: "Action catastrophique" };

const S = {
  status: null, sessions: [], sid: store.get("sid", null), session: null, messages: [], live: null,
  approvals: [], attachments: [], view: "chat", tts: store.get("tts", false), wake: store.get("wake", false),
  converse: store.get("converse", false), micLang: store.get("micLang", "auto"), voiceRate: store.get("voiceRate", 1),
  pendingMode: null, lastLang: "", speaking: false, followUp: false, armedUntil: 0, stream: null,
  accent: store.get("accent", {}), jarvis: false, jvApproval: null, timers: [], interpLang: "", lastAnswer: "",
  dossierFilter: "", dossierSel: null, runs: new Set(), runInfo: new Map(), phoneTimer: null, sending: false,
};

/* ================================================================ API */
async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body !== undefined ? "POST" : "GET"), headers: {}, credentials: "same-origin" };
  if (opts.body !== undefined) {
    if (opts.raw) { init.body = opts.body; Object.assign(init.headers, opts.headers || {}); }
    else { init.body = JSON.stringify(opts.body); init.headers["Content-Type"] = "application/json"; }
  }
  const r = await fetch(path, init);
  if (r.status === 401) { showLogin(); throw new Error("non connecté"); }
  const ct = r.headers.get("Content-Type") || "";
  const data = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.error) || `Erreur ${r.status}`);
  return data;
}

function toast(text, level = "info", ms = 5000) {
  const t = h("div", { class: `toast ${level}` }, text);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), ms);
}

function fmtUsd(v) {
  const n = Number(v) || 0;
  return (n > 0 && n < 0.01 ? "< 0,01" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + " $";
}
function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000), now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/* ================================================================ Markdown sûr */
function md(src) {
  if (!src) return "";
  const blocks = [];
  let s = String(src).replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code) => { blocks.push(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = (t) => t
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const lines = esc(s).split("\n");
  let out = "", list = null, para = [], table = [];
  const flushPara = () => { if (para.length) { out += `<p>${inline(para.join("<br>"))}</p>`; para = []; } };
  const closeList = () => { if (list) { out += `</${list}>`; list = null; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r.trim()));
    out += "<table>" + rows.map((r, i) => "<tr>" + r.trim().replace(/^\||\|$/g, "").split("|")
      .map((c) => `<${i ? "td" : "th"}>${inline(c.trim())}</${i ? "td" : "th"}>`).join("") + "</tr>").join("") + "</table>";
    table = [];
  };
  for (const line of lines) {
    let m;
    const t = line.trim();
    if (/^\|.*\|$/.test(t)) { flushPara(); closeList(); table.push(t); continue; }
    flushTable();
    if (/^\u0000\d+\u0000$/.test(t)) { flushPara(); closeList(); out += t; continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) { flushPara(); closeList(); out += `<h4>${inline(m[2])}</h4>`; continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { flushPara(); if (list !== "ul") { closeList(); out += "<ul>"; list = "ul"; } out += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)/))) { flushPara(); if (list !== "ol") { closeList(); out += "<ol>"; list = "ol"; } out += `<li>${inline(m[2])}</li>`; continue; }
    if ((m = line.match(/^&gt;\s?(.*)/))) { flushPara(); closeList(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    if (!t) { flushPara(); closeList(); continue; }
    closeList(); para.push(line);
  }
  flushTable(); flushPara(); closeList();
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
}
const plain = (s) => String(s || "").replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>|]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "lien");

/* ================================================================ démarrage */
async function boot() {
  try {
    const p = await fetch("/api/ping", { credentials: "same-origin" }).then((r) => r.json());
    if (!p.auth) return showLogin();
    start();
  } catch (e) {
    document.body.innerHTML = `<p style="padding:2rem">ZEUS ne répond pas. Vérifie qu'il tourne sur l'ordinateur. (${esc(e.message)})</p>`;
  }
}

function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#token-input").focus();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/login", { body: { token: $("#token-input").value.trim() } });
    $("#login").hidden = true;
    start();
  } catch (err) { $("#login-error").textContent = err.message; }
});

let started = false;
async function start() {
  $("#app").hidden = false;
  $("#login").hidden = true;
  if (started) return;
  started = true;
  if (!CALM.matches) { $("#app").classList.add("ignite"); setTimeout(() => $("#app").classList.remove("ignite"), 1300); }
  for (const a of $$(".rail [data-view]")) {
    const ic = a.querySelector(".ico");
    if (ic) ic.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[NAV_ICONS[a.dataset.view]]}</svg>`;
  }
  $("#more-btn .ico").innerHTML = `<svg viewBox="0 0 24 24">${ICONS.menu}</svg>`;
  // Menu unique : toutes les rubriques (Parler, Téléphone, Dossiers…) rangées derrière « ☰ Menu »
  const menu = $("#more-menu");
  menu.innerHTML = "";
  for (const a of $$(".rail a[data-view]")) {
    menu.append(h("a", { href: a.getAttribute("href"), "data-view": a.dataset.view, html: a.querySelector(".ico").innerHTML + `<span>${esc(a.textContent.trim())}</span>` }));
  }
  const theme = store.get("theme", "");
  if (theme) document.documentElement.dataset.theme = theme;
  $("#opt-tts").checked = S.tts;
  $("#opt-wake").checked = S.wake;
  $("#opt-converse").checked = S.converse;
  $("#opt-lang").value = S.micLang;
  await loadStatus();
  connectSSE();
  await loadSessions();
  await loadApprovals();
  route();
  if (S.wake) startWake();
  setInterval(loadStatus, 30000);
  setInterval(syncApprovals, 15000);
}

/* ================================================================ routes */
window.addEventListener("hashchange", route);
function route() {
  const [view, arg] = (location.hash.slice(1) || "chat").split("/");
  const known = ["chat", "phone", "dossiers", "validations", "apprendre", "agenda", "documents", "memoire", "taches", "journal", "reglages"];
  S.view = known.includes(view) ? view : "chat";
  for (const v of $$(".view")) v.hidden = v.dataset.view !== S.view;
  updateHero();
  for (const a of $$(".rail a[data-view], #more-menu a[data-view]")) a.classList.toggle("active", a.dataset.view === S.view);
  $("#more-menu").hidden = true;
  stopPhoneTimer();
  ({ chat: () => openSession(S.sid), phone: initPhone, dossiers: () => loadDossiers(arg), validations: loadValidations,
    apprendre: loadLearn, agenda: loadAgenda, documents: loadDocuments, memoire: loadMemory, taches: loadTasks, journal: loadAudit, reglages: loadSettings })[S.view]();
}
$("#more-btn").addEventListener("click", () => { const m = $("#more-menu"); m.hidden = !m.hidden; $("#more-btn").setAttribute("aria-expanded", String(!m.hidden)); });
document.addEventListener("click", (e) => { if (!e.target.closest("#more-menu, #more-btn")) $("#more-menu").hidden = true; });

/* ================================================================ état */
/** Détails techniques (modèles d'IA) : cachés à l'utilisateur, visibles pour le développeur (Réglages). */
function applyTech() { document.documentElement.classList.toggle("show-tech", !!store.get("tech", false)); }
applyTech();
async function loadStatus() {
  try { S.status = await api("/api/status"); } catch { return; }
  const st = S.status;
  S.runs = new Set((st.runs || []).map((r) => r.session_id));
  $("#badge-approvals").hidden = !st.stats.approvals_pending;
  $("#badge-approvals").textContent = st.stats.approvals_pending || "";
  $("#badge-menu").hidden = !st.stats.approvals_pending;
  $("#badge-menu").textContent = st.stats.approvals_pending || "";
  const models = st.models || [];
  const c = st.costs || {};
  $("#act-models").innerHTML = (models.length ? models.map((m) => `<div class="model-line"><span><span class="dot ${m.healthy ? "" : "off"}"></span>${esc(m.id)}</span><span class="muted">${esc(m.model || "")}</span></div>`).join("")
    : 'Aucun modèle. <a href="#reglages">Brancher un modèle</a>') + (c.month || c.limit ? `<div class="model-line spend"><span>Ce mois</span><span class="${c.exhausted ? "error-text" : "muted"}">${fmtUsd(c.month)}${c.limit ? " / " + fmtUsd(c.limit) : ""}</span></div>` : "");
  const ph = st.phone || {};
  $("#act-phone").innerHTML = ph.connected ? `<span class="dot"></span>${esc((ph.manufacturer || "") + " " + (ph.model || ""))} · ${ph.battery && ph.battery.level != null ? ph.battery.level + " %" : ""}`
    : `<span class="dot idle"></span>Non connecté — <a href="#phone">brancher</a>`;
  renderSuggestions();
  updatePresence();
}

/* Accueil : un profil (étudiant, prof, salarié, dirigeant, RH, chercheur…) = un rôle + des idées adaptées. */
const PERSONAS = {
  perso: { label: "Vie perso", mode: null, ideas: null },
  etudiant: { label: "Étudiant", mode: { id: "enseignant", subject: "toutes matières" }, ideas: [
    "Explique-moi les dérivées pas à pas, puis donne-moi un exercice",
    "Fais-moi un planning de révision pour mes examens dans 3 semaines, avec des rappels",
    "Fais-moi une fiche de révision sur la Seconde Guerre mondiale",
    "Corrige l'introduction de mon rapport de stage et explique mes erreurs"] },
  langues: { label: "Langues", mode: { id: "prof_langue", lang: "en" }, ideas: [
    "Sois mon prof d'anglais : évalue mon niveau puis commençons",
    "Jouons une scène au restaurant en anglais",
    "Prépare-moi au TOEIC : un exercice de compréhension",
    "Apprends-moi 10 phrases utiles pour l'aéroport"] },
  prof: { label: "Professeur", mode: { id: "formateur" }, ideas: [
    "Prépare une séance de 55 minutes sur la photosynthèse pour une classe de 4e",
    "Crée un QCM de 10 questions avec corrigé sur la Révolution française",
    "Propose des exercices différenciés sur les fractions, sur 3 niveaux",
    "Rédige des appréciations de bulletin bienveillantes à partir de ces notes"] },
  salarie: { label: "Salarié", mode: { id: "secretaire" }, ideas: [
    "Ajoute réunion projet jeudi à 10h et rappelle-moi 30 minutes avant",
    "Résume mes e-mails non lus et propose des réponses",
    "Rédige le compte rendu de ma réunion à partir de ces notes",
    "Fais une facture de 1 200 $ pour la création d'un site web, TVA 16 %"] },
  dirigeant: { label: "Dirigeant", mode: { id: "dirigeant" }, ideas: [
    "Prépare une note de décision d'une page : faut-il ouvrir une deuxième agence ?",
    "Fais l'analyse SWOT de mon entreprise",
    "Prépare l'ordre du jour et les points clés de mon conseil d'administration",
    "Construis un plan à 90 jours avec des KPI mesurables"] },
  rh: { label: "RH", mode: { id: "rh" }, ideas: [
    "Rédige une fiche de poste de comptable junior",
    "Crée une grille d'évaluation objective pour comparer des CV",
    "Prépare 10 questions d'entretien comportementales (méthode STAR)",
    "Construis un plan d'intégration de 30 jours pour un nouvel employé"] },
  chercheur: { label: "Chercheur", mode: { id: "chercheur" }, ideas: [
    "Trouve 5 articles récents sur l'apprentissage des langues avec l'IA, avec leurs DOI",
    "Résume cet article : question, méthode, résultats, limites",
    "Quel test statistique pour comparer 3 groupes indépendants ?",
    "Relis mon résumé comme un relecteur de revue scientifique"] },
};
/** Applique un rôle à la conversation affichée (ou à la prochaine, si elle n'existe pas encore). */
async function applyMode(m) {
  if (!m) return;
  if (!S.sid || !S.session) { S.pendingMode = m; renderRole(); return; }
  try {
    const r = await api(`/api/sessions/${S.sid}`, { method: "PATCH", body: { mode: m } });
    if (r.session) S.session = r.session;
    renderRole();
  } catch (err) { toast(err.message, "error"); }
}
/** Modèle local lent : au bout de 15 s sans réponse, on explique l'attente (sinon ZEUS semble figé). */
function slowHint() {
  clearTimeout(S.slowTimer);
  S.slowTimer = setTimeout(() => {
    if (!S.live || S.live.sid !== S.sid || S.live.text || S.live.items.length) return;
    const models = (S.status && S.status.models) || [];
    const localOnly = models.length && !models.some((m) => !/localhost|127\.0\.0\.1|\[::1\]/.test(m.base_url || "") && m.provider !== "ollama");
    if (localOnly) liveNote("Le modèle local lit ses consignes : jusqu'à quelques minutes la première fois sur un PC sans carte graphique, bien moins pour les messages suivants. Pour des réponses en 2 secondes : 🚀 Groq gratuit (écran d'accueil).");
  }, 15000);
}
function renderBrainCard() {
  const box = $("#brain-card");
  if (!box || !S.status) return;
  box.innerHTML = "";
  const models = S.status.models || [];
  const cloud = models.some((m) => !/localhost|127\.0\.0\.1|\[::1\]/.test(m.base_url || "") && m.provider !== "ollama");
  if (cloud) return;
  box.append(h("div", { class: "brain-card" },
    h("strong", {}, models.length ? "Pour que ZEUS réponde vite, branche un cerveau en ligne" : "Branche un cerveau pour commencer"),
    h("p", { class: "muted small" }, models.length
      ? "Sur un ordinateur sans carte graphique, un modèle local met plusieurs minutes par réponse. Groq est gratuit et répond en 1 à 2 secondes ; Claude est le plus intelligent. Le modèle local reste en secours."
      : "Groq est gratuit et très rapide (2 minutes pour l'activer). Claude est le plus intelligent. Ollama fonctionne sans internet si ton PC a une carte graphique."),
    h("div", { class: "row wrap gap" },
      h("button", { type: "button", class: "btn bolt", onclick: () => groqDialog() }, "Groq gratuit"),
      h("button", { type: "button", class: "btn", onclick: () => { location.hash = "#reglages"; } }, "Claude ou autre"))));
}
function renderSuggestions() {
  renderBrainCard();
  const box = $("#suggestions");
  const pbox = $("#personas");
  if (!box || !pbox) return;
  const current = PERSONAS[store.get("persona", "perso")] ? store.get("persona", "perso") : "perso";
  pbox.innerHTML = "";
  pbox.append(h("span", { class: "muted small" }, "Je suis :"));
  for (const [k, p] of Object.entries(PERSONAS)) {
    pbox.append(h("button", { type: "button", class: "chip" + (k === current ? " active" : ""), "aria-pressed": String(k === current),
      onclick: () => { store.set("persona", k); renderSuggestions(); if (p.mode && !S.messages.length) applyMode(p.mode); } }, p.label));
  }
  box.innerHTML = "";
  const persona = PERSONAS[current];
  const defaults = [
    "Fais mon brief du matin",
    "Lis mes dernières notifications et dis-moi ce qui est important",
    "Envoie un WhatsApp à Maman : « J'arrive dans 30 minutes »",
    "Préviens-moi si Maman m'écrit sur WhatsApp",
    "Mets une alarme à 6h30 du lundi au vendredi",
    "Cherche le taux du dollar en francs congolais aujourd'hui",
    "Range les PDF de mon dossier Téléchargements par thème",
    "Montre-moi les dossiers incomplets et prépare les relances",
  ];
  const ideas = persona.ideas || defaults;
  for (const t of ideas) box.append(h("button", { type: "button", onclick: () => { if (persona.mode && !S.messages.length) applyMode(persona.mode); $("#input").value = t; autosize(); $("#input").focus(); } }, t));
}
/** « Rapide et gratuit » : Groq en un clic (ZEUS choisit le meilleur modèle et branche la voix). */
function groqDialog() {
  const f = $("#dialog-form");
  f.innerHTML = "";
  const key = h("input", { type: "password", placeholder: "gsk_…", autocomplete: "off", "aria-label": "Clé API Groq" });
  const err = h("p", { class: "error" });
  f.append(h("h3", { style: "margin:0" }, "Rapide et gratuit — Groq"),
    h("p", { class: "muted small" }, "1. Crée un compte gratuit sur console.groq.com. 2. Menu API Keys → Create API Key. 3. Colle la clé ici : elle reste sur ton ordinateur. ZEUS choisit tout seul le meilleur modèle disponible et branche aussi la reconnaissance de la voix."),
    field("Clé API Groq", key), err,
    h("div", { class: "dialog-actions" }, h("button", { class: "btn", value: "cancel", formnovalidate: true }, "Annuler"),
      h("button", { class: "btn bolt", type: "button", onclick: async (e) => {
        err.textContent = ""; e.target.disabled = true; e.target.textContent = "Test de la clé…";
        try {
          const r = await api("/api/models/groq", { body: { api_key: key.value.trim() } });
          $("#dialog").close();
          toast(r.test && r.test.ok ? `Groq répond (${r.test.latency} s) avec ${r.main}. ZEUS est prêt.` : `Réglages enregistrés, mais le test a échoué : ${(r.test && r.test.error) || "?"}`, r.test && r.test.ok ? "success" : "error", 12000);
          await loadStatus();
          if (S.view === "reglages") loadSettings();
        } catch (x) { err.textContent = x.message; e.target.disabled = false; e.target.textContent = "Activer"; }
      } }, "Activer")));
  $("#dialog").showModal();
  key.focus();
}

/** 2e cerveau en ligne gratuit (Cerebras ou Gemini) : prend le relais quand Groq atteint sa limite du jour. */
const FREE_BRAINS = {
  cerebras: { label: "Cerebras", key: "csk-…", how: "1. Crée un compte gratuit sur cloud.cerebras.ai. 2. Menu API Keys → Create. 3. Colle la clé ici.", about: "Environ 1 million de jetons gratuits par jour (5 fois Groq) et très rapide. Ne voit pas les images." },
  gemini: { label: "Google Gemini", key: "AIza…", how: "1. Va sur aistudio.google.com/apikey avec ton compte Google. 2. Create API key. 3. Colle la clé ici.", about: "Quelques centaines de requêtes gratuites par jour, et il voit les images (captures, photos)." },
};
function freeDialog(start = "cerebras") {
  const f = $("#dialog-form");
  f.innerHTML = "";
  let provider = start;
  const how = h("p", { class: "muted small" });
  const key = h("input", { type: "password", autocomplete: "off", "aria-label": "Clé API" });
  const err = h("p", { class: "error" });
  const chips = h("div", { class: "row wrap gap", role: "radiogroup", "aria-label": "Fournisseur" });
  const show = () => {
    const p = FREE_BRAINS[provider];
    how.textContent = `${p.about} ${p.how} Elle reste sur ton ordinateur ; ZEUS choisit tout seul le meilleur modèle gratuit.`;
    key.placeholder = p.key;
    for (const b of chips.children) { const on = b.dataset.p === provider; b.classList.toggle("active", on); b.setAttribute("aria-checked", String(on)); }
  };
  for (const [k, p] of Object.entries(FREE_BRAINS)) {
    chips.append(h("button", { type: "button", class: "chip", role: "radio", "data-p": k, onclick: () => { provider = k; show(); } }, p.label));
  }
  const go = h("button", { class: "btn bolt", type: "button", onclick: async () => {
    err.textContent = ""; go.disabled = true; go.textContent = "Test de la clé…";
    try {
      const r = await api("/api/models/free", { body: { provider, api_key: key.value.trim() } });
      $("#dialog").close();
      toast(r.test && r.test.ok ? `${r.label} répond (${r.test.latency} s) avec ${r.model}. Il prendra le relais quand Groq sera à sa limite.` : `Réglages enregistrés, mais le test a échoué : ${(r.test && r.test.error) || "?"}`, r.test && r.test.ok ? "success" : "error", 12000);
      await loadStatus();
      if (S.view === "reglages") loadSettings();
    } catch (x) { err.textContent = x.message; go.disabled = false; go.textContent = "Activer"; }
  } }, "Activer");
  f.append(h("h3", { style: "margin:0" }, "2e cerveau gratuit, après Groq"),
    h("p", { class: "small" }, "Quand Groq atteint sa limite du jour, ZEUS continue en ligne avec ce 2e cerveau au lieu du modèle local, bien plus lent."),
    chips, how, field("Clé API", key), err,
    h("div", { class: "dialog-actions" }, h("button", { class: "btn", value: "cancel", formnovalidate: true }, "Annuler"), go));
  show();
  $("#dialog").showModal();
  key.focus();
}

function updatePresence() {
  const acting = S.live && S.live.sid === S.sid || S.runs.has(S.sid);
  $("#presence").classList.toggle("acting", !!acting);
  $("#presence-text").textContent = acting ? "Agit…" : "Prêt";
  $("#presence").title = acting ? "ZEUS agit…" : "ZEUS est prêt";
  $("#send").hidden = !!acting && !$("#input").value.trim();
  $("#stop").hidden = !acting;
  const runs = [...S.runInfo.values()];
  const labels = { owner: "Tâche", guichet: "Guichet", system: "Tâche planifiée", phone: "Agent téléphone", worker: "Sous-agent" };
  $("#act-runs").innerHTML = runs.length ? runs.map((r) => `<div>⚡ ${esc(labels[r.profile] || r.profile)} — ${esc(r.title || "")}<br><span class="muted">${r.tools} action(s)${r.last ? " · " + esc(TOOL_LABELS[r.last] || r.last) : ""}</span></div>`).join("") : "Aucune tâche en cours.";
}

/* ================================================================ temps réel */
let es = null;
function connectSSE() {
  if (es) es.close();
  es = new EventSource("/api/events");
  es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  es.onerror = () => { /* reconnexion automatique par le navigateur */ };
}

function rootOf(ev) { return ev.root_session || ev.session_id; }

function onEvent(ev) {
  const sid = rootOf(ev);
  const mine = sid && sid === S.sid;
  switch (ev.type) {
    case "run_start":
      if (ev.depth === 0) {
        const s = S.sessions.find((x) => x.id === ev.session_id);
        S.runInfo.set(ev.run_id, { profile: ev.profile, tools: 0, title: s ? s.title : "", session: ev.session_id });
      }
      if (ev.depth === 0) { S.runs.add(ev.session_id); if (ev.session_id === S.sid) { flash(); beginLive(); slowHint(); } markSessionRunning(ev.session_id, true); }
      break;
    case "assistant_delta": if (mine && ev.depth === 0) { liveText(ev.text); if (S.tts || S.speakNext) streamSpeak(ev.text); jv("delta", ev.text); } break;
    case "assistant_reset": if (mine && ev.depth === 0) { if (S.live) { S.live.text = ""; renderLiveText(); } if (S.stream && !S.stream.done) S.stream = { buf: "", pos: 0 }; jv("reset"); } break;
    case "assistant_note": if (mine) liveNote(ev.text, ev.depth); break;
    case "model_notice": if (mine && !ev.depth) { liveNote(ev.text, 0); toast(ev.text, "info", 8000); jv("tool", ev.text); } break;
    case "tool_start": {
      const info = [...S.runInfo.values()].find((r) => r.session === sid);
      if (info) { info.tools++; info.last = ev.name; }
      if (mine) liveTool(ev);
      if (mine && ev.depth === 0) { if (S.jarvis) jvModule = jvModuleOf(ev.name); jv("tool", (TOOL_LABELS[ev.name] || ev.name) + " " + argSummary(ev.name, ev.args)); }
      break;
    }
    case "tool_end": if (mine) liveToolEnd(ev); break;
    case "plan": if (mine) livePlan(ev.steps); break;
    case "run_end":
      if (ev.depth === 0) {
        S.runInfo.delete(ev.run_id);
        S.runs.delete(ev.session_id);
        markSessionRunning(ev.session_id, false);
        if (ev.session_id === S.sid) { endLive(ev); jv("end", ev.text); }
      }
      break;
    case "approval": addApproval(ev.approval); break;
    case "approval_done": removeApproval(ev.id); break;
    case "session_updated": loadSessions(); break;
    case "notification": toast(ev.text, ev.level || "info", 7000); if (S.tts || S.jarvis) speak(ev.text, { raw: true, append: S.speaking }); break;
    case "errors_changed": if (S.view === "apprendre") debounce("learn", loadLearn, 500); break;
    case "memory_added": toast("Mémorisé : " + ev.content, "success", 4000); break;
    case "skill_learned": toast("Nouvelle compétence : " + ev.name, "success", 5000); break;
    case "dossier_update": if (S.view === "dossiers") debounce("doss", () => loadDossiers(S.dossierSel), 600); break;
    case "phone_action": case "phone_screen": if (S.view === "phone") debounce("phone", refreshPhone, 700); break;
    case "inbox": if (mine) toast("Message transmis à ZEUS pendant qu'il travaille.", "info", 3000); break;
    case "schedule_ran": case "schedule_changed": if (S.view === "taches") debounce("tasks", loadTasks, 400); break;
    case "trigger_changed": if (S.view === "taches") debounce("trg", loadTriggers, 400); break;
    case "mode_changed":
      if (mine && S.session) { S.session.meta = { ...(S.session.meta || {}), mode: ev.mode }; S.interpLang = ""; renderRole(); if (S.wake) startWake(); if (S.jarvis) { $("#jv-role").textContent = roleLabel(ev.mode); jvInterp(); } }
      if (mine) toast(roleToast(ev.mode), "success", 3500);
      break;
    case "flashcards_changed": case "progress_changed": if (S.view === "apprendre") debounce("learn", loadLearn, 500); break;
    case "agenda_changed": case "todos_changed": case "contacts_changed": if (S.view === "agenda") debounce("agenda", loadAgenda, 500); break;
    case "kb_changed": if (S.view === "documents") debounce("kb", loadDocuments, 500); break;
    case "kb_progress": if (S.view === "documents") renderKbState(ev); break;
    case "trigger_fired":
      if (ev.action === "agent") toast(`${ev.name} — ZEUS s'en occupe.`, "info", 6000);
      if (S.view === "taches") debounce("trg", loadTriggers, 600);
      break;
    default: break;
  }
  updatePresence();
}
const timers = {};
function debounce(key, fn, ms) { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); }
function flash() { const f = $("#flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }

/* ================================================================ conversations */
async function loadSessions() {
  try { S.sessions = await api("/api/sessions"); } catch { return; }
  renderSessions();
}
function renderSessions() {
  const box = $("#session-list");
  box.innerHTML = "";
  const mine = S.sessions.filter((s) => s.trust !== "external");
  const ext = S.sessions.filter((s) => s.trust === "external");
  const item = (s) => h("div", { class: "session-row" + (s.id === S.sid ? " active" : "") },
    h("button", { class: "session-item" + (s.id === S.sid ? " active" : ""), onclick: () => { openSession(s.id); $("#sessions").classList.remove("open"); } },
      h("span", { class: "t" }, s.title || "Sans titre"),
      h("span", { class: "s" + (s.running ? " run" : "") }, s.running ? "ZEUS agit…" : (CHANNEL_NAME[s.channel] ? CHANNEL_NAME[s.channel] + ", " : "") + fmtTime(s.updated))),
    h("span", { class: "session-tools" },
      h("button", { type: "button", class: "icon-btn mini", title: "Renommer", "aria-label": `Renommer « ${s.title || "Sans titre"} »`, onclick: () => renameSession(s),
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>' }),
      h("button", { type: "button", class: "icon-btn mini danger-ico", title: "Supprimer", "aria-label": `Supprimer « ${s.title || "Sans titre"} »`, onclick: () => deleteSession(s),
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>' })));
  for (const s of mine) box.append(item(s));
  if (ext.length) {
    box.append(h("div", { class: "session-group" }, "Usagers du guichet"));
    for (const s of ext) box.append(item(s));
  }
  if (!S.sessions.length) box.append(h("p", { class: "muted small", style: "padding:.5rem .7rem" }, "Aucune conversation pour l'instant."));
}
function renameSession(s) {
  const f = $("#dialog-form");
  f.innerHTML = "";
  const inp = h("input", { value: s.title || "", maxlength: "120", "aria-label": "Nouveau nom" });
  const save = async () => {
    const t = inp.value.trim();
    if (!t) { inp.focus(); return; }
    try {
      await api(`/api/sessions/${s.id}`, { method: "PATCH", body: { title: t } });
      $("#dialog").close();
      await loadSessions();
      if (s.id === S.sid) $("#chat-title").textContent = t;
    } catch (err) { toast(err.message, "error"); }
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  appendAll(f, h("h3", {}, "Renommer la conversation"), inp,
    h("div", { class: "dialog-actions" }, h("button", { class: "btn ghost", value: "close" }, "Annuler"),
      h("button", { type: "button", class: "btn bolt", onclick: save }, "Renommer")));
  $("#dialog").showModal();
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
}
function deleteSession(s) {
  const f = $("#dialog-form");
  f.innerHTML = "";
  appendAll(f, h("h3", {}, "Supprimer la conversation ?"),
    h("p", {}, `« ${s.title || "Sans titre"} » et tous ses messages seront effacés. C'est définitif.`),
    h("div", { class: "dialog-actions" }, h("button", { class: "btn ghost", value: "close" }, "Annuler"),
      h("button", { type: "button", class: "btn danger", onclick: async () => {
        try {
          await api(`/api/sessions/${s.id}`, { method: "DELETE" });
          $("#dialog").close();
          toast("Conversation supprimée.", "success");
          await loadSessions();
          if (s.id === S.sid) {
            const next = S.sessions.find((x) => x.trust !== "external");
            if (next) openSession(next.id); else $("#new-session").click();
          }
        } catch (err) { toast(err.message, "error"); }
      } }, "Supprimer")));
  $("#dialog").showModal();
}
function markSessionRunning(sid, on) { const s = S.sessions.find((x) => x.id === sid); if (s) { s.running = on; renderSessions(); } }

$("#new-session").addEventListener("click", async () => {
  S.pendingBrain = "";
  S.pendingMode = null;
  const r = await api("/api/sessions", { body: {} });
  S.sid = r.id; store.set("sid", S.sid);
  await loadSessions();
  openSession(S.sid);
  $("#sessions").classList.remove("open");
  $("#input").focus();
});
$("#toggle-sessions").addEventListener("click", () => $("#sessions").classList.toggle("open"));

async function openSession(sid) {
  if (!sid) { S.session = null; S.messages = []; renderMessages(); return; }
  let data;
  try { data = await api(`/api/sessions/${sid}`); }
  catch { S.sid = null; store.set("sid", null); S.session = null; S.messages = []; renderMessages(); return; }
  S.sid = sid; store.set("sid", sid);
  S.session = data.session;
  S.pendingMode = null;
  S.messages = data.messages;
  if (data.running) { if (!S.live || S.live.sid !== sid) beginLive(); if (data.running.plan) livePlan(data.running.plan); }
  else if (S.live && S.live.sid === sid) { S.live = null; }
  renderSessions();
  renderMessages();
}

function renderBrain() {
  const r = (S.status && S.status.routing) || {};
  const s = S.session;
  const wrap = $("#brain-wrap");
  wrap.hidden = !((!s || s.trust !== "external") && (r.max || r.fast));
  if (wrap.hidden) return;
  const sel = $("#brain-select");
  for (const o of sel.options) {
    const key = o.value || "default";
    o.disabled = !!o.value && !r[o.value];
    o.textContent = ({ "": "Normal", max: "Maximum", fast: "Rapide" })[o.value] + (r[key] ? ` (${r[key]})` : "");
  }
  sel.value = s ? ((s.meta && s.meta.brain) || "") : (S.pendingBrain || "");
}
$("#brain-select").addEventListener("change", async (e) => {
  if (!S.sid || !S.session) { S.pendingBrain = e.target.value || ""; return; }
  try {
    await api(`/api/sessions/${S.sid}`, { method: "PATCH", body: { brain: e.target.value || null } });
    if (S.session) S.session.meta = { ...(S.session.meta || {}), brain: e.target.value || null };
    toast(e.target.value === "max" ? "Mode maximum pour cette conversation." : e.target.value === "fast" ? "Mode rapide pour cette conversation." : "Mode normal.", "success", 2500);
  } catch (err) { toast(err.message, "error"); }
});

function renderMessages() {
  const s = S.session;
  renderBrain();
  renderRole();
  $("#chat-title").textContent = s ? (s.title || "Conversation") : "Nouvelle conversation";
  $("#chat-sub").textContent = s ? `${({ web: "Interface web", telegram: "Telegram", whatsapp: "WhatsApp", email: "E-mail", cli: "Terminal", scheduler: "Tâche planifiée" })[s.channel] || s.channel}${s.trust === "external" ? " · usager externe" : ""}` : "";
  const ext = s && s.trust === "external";
  const banner = $("#external-banner");
  banner.hidden = !ext;
  if (ext) {
    banner.innerHTML = "";
    banner.append(`Conversation d'un usager (${s.peer_name || s.peer}). ZEUS lui répond avec les seuls outils du guichet. Tu peux répondre toi-même :`);
    const f = h("form", { class: "row gap", style: "margin-top:.5rem", onsubmit: async (e) => {
      e.preventDefault(); const t = f.querySelector("input").value.trim(); if (!t) return;
      try { await api(`/api/sessions/${s.id}/reply`, { body: { text: t } }); f.querySelector("input").value = ""; openSession(s.id); toast("Message envoyé à l'usager.", "success"); }
      catch (err) { toast(err.message, "error"); }
    } }, h("input", { placeholder: "Ta réponse à l'usager (envoyée telle quelle)" }), h("button", { class: "btn" }, "Envoyer"));
    banner.append(f);
  }
  $("#composer").hidden = !!ext;
  $("#welcome").hidden = !!(S.messages.length || (S.live && S.live.sid === S.sid));
  const box = $("#messages");
  box.innerHTML = "";
  const results = {};
  for (const m of S.messages) if (m.role === "tool") results[m.tool_call_id] = m;
  const lastZeus = [...S.messages].reverse().find((m) => m.role === "assistant" && !(m.tool_calls && m.tool_calls.length));
  let strikes = null;
  for (const m of S.messages) {
    if (m.auto) continue;
    if (m.role === "user") {
      strikes = null;
      const el = h("div", { class: "msg user" }, h("div", { class: "bubble" }, m.text));
      const att = h("div", { class: "att" });
      for (const u of m.images || []) att.append(h("img", { class: "thumb", src: u, alt: "image jointe", onclick: () => zoom(u) }));
      for (const a of m.attachments || []) if (!a.image) att.append(h("a", { class: "file-chip", href: a.url, target: "_blank" }, "" + a.name));
      if (att.children.length) el.append(att);
      box.append(el);
    } else if (m.role === "assistant") {
      if (m.tool_calls && m.tool_calls.length) {
        if (m.text && m.text.trim()) box.append(h("p", { class: "note" }, m.text));
        if (!strikes) { strikes = h("div", { class: "strikes" }); box.append(strikes); }
        for (const tc of m.tool_calls) {
          const r = results[tc.id];
          strikes.append(strikeEl({ name: tc.name, args: tc.args, ok: r ? !r.error : true, pending: false, preview: r ? r.text : "", depth: 0 }));
        }
      } else {
        strikes = null;
        const meta = store.get("tech", false) ? [m.reflex ? "réflexe instantané, sans IA" : m.mini ? `mini-cerveau local (${m.model})` : m.model, m.cost ? fmtUsd(m.cost) : ""].filter(Boolean).join(" · ") : "";
        const lesson = !m.error && sessionMode() && sessionMode().id === "prof_langue";
        const parts = lesson ? String(m.text || "").split(/\n(?=\s*[*_#\s]*\u270F)/) : [m.text];
        const el = h("div", { class: "msg zeus" }, h("div", { class: "z-who", html: BOLT + "ZEUS" + (meta ? ` <span class="muted" style="letter-spacing:0">· ${esc(meta)}</span>` : "") }),
          h("div", { class: "z-text md" + (m.error ? " error-text" : ""), html: md(parts[0]) }));
        if (parts.length > 1) el.append(h("div", { class: "corrections md", html: md(parts.slice(1).join("\n")) }));
        if (lesson) {
          const lang = sessionMode().lang || "en";
          el.append(h("div", { class: "lesson-actions" },
            h("button", { type: "button", class: "btn ghost small", onclick: () => speak(m.text) }, "Écouter"),
            h("button", { type: "button", class: "btn ghost small", onclick: () => { const ss = sentencesFrom(m.text, lang); ss.length ? openPractice({ lang, sentences: ss }) : toast("Pas de phrase à répéter dans cette réponse.", "info"); } }, "Répéter"),
            m === lastZeus ? h("button", { type: "button", class: "btn ghost small", onclick: () => sendMessage("Fais le bilan de notre séance : ce que j'ai bien réussi, mes erreurs principales avec la règle, les mots nouveaux, mon niveau estimé et un objectif pour la prochaine fois. Note le résultat avec progress_log.") }, "Bilan de séance") : null));
        } else if (!m.error && sessionMode() && sessionMode().id === "interprete") {
          el.append(h("div", { class: "lesson-actions" }, h("button", { type: "button", class: "btn ghost small", onclick: () => speak(m.text) }, "Réécouter")));
        }
        if (m.files && m.files.length) el.append(h("div", { class: "row wrap gap" }, m.files.map((f) => h("a", { class: "file-chip", href: f.url + "&download=1" }, "" + f.name))));
        if (m.id && !ext) el.append(h("div", { class: "msg-foot" }, h("button", { type: "button", class: "wrong-btn", title: "Signaler une erreur : elle deviendra un cas de test pour que ZEUS ne la refasse pas", onclick: () => reportWrong(m) }, "ZEUS s'est trompé")));
        box.append(el);
      }
    }
  }
  renderInlineApprovals();
  if (S.live && S.live.sid === S.sid) renderLive();
  if (S.messages.length) scrollDown(true); else $("#transcript").scrollTop = 0;
  updateHero();
  if (S.jarvis) jvFeed();
}

/* « ZEUS s'est trompé » : l'erreur devient un cas enregistré (data/cas), futur test du banc d'essai */
const WRONG_KINDS = [["faux", "Réponse fausse"], ["compris", "Pas compris ma demande"], ["incomplet", "Incomplet ou vague"],
  ["long", "Trop long"], ["action", "Action non voulue"], ["langue", "Mauvaise langue ou mauvais ton"], ["autre", "Autre"]];
function reportWrong(m) {
  const f = $("#dialog-form");
  f.innerHTML = "";
  let kind = "faux";
  const chips = h("div", { class: "row wrap gap", role: "radiogroup", "aria-label": "Ce qui n'allait pas" });
  const pick = (k, btn) => { kind = k; for (const b of chips.children) { b.classList.toggle("active", b === btn); b.setAttribute("aria-checked", String(b === btn)); } };
  for (const [k, label] of WRONG_KINDS) {
    const b = h("button", { type: "button", class: "chip" + (k === kind ? " active" : ""), role: "radio", "aria-checked": String(k === kind), onclick: (e) => pick(k, e.currentTarget) }, label);
    chips.append(b);
  }
  const expected = h("textarea", { rows: "4", placeholder: "Qu'attendais-tu ? (la bonne réponse, ou ce que ZEUS aurait dû faire)", "aria-label": "Ce que tu attendais" });
  const comment = h("input", { placeholder: "Un détail à ajouter ? (facultatif)", "aria-label": "Commentaire" });
  const send = h("button", { type: "button", class: "btn bolt", onclick: async () => {
    send.disabled = true;
    try {
      const r = await api("/api/feedback", { body: { session_id: S.sid, message_id: m.id, kind, expected: expected.value.trim(), comment: comment.value.trim() } });
      $("#dialog").close();
      toast(`Merci, c'est noté (cas n° ${r.id}). Il servira de test pour que ZEUS ne refasse pas cette erreur.`, "success", 5000);
    } catch (err) { toast(err.message, "error"); send.disabled = false; }
  } }, "Enregistrer l'erreur");
  appendAll(f, h("h3", {}, "ZEUS s'est trompé"),
    h("p", { class: "muted small" }, "La question, la réponse, les outils utilisés et le modèle sont enregistrés sur ton PC (dossier data\\cas), sans aucune clé."),
    h("p", { class: "small" }, "Qu'est-ce qui n'allait pas ?"), chips, expected, comment,
    h("div", { class: "dialog-actions" }, h("button", { class: "btn ghost", value: "close" }, "Annuler"), send));
  $("#dialog").showModal();
  setTimeout(() => expected.focus(), 30);
}

function zoom(url) {
  const f = $("#dialog-form");
  f.innerHTML = "";
  f.append(h("img", { src: url, class: "zoom", alt: "" }), h("div", { class: "dialog-actions" }, h("a", { class: "btn", href: url, target: "_blank" }, "Ouvrir"), h("button", { class: "btn bolt", value: "ok" }, "Fermer")));
  $("#dialog").showModal();
}

function argSummary(name, a) {
  if (!a || typeof a !== "object") return "";
  const keys = ["goal", "title", "client", "deck", "mode", "query", "to", "number", "text", "message", "path", "url", "command", "name", "app", "key", "element", "direction", "procedure", "id", "content", "when", "question", "prompt", "toolsets", "steps", "tasks", "code"];
  for (const k of keys) {
    if (a[k] === undefined || a[k] === null || a[k] === "") continue;
    let v = a[k];
    if (Array.isArray(v)) v = v.map((x) => (typeof x === "object" ? (x.step || x.goal || JSON.stringify(x)) : x)).join(", ");
    else if (typeof v === "object") v = JSON.stringify(v);
    v = String(v).replace(/\s+/g, " ");
    if (k === "element") v = `[${v}]`;
    return v.length > 90 ? v.slice(0, 88) + "…" : v;
  }
  return "";
}

function strikeEl(t) {
  const el = h("details", { class: `strike ${t.pending ? "pending" : t.ok ? "ok" : "err"} depth${Math.min(t.depth || 0, 2)}` });
  el.append(h("summary", {}, h("span", { class: "st" }), h("span", { class: "tname" }, TOOL_LABELS[t.name] || t.name), h("span", { class: "tdesc" }, argSummary(t.name, t.args))));
  const body = h("div", { class: "body" });
  if (t.args && Object.keys(t.args).length) body.append(h("pre", {}, JSON.stringify(t.args, null, 1)));
  if (t.preview) body.append(h("pre", {}, String(t.preview).replace(/<\/?untrusted[^>]*>/g, "")));
  if (t.images && t.images.length) body.append(h("div", { class: "imgs" }, t.images.map((u) => h("img", { class: "thumb", src: u, alt: "capture", onclick: () => zoom(u) }))));
  if (t.files && t.files.length) body.append(h("div", { class: "row wrap gap" }, t.files.map((f) => h("a", { class: "file-chip", href: f.url + "&download=1" }, "" + f.name))));
  el.append(body);
  el._t = t;
  return el;
}

/* ---------------------------------------------------------------- tâche en direct */
function beginLive() {
  S.live = { sid: S.sid, items: [], text: "", plan: [] };
  $("#welcome").hidden = true;
  updateHero();
  renderLive();
}
function renderLive() {
  const L = S.live;
  const box = $("#live");
  box.hidden = !L || L.sid !== S.sid;
  if (box.hidden) return;
  const items = $("#live-items");
  items.innerHTML = "";
  for (const it of L.items) items.append(it.type === "note" ? h("p", { class: "note" }, it.text) : strikeEl(it));
  items.hidden = !L.items.length;
  livePlan(L.plan, true);
  renderLiveText();
}
function renderLiveText() {
  if (!S.live) return;
  const el = $("#live-text");
  el.innerHTML = S.live.text ? md(S.live.text) : "";
  el.classList.toggle("caret", true);
  scrollDown();
}
function liveText(t) { if (!S.live || S.live.sid !== S.sid) beginLive(); S.live.text += t; renderLiveText(); }
function liveNote(t, depth) { if (!S.live) beginLive(); S.live.text = ""; S.live.items.push({ type: "note", text: (depth ? "↳ " : "") + t }); renderLive(); }
function liveTool(ev) {
  if (!S.live) beginLive();
  S.live.text = "";
  S.live.items.push({ id: ev.call_id, name: ev.name, args: ev.args, pending: true, ok: true, depth: ev.depth || 0, decision: ev.decision });
  renderLive();
}
function liveToolEnd(ev) {
  if (!S.live) return;
  const t = S.live.items.find((x) => x.id === ev.call_id);
  if (t) { t.pending = false; t.ok = ev.ok; t.preview = ev.preview; t.images = ev.image_urls || []; t.files = ev.file_links || []; }
  renderLive();
}
function livePlan(steps, silent) {
  if (!S.live) { if (silent) return; beginLive(); }
  if (steps) S.live.plan = steps;
  const box = $("#live-plan");
  const st = S.live.plan || [];
  box.hidden = !st.length;
  box.innerHTML = st.length ? `<h4>Plan</h4><ol>${st.map((s) => `<li class="${esc(s.status)}">${esc(s.step)}</li>`).join("")}</ol>` : "";
}
async function endLive(ev) {
  const files = ev.file_links || [];
  S.live = null;
  $("#live").hidden = true;
  await openSession(S.sid);
  if (files.length) {
    const last = $$("#messages .msg.zeus").pop();
    if (last && !last.querySelector(".file-chip")) last.append(h("div", { class: "row wrap gap" }, files.map((f) => h("a", { class: "file-chip", href: f.url + "&download=1" }, "" + f.name))));
  }
  if (ev.text) S.lastAnswer = ev.text;
  if (S.tts || S.speakNext) {
    S.followUp = !!S.speakNext;
    streamFinish(ev.text);
    S.speakNext = false;
    if (!speakQueue) afterSpeech();
  } else S.stream = null;
  loadStatus();
}
function scrollDown(force) {
  const t = $("#transcript");
  if (force || t.scrollHeight - t.scrollTop - t.clientHeight < 240) t.scrollTop = t.scrollHeight;
}

/* ---------------------------------------------------------------- envoi */
const input = $("#input");
if (window.matchMedia("(max-width: 900px)").matches) input.placeholder = "Écris à ZEUS…";
function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 220) + "px"; updatePresence(); }
input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); sendMessage(); }
});
$("#composer").addEventListener("submit", (e) => { e.preventDefault(); sendMessage(); });
$("#stop").addEventListener("click", async () => { if (S.sid) { await api(`/api/sessions/${S.sid}/stop`, { body: {} }); toast("Arrêt demandé."); } });

async function sendMessage(text, opts = {}) {
  const t = (text ?? input.value).trim();
  if ((!t && !S.attachments.length) || S.sending) return;
  S.sending = true;
  try {
    const body = { session_id: S.sid, text: t, attachments: S.attachments.map((a) => a.path), voice: !!opts.voice };
    if (!S.session && S.pendingBrain) body.brain = S.pendingBrain;
    if (!S.session && S.pendingMode) body.mode = S.pendingMode;
    const dl = detectLang(t, "");
    if (dl) S.lastLang = dl;
    stopSpeaking();
    S.followUp = false;
    if (!opts.keepInput) { input.value = ""; autosize(); }
    const optimistic = h("div", { class: "msg user" }, h("div", { class: "bubble" }, t || "(pièces jointes)"));
    $("#messages").append(optimistic);
    $("#welcome").hidden = true;
    scrollDown(true);
    S.attachments = []; renderChips();
    const r = await api("/api/chat", { body });
    if (r.session_id !== S.sid) { S.sid = r.session_id; store.set("sid", S.sid); loadSessions(); }
    if (opts.voice) S.speakNext = true;
    if (r.status === "answered") { toast("Réponse transmise à ZEUS.", "success"); openSession(S.sid); }
  } catch (err) { toast(err.message, "error"); }
  finally { S.sending = false; }
}

/* pièces jointes */
$("#file-input").addEventListener("change", (e) => { for (const f of e.target.files) uploadFile(f); e.target.value = ""; });
document.addEventListener("paste", (e) => { if (S.view !== "chat") return; for (const it of e.clipboardData?.items || []) if (it.kind === "file") uploadFile(it.getAsFile()); });
$("#transcript").addEventListener("dragover", (e) => e.preventDefault());
$("#transcript").addEventListener("drop", (e) => { e.preventDefault(); for (const f of e.dataTransfer.files) uploadFile(f); });
async function uploadFile(file) {
  const chip = { name: file.name, path: null, pending: true };
  S.attachments.push(chip); renderChips();
  try {
    const r = await api("/api/upload", { body: file, raw: true, headers: { "X-Filename": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" } });
    Object.assign(chip, r, { pending: false });
  } catch (err) { S.attachments = S.attachments.filter((a) => a !== chip); toast("Envoi impossible : " + err.message, "error"); }
  renderChips();
}
function renderChips() {
  const box = $("#attach-chips");
  box.innerHTML = "";
  for (const a of S.attachments) box.append(h("span", { class: "chip" }, (a.pending ? "" : "") + a.name, h("button", { type: "button", "aria-label": "Retirer", onclick: () => { S.attachments = S.attachments.filter((x) => x !== a); renderChips(); } }, "×")));
}

/* ================================================================ validations */
async function loadApprovals() {
  try { S.approvals = await api("/api/approvals?status=pending"); } catch { return; }
  renderInlineApprovals();
  updateApprovalBadge();
}
function updateApprovalBadge() { const n = S.approvals.length; $("#badge-approvals").hidden = !n; $("#badge-approvals").textContent = n || ""; }
function addApproval(a) {
  if (!S.approvals.find((x) => x.id === a.id)) S.approvals.unshift(a);
  updateApprovalBadge();
  renderInlineApprovals();
  if (S.view === "validations") loadValidations();
  if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("ZEUS attend ta validation", { body: a.summary });
  if (S.jarvis && (!a.session_id || a.session_id === S.sid)) { jvApproval(a); S.followUp = true; }
  if (S.tts || S.wake || S.jarvis) speak(a.kind === "question" ? a.summary : say("approval") + " " + a.summary, { raw: true });
}
function removeApproval(id) {
  S.approvals = S.approvals.filter((x) => x.id !== id);
  if (S.jvApproval && S.jvApproval.id === id) jvApproval(null);
  updateApprovalBadge();
  renderInlineApprovals();
  if (S.view === "validations") loadValidations();
}
function decreeEl(a) {
  const el = h("div", { class: `decree ${a.kind === "question" ? "question" : a.risk}` });
  if (a.kind === "question") {
    el.append(h("p", { class: "what" }, "" + a.summary));
    const opts = a.options || [];
    if (opts.length) el.append(h("div", { class: "actions" }, opts.map((o) => h("button", { class: "btn", onclick: () => decide(a.id, "answer", o) }, o))));
    const inp = h("input", { placeholder: "Ta réponse" });
    el.append(h("form", { class: "answer-row", onsubmit: (e) => { e.preventDefault(); if (inp.value.trim()) decide(a.id, "answer", inp.value.trim()); } }, inp, h("button", { class: "btn bolt" }, "Répondre")));
    return el;
  }
  el.append(h("p", { class: "what" }, a.summary || a.tool));
  el.append(h("p", { class: "risk" }, `${RISK_TEXT[a.risk] || a.risk} · ${TOOL_LABELS[a.tool] || a.tool} · demandé ${fmtTime(a.ts)}`));
  if (a.args && Object.keys(a.args).length) {
    const d = h("details", {}, h("summary", { class: "muted small" }, "Détails"), h("pre", {}, JSON.stringify(a.args, null, 1)));
    el.append(d);
  }
  const money = ["money", "catastrophic"].includes(a.risk);
  const actions = h("div", { class: "actions" },
    money ? holdButton("Maintenir pour autoriser", () => decide(a.id, "approve"))
      : h("button", { class: "btn bolt", onclick: () => decide(a.id, "approve") }, "Autoriser"),
    h("button", { class: "btn", onclick: () => decide(a.id, "deny") }, "Refuser"));
  if (money) el.append(h("p", { class: "small muted", style: "margin:.2rem 0 .3rem" }, "Garde le doigt (ou la touche Entrée) appuyé une seconde : c'est une action sensible."));
  if (!["money", "catastrophic"].includes(a.risk)) actions.append(h("button", { class: "btn ghost small", onclick: () => decide(a.id, "always") }, "Toujours autoriser cet outil"));
  el.append(actions);
  return el;
}
/** Bouton « maintenir pour autoriser » : un simple clic ne suffit pas, il faut appuyer une seconde (souris, doigt ou clavier). */
function holdButton(label, onDone, ms = 1200) {
  const b = h("button", { type: "button", class: "btn hold", "aria-label": label + " (maintenir appuyé une seconde)" }, h("span", {}, label));
  b.style.setProperty("--hold", ms + "ms");
  let timer = null;
  const isKey = (e) => e.key === "Enter" || e.key === " ";
  const begin = (e) => {
    if (e.type === "keydown") { if (!isKey(e)) return; e.preventDefault(); }
    if (timer || b.disabled) return;
    b.classList.add("charging");
    timer = setTimeout(() => { timer = null; b.classList.remove("charging"); b.disabled = true; onDone(); }, ms);
  };
  const cancel = (e) => {
    if (e && e.type === "keyup" && !isKey(e)) return;
    if (timer) { clearTimeout(timer); timer = null; }
    b.classList.remove("charging");
  };
  b.addEventListener("pointerdown", begin);
  b.addEventListener("keydown", begin);
  for (const ev of ["pointerup", "pointerleave", "pointercancel", "keyup", "blur"]) b.addEventListener(ev, cancel);
  b.addEventListener("click", (e) => e.preventDefault());
  b.addEventListener("contextmenu", (e) => e.preventDefault());
  return b;
}
async function decide(id, decision, answer = "") {
  try { await api(`/api/approvals/${id}`, { body: { decision, answer } }); removeApproval(id); }
  catch (err) { toast(err.message, "error"); }
}
function renderInlineApprovals() {
  let box = $("#inline-approvals");
  if (!box) { box = h("div", { id: "inline-approvals" }); $("#live").after(box); }
  box.innerHTML = "";
  box.style.cssText = "max-width:760px;margin:0 auto";
  for (const a of S.approvals) box.append(decreeEl(a));
  const act = $("#act-approvals");
  act.innerHTML = "";
  if (S.approvals.length) act.append(h("p", { class: "small" }, `${S.approvals.length} validation(s) en attente.`));
  if (S.approvals.length) scrollDown(true);
}
async function syncApprovals() {
  let list;
  try { list = await api("/api/approvals?status=pending"); } catch { return; }
  const ids = (l) => l.map((x) => x.id).sort().join(",");
  if (ids(list) === ids(S.approvals)) return;
  const fresh = list.filter((x) => !S.approvals.find((y) => y.id === x.id));
  S.approvals = list;
  updateApprovalBadge();
  renderInlineApprovals();
  if (S.view === "validations") loadValidations();
  if (fresh.length && document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("ZEUS attend ta validation", { body: fresh[0].summary });
}
async function loadValidations() {
  const pend = $("#approvals-pending");
  pend.innerHTML = "";
  await loadApprovals();
  if (!S.approvals.length) pend.append(h("p", { class: "muted" }, "Rien à valider. ZEUS te demandera ici avant toute action sensible."));
  for (const a of S.approvals) pend.append(decreeEl(a));
  const hist = await api("/api/approvals?status=all");
  const done = hist.filter((a) => a.status !== "pending").slice(0, 100);
  const lab = { approved: "autorisé", denied: "refusé", answered: "répondu", expired: "expiré", cancelled: "annulé" };
  $("#approvals-history").innerHTML = done.length ? `<table class="data"><tr><th>Date</th><th>Demande</th><th>Décision</th><th>Par</th></tr>${done.map((a) =>
    `<tr><td>${fmtTime(a.ts)}</td><td>${esc(a.summary || a.tool)}</td><td>${lab[a.status] || a.status}${a.answer ? " : " + esc(a.answer) : ""}</td><td>${esc(a.decided_by || "")}</td></tr>`).join("")}</table>`
    : '<p class="muted">Aucun historique.</p>';
}

/* ================================================================ voix */
/* Voix multilingue (français, anglais, espagnol, allemand) façon Jarvis :
   - le micro écoute dans la langue choisie, ou celle du cours en mode professeur ;
   - chaque phrase de la réponse est lue avec une voix de SA langue (utile pour un cours de langue) ;
   - la lecture commence pendant que ZEUS écrit encore (phrase par phrase) ;
   - conversation continue : après la réponse, ZEUS réécoute sans qu'on redise « Zeus » ;
   - « stop », « arrête », « silence » coupe la parole. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recording = null, wakeRec = null;
const DEFAULT_ACCENT = { fr: "fr-FR", en: "en-GB", es: "es-ES", de: "de-DE" };
/** Accent de chaque langue (voix et micro) : anglais britannique par défaut, réglable dans Apprendre. */
const VOICE_LANGS = new Proxy(DEFAULT_ACCENT, { get: (t, k) => (S.accent && S.accent[k]) || t[k] });
/** Prévient le mode Jarvis (s'il est ouvert) de ce que fait la voix. */
function jv(evt, data) { if (S.jarvis) jarvisEvent(evt, data); }
const STOPWORDS = {
  fr: "le la les des une est et pas que qui dans pour sur avec ce cette mais je tu il nous vous ils suis sont ont fait comme plus tout bien aussi très être avoir c'est j'ai du au aux mon ton ma ta oui non merci",
  en: "the and is are was were you your have has with this that what which for not but they we it's i'm can will would should there their about from just very been do does did yes no please thanks of to",
  es: "el la los las una es y que de en por con para pero como muy está están estoy soy eres tengo tiene hay este esta eso sí no gracias por favor qué cómo dónde cuando también usted ustedes nosotros del al",
  de: "der die das und ist nicht ein eine ich du er sie wir ihr sind bin hast hat mit für auf auch aber wie was wo wann sehr noch schon ja nein danke bitte dem den des zu im kann können haben mein dein",
};
const STOPSETS = Object.fromEntries(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v.split(" "))]));
const LANG_CHARS = { fr: "éèêàùçœ", es: "ñ¿¡áíóú", de: "äöüß" };
const SAY = {
  yes: { fr: "Oui ?", en: "Yes?", es: "¿Sí?", de: "Ja?" },
  listen: { fr: "Je t'écoute…", en: "Listening…", es: "Te escucho…", de: "Ich höre…" },
  approval: { fr: "J'ai besoin de ta validation.", en: "I need your approval.", es: "Necesito tu validación.", de: "Ich brauche deine Bestätigung." },
};
const STOP_RE = /^(stop|stoppe|arr[eê]te|tais[- ]toi|silence|chut|ça suffit|cancel|be quiet|shut up|para|cállate|basta|halt|ruhe|hör auf)\b/i;
const BYE_RE = /^(merci|c'est tout|c'est bon|au revoir|à plus|thank you|thanks|that's all|bye|gracias|eso es todo|adiós|danke|das ist alles|tschüss)[\s.!]*$/i;

function detectLang(text, dflt) {
  const t = String(text || "").toLowerCase();
  const words = t.match(/[a-zà-ÿœß']+/g) || [];
  if (!words.length) return dflt;
  const score = {};
  for (const [k, set] of Object.entries(STOPSETS)) score[k] = words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0);
  for (const [k, chars] of Object.entries(LANG_CHARS)) for (const c of chars) score[k] += (t.split(c).length - 1) * 0.6;
  const best = Object.keys(score).reduce((a, b) => (score[b] > score[a] ? b : a));
  const ties = Object.values(score).filter((v) => v === score[best]).length;
  return score[best] < 1 || ties > 1 ? dflt : best;
}
function sessionMode() { return (S.session && S.session.meta && S.session.meta.mode) || S.pendingMode || null; }
/** Langue (fr/en/es/de) dans laquelle le micro écoute. */
function micLangCode() {
  if (S.micLang && S.micLang !== "auto") return S.micLang;
  const m = sessionMode();
  if (m && m.id === "interprete") return S.interpLang || m.lang || "fr";
  if (m && m.id === "prof_langue" && m.lang) return m.lang;
  if (m && m.id === "enseignant" && m.lang) return m.lang;
  if (S.lastLang) return S.lastLang;
  const st = S.status && S.status.voice_language;
  if (st && VOICE_LANGS[st]) return st;
  const nav = (navigator.language || "fr").slice(0, 2);
  return VOICE_LANGS[nav] ? nav : "fr";
}
function micLang() { return VOICE_LANGS[micLangCode()] || "fr-FR"; }
function say(key) { return SAY[key][micLangCode()] || SAY[key].fr; }
function voiceHint(t) { $("#voice-hint").textContent = t || ""; }

/* ---------------------------------------------------------------- écoute */
function listenOnce(opts = {}) {
  if (rec || recording) return;
  if (SR) {
    rec = new SR(); rec.lang = micLang(); rec.interimResults = true; rec.continuous = false;
    let final = "", heard = false;
    rec.onresult = (e) => { let interim = ""; heard = true; for (const r of e.results) (r.isFinal ? (final = r[0].transcript) : (interim += r[0].transcript)); input.value = final || interim; autosize(); jv("interim", input.value); };
    rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") voiceHint(e.error === "not-allowed" ? "Micro refusé (sur téléphone, il faut HTTPS)." : "Micro : " + e.error); };
    rec.onend = () => {
      $("#mic").setAttribute("aria-pressed", "false"); rec = null; voiceHint(S.wake ? "Mains libres actif." : "");
      const said = input.value.trim();
      if (!said) { jv("silence"); return; }
      if (S.jarvis && handleVoiceApproval(said)) { input.value = ""; autosize(); return; }
      if (opts.followUp && BYE_RE.test(said)) { input.value = ""; autosize(); jv("spoken"); if (S.jarvis) closeJarvis(); return; }
      if (STOP_RE.test(said)) { input.value = ""; autosize(); stopSpeaking(); jv("spoken"); return; }
      if (quickIntent(said)) { input.value = ""; autosize(); return; }
      const im = sessionMode();
      if (im && im.id === "interprete" && (!S.micLang || S.micLang === "auto")) S.interpLang = micLangCode() === im.lang ? im.lang2 : im.lang;
      jv("sent", said);
      sendMessage(undefined, { voice: true });
    };
    $("#mic").setAttribute("aria-pressed", "true"); voiceHint(say("listen") + ` (${micLangCode().toUpperCase()})`);
    jv("listen");
    try { rec.start(); } catch (e) { voiceHint(String(e)); rec = null; }
  } else if (navigator.mediaDevices && window.MediaRecorder) {
    recordAndTranscribe();
  } else voiceHint("Micro indisponible ici (utilise Chrome ou Edge, ou HTTPS sur téléphone, ou Telegram).");
}
$("#mic").addEventListener("click", () => {
  if (rec || recording) return stopListening();
  stopSpeaking();
  listenOnce();
});
function stopListening() {
  if (rec) { try { rec.stop(); } catch { /* déjà arrêté */ } }
  if (recording) recording.stop();
}
async function recordAndTranscribe() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const mr = new MediaRecorder(stream);
    recording = mr;
    mr.ondataavailable = (e) => chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recording = null; $("#mic").setAttribute("aria-pressed", "false"); voiceHint("Transcription…");
      const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
      try {
        const r = await api("/api/voice/transcribe", { body: blob, raw: true, headers: { "X-Filename": "voix." + (blob.type.includes("mp4") ? "m4a" : "webm"), "Content-Type": blob.type } });
        input.value = r.text; autosize(); voiceHint(""); if (r.text) sendMessage(undefined, { voice: true });
      } catch (err) { voiceHint(err.message); }
    };
    mr.start(); $("#mic").setAttribute("aria-pressed", "true"); voiceHint("J'enregistre… touche à nouveau pour envoyer.");
  } catch (err) { voiceHint("Micro : " + err.message); }
}

/* ---------------------------------------------------------------- parole */
const QUALITY = /natural|neural|online|premium|enhanced|google|siri/i;
function bestVoice(lang) {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
  if (!voices.length) return null;
  const pref = String(VOICE_LANGS[lang]).toLowerCase();
  const exact = (v) => (v.lang.replace("_", "-").toLowerCase() === pref ? 1 : 0);
  // d'abord l'accent choisi (en-GB, es-ES…), puis les voix les plus naturelles
  return voices.sort((a, b) => (exact(b) - exact(a)) || (QUALITY.test(b.name) - QUALITY.test(a.name)) || (b.localService - a.localService))[0];
}
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
function splitSentences(text) {
  return (String(text).match(/[^.!?…\n]+[.!?…]*[\s]*|\n+/g) || []).map((s) => s.trim()).filter((s) => s && /\w/.test(s));
}
let speakQueue = 0;
/** Lit un texte : chaque phrase avec la voix de sa langue. */
function speak(text, opts = {}) {
  if (!("speechSynthesis" in window) || !text) return;
  if (!opts.append) { speechSynthesis.cancel(); speakQueue = 0; }
  // en cours de langue : ni la section ✏️ Corrections ni les traductions entre parenthèses ne sont lues
  const m = sessionMode();
  const src = !opts.raw && m && m.id === "prof_langue" ? lessonText(text) : text;
  const clean = plain(src).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").slice(0, 4000);
  const base = opts.lang || micLangCode();
  let prev = base;
  for (const sentence of splitSentences(clean)) {
    const lang = opts.lang || detectLang(sentence, prev);
    prev = lang;
    const u = new SpeechSynthesisUtterance(sentence);
    u.lang = VOICE_LANGS[lang] || "fr-FR";
    const v = bestVoice(lang);
    if (v) u.voice = v;
    u.rate = opts.rate || S.voiceRate || 1;
    speakQueue++;
    S.speaking = true;
    u.onstart = () => jv("speak", sentence);
    u.onboundary = () => jv("boundary");
    u.onend = u.onerror = () => { speakQueue = Math.max(0, speakQueue - 1); if (!speakQueue) { S.speaking = false; jv("spoken"); afterSpeech(); } };
    speechSynthesis.speak(u);
  }
}
function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  speakQueue = 0; S.speaking = false; S.stream = null;
}
/** Conversation continue : quand ZEUS a fini de parler, il réécoute (sans mot d'éveil). */
function afterSpeech() {
  if (!S.converse || !S.followUp || S.runs.has(S.sid)) return;
  S.followUp = false;
  if (S.wake && wakeRec) { S.armedUntil = Date.now() + 9000; voiceHint(say("listen")); return; }
  setTimeout(() => listenOnce({ followUp: true }), 250);
}
/* lecture en direct pendant que la réponse s'écrit */
function streamSpeak(delta) {
  if (!S.stream) S.stream = { buf: "", pos: 0 };
  const st = S.stream;
  if (st.done) return;
  st.buf += delta;
  const cut = st.buf.indexOf("\u270F"); // section ✏️ Corrections : on ne la lit pas
  if (cut >= 0 && sessionMode() && sessionMode().id === "prof_langue") {
    const tail = st.buf.slice(st.pos, cut);
    st.done = true;
    if (tail.trim()) speak(tail, { append: true });
    return;
  }
  const rest = st.buf.slice(st.pos);
  if (/```/.test(rest) && (rest.match(/```/g) || []).length % 2) return; // bloc de code pas encore fermé
  const m = rest.match(/^[\s\S]*[.!?…:](\s|$)|^[\s\S]*\n/);
  if (!m || m[0].trim().length < 2) return;
  st.pos += m[0].length;
  speak(m[0], { append: true });
}
function streamFinish(finalText) {
  const st = S.stream;
  S.stream = null;
  if (st && st.done) return;
  if (!st || !st.pos) return speak(finalText, { append: true });
  let rest = finalText && finalText.length > st.pos ? finalText.slice(st.pos) : "";
  if (sessionMode() && sessionMode().id === "prof_langue") rest = rest.split("\u270F")[0];
  if (rest.trim()) speak(rest, { append: true });
}
$("#opt-tts").addEventListener("change", (e) => { S.tts = e.target.checked; store.set("tts", S.tts); if (!S.tts) stopSpeaking(); });
$("#opt-wake").addEventListener("change", (e) => { S.wake = e.target.checked; store.set("wake", S.wake); S.wake ? startWake() : stopWake(); });
$("#opt-converse").addEventListener("change", (e) => { S.converse = e.target.checked; store.set("converse", S.converse); });
$("#opt-lang").addEventListener("change", (e) => {
  S.micLang = e.target.value; store.set("micLang", S.micLang);
  if (S.wake) startWake();
  voiceHint(`Micro : ${S.micLang === "auto" ? "langue automatique (" + micLangCode().toUpperCase() + ")" : micLangCode().toUpperCase()}`);
});
function startWake() {
  if (!SR) { voiceHint("Mains libres : nécessite Chrome ou Edge."); $("#opt-wake").checked = false; return; }
  stopWake();
  const word = ((S.status && S.status.wake_word) || "zeus").toLowerCase();
  wakeRec = new SR(); wakeRec.lang = micLang(); wakeRec.continuous = true; wakeRec.interimResults = false;
  wakeRec.onresult = (e) => {
    const r = e.results[e.results.length - 1];
    const said = r[0].transcript.trim();
    const low = said.toLowerCase();
    if (S.speaking) { // pendant que ZEUS parle, on n'écoute que l'ordre de se taire (sinon il s'entendrait lui-même)
      if (STOP_RE.test(low.replace(word, "").trim()) || low.trim() === word) { stopSpeaking(); voiceHint("Mains libres actif."); }
      return;
    }
    const i = low.indexOf(word);
    if (i >= 0) {
      const cmd = said.slice(i + word.length).replace(/^[\s,.:!?]+/, "");
      if (cmd.length > 2) { S.armedUntil = 0; if (!quickIntent(cmd)) sendMessage(cmd, { voice: true, keepInput: true }); }
      else { S.armedUntil = Date.now() + 9000; speak(say("yes")); voiceHint(say("listen")); }
    } else if (S.armedUntil > Date.now() && said.length > 2) {
      S.armedUntil = 0;
      if (BYE_RE.test(said)) { voiceHint("Mains libres actif."); return; }
      if (!quickIntent(said)) sendMessage(said, { voice: true, keepInput: true }); voiceHint("Mains libres actif.");
    }
  };
  wakeRec.onend = () => { if (S.wake) setTimeout(() => { try { wakeRec && wakeRec.start(); } catch { /* relance */ } }, 400); };
  wakeRec.onerror = (e) => { if (e.error === "not-allowed") { voiceHint("Micro refusé."); S.wake = false; $("#opt-wake").checked = false; } };
  try { wakeRec.start(); voiceHint(`Mains libres actif : dis « ${word} … » (${micLangCode().toUpperCase()}).`); } catch { /* déjà actif */ }
}
function stopWake() { if (wakeRec) { const w = wakeRec; wakeRec = null; try { w.stop(); } catch { /* */ } } voiceHint(""); }

/* ================================================================ rôles */
const LANG_FLAG = { fr: "FR", en: "EN", es: "ES", de: "DE" };  // codes plutôt que drapeaux : Windows n'affiche pas les drapeaux emoji
function modeValue(m) {
  if (!m || !m.id) return "assistant";
  if (m.id === "interprete") return `interprete:${m.lang || "fr"}-${m.lang2 || "en"}`;
  return m.id === "prof_langue" ? `prof_langue:${m.lang || "en"}` : m.id;
}
function modeFromValue(v) {
  if (v.startsWith("prof_langue:")) return { id: "prof_langue", lang: v.split(":")[1] };
  if (v.startsWith("interprete:")) { const [a, b] = v.split(":")[1].split("-"); return { id: "interprete", lang: a, lang2: b }; }
  if (v === "enseignant") {
    const subject = prompt("Quelle matière ? (ex. maths, physique, histoire, programmation Python…)", "");
    if (subject === null) return null;
    const level = prompt("Quel niveau ? (ex. 3e, terminale, licence 1 — facultatif)", "") || "";
    return { id: "enseignant", subject: subject || "toutes matières", level };
  }
  return { id: v };
}
function renderRole() {
  const s = S.session;
  const wrap = $("#role-wrap");
  wrap.hidden = !!(s && s.trust === "external");
  if (wrap.hidden) return;
  const sel = $("#role-select");
  const m = sessionMode();
  const v = modeValue(m);
  const opt = sel.querySelector('option[value="enseignant"]');
  if (opt) opt.textContent = m && m.id === "enseignant" ? `Tuteur — ${m.subject || "toutes matières"}` : "Tuteur (toute matière)…";
  sel.value = v;
}
$("#role-select").addEventListener("change", async (e) => {
  const m = modeFromValue(e.target.value);
  if (!m) { renderRole(); return; }
  if (!S.sid || !S.session) { S.pendingMode = m; renderRole(); toast(roleToast(m), "success", 3000); return; }
  try {
    const r = await api(`/api/sessions/${S.sid}`, { method: "PATCH", body: { mode: m } });
    if (r.session) S.session = r.session;
    S.interpLang = "";
    renderRole();
    renderMessages();
    toast(roleToast(m), "success", 3000);
    if (S.wake) startWake();
  } catch (err) { toast(err.message, "error"); }
});
function roleToast(m) {
  if (m.id === "prof_langue") return `${({ fr: "Professeur de français", en: "Professeur d'anglais", es: "Professeur d'espagnol", de: "Professeur d'allemand" })[m.lang] || "Professeur de langue"} : écris ou parle, je te corrige.`;
  if (m.id === "enseignant") return `Enseignant — ${m.subject || "toutes matières"}.`;
  if (m.id === "secretaire") return "Secrétaire : agenda, courrier, contacts, tâches, factures.";
  if (m.id === "formateur") return "Assistant pédagogique : séances, exercices, QCM, corrections, appréciations.";
  if (m.id === "dirigeant") return "Bras droit : décisions, stratégie, réunions, chiffres.";
  if (m.id === "rh") return "RH : recrutement équitable, intégration, entretiens, documents.";
  if (m.id === "chercheur") return "Assistant de recherche : bibliographie sourcée, méthode, données, rédaction.";
  if (m.id === "interprete") return `Interprète ${LANG_FLAG[m.lang] || ""} ↔ ${LANG_FLAG[m.lang2] || ""} : parle, je traduis dans l'autre langue.`;
  return "Assistant expert.";
}
/** Ouvre une nouvelle conversation dans un rôle donné et lance la première demande. */
async function startRoleSession(mode, text) {
  S.sid = null; store.set("sid", null); S.session = null; S.messages = []; S.pendingBrain = "";
  S.pendingMode = mode;
  if (location.hash !== "#chat") location.hash = "#chat"; else renderMessages();
  setTimeout(() => sendMessage(text), 150);
}

/** Un seul gestionnaire de fermeture pour la boîte de dialogue partagée (sinon un ancien choix se rejouerait). */
function onDialogClose(fn) { const d = $("#dialog"); d.onclose = () => { d.onclose = null; fn(d.returnValue); }; }
/* ================================================================ apprendre */
let learnState = { deck: "", queue: [], shown: false, after: "", data: null };
const LANG_NAMES = { fr: "français", en: "anglais", es: "espagnol", de: "allemand" };
const COURSE_START = {
  en: "Je veux apprendre l'anglais. Évalue mon niveau puis commençons.",
  es: "Quiero aprender español. Évalue mon niveau puis commençons.",
  de: "Ich möchte Deutsch lernen. Évalue mon niveau puis commençons.",
  fr: "I want to learn French. Assess my level and let's start.",
};
function lastLearnLang() {
  const d = learnState.data;
  const fromErr = d && d.errors && d.errors[0] && d.errors[0].lang;
  const fromDeck = d && d.decks && (d.decks.find((x) => x.due) || d.decks[0] || {}).lang;
  return store.get("learnLang", "") || fromErr || fromDeck || "en";
}
function askLang(title, dflt) {
  return new Promise((resolve) => {
    const f = $("#dialog-form");
    f.innerHTML = "";
    let picked = null;
    f.append(h("h3", {}, title), h("div", { class: "row wrap gap" }, Object.entries(LANG_NAMES).map(([k, v]) =>
      h("button", { class: "btn" + (k === dflt ? " bolt" : ""), value: k, onclick: () => { picked = k; } }, `${LANG_FLAG[k]} ${v[0].toUpperCase() + v.slice(1)}`))),
      h("div", { class: "dialog-actions" }, h("button", { class: "btn ghost", value: "cancel" }, "Annuler")));
    onDialogClose(() => resolve(picked));
    $("#dialog").showModal();
  });
}
async function startCourse(lang, extra = {}, text = "") {
  store.set("learnLang", lang);
  const known = learnState.data && learnState.data.levels && learnState.data.levels[lang];
  const lvl = extra.level || (known && known.level) || "";
  const start = text || (lvl ? COURSE_LEVEL_START(lang, lvl) : COURSE_START[lang]);
  startRoleSession({ id: "prof_langue", lang, ...(lang === "fr" ? { native: "en" } : {}), ...(lvl ? { level: lvl } : {}), ...extra }, start);
}
function COURSE_LEVEL_START(lang, lvl) {
  return ({ en: `Je veux apprendre l'anglais. Mon test de niveau donne ${lvl} : commençons à ce niveau.`,
    es: `Quiero aprender español. Mon test de niveau donne ${lvl} : commençons à ce niveau.`,
    de: `Ich möchte Deutsch lernen. Mon test de niveau donne ${lvl} : commençons à ce niveau.`,
    fr: `I want to learn French. My placement test says ${lvl}: let's start at that level.` })[lang];
}

/* ---------------------------------------------------------------- test de niveau adaptatif */
const SKILL_LABEL = { grammaire: "Grammaire", vocabulaire: "Vocabulaire" };
async function startPlacement(lang) {
  lang = lang || await askLang("Test de niveau — quelle langue ?", lastLearnLang());
  if (!lang) return;
  let v;
  try { v = await api("/api/learn/placement", { body: { lang } }); } catch (err) { toast(err.message, "error"); return; }
  const d = $("#dialog");
  d.classList.add("placement-dialog");
  onDialogClose(() => { d.classList.remove("placement-dialog"); if (S.view === "apprendre") loadLearn(); });
  renderPlacement(v);
  if (!d.open) d.showModal();
}
function renderPlacement(v, feedback) {
  const f = $("#dialog-form");
  f.innerHTML = "";
  const lang = v.lang;
  const head = h("div", { class: "row between" }, h("h3", {}, `Test de niveau — ${LANG_NAMES[lang]}`),
    h("button", { class: "icon-btn", value: "close", "aria-label": "Fermer" }, "✕"));
  f.append(head);
  if (v.result) return renderPlacementResult(f, v);
  const pct = Math.round((v.n / v.max) * 100);
  f.append(h("div", { class: "pl-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(v.max), "aria-valuenow": String(v.n), "aria-label": "Avancement du test" }, h("i", { style: `width:${pct}%` })),
    h("p", { class: "muted small" }, `Question ${v.n + 1} · le test s'adapte à tes réponses (10 à ${v.max} questions)` + (v.estimate ? ` · estimation actuelle : ${v.estimate}` : "")));
  if (feedback) f.append(h("div", { class: "pl-feedback " + (feedback.ok ? "ok" : "ko"), role: "status" },
    h("strong", {}, feedback.ok ? "Exact. " : `Non : « ${feedback.correct} ». `), feedback.explanation));
  const q = v.question;
  f.append(h("p", { class: "pl-skill small" }, SKILL_LABEL[q.skill] || q.skill),
    h("p", { class: "pl-prompt", lang: lang }, q.prompt, " ",
      h("button", { type: "button", class: "icon-btn", title: "Écouter", "aria-label": "Écouter la phrase", onclick: () => speak(q.prompt.replace(/_{2,}/g, "…"), { raw: true, lang }) }, "🔊")));
  const opts = h("div", { class: "pl-options" });
  q.options.forEach((o, i) => opts.append(h("button", { type: "button", class: "btn pl-opt", lang: lang, onclick: async (e) => {
    for (const b of $$(".pl-opt", opts)) b.disabled = true;
    e.currentTarget.classList.add("picked");
    let r;
    try { r = await api(`/api/learn/placement/${v.id}`, { body: { choice: i } }); } catch (err) { toast(err.message, "error"); for (const b of $$(".pl-opt", opts)) b.disabled = false; return; }
    renderPlacement(r, r.feedback);
  } }, `${"ABCD"[i]}. ${o}`)));
  f.append(opts, h("p", { class: "muted small" }, "Tu ne sais pas ? Choisis au hasard plutôt que de chercher : le test en tient compte."));
  const first = $(".pl-opt", opts);
  if (first) setTimeout(() => first.focus(), 30);
}
function renderPlacementResult(f, v) {
  const r = v.result;
  if (v.feedback) f.append(h("div", { class: "pl-feedback " + (v.feedback.ok ? "ok" : "ko") }, h("strong", {}, v.feedback.ok ? "Exact. " : `Non : « ${v.feedback.correct} ». `), v.feedback.explanation));
  const bars = h("div", { class: "pl-levels" }, ["A1", "A2", "B1", "B2", "C1", "C2"].map((L) => {
    const x = r.by_level[L];
    return h("div", { class: "pl-lv" + (L === r.level ? " on" : "") }, h("strong", {}, L), h("span", { class: "muted small" }, x ? `${x[0]}/${x[1]}` : "—"));
  }));
  appendAll(f, h("div", { class: "pl-result" }, h("span", { class: "pl-badge" }, r.level), h("div", {},
      h("strong", {}, `Niveau ${r.level} (${r.position} du niveau)`), h("p", { class: "small" }, r.description))),
    bars,
    h("p", { class: "small" }, `${r.correct} bonne${r.correct > 1 ? "s" : ""} réponse${r.correct > 1 ? "s" : ""} sur ${r.total}. ` + Object.entries(r.by_skill).map(([k, [ok, n]]) => `${SKILL_LABEL[k] || k} : ${ok}/${n}`).join(" · ")
      + (r.weak.length ? ` — à travailler en priorité : ${r.weak.join(", ")}.` : "")),
    h("p", { class: "muted small" }, r.note),
    h("div", { class: "dialog-actions" },
      h("button", { class: "btn ghost", value: "close" }, "Fermer"),
      h("button", { type: "button", class: "btn", onclick: () => { $("#dialog").close(); startPlacement(v.lang); } }, "Refaire le test"),
      h("button", { type: "button", class: "btn bolt", onclick: () => { $("#dialog").close();
        startCourse(v.lang, { level: r.level }, COURSE_LEVEL_START(v.lang, r.level) + (r.weak.length ? ` Point faible repéré : ${r.weak.join(", ")}.` : "")); } }, `Commencer le cours ${r.level}`)));
}
function renderLevels(levels) {
  const box = $("#learn-levels");
  if (!box) return;
  box.innerHTML = "";
  const entries = Object.entries(levels || {});
  if (!entries.length) return;
  box.append(h("span", { class: "muted small" }, "Mes niveaux :"));
  for (const [lang, x] of entries) box.append(h("button", { type: "button", class: "chip", title: `Test du ${fmtTime(x.ts)} — clique pour reprendre le cours à ce niveau`, onclick: () => startCourse(lang, { level: x.level }) }, `${LANG_FLAG[lang] || lang} ${x.level}`));
}
async function pickScenario() {
  const lang = await askLang("Jeu de rôle — dans quelle langue ?", lastLearnLang());
  if (!lang) return;
  const list = (learnState.data && learnState.data.scenarios) || [];
  const f = $("#dialog-form");
  f.innerHTML = "";
  let picked = null;
  const custom = h("input", { placeholder: "Ou invente ta scène (ex. Tu es un douanier, je passe la frontière)" });
  f.append(h("h3", {}, `Jeu de rôle en ${LANG_NAMES[lang]}`),
    h("div", { class: "scenario-list" }, list.map((s) => h("button", { class: "btn scenario", value: "ok", onclick: () => { picked = s; } }, h("strong", {}, s.title), h("span", { class: "muted small" }, s.detail)))),
    custom,
    h("div", { class: "dialog-actions" }, h("button", { class: "btn ghost", value: "cancel" }, "Annuler"),
      h("button", { class: "btn bolt", value: "ok", onclick: () => { if (custom.value.trim()) picked = { title: custom.value.trim(), detail: "" }; } }, "Jouer")));
  onDialogClose(() => {
    if (!picked) return;
    startCourse(lang, { activity: "jeu_de_role", scenario: picked.title }, `Jouons la scène « ${picked.title} ». ${picked.detail} Commence, tu joues ton personnage.`);
  });
  $("#dialog").showModal();
}
async function pickChallenge() {
  const cats = (learnState.data && learnState.data.categories) || [];
  if (!cats.length) { toast("Pas encore d'erreurs enregistrées : fais d'abord une conversation avec ton prof, je repérerai tes points faibles.", "info", 6000); return; }
  const f = $("#dialog-form");
  f.innerHTML = "";
  let picked = null;
  f.append(h("h3", {}, "Défi — quelle faiblesse retravailler ?"),
    h("div", { class: "scenario-list" }, cats.slice(0, 12).map((c) => h("button", { class: "btn scenario", value: "ok", onclick: () => { picked = c; } },
      h("strong", {}, `${LANG_FLAG[c.lang] || ""} ${c.category}`), h("span", { class: "muted small" }, `${c.n} erreur(s)`)))),
    h("div", { class: "dialog-actions" }, h("button", { class: "btn ghost", value: "cancel" }, "Annuler")));
  onDialogClose(() => { if (picked) startCourse(picked.lang, { activity: "defi", defi: picked.category }, `Défi : fais-moi travailler « ${picked.category} », une question à la fois, de plus en plus difficile.`); });
  $("#dialog").showModal();
}
async function startStudySession() {
  const lang = lastLearnLang();
  const due = learnState.queue.length;
  if (due) {
    learnState.after = lang;
    $("#learn-card").scrollIntoView({ behavior: "smooth", block: "center" });
    toast(`Commence par tes ${due} carte(s) à revoir, ensuite on parle ${LANG_NAMES[lang]}.`, "info", 5000);
    return;
  }
  startCourse(lang, {}, "Commençons ma séance du jour. Pose-moi une question à mon niveau sur un sujet qui m'intéresse.");
}
function renderGoals(st) {
  const box = $("#learn-goals");
  box.innerHTML = "";
  if (!st || !st.goals || !st.goals.length) return;
  box.append(h("strong", { class: "small" }, st.goals_done ? "Objectifs du jour atteints !" : "Objectifs du jour"));
  for (const g of st.goals) {
    const pct = Math.min(100, Math.round((g.value / g.target) * 100));
    box.append(h("div", { class: "goal" + (g.done ? " done" : "") }, h("span", {}, (g.done ? "" : "") + g.label),
      h("span", { class: "bar" }, h("i", { style: `width:${pct}%` })), h("span", { class: "muted small" }, `${String(g.value).replace(".", ",")} / ${g.target}`)));
  }
}
function renderLearnStats(st) {
  renderGoals(st);
  const box = $("#learn-stats");
  box.innerHTML = "";
  if (!st) return;
  const t = st.today || {};
  const maxv = Math.max(1, ...st.week.map((d) => d.speak_min + d.cards / 4 + d.msgs / 2 + d.ex));
  box.append(
    h("span", { class: "stat", title: "Jours d'affilée avec au moins une activité" }, `${st.streak} jour${st.streak > 1 ? "s" : ""}`),
    h("span", { class: "stat", title: "Minutes parlées aujourd'hui (exercices de prononciation)" }, `${String(t.speak_min).replace(".", ",")} min`),
    h("span", { class: "stat", title: "Cartes revues aujourd'hui" }, `🃏 ${t.cards}`),
    h("span", { class: "stat", title: "Messages corrigés aujourd'hui" }, `${t.msgs}`),
    h("span", { class: "week", title: "Activité des 7 derniers jours" }, st.week.map((d) => {
      const v = d.speak_min + d.cards / 4 + d.msgs / 2 + d.ex;
      return h("i", { style: `height:${Math.max(3, Math.round((v / maxv) * 22))}px`, class: v ? "on" : "" });
    })));
}
async function loadLearn() {
  const box = $("#learn-start");
  box.innerHTML = "";
  for (const k of ["en", "es", "de", "fr"]) box.append(h("button", { type: "button", class: "btn", onclick: () => startCourse(k) }, `Cours ${({ en: "d'anglais", es: "d'espagnol", de: "d'allemand", fr: "de français" })[k]}`));
  box.append(
    h("button", { type: "button", class: "btn", onclick: pickScenario }, "Jeu de rôle"),
    h("button", { type: "button", class: "btn", onclick: pickChallenge }, "Défi sur mes faiblesses"),
    h("button", { type: "button", class: "btn", onclick: async () => { const l = await askLang("Conversation libre — dans quelle langue ?", lastLearnLang()); if (l) startCourse(l, {}, "Faisons une conversation libre pour pratiquer. Lance un sujet qui m'intéresse, adapte-toi à mon niveau et corrige-moi."); } }, "Conversation libre"),
    h("button", { type: "button", class: "btn", onclick: () => { const m = modeFromValue("enseignant"); if (m) startRoleSession(m, `Aide-moi à réviser : ${m.subject}${m.level ? " (niveau " + m.level + ")" : ""}. Commence par vérifier ce que je sais.`); } }, "Réviser une matière"));
  let data;
  try { data = await api("/api/learn" + (learnState.deck ? "?deck=" + encodeURIComponent(learnState.deck) : "")); } catch (err) { toast(err.message, "error"); return; }
  learnState.data = data;
  renderLearnStats(data.stats);
  renderLevels(data.levels);
  $("#learn-anki").href = "/api/learn/export" + (learnState.deck ? "?deck=" + encodeURIComponent(learnState.deck) : "");
  const decks = $("#learn-decks");
  decks.innerHTML = "";
  decks.append(h("button", { type: "button", class: "chip" + (!learnState.deck ? " active" : ""), onclick: () => { learnState.deck = ""; loadLearn(); } }, `Tous (${data.decks.reduce((n, d) => n + (d.due || 0), 0)} à revoir)`));
  for (const d of data.decks) decks.append(h("button", { type: "button", class: "chip" + (learnState.deck === d.deck ? " active" : ""), onclick: () => { learnState.deck = d.deck; loadLearn(); } },
    `${LANG_FLAG[d.lang] || ""} ${d.deck} · ${d.due || 0}/${d.total}${d.mastered ? " · ✅ " + d.mastered : ""}`));
  if (!data.decks.length) decks.append(h("p", { class: "muted small" }, "Aucune carte pour l'instant. Pendant un cours, ZEUS ajoute tout seul le vocabulaire nouveau et tes erreurs à retravailler — ou ajoute des cartes ci-dessous."));
  learnState.queue = data.due;
  learnState.shown = false;
  renderCard();
  const errs = $("#learn-errors");
  errs.innerHTML = "";
  if (!data.errors.length) errs.append(h("p", { class: "muted small" }, "Ton journal d'erreurs se remplit pendant les cours : chaque correction vérifiée y est rangée, et une erreur qui revient remonte en révision."));
  for (const e of data.errors) errs.append(h("div", { class: "item err-item" },
    h("div", { class: "top" }, h("span", {}, h("s", {}, e.error), " → ", h("strong", {}, e.correction)),
      h("button", { type: "button", class: "icon-btn", title: "Retirer du journal", onclick: async () => { await api(`/api/learn/errors/${e.id}`, { method: "DELETE" }); loadLearn(); } }, "✕")),
    h("div", { class: "meta" }, [`${LANG_FLAG[e.lang] || ""} ${e.category}`, e.count > 1 ? `${e.count} fois` : "", e.verified ? "vérifiée" : "", e.rule].filter(Boolean).join(" · "))));
  const prog = $("#learn-progress");
  prog.innerHTML = "";
  if (!data.progress.length) prog.append(h("p", { class: "muted small" }, "Les résultats des tests, quiz, dictées et exercices de prononciation apparaîtront ici."));
  for (const p of data.progress.slice(0, 15)) prog.append(h("div", { class: "item" },
    h("div", { class: "top" }, h("strong", {}, `${p.subject} — ${p.topic}`), h("span", { class: "meta" }, (p.score != null ? Math.round(p.score) + "/100 · " : "") + fmtTime(p.ts))),
    p.notes ? h("div", { class: "meta" }, p.notes) : null));
  for (const sel of $$("#view-apprendre [data-accent]")) sel.value = VOICE_LANGS[sel.dataset.accent];
}
function renderCard() {
  const box = $("#learn-card");
  box.innerHTML = "";
  const c = learnState.queue[0];
  if (!c) {
    box.append(h("p", { class: "muted" }, "Rien à réviser pour le moment."));
    if (learnState.after) {
      const lang = learnState.after;
      box.append(h("button", { type: "button", class: "btn bolt", onclick: () => { learnState.after = ""; startCourse(lang, {}, "J'ai fini mes cartes. Continuons la séance : pose-moi une question à mon niveau."); } }, `▶️ Continuer en ${LANG_NAMES[lang] || lang}`));
    }
    return;
  }
  const speakBtn = (txt) => h("button", { type: "button", class: "icon-btn", title: "Écouter", onclick: () => speak(txt.replace(/^✏️\s*/, ""), { raw: true, lang: c.lang || detectLang(txt, "en") }) }, "🔊");
  box.append(
    h("div", { class: "meta" }, `${LANG_FLAG[c.lang] || ""} ${c.deck} · ${learnState.queue.length} carte(s) restante(s)`),
    h("div", { class: "flash-front" }, c.front.startsWith("✏️") ? h("span", { class: "muted small", style: "display:block;width:100%" }, "Corrige cette phrase :") : null, c.front.replace(/^✏️\s*/, ""), " ", speakBtn(c.front)));
  if (!learnState.shown) {
    box.append(h("button", { type: "button", class: "btn bolt", onclick: () => { learnState.shown = true; renderCard(); } }, "Voir la réponse"));
    return;
  }
  appendAll(box, h("div", { class: "flash-back" }, c.back),
    c.example ? h("div", { class: "flash-ex" }, "« ", c.example, " » ", speakBtn(c.example)) : null,
    h("div", { class: "row wrap gap" }, [["oubli", "À revoir"], ["difficile", "Difficile"], ["bien", "Bien"], ["facile", "Facile"]].map(([g, label]) =>
      h("button", { type: "button", class: "btn" + (g === "bien" ? " bolt" : ""), onclick: async () => {
        try { await api("/api/learn/grade", { body: { id: c.id, grade: g } }); } catch (err) { toast(err.message, "error"); return; }
        learnState.queue.shift();
        if (g === "oubli") learnState.queue.push(c);
        learnState.shown = false;
        renderCard();
      } }, label))),
    h("button", { type: "button", class: "btn ghost small", onclick: async () => { if (!confirm("Supprimer cette carte ?")) return; await api(`/api/learn/cards/${c.id}`, { method: "DELETE" }); learnState.queue.shift(); learnState.shown = false; renderCard(); } }, "Supprimer la carte"));
}
$("#card-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { deck: $("#card-deck").value.trim() || "général", front: $("#card-front").value.trim(), back: $("#card-back").value.trim(), example: $("#card-example").value.trim(), lang: $("#card-lang").value };
  try { await api("/api/learn/cards", { body }); } catch (err) { toast(err.message, "error"); return; }
  $("#card-front").value = ""; $("#card-back").value = ""; $("#card-example").value = "";
  toast("Carte ajoutée.", "success", 2000);
  await loadLearn();
});
$("#learn-session").addEventListener("click", startStudySession);
$("#learn-pron").addEventListener("click", () => openPractice({ lang: lastLearnLang() }));
$("#learn-dictee").addEventListener("click", () => openPractice({ lang: lastLearnLang(), mode: "dictee" }));
$("#learn-placement").addEventListener("click", () => startPlacement());
for (const sel of $$("#view-apprendre [data-accent]")) sel.addEventListener("change", () => { S.accent = { ...(S.accent || {}), [sel.dataset.accent]: sel.value }; store.set("accent", S.accent); toast("Accent enregistré.", "success", 1500); });

/* ================================================================ agenda / secrétariat */
async function loadAgenda() {
  let d;
  try { d = await api("/api/office"); } catch (err) { toast(err.message, "error"); return; }
  const ev = $("#agenda-events");
  ev.innerHTML = "";
  if (!d.events.length) ev.append(h("p", { class: "muted small" }, "Aucun rendez-vous dans les 31 prochains jours. Dis par exemple : « Ajoute réunion budget jeudi à 10h avec Paul »."));
  let lastDay = "";
  for (const e of d.events) {
    const day = new Date(e.start * 1000).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    if (day !== lastDay) { ev.append(h("div", { class: "session-group" }, day)); lastDay = day; }
    const hm = (t) => new Date(t * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const allday = e.end - e.start >= 86400 - 60 && new Date(e.start * 1000).getHours() === 0;
    ev.append(h("div", { class: "item" + (e.source ? " ext" : "") },
      h("div", { class: "top" }, h("strong", {}, e.title), h("span", { class: "meta" }, allday ? "toute la journée" : `${hm(e.start)} – ${hm(e.end)}`)),
      e.location || e.attendees ? h("div", { class: "meta" }, [e.location ? "" + e.location : "", e.attendees ? "" + e.attendees : ""].filter(Boolean).join(" · ")) : null,
      e.notes ? h("div", { class: "meta" }, e.notes.length > 220 ? e.notes.slice(0, 217) + "…" : e.notes) : null,
      e.source ? h("div", { class: "meta src" }, `Depuis ${e.source_name} (lecture seule)`)
        : h("div", { class: "row wrap gap" },
          h("a", { class: "btn ghost small", href: e.google, target: "_blank", rel: "noopener", title: "Ajouter à Google Agenda" }, "+ Google"),
          h("a", { class: "btn ghost small", href: e.outlook, target: "_blank", rel: "noopener", title: "Ajouter à Outlook" }, "+ Outlook"),
          h("button", { type: "button", class: "btn ghost small", onclick: async () => { if (confirm("Supprimer ce rendez-vous ?")) { await api(`/api/office/events/${e.id}`, { method: "DELETE" }); loadAgenda(); } } }, "Supprimer"))));
  }
  const td = $("#agenda-todos");
  td.innerHTML = "";
  const now = Date.now() / 1000;
  if (!d.todos.length) td.append(h("p", { class: "muted small" }, "Aucune tâche en cours. 🎉"));
  for (const t of [...d.todos, ...d.done.slice(0, 5)]) {
    const cb = h("input", { type: "checkbox", checked: !!t.done, "aria-label": "Fait", onchange: async () => { await api(`/api/office/todos/${t.id}`, { body: { done: cb.checked } }); loadAgenda(); } });
    td.append(h("div", { class: "item todo" + (t.done ? " done" : "") },
      h("div", { class: "top" }, h("label", { class: "row gap" }, cb, h("span", {}, `${({ 1: "🔴", 2: "🟡", 3: "⚪" })[t.priority] || ""} ${t.text}`)),
        h("button", { type: "button", class: "icon-btn", title: "Supprimer", onclick: async () => { await api(`/api/office/todos/${t.id}`, { method: "DELETE" }); loadAgenda(); } }, "✕")),
      t.due || t.project ? h("div", { class: "meta" + (t.due && t.due < now && !t.done ? " error-text" : "") }, [t.project ? "[" + t.project + "]" : "", t.due ? "pour " + fmtTime(t.due) : ""].filter(Boolean).join(" ")) : null));
  }
  const ct = $("#agenda-contacts");
  const q = ($("#contact-search").value || "").toLowerCase();
  ct.innerHTML = "";
  const list = d.contacts.filter((c) => !q || JSON.stringify(c).toLowerCase().includes(q));
  if (!list.length) ct.append(h("p", { class: "muted small" }, d.contacts.length ? "Aucun résultat." : "Carnet vide. Dis par exemple : « Enregistre Paul Mbala, comptable, 0812345678, paul@exemple.com »."));
  for (const c of list) ct.append(h("div", { class: "item" },
    h("div", { class: "top" }, h("strong", {}, c.name), h("span", { class: "meta" }, [c.company, c.role].filter(Boolean).join(" · "))),
    h("div", { class: "meta" }, [c.phone ? "" + c.phone : "", c.email ? "" + c.email : "", c.address ? "" + c.address : ""].filter(Boolean).join("  ")),
    c.notes ? h("div", { class: "meta" }, c.notes) : null,
    h("button", { type: "button", class: "btn ghost small", onclick: async () => { if (confirm(`Supprimer ${c.name} ?`)) { await api(`/api/office/contacts/${c.id}`, { method: "DELETE" }); loadAgenda(); } } }, "Supprimer")));
  loadCalendars();
}
$("#contact-search").addEventListener("input", () => debounce("contacts", loadAgenda, 250));
async function loadCalendars() {
  let c;
  try { c = await api("/api/calendar"); } catch (err) { return; }
  const box = $("#cal-feeds");
  box.innerHTML = "";
  if (!c.feeds.length) box.append(h("p", { class: "muted small" }, "Aucun agenda branché."));
  for (const f of c.feeds) {
    const st = f.status || {};
    box.append(h("div", { class: "item" },
      h("div", { class: "top" }, h("strong", {}, `${f.name}`), h("span", { class: "meta" }, f.provider)),
      h("div", { class: "meta" + (st.ok === false ? " error-text" : "") }, st.ok ? `${st.events} rendez-vous · synchronisé ${fmtTime(st.ts)}` + (f.remind ? ` · rappel ${f.remind} min avant` : "")
        : st.error ? `Erreur : ${st.error}` : "En attente de synchronisation"),
      h("button", { type: "button", class: "btn ghost small", onclick: async () => { if (!confirm(`Débrancher « ${f.name} » ? Ses rendez-vous disparaîtront de ZEUS (pas de ton agenda).`)) return; await api(`/api/calendar/feeds/${f.id}`, { method: "DELETE" }); loadAgenda(); } }, "Débrancher")));
  }
  const fu = $("#cal-feed-url");
  fu.innerHTML = "";
  fu.append("Dans l'autre sens : un téléphone (ICSx⁵ sur Android), Thunderbird ou Outlook sur ton réseau peut s'abonner à l'agenda de ZEUS avec ce lien privé : ",
    h("code", {}, c.feed_url), " ", h("button", { type: "button", class: "btn ghost small", onclick: () => { navigator.clipboard.writeText(c.feed_url).then(() => toast("Lien copié.", "success", 1500)); } }, "Copier"));
}
$("#cal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter || $("#cal-form .btn.bolt");
  btn.disabled = true;
  try {
    const r = await api("/api/calendar/feeds", { body: { url: $("#cal-url").value.trim(), name: $("#cal-name").value.trim(), remind: +$("#cal-remind").value } });
    toast(`Agenda branché : ${r.status.events} rendez-vous importés.`, "success");
    $("#cal-url").value = ""; $("#cal-name").value = "";
    loadAgenda();
  } catch (err) { toast(err.message, "error", 9000); } finally { btn.disabled = false; }
});
$("#cal-sync").addEventListener("click", async () => {
  try { const r = await api("/api/calendar/sync", { body: {} }); toast(r.results.length ? r.results.map((x) => x.ok ? `${x.name} : ${x.events} rdv` : `${x.name} : erreur`).join(" · ") : "Aucun agenda branché.", "info"); } catch (err) { toast(err.message, "error"); }
  loadAgenda();
});

/* ================================================================ mes documents (bibliothèque) */
const kbState = { q: "", data: null };
function renderKbState(st) {
  const el = $("#kb-state");
  if (!el) return;
  if (st && st.running) el.textContent = `Indexation en cours : ${st.done || 0} / ${st.total || 0} fichiers${st.current ? " — " + st.current : ""}`;
  else if (kbState.data && kbState.data.last) {
    const l = kbState.data.last;
    el.textContent = `Dernière mise à jour ${fmtTime(l.ts)} : ${l.new || 0} nouveau(x), ${l.updated || 0} modifié(s), ${l.removed || 0} retiré(s). Mise à jour automatique toutes les 30 minutes.`;
  } else el.textContent = "";
}
function kbHighlight(text, terms) {
  const frag = document.createDocumentFragment();
  if (!terms || !terms.length) { frag.append(text); return frag; }
  const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const low = fold(text);
  let i = 0;
  const marks = [];
  for (const t of terms) { let k = low.indexOf(t); while (k >= 0) { marks.push([k, k + t.length]); k = low.indexOf(t, k + t.length); } }
  marks.sort((a, b) => a[0] - b[0]);
  for (const [a, b] of marks) { if (a < i) continue; let e = b; while (e < text.length && /[\p{L}\p{N}]/u.test(text[e])) e++; frag.append(text.slice(i, a), h("mark", {}, text.slice(a, e))); i = e; }
  frag.append(text.slice(i));
  return frag;
}
async function loadDocuments() {
  let d;
  try { d = await api("/api/kb" + (kbState.filter ? "?q=" + encodeURIComponent(kbState.filter) : "")); } catch (err) { toast(err.message, "error"); return; }
  kbState.data = d;
  const stats = $("#kb-stats");
  stats.innerHTML = "";
  appendAll(stats, h("span", { class: "stat" }, `${d.docs} document${d.docs > 1 ? "s" : ""}`), h("span", { class: "stat" }, `${d.chunks} passages`),
    d.problems ? h("span", { class: "stat warn", title: "Documents sans texte lisible (scans sans OCR, fichiers protégés…)" }, `${d.problems} illisible${d.problems > 1 ? "s" : ""}`) : null);
  const fl = $("#kb-folders");
  fl.innerHTML = "";
  fl.append(h("div", { class: "item" }, h("div", { class: "top" }, h("strong", {}, "Dépôt de ZEUS"), h("span", { class: "meta" }, "fichiers déposés ici")), h("div", { class: "meta" }, d.inbox)));
  for (const path of [...d.folders, ...d.files]) fl.append(h("div", { class: "item" },
    h("div", { class: "top" }, h("strong", {}, path.split(/[\\/]/).filter(Boolean).pop() || path),
      h("button", { type: "button", class: "icon-btn", title: "Ne plus suivre (les fichiers ne sont pas supprimés)", "aria-label": "Ne plus suivre ce dossier", onclick: async () => { if (!confirm(`Ne plus suivre « ${path} » ? Les fichiers restent sur ton PC.`)) return; await api("/api/kb/folders/remove", { body: { path } }); loadDocuments(); } }, "✕")),
    h("div", { class: "meta" }, path)));
  if (!d.folders.length && !d.files.length) fl.append(h("p", { class: "muted small" }, "Ajoute par exemple ton dossier de cours, tes notes ou le dossier RH de l'entreprise. ZEUS lit les sous-dossiers et suit les nouveaux fichiers tout seul."));
  const docs = $("#kb-docs");
  docs.innerHTML = "";
  if (!d.list.length) docs.append(h("p", { class: "muted small" }, d.docs ? "Aucun document pour ce filtre." : "Aucun document indexé pour l'instant."));
  for (const x of d.list.slice(0, 300)) docs.append(h("div", { class: "item" + (x.status !== "ok" ? " warn" : "") },
    h("div", { class: "top" }, h("a", { href: x.url, target: "_blank", rel: "noopener" }, x.name), h("span", { class: "meta" }, [x.ext.toUpperCase(), x.pages ? `${x.pages} p.` : "", `${x.chunks} passages`].filter(Boolean).join(" · "))),
    x.status !== "ok" ? h("div", { class: "meta error-text" }, x.error || "aucun texte") : null));
  if (d.list.length > 300) docs.append(h("p", { class: "muted small" }, `… et ${d.list.length - 300} autres : utilise le filtre.`));
  renderKbState(d.state);
}
async function kbSearch(q) {
  kbState.q = q;
  const box = $("#kb-results");
  box.innerHTML = "";
  if (!q) return;
  let r;
  try { r = await api("/api/kb/search?q=" + encodeURIComponent(q)); } catch (err) { toast(err.message, "error"); return; }
  if (!r.hits.length) { box.append(h("p", { class: "muted" }, kbState.data && kbState.data.docs ? `Rien trouvé pour « ${q} ». Essaie un synonyme ou un mot plus général.` : "Ta bibliothèque est vide : ajoute un dossier ou dépose des fichiers ci-dessous.")); return; }
  box.append(h("p", { class: "muted small" }, `${r.hits.length} passage${r.hits.length > 1 ? "s" : ""} trouvé${r.hits.length > 1 ? "s" : ""}`));
  for (const x of r.hits) {
    const more = h("div", { class: "kb-more", hidden: true });
    box.append(h("div", { class: "item kb-hit" },
      h("div", { class: "top" }, h("a", { href: x.url, target: "_blank", rel: "noopener" }, x.name + (x.page ? ` — page ${x.page}` : "")), h("span", { class: "meta" }, x.heading || "")),
      h("p", { class: "kb-snip" }, kbHighlight(x.snippet, x.terms)),
      h("div", { class: "row wrap gap" },
        h("button", { type: "button", class: "btn ghost small", "aria-expanded": "false", onclick: async (e) => {
          const btn = e.currentTarget;  // currentTarget n'existe plus après un await
          if (!more.hidden) { more.hidden = true; btn.textContent = "Lire le passage"; btn.setAttribute("aria-expanded", "false"); return; }
          try { const t = await api(`/api/kb/docs/${x.doc_id}?chunk=${x.chunk_id}`); more.textContent = t.text; more.hidden = false; btn.textContent = "Replier"; btn.setAttribute("aria-expanded", "true"); } catch (err) { toast(err.message, "error"); }
        } }, "Lire le passage"),
        h("button", { type: "button", class: "btn ghost small", onclick: () => askDocs(`À partir de « ${x.name} »${x.page ? " (page " + x.page + ")" : ""} : explique-moi ce passage sur « ${q} ».`) }, "Expliquer")),
      more));
  }
}
function askDocs(text) {
  S.sid = null; store.set("sid", null); S.session = null; S.messages = [];
  if (location.hash !== "#chat") location.hash = "#chat"; else renderMessages();
  setTimeout(() => sendMessage(text + " Cherche dans mes documents (docs_search) et cite les sources [document, page]."), 150);
}
$("#kb-search-form").addEventListener("submit", (e) => { e.preventDefault(); kbSearch($("#kb-q").value.trim()); });
$("#kb-ask").addEventListener("click", () => { const q = $("#kb-q").value.trim(); if (!q) { $("#kb-q").focus(); toast("Écris d'abord ta question.", "info", 2500); return; } askDocs(q + " —"); });
$("#kb-filter").addEventListener("input", () => { kbState.filter = $("#kb-filter").value.trim(); debounce("kbf", loadDocuments, 250); });
$("#kb-folder-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { const r = await api("/api/kb/folders", { body: { path: $("#kb-folder").value.trim() } }); toast(r.new ? "Dossier ajouté : indexation en cours…" : "Ce dossier est déjà suivi : mise à jour lancée.", "success"); $("#kb-folder").value = ""; } catch (err) { toast(err.message, "error", 8000); return; }
  loadDocuments();
});
$("#kb-reindex").addEventListener("click", async () => { try { const r = await api("/api/kb/reindex", { body: {} }); toast(r.started ? "Mise à jour de l'index lancée." : "Une indexation est déjà en cours.", "info", 3000); } catch (err) { toast(err.message, "error"); } });
$("#kb-file").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  let ok = 0;
  for (const f of files) {
    try { const r = await api("/api/kb/upload", { body: f, raw: true, headers: { "X-Filename": encodeURIComponent(f.name) } }); ok++; if (r.doc && r.doc.status !== "ok") toast(`${f.name} : ${r.doc.error || "aucun texte lisible"}`, "error", 7000); } catch (err) { toast(`${f.name} : ${err.message}`, "error", 7000); }
  }
  if (ok) toast(`${ok} fichier${ok > 1 ? "s" : ""} ajouté${ok > 1 ? "s" : ""} à la bibliothèque.`, "success");
  loadDocuments();
});
$("#todo-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { text: $("#todo-text").value.trim(), due: $("#todo-due").value.trim(), priority: +$("#todo-prio").value };
  if (!body.text) return;
  try { await api("/api/office/todos", { body }); } catch (err) { toast(err.message, "error"); return; }
  $("#todo-text").value = ""; $("#todo-due").value = "";
  loadAgenda();
});
$("#open-secretary").addEventListener("click", () => startRoleSession({ id: "secretaire" }, "Fais le point : mon agenda de la semaine, mes tâches urgentes et ce que je dois traiter en priorité."));

/* ================================================================ prononciation et dictée */
/* Repris du tuteur Jarvis : on compare mot à mot ce que la reconnaissance vocale a compris avec la phrase attendue.
   Le score mesure l'intelligibilité (ce qu'un auditeur comprend), pas la phonétique fine. */
const PR_PUNCT = /[¿?¡!.,;:«»"“”()…\-–—]/g;
function prNorm(w) { return String(w || "").toLowerCase().replace(/’/g, "'").replace(PR_PUNCT, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").trim(); }
function prWords(s) { return String(s || "").split(/\s+/).filter((w) => prNorm(w)); }
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function prNear(a, b) { const n = Math.max(a.length, b.length); return n >= 3 && levenshtein(a, b) <= (n <= 5 ? 1 : 2); }
/** Aligne la phrase attendue et ce qui a été entendu ; statut de chaque mot : ok, near (presque), miss. */
function evaluateSpeech(expected, heard) {
  const a = prWords(expected), r = prWords(heard);
  const na = a.map(prNorm), nr = r.map(prNorm);
  const n = na.length, m = nr.length;
  const eqc = (i, j) => (na[i] === nr[j] ? 0 : prNear(na[i], nr[j]) ? 0.5 : 1);
  const cost = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n; i >= 0; i--) {
    for (let j = m; j >= 0; j--) {
      if (i === n) cost[i][j] = (m - j) * 0.5; // mots en trop : petite pénalité
      else if (j === m) cost[i][j] = n - i;
      else cost[i][j] = Math.min(cost[i + 1][j + 1] + eqc(i, j), cost[i + 1][j] + 1, cost[i][j + 1] + 0.5);
    }
  }
  const words = [];
  let i = 0, j = 0, pts = 0, extra = 0;
  while (i < n) {
    if (j < m) {
      const e = eqc(i, j);
      if (cost[i][j] === cost[i + 1][j + 1] + e && e < 1) { words.push({ w: a[i], st: e === 0 ? "ok" : "near", heard: e ? r[j] : "" }); pts += e === 0 ? 1 : 0.5; i++; j++; continue; }
      if (cost[i][j] === cost[i][j + 1] + 0.5) { j++; extra++; continue; }
      if (cost[i][j] === cost[i + 1][j + 1] + 1) { words.push({ w: a[i], st: "miss", heard: r[j] }); i++; j++; continue; }
    }
    words.push({ w: a[i], st: "miss", heard: "" });
    i++;
  }
  extra += m - j;
  const base = n ? pts / n : 0;
  return { words, score: Math.round(Math.max(0, Math.min(1, base - 0.05 * extra)) * 100), heard: heard || "" };
}
function appreciation(score) {
  if (score >= 90) return "Excellent, c'est très clair.";
  if (score >= 75) return "Très bien, presque parfait.";
  if (score >= 50) return "Bien compris dans l'ensemble. Retravaille les mots en orange et en rouge.";
  if (score > 0) return "Pas encore clair. Écoute la version lente et réessaie.";
  return "Je n'ai rien reconnu. Parle plus près du micro.";
}
/** Texte d'une réponse du professeur : sans la section ✏️ Corrections ni les traductions entre parenthèses. */
function lessonText(t) {
  return String(t || "").split(/\n\s*[*_#\s]*✏/)[0].replace(/\([^)]*\)/g, " ").replace(/\*\*/g, "")
    .replace(/[ \t]+/g, " ").replace(/ ([,.!?;:])/g, "$1");
}
function sentencesFrom(text, lang) {
  return (lessonText(text).match(/[^.!?\n]+[.!?]*/g) || []).map((s) => s.trim().replace(/^[-•]\s*/, ""))
    .filter((s) => { const n = prWords(s).length; return n >= 2 && n <= 16 && detectLang(s, lang) === lang; });
}

const PR = { lang: "en", list: [], i: 0, mode: "repeter" };
function prDefaultLang() {
  const m = sessionMode();
  if (m && m.id === "prof_langue" && m.lang) return m.lang;
  return store.get("prLang", "en");
}
async function openPractice(opts = {}) {
  PR.lang = opts.lang || prDefaultLang();
  PR.mode = opts.mode || "repeter";
  PR.list = (opts.sentences || []).map((t) => ({ text: t, source: "message" }));
  PR.i = 0;
  if (!PR.list.length) {
    try { PR.list = (await api(`/api/learn/practice?lang=${PR.lang}`)).sentences; } catch (err) { toast(err.message, "error"); return; }
  }
  $("#pr-lang").value = PR.lang;
  prRender();
  if (!$("#practice").open) $("#practice").showModal();
}
function prCurrent() { return PR.list[PR.i] || null; }
function prRender(result) {
  const c = prCurrent();
  for (const b of $$("#practice [data-prmode]")) b.classList.toggle("active", b.dataset.prmode === PR.mode);
  $("#pr-title").textContent = PR.mode === "dictee" ? "Dictée" : "Prononciation";
  $("#pr-count").textContent = PR.list.length ? `${PR.i + 1} / ${PR.list.length}` : "";
  const box = $("#pr-sentence");
  box.innerHTML = "";
  if (!c) { box.textContent = "Aucune phrase pour cette langue."; return; }
  if (PR.mode === "dictee" && !result) box.append(h("span", { class: "muted" }, "Écoute la phrase, puis écris-la ci-dessous."));
  else if (result) box.append(...result.words.map((w) => h("span", { class: "pw " + w.st, title: w.heard ? "entendu : " + w.heard : "" }, w.w)));
  else box.textContent = c.text;
  $("#pr-typed").hidden = PR.mode !== "dictee";
  if (!result) $("#pr-typed").value = "";
  $("#pr-rec").textContent = PR.mode === "dictee" ? "Vérifier" : "À toi";
  const res = $("#pr-result");
  res.innerHTML = "";
  if (result) {
    const todo = result.words.filter((w) => w.st !== "ok").map((w) => w.w);
    appendAll(res, h("div", { class: "pr-score " + (result.score >= 75 ? "good" : result.score >= 50 ? "mid" : "low") }, `${result.score}/100`),
      h("p", {}, appreciation(result.score)),
      result.heard ? h("p", { class: "muted small" }, (PR.mode === "dictee" ? "Tu as écrit : « " : "Compris : « ") + result.heard + " »") : null,
      PR.mode === "dictee" ? h("p", { class: "small" }, "Phrase : « " + c.text + " »") : null,
      todo.length ? h("p", { class: "small" }, "À retravailler : " + todo.join(", ")) : null,
      todo.length && result.score < 90 ? h("button", { type: "button", class: "btn ghost small", onclick: () => {
        $("#practice").close();
        const txt = `J'ai du mal à prononcer ces mots en ${LANG_NAMES[PR.lang] || PR.lang} : ${todo.join(", ")} (dans « ${c.text} »). Donne-moi des astuces simples pour bien les prononcer, avec une prononciation facile à lire.`;
        const sm = sessionMode();
        if (sm && sm.id === "prof_langue" && sm.lang === PR.lang && S.session) { location.hash = "#chat"; sendMessage(txt); } else startCourse(PR.lang, {}, txt);
      } }, "Conseils du prof") : null);
  }
}
function prListen(slow) { const c = prCurrent(); if (c) speak(c.text, { raw: true, lang: PR.lang, rate: slow ? 0.65 : 1 }); }
function prRecord() {
  const c = prCurrent();
  if (!c) return;
  if (PR.mode === "dictee") {
    const typed = $("#pr-typed").value.trim();
    if (!typed) { $("#pr-typed").focus(); return; }
    const res = evaluateSpeech(c.text, typed);
    prRender(res);
    api("/api/learn/speech", { body: { lang: PR.lang, seconds: 0, score: res.score, kind: "dictee", text: c.text } }).catch(() => {});
    return;
  }
  if (!SR) { toast("La reconnaissance vocale demande Chrome ou Edge.", "error"); return; }
  stopSpeaking();
  const r = new SR();
  r.lang = VOICE_LANGS[PR.lang]; r.interimResults = false; r.continuous = false; r.maxAlternatives = 4;
  let t0 = 0, t1 = 0, best = null;
  r.onspeechstart = () => { t0 = performance.now(); };
  r.onspeechend = () => { t1 = performance.now(); };
  r.onresult = (e) => { for (const alt of e.results[0]) { const ev = evaluateSpeech(c.text, alt.transcript); if (!best || ev.score > best.score) best = ev; } };
  r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") toast(e.error === "not-allowed" ? "Micro refusé." : "Micro : " + e.error, "error"); };
  r.onend = () => {
    $("#pr-rec").classList.remove("rec");
    const res = best || evaluateSpeech(c.text, "");
    prRender(res);
    const secs = t0 ? ((t1 || performance.now()) - t0) / 1000 : 0;
    api("/api/learn/speech", { body: { lang: PR.lang, seconds: secs, score: res.score, kind: "repeter", text: c.text } }).catch(() => {});
  };
  $("#pr-rec").classList.add("rec");
  try { r.start(); } catch (e) { $("#pr-rec").classList.remove("rec"); toast(String(e), "error"); }
}
$("#pr-listen").addEventListener("click", () => prListen(false));
$("#pr-slow").addEventListener("click", () => prListen(true));
$("#pr-rec").addEventListener("click", prRecord);
$("#pr-typed").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); prRecord(); } });
$("#pr-next").addEventListener("click", () => { if (PR.list.length) { PR.i = (PR.i + 1) % PR.list.length; prRender(); if (PR.mode === "dictee") prListen(false); } });
$("#pr-lang").addEventListener("change", (e) => { store.set("prLang", e.target.value); openPractice({ lang: e.target.value, mode: PR.mode }); });
for (const b of $$("#practice [data-prmode]")) b.addEventListener("click", () => { PR.mode = b.dataset.prmode; prRender(); if (PR.mode === "dictee") prListen(false); });
$("#practice").addEventListener("close", () => stopSpeaking());

/* ================================================================ mode Jarvis : conversation vocale plein écran */
const YES_RE = /^(oui|ouais|vas[- ]y|d'accord|ok|okay|autorise|confirme|valide|yes|yeah|sure|go ahead|s[ií]|claro|vale|ja|genau|klar)\b/i;
const NO_RE = /^(non|refuse|annule|surtout pas|no|nope|cancel|nein|nicht)\b/i;
let jvLeaveTimer = 0;
let jvAudio = null, jvPulse = 0, jvState = "idle", jvSilences = 0, jvPrevConverse = false, jvText = "";
function roleLabel(m) {
  if (!m || m.id === "assistant") return "Assistant expert";
  const pro = { secretaire: "Secrétaire", formateur: "Professeur / formateur", dirigeant: "Conseiller du dirigeant", rh: "Ressources humaines", chercheur: "Assistant de recherche" };
  if (pro[m.id]) return pro[m.id];
  if (m.id === "prof_langue") return `${({ fr: "Prof de français", en: "Prof d'anglais", es: "Prof d'espagnol", de: "Prof d'allemand" })[m.lang] || "Prof de langue"}`;
  if (m.id === "enseignant") return `${m.subject || "Enseignant"}`;
  if (m.id === "interprete") return `Interprète ${LANG_FLAG[m.lang] || ""} ↔ ${LANG_FLAG[m.lang2] || ""}`;
  return "Secrétaire";
}
function openJarvis() {
  if (S.jarvis) return;
  S.jarvis = true;
  jvPrevConverse = S.converse;
  S.converse = true;
  jvSilences = 0; jvText = "";
  clearTimeout(jvLeaveTimer);
  const ov = $("#jarvis");
  ov.classList.remove("leaving");
  ov.hidden = false;
  ov.classList.add("entering");
  setTimeout(() => ov.classList.remove("entering"), 1300);
  document.body.classList.add("jv-open");
  updateHero();
  $("#jv-user").textContent = ""; $("#jv-reply").textContent = ""; $("#jv-tool").textContent = "";
  $("#jv-lang").value = S.micLang || "auto";
  $("#jv-role").textContent = roleLabel(sessionMode());
  jvApproval(S.approvals.find((a) => a.session_id === S.sid) || null);
  setTimeout(() => $("#jv-orb").focus(), 50);
  jvMic();
  jvDraw();
  jvHudStart();
  jvReactor.intro();
  jvInterp();
  jvSet("thinking", "…");
  jvGreeting().then((hello) => {
    if (!S.jarvis) return;
    $("#jv-reply").textContent = hello;
    S.followUp = true;
    speak(hello, { raw: true });
  });
}
function closeJarvis() {
  if (!S.jarvis) return;
  S.jarvis = false;
  S.converse = jvPrevConverse;
  S.followUp = false;
  stopSpeaking();
  stopListening();
  jvHudStop();
  if (jvAudio) { try { jvAudio.stream.getTracks().forEach((t) => t.stop()); jvAudio.ctx.close(); } catch { /* */ } jvAudio = null; }
  const ov = $("#jarvis");
  const done = () => {
    clearTimeout(jvLeaveTimer);
    if (S.jarvis) return;  // rouvert entre-temps
    if (jvReactor) jvReactor.stop();
    ov.hidden = true; ov.classList.remove("leaving");
    document.body.classList.remove("jv-open");
    $("#jarvis-btn").focus();
    updateHero();
  };
  ov.classList.remove("entering");
  ov.classList.add("leaving");
  jvLeaveTimer = setTimeout(done, 650);  // filet de sécurité si l'animation ne se termine pas
  if (jvReactor) jvReactor.outro(done); else done();
}
function jvSet(state, text) {
  jvState = state;
  $("#jarvis").dataset.state = state;
  if (jvReactor) jvReactor.refresh();
  $("#jv-state").textContent = text || ({ idle: "Touche l'orbe pour parler", listening: say("listen"), thinking: "Je réfléchis…", speaking: "" })[state] || "";
}
/** Appelé par la voix (écoute, parole) et par les événements de ZEUS pendant le mode Jarvis. */
function jarvisEvent(evt, data) {
  switch (evt) {
    case "listen": jvSet("listening"); $("#jv-user").textContent = ""; jvInterp(); break;
    case "interim": $("#jv-user").textContent = data || ""; break;
    case "sent": jvSilences = 0; jvText = ""; jvModule = -1; $("#jv-reply").textContent = ""; $("#jv-tool").textContent = ""; jvSet("thinking"); break;
    case "silence":
      if (S.runs.has(S.sid)) { jvSet("thinking"); break; }
      if (++jvSilences <= 2) setTimeout(() => { if (S.jarvis && !rec && !S.speaking) listenOnce({ followUp: true }); }, 350);
      else jvSet("idle");
      break;
    case "speak": jvSet("speaking"); jvPulse = 1; break;
    case "boundary": jvPulse = 1; break;
    case "spoken": if (jvState === "speaking") jvSet(S.runs.has(S.sid) ? "thinking" : "idle"); break;
    case "delta": jvText += data || ""; $("#jv-reply").textContent = plain(lessonText(jvText)).slice(-320); break;
    case "reset": jvText = ""; break;
    case "tool": $("#jv-tool").textContent = data; if (jvState !== "speaking") jvSet("thinking"); break;
    case "end": jvModule = -1; $("#jv-tool").textContent = ""; if (data) $("#jv-reply").textContent = plain(lessonText(data)).slice(-320); if (!S.speaking && jvState === "thinking") jvSet("idle"); break;
    default: break;
  }
}
function jvApproval(a) {
  S.jvApproval = a;
  const box = $("#jv-approval");
  box.hidden = !a;
  box.innerHTML = "";
  if (!a) return;
  const decide = (decision, answer = "") => api(`/api/approvals/${a.id}`, { body: { decision, answer } }).then(() => { jvApproval(null); }).catch((err) => toast(err.message, "error"));
  box.append(h("p", {}, a.summary));
  const opts = a.options || [];
  if (a.kind === "question" && opts.length) box.append(h("div", { class: "row wrap gap" }, opts.map((o) => h("button", { type: "button", class: "btn", onclick: () => decide("answer", o) }, o))));
  else if (a.kind !== "question") box.append(h("div", { class: "row wrap gap" },
    ["money", "catastrophic"].includes(a.risk) ? holdButton("Maintenir pour autoriser", () => decide("approve"))
      : h("button", { type: "button", class: "btn bolt", onclick: () => decide("approve") }, "Autoriser (« oui »)"),
    h("button", { type: "button", class: "btn danger", onclick: () => decide("deny") }, "Refuser (« non »)")));
  else box.append(h("p", { class: "muted small" }, "Réponds à voix haute."));
}
/** Une validation attend : « oui » / « non » (ou le choix proposé) décide à la voix. */
function handleVoiceApproval(said) {
  const a = S.jvApproval;
  if (!a) return false;
  const decide = (decision, answer = "") => api(`/api/approvals/${a.id}`, { body: { decision, answer } }).then(() => jvApproval(null)).catch(() => {});
  const low = said.trim().toLowerCase();
  if (a.kind === "question") {
    const opt = (a.options || []).find((o) => prNorm(low).includes(prNorm(o)) || prNorm(o).includes(prNorm(low)));
    decide("answer", opt || said);
    return true;
  }
  if (YES_RE.test(low)) { decide("approve"); speak(({ fr: "C'est parti.", en: "On it.", es: "Vamos.", de: "Wird gemacht." })[micLangCode()], { raw: true }); return true; }
  if (NO_RE.test(low)) { decide("deny"); speak(({ fr: "D'accord, j'annule.", en: "Okay, cancelled.", es: "Vale, lo cancelo.", de: "Okay, abgebrochen." })[micLangCode()], { raw: true }); return true; }
  S.followUp = true;
  speak(({ fr: "Dis oui ou non.", en: "Please say yes or no.", es: "Di sí o no.", de: "Sag ja oder nein." })[micLangCode()], { raw: true });
  return true;
}
async function jvMic() {
  if (jvAudio || !navigator.mediaDevices || !window.AudioContext) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (!S.jarvis) { stream.getTracks().forEach((t) => t.stop()); return; }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    jvAudio = { stream, ctx, analyser, data: new Uint8Array(analyser.fftSize) };
  } catch { /* pas de micro pour l'animation : l'orbe s'anime quand même */ }
}
/* ================================================================ le réacteur de ZEUS
   Trois anneaux gyroscopiques en perspective autour d'un cœur de plasma. États : idle (repos), listen (écoute : les
   anneaux se tournent vers toi, une couronne suit la voix), act (réflexion ou action : les anneaux s'emballent, un arc
   doré balaie la lunette), speak (parole : des éclairs jaillissent du cœur). Un seul moteur pour l'accueil et Jarvis.
   Rien ne tourne si la page est cachée ; avec « réduire les animations », une image fixe par état. */
const CALM = window.matchMedia("(prefers-reduced-motion: reduce)");
class Reactor {
  constructor(canvas, opts = {}) {
    this.cv = canvas; this.g = canvas.getContext("2d");
    this.state = opts.state || (() => "idle");
    this.level = opts.level || null;
    this.light = !!opts.light;
    this.running = false; this.raf = 0; this.introT = 0; this.outT = 0; this.onOut = null;
    this.lvl = 0; this.spin = 0; this.t = 0; this.last = 0; this.fil = []; this.filT = -1; this.bolts = []; this.boltT = -1;
    // Interface spatiale (mode Jarvis) : grand cœur doré, anneau des modules, étiquette du cerveau actif.
    this.spatial = !!opts.spatial; this.labels = opts.labels || null; this.active = opts.active || (() => -1);
    this.coreLabel = opts.coreLabel || null;
    this.font = (getComputedStyle(document.documentElement).getPropertyValue("--font-display") || "sans-serif").trim();
    // Poussière de données en orbite (mode Jarvis) : quelques points en 2D, bien plus léger qu'une scène 3D.
    this.dust = opts.dust ? Array.from({ length: opts.spatial ? 220 : 140 }, () => {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 190 + Math.random() * 50, s = Math.sqrt(1 - u * u);
      return [r * s * Math.cos(a), r * u * 0.8, r * s * Math.sin(a), 0.6 + Math.random() * 1.2, Math.random() < 0.18];
    }) : null;
    this.resize(opts.size || canvas.clientWidth || 300);
  }
  resize(size) {
    const dpr = window.devicePixelRatio || 1;
    this.S = Math.max(80, Math.round(size));
    this.cv.width = this.S * dpr; this.cv.height = this.S * dpr;
    this.cv.style.width = this.cv.style.height = this.S + "px";
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.running) this.draw(performance.now());
  }
  start() {
    if (this.running) return;
    this.running = true; this.last = performance.now();
    if (CALM.matches) { this.running = false; this.draw(this.last); return; }
    const loop = (now) => { if (!this.running) return; this.draw(now); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  intro() { if (CALM.matches) return; this.outT = 0; this.introT = performance.now(); }
  outro(done) {
    if (CALM.matches) { if (done) done(); return; }
    this.introT = 0; this.outT = performance.now(); this.onOut = done || null;
  }
  refresh() { if (!this.running) this.draw(performance.now()); }
  zig(x1, y1, x2, y2, depth) {
    let seg = [[x1, y1], [x2, y2]];
    for (let n = 0; n < depth; n++) {
      const out = [seg[0]];
      for (let i = 0; i < seg.length - 1; i++) {
        const [a, b] = seg[i], [p, q] = seg[i + 1], len = Math.hypot(p - a, q - b) || 1, off = (Math.random() - 0.5) * len * 0.5;
        out.push([(a + p) / 2 - (q - b) / len * off, (b + q) / 2 + (p - a) / len * off], seg[i + 1]);
      }
      seg = out;
    }
    return seg;
  }
  draw(now) {
    const g = this.g, S = this.S, c = S / 2, k = S / 480;
    const dt = Math.min(0.05, Math.max(0, (now - (this.last || now)) / 1000)); this.last = now; this.t += dt;
    const t = this.t, m = this.state();
    let target = 0.08 + 0.05 * Math.sin(t * 1.3);
    if (this.level) target = this.level(t, m);
    else if (m === "listen") target = 0.3 + 0.35 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.2));
    else if (m === "speak") target = 0.55 + 0.3 * Math.abs(Math.sin(t * 11));
    else if (m === "act") target = 0.35;
    this.lvl += (target - this.lvl) * 0.16;
    const lvl = this.lvl;
    this.spin += dt * (m === "act" ? 3.2 : m === "speak" ? 1.4 : 0.6);
    const spin = this.spin, tumble = CALM.matches ? 0.35 : 0.35 * Math.sin(t * 0.25);
    const CY = this.light ? "0,140,165" : "0,229,255", AU = this.light ? "214,168,0" : "245,196,0";
    const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    let scale = 1, flash = 0, strike = null;
    if (this.introT) {
      const p = (now - this.introT) / 1300;
      if (p >= 1) this.introT = 0;
      else if (p < 0.22) { strike = p / 0.22; scale = 0; }
      else { scale = ease((p - 0.22) / 0.78); flash = Math.max(0, 1 - (p - 0.22) / 0.25); }
    }
    let outP = -1;
    if (this.outT) {
      outP = (now - this.outT) / 520;
      scale = Math.max(0, 1 - ease(outP / 0.75));
      if (outP >= 1) { this.outT = 0; const cb = this.onOut; this.onOut = null; if (cb) cb(); }
    }
    const rings = [
      { R: 150 * k, tilt: 1.18, yaw: 0, sp: 0.55, kind: "dash" },
      { R: 126 * k, tilt: 1.12, yaw: 2.09, sp: -0.45, kind: "gold" },
      { R: 176 * k, tilt: 1.26, yaw: 4.19, sp: 0.32, kind: "fine" }];
    if (this.spatial) rings.push({ R: 222 * k, tilt: 1.16, yaw: -0.22, sp: 0.16, kind: "band", fixed: true });
    const tiltK = m === "listen" ? 0.82 : 1, hot = m === "speak" || m === "act", f = 760 * k;
    const pt = (r, u) => {
      const R = r.R * scale, tl = r.tilt * tiltK, x = R * Math.cos(u), y0 = R * Math.sin(u);
      const y1 = y0 * Math.cos(tl), z1 = y0 * Math.sin(tl), a = r.yaw + (r.fixed ? 0 : spin * 0.35);
      const x2 = x * Math.cos(a) - y1 * Math.sin(a), y2 = x * Math.sin(a) + y1 * Math.cos(a);
      const x3 = x2 * Math.cos(tumble) + z1 * Math.sin(tumble), z3 = -x2 * Math.sin(tumble) + z1 * Math.cos(tumble);
      const sc = f / (f + z3);
      return [c + x3 * sc, c + y2 * sc, z3];
    };
    const TAU = Math.PI * 2;
    // Anneau des modules (interface spatiale) : deux rails, des séparateurs et le nom de chaque module ; le module
    // que ZEUS utilise en ce moment s'allume en or.
    const band = (r, front, off) => {
      const inner = { ...r, R: r.R * 0.86 }, mid = { ...r, R: r.R * 0.93 }, N = 132;
      for (const rr of [r, inner]) {
        for (let i = 0; i < N; i++) {
          const p0 = pt(rr, i / N * TAU), p1 = pt(rr, (i + 1) / N * TAU);
          if (((p0[2] + p1[2]) / 2 < 0) !== front) continue;
          g.strokeStyle = `rgba(${CY},${front ? 0.85 : 0.22})`; g.lineWidth = (rr === r ? 2.6 : 1.4) * Math.max(0.7, k);
          g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        }
      }
      const L = this.labels || [], n = L.length || 6, act = this.active();
      for (let j = 0; j < n; j++) {
        const u = j / n * TAU + off, a0 = pt(r, u), b0 = pt(inner, u);
        if ((a0[2] < 0) === front) {
          g.strokeStyle = `rgba(${CY},${front ? 0.95 : 0.3})`; g.lineWidth = 2.2 * Math.max(0.7, k);
          g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(b0[0], b0[1]); g.stroke();
        }
        if (!L[j]) continue;
        const um = u + Math.PI / n, p = pt(mid, um), q = pt(mid, um + 0.02);
        if ((p[2] < 0) !== front) continue;
        let ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        const on = j === act && hot;
        g.save(); g.translate(p[0], p[1]); g.rotate(ang);
        g.font = `600 ${Math.max(8, 12 * k)}px ${this.font}`; g.textAlign = "center"; g.textBaseline = "middle";
        if (on) { g.shadowColor = `rgba(${AU},.95)`; g.shadowBlur = 12 * k; }
        g.fillStyle = on ? `rgb(${AU})` : `rgba(${this.light ? "0,90,110" : "200,250,255"},${front ? 0.92 : 0.3})`;
        g.fillText(L[j], 0, 0); g.restore();
      }
    };
    const ringsPass = (front) => {
      for (const r of rings) {
        if (r.kind === "band") { band(r, front, spin * r.sp); continue; }
        const N = 96, off = spin * r.sp;
        for (let i = 0; i < N; i++) {
          const u0 = i / N * Math.PI * 2, u1 = (i + 1) / N * Math.PI * 2, p0 = pt(r, u0), p1 = pt(r, u1);
          if (((p0[2] + p1[2]) / 2 < 0) !== front) continue;
          const kk = ((u0 + off) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          if (r.kind === "dash" && Math.floor(kk / (Math.PI * 2 / 40)) % 3 === 2) continue;
          const col = r.kind === "gold" || (hot && r.kind === "dash") ? AU : CY;
          g.strokeStyle = `rgba(${col},${(front ? 1 : (this.light ? 0.45 : 0.35)) * (r.kind === "fine" ? 0.6 : 0.95)})`;
          g.lineWidth = (r.kind === "gold" ? 3 : r.kind === "dash" ? 2.2 : 1.1) * Math.max(0.7, k);
          g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
        }
        if (r.kind === "gold") {
          for (let j = 0; j < 3; j++) {
            const p = pt(r, -off * 1.6 + j * Math.PI * 2 / 3);
            if ((p[2] < 0) !== front) continue;
            g.save(); g.shadowColor = `rgba(${AU},.9)`; g.shadowBlur = 12 * k;
            g.fillStyle = front ? (this.light ? `rgb(${AU})` : "#FFF4C2") : `rgba(${AU},.4)`;
            g.beginPath(); g.arc(p[0], p[1], (front ? 5 : 3.5) * Math.max(0.7, k), 0, Math.PI * 2); g.fill(); g.restore();
          }
        }
      }
    };
    g.clearRect(0, 0, S, S);
    if (this.dust && scale > 0.001) {
      const ay = t * 0.05, ca = Math.cos(ay), sa = Math.sin(ay);
      for (const [x, y, z, sz, gold] of this.dust) {
        const x1 = x * ca + z * sa, z1 = -x * sa + z * ca, sc = f / (f + z1 * k);
        g.fillStyle = `rgba(${gold ? AU : CY},${(z1 < 0 ? 0.25 : 0.6) * (this.light ? 0.8 : 1)})`;
        g.fillRect(c + x1 * k * sc * scale, c + y * k * sc * scale, sz * Math.max(0.8, k), sz * Math.max(0.8, k));
      }
    }
    if (scale > 0.001) {
      const halo = g.createRadialGradient(c, c, 10 * k, c, c, 230 * k * scale);
      halo.addColorStop(0, `rgba(${hot ? AU : CY},${(this.light ? 0.16 : 0.22) + 0.25 * lvl})`); halo.addColorStop(1, `rgba(${CY},0)`);
      g.fillStyle = halo; g.beginPath(); g.arc(c, c, 230 * k * scale, 0, Math.PI * 2); g.fill();
      const bz = 214 * k * scale, rot = spin * 0.12;
      if (!this.spatial) { g.strokeStyle = `rgba(${CY},.32)`; g.lineWidth = 1; g.beginPath(); g.arc(c, c, bz, 0, Math.PI * 2); g.stroke(); }
      for (let j = 0; j < (this.spatial ? 0 : 4); j++) {
        const a = rot + Math.PI / 4 + j * Math.PI / 2;
        g.strokeStyle = `rgba(${CY},.9)`; g.lineWidth = 2.5 * Math.max(0.7, k); g.beginPath(); g.arc(c, c, bz + 6 * k, a - 0.17, a + 0.17); g.stroke();
      }
      if (m === "listen") {
        for (let i = 0; i < 72; i++) {
          const a = i / 72 * Math.PI * 2, len = (4 + 30 * lvl * Math.abs(Math.sin(i * 0.9 + t * 8) * Math.cos(i * 0.37 - t * 3))) * k;
          g.strokeStyle = `rgba(${CY},.75)`; g.lineWidth = 2 * Math.max(0.7, k);
          g.beginPath(); g.moveTo(c + Math.cos(a) * (bz - 10 * k), c + Math.sin(a) * (bz - 10 * k));
          g.lineTo(c + Math.cos(a) * (bz - 10 * k - len), c + Math.sin(a) * (bz - 10 * k - len)); g.stroke();
        }
      }
      if (m === "act" && !this.spatial) { g.strokeStyle = `rgba(${AU},.95)`; g.lineWidth = 3 * Math.max(0.7, k); g.beginPath(); g.arc(c, c, bz, spin * 1.4, spin * 1.4 + 1); g.stroke(); }
      ringsPass(false);
      const R0 = 44 * k * (this.spatial ? 1.5 : 1) * (1 + 0.3 * lvl) * scale;
      const glow = g.createRadialGradient(c, c, 0, c, c, R0 * 2.2);
      glow.addColorStop(0, "rgba(255,250,230,1)"); glow.addColorStop(0.25, "rgba(255,226,110,.95)");
      glow.addColorStop(0.55, `rgba(${AU},.55)`); glow.addColorStop(1, `rgba(${AU},0)`);
      g.fillStyle = glow; g.beginPath(); g.arc(c, c, R0 * 2.2, 0, Math.PI * 2); g.fill();
      if (this.spatial) {
        // cœur doré : sphère, méridiens qui tournent, rayons, et l'étiquette du cerveau actif
        const Rs = R0 * 1.25;
        g.strokeStyle = `rgba(${AU},.75)`; g.lineWidth = 1.4 * Math.max(0.7, k); g.beginPath(); g.arc(c, c, Rs, 0, TAU); g.stroke();
        g.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const w = Math.abs(Math.cos(spin * 0.25 + i * Math.PI / 4)) * Rs;
          g.strokeStyle = `rgba(${AU},.32)`; g.beginPath(); g.ellipse(c, c, w, Rs, 0, 0, TAU); g.stroke();
          g.beginPath(); g.ellipse(c, c, Rs, Rs * (0.2 + 0.22 * i), 0, 0, TAU); g.stroke();
        }
        for (let i = 0; i < 18; i++) {
          const a = i / 18 * TAU + spin * 0.05;
          g.strokeStyle = `rgba(255,236,170,${0.12 + 0.18 * lvl})`;
          g.beginPath(); g.moveTo(c + Math.cos(a) * R0 * 0.35, c + Math.sin(a) * R0 * 0.35); g.lineTo(c + Math.cos(a) * Rs, c + Math.sin(a) * Rs); g.stroke();
        }
        const tag = this.coreLabel ? this.coreLabel() : "";
        if (tag && scale > 0.9) {
          g.save(); g.font = `600 ${Math.max(8, 10.5 * k)}px ${this.font}`;
          const tw = g.measureText(tag).width, x = c + Rs * 0.95, y = c + Rs * 0.62, pad = 6 * k;
          g.fillStyle = this.light ? "rgba(255,255,255,.85)" : "rgba(8,10,16,.78)"; g.strokeStyle = `rgba(${AU},.85)`; g.lineWidth = 1;
          g.fillRect(x, y, tw + pad * 2, 20 * k); g.strokeRect(x, y, tw + pad * 2, 20 * k);
          g.fillStyle = this.light ? "rgb(120,90,0)" : "#FFE9A3"; g.textBaseline = "middle"; g.fillText(tag, x + pad, y + 10 * k);
          g.restore();
        }
      }
      if (t - this.filT > 0.12 || !this.fil.length) {
        this.filT = t;
        this.fil = Array.from({ length: 7 }, () => { const a = Math.random() * Math.PI * 2, r = R0 * (0.7 + Math.random() * 0.5); return this.zig(c, c, c + Math.cos(a) * r, c + Math.sin(a) * r, 3); });
      }
      g.strokeStyle = "rgba(255,255,240,.8)"; g.lineWidth = 1;
      for (const fl of this.fil) { g.beginPath(); fl.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
      ringsPass(true);
      if (m === "speak") {
        if (t - this.boltT > 0.08 || !this.bolts.length) {
          this.boltT = t;
          this.bolts = [0, 1, 2].map(() => { const r = rings[Math.floor(Math.random() * 3)], p = pt(r, Math.random() * Math.PI * 2), a = Math.atan2(p[1] - c, p[0] - c); return this.zig(c + Math.cos(a) * R0, c + Math.sin(a) * R0, p[0], p[1], 5); });
        }
        g.save(); g.shadowColor = "rgba(255,236,150,.95)"; g.shadowBlur = 16 * k; g.strokeStyle = this.light ? "rgba(150,110,0,.95)" : "rgba(255,250,225,.95)"; g.lineWidth = 2 * Math.max(0.7, k);
        for (const b of this.bolts) { g.beginPath(); b.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
        g.restore();
      }
    }
    if (strike !== null) {
      const yEnd = c * strike, pts = this._strike || (this._strike = this.zig(c, -10, c, c, 6));
      g.save(); g.shadowColor = "rgba(255,240,170,1)"; g.shadowBlur = 20 * k; g.strokeStyle = "#FFFBE6"; g.lineWidth = 3;
      g.beginPath(); let first = true;
      for (const [x, y] of pts) { if (y > yEnd) break; if (first) g.moveTo(x, y); else g.lineTo(x, y); first = false; }
      g.stroke(); g.restore();
    } else this._strike = null;
    if (outP >= 0.7 && outP < 1.25) {
      const w = 320 * k * Math.max(0, 1 - (outP - 0.7) * 1.6);
      g.fillStyle = `rgba(${CY},${Math.max(0, 1 - (outP - 0.7) / 0.55)})`; g.fillRect(c - w / 2, c - 1, w, 2);
    }
    if (flash > 0) {
      const fl = g.createRadialGradient(c, c, 0, c, c, c);
      fl.addColorStop(0, `rgba(255,252,235,${0.95 * flash})`); fl.addColorStop(0.45, `rgba(255,240,190,${0.45 * flash})`); fl.addColorStop(1, "rgba(255,240,190,0)");
      g.fillStyle = fl; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    }
  }
}
const JV_STATE = { idle: "idle", listening: "listen", thinking: "act", speaking: "speak" };
let jvReactor = null;
/** Niveau de l'animation : la vraie voix au micro quand ZEUS écoute, le rythme des phrases quand il parle. */
function jvTarget(t) {
  if (jvState === "listening" && jvAudio) {
    jvAudio.analyser.getByteTimeDomainData(jvAudio.data);
    let sum = 0;
    for (const v of jvAudio.data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / jvAudio.data.length) * 5);
  }
  if (jvState === "listening") return 0.3 + 0.3 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.2));
  if (jvState === "speaking") { jvPulse *= 0.93; return 0.3 + 0.5 * jvPulse + 0.06 * Math.sin(t * 10); }
  if (jvState === "thinking") return 0.35;
  return 0.08 + 0.05 * Math.sin(t * 1.3);
}
/* ================================================================ interface spatiale du mode Jarvis
   Le cœur doré et l'anneau des modules au centre, le fil de la conversation à gauche, l'échange en cours et les
   relevés système à droite (vraies valeurs de ZEUS et de l'ordinateur). Tout est dessiné sur place, sans bibliothèque
   externe : rien à télécharger, et l'animation s'arrête dès que le mode Jarvis est fermé ou la page cachée. */
const JV_MODULES = [["COMMUNICATIONS", /^(phone_send|phone_call|send_|email|mail_|whatsapp|sms|telegram|contact)/],
  ["SÉCURITÉ", /^(ask_human|security|approval|vault)/], ["ANALYSE", /^(web_|fetch|run_python|run_shell|search|kb_|knowledge|read_|pdf|office)/],
  ["AGENDA", /^(agenda|calendar|reminder|task|alarm|schedule|timer)/], ["MÉMOIRE", /^(remember|recall|memory|save_skill|use_skill|flashcard|progress|corrections)/],
  ["TÉLÉPHONE", /^phone_/]];
let jvModule = -1;
function jvModuleOf(tool) { return JV_MODULES.findIndex(([, re]) => re.test(tool || "")); }
function jvWide() { return window.innerWidth >= 1100 && window.innerHeight >= 620; }
function jvCoreLabel() {
  const st = S.status || {}, mods = st.models || [], first = ((st.routing || {}).default) || (mods[0] || {}).id;
  const m = mods.find((x) => x.id === first) || mods[0];
  if (!store.get("tech", false)) return m ? (m.healthy ? "CŒUR · EN LIGNE" : "CŒUR · EN PAUSE") : "CŒUR · HORS LIGNE";
  return m ? `CŒUR · ${m.id}${m.healthy ? "" : " (en pause)"}` : "CŒUR · aucun modèle";
}
function jvFeed() {
  const box = $("#jv-feed");
  if (!box || !S.jarvis) return;
  box.innerHTML = "";
  box.append(h("h3", {}, "Fil de la conversation"));
  const items = S.messages.filter((m) => !m.auto && (m.role === "user" || (m.role === "assistant" && !(m.tool_calls && m.tool_calls.length)))).slice(-6);
  if (!items.length) box.append(h("p", { class: "jv-empty" }, "Rien encore. Parle ou écris à ZEUS."));
  for (const m of items) {
    const txt = plain(lessonText(m.text || "")).replace(/\s+/g, " ").trim();
    box.append(h("div", { class: "jv-bubble " + (m.role === "user" ? "me" : "zeus") },
      h("b", {}, m.role === "user" ? (S.status && S.status.owner) || "Toi" : "ZEUS"), " ", txt.length > 150 ? txt.slice(0, 150) + "…" : txt));
  }
}
const JV_HIST = { cpu: [], mem: [] };
let jvStatsTimer = 0, jvStatusTick = 0;
function jvGb(x) { return x == null ? "—" : `${String(x).replace(".", ",")} Go`; }
async function jvReadouts() {
  if (!S.jarvis) return;
  let sys = null;
  try { sys = await api("/api/system"); } catch { /* relevés indisponibles : on garde les derniers */ }
  if (++jvStatusTick % 3 === 1) { try { await loadStatus(); } catch { /* */ } }
  const st = S.status || {}, mods = st.models || [], ph = st.phone || {}, c = st.costs || {};
  if (sys) {
    JV_HIST.cpu.push(sys.cpu == null ? 0 : sys.cpu); JV_HIST.mem.push(sys.memory ? sys.memory.percent : 0);
    for (const k of ["cpu", "mem"]) if (JV_HIST[k].length > 30) JV_HIST[k].shift();
    S.sys = sys;
  }
  const sy = S.sys || {};
  const first = ((st.routing || {}).default) || (mods[0] || {}).id, main = mods.find((m) => m.id === first);
  const local = mods.find((m) => m.local && m.id !== first);
  const tech = store.get("tech", false);
  const rows = [
    ["Cerveau", main ? `${tech ? main.id + " · " : ""}${main.healthy ? "prêt" : "en pause"}${main.latency ? ` · ${String(main.latency).replace(".", ",")} s` : ""}` : "aucun modèle"],
    ["Secours", local ? (tech ? `${local.model || local.id}` : "prêt") + (local.mini_ready ? " · chargé" : "") : "—"],
    ["Téléphone", ph.connected ? `${(ph.model || "connecté")}${ph.battery && ph.battery.level != null ? " · " + ph.battery.level + " %" : ""}` : "non connecté"],
    ["Tâches en cours", String((st.runs || []).length)],
    ["Processeur", sy.cpu == null ? "—" : `${String(sy.cpu).replace(".", ",")} %${sy.cores ? ` · ${sy.cores} cœurs` : ""}`],
    ["Mémoire", sy.memory ? `${String(sy.memory.percent).replace(".", ",")} % · ${jvGb(sy.memory.used_gb)} / ${jvGb(sy.memory.total_gb)}` : "—"],
    ["Disque libre", sy.disk ? jvGb(sy.disk.free_gb) : "—"],
    ["Dépenses du mois", fmtUsd(c.month || 0)],
  ];
  const dl = $("#jv-stats");
  dl.innerHTML = "";
  for (const [k, v] of rows) dl.append(h("dt", {}, k), h("dd", {}, v));
  jvSpark();
}
function jvSpark() {
  const cv = $("#jv-spark");
  if (!cv || !cv.clientWidth) return;
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight || 56;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(0,229,255,.18)"; g.lineWidth = 1;
  for (const y of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(0, H * y); g.lineTo(W, H * y); g.stroke(); }
  const n = 30, bw = W / n;
  JV_HIST.cpu.forEach((v, i) => { const bh = Math.max(1, v / 100 * (H - 4)); g.fillStyle = "rgba(0,229,255,.75)"; g.fillRect(i * bw + 1, H - bh, bw - 2, bh); });
  if (JV_HIST.mem.length > 1) {
    g.strokeStyle = "#F5C400"; g.lineWidth = 1.6; g.beginPath();
    JV_HIST.mem.forEach((v, i) => { const x = i * bw + bw / 2, y = H - v / 100 * (H - 4); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  }
}
function jvHudStart() {
  clearInterval(jvStatsTimer);
  jvFeed(); jvReadouts();
  jvStatsTimer = setInterval(() => { if (!document.hidden) jvReadouts(); }, 2000);
}
function jvHudStop() { clearInterval(jvStatsTimer); jvStatsTimer = 0; }
$("#jv-type").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("#jv-input").value.trim();
  if (!t) return;
  $("#jv-input").value = "";
  stopSpeaking();
  jarvisEvent("sent", t);
  $("#jv-user").textContent = t;
  sendMessage(t, { keepInput: true });
});
function jvSize() {
  if (jvWide()) return Math.round(Math.min(window.innerWidth * 0.42, window.innerHeight * 0.64, 620));
  return Math.round(Math.min(window.innerWidth * 0.82, window.innerHeight * 0.46, 440));
}
function jvDraw() {
  const cv = $("#jv-canvas");
  if (!jvReactor) jvReactor = new Reactor(cv, { size: jvSize(), state: () => JV_STATE[jvState] || "idle", level: jvTarget, dust: true,
    spatial: true, labels: JV_MODULES.map(([name]) => name), active: () => jvModule, coreLabel: jvCoreLabel });
  else jvReactor.resize(jvSize());
  jvReactor.start();
}

/* réacteur d'accueil : seulement quand l'écran d'accueil est visible */
let heroReactor = null;
function isLightTheme() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--page").trim();
  const m = bg.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  return !!m && (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 3 > 128;
}
function updateHero() {
  const cv = $("#hero-reactor");
  if (!cv) return;
  const show = S.view === "chat" && !$("#welcome").hidden && !document.hidden && !S.jarvis;
  if (!show) { if (heroReactor) heroReactor.stop(); return; }
  const size = cv.getBoundingClientRect().width || 300;
  if (!heroReactor) heroReactor = new Reactor(cv, { size });
  heroReactor.light = isLightTheme();
  if (Math.abs(heroReactor.S - size) > 2) heroReactor.resize(size);
  heroReactor.start();
}
document.addEventListener("visibilitychange", () => { updateHero(); if (jvReactor && S.jarvis) { if (document.hidden) jvReactor.stop(); else jvReactor.start(); } });
window.addEventListener("resize", () => debounce("hero", updateHero, 200));
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(updateHero, 50));
$("#jarvis-btn").addEventListener("click", () => { closeTools(); openJarvis(); });
/* Rôle, cerveau, Jarvis : rangés dans un petit menu « ⋯ » pour ne pas encombrer l'écran */
function closeTools() { $("#chat-tools").hidden = true; $("#tools-btn").setAttribute("aria-expanded", "false"); }
$("#tools-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const box = $("#chat-tools"), open = box.hidden;
  box.hidden = !open; $("#tools-btn").setAttribute("aria-expanded", String(open));
  if (open) setTimeout(() => $("#role-select").focus(), 0);
});
document.addEventListener("click", (e) => { if (!e.target.closest("#chat-tools, #tools-btn")) closeTools(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#chat-tools").hidden) { closeTools(); $("#tools-btn").focus(); } });
$("#jv-close").addEventListener("click", closeJarvis);
$("#jv-orb").addEventListener("click", () => {
  if (S.speaking) { stopSpeaking(); listenOnce({ followUp: true }); return; }
  if (rec) { stopListening(); return; }
  jvSilences = 0;
  listenOnce({ followUp: true });
});
$("#jv-stop").addEventListener("click", async () => {
  stopSpeaking(); stopListening();
  if (S.sid && S.runs.has(S.sid)) { try { await api(`/api/sessions/${S.sid}/stop`, { body: {} }); } catch { /* */ } }
  jvSet("idle");
});
$("#jv-lang").addEventListener("change", (e) => { S.micLang = e.target.value; store.set("micLang", S.micLang); $("#opt-lang").value = S.micLang; if (S.wake) startWake(); jvSet(jvState); });
document.addEventListener("keydown", (e) => {
  if (e.altKey && (e.key === "j" || e.key === "J")) { e.preventDefault(); S.jarvis ? closeJarvis() : openJarvis(); return; }
  if (!S.jarvis) return;
  if (e.key === "Escape") { e.preventDefault(); closeJarvis(); }
  else if (e.key === " " && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $("#jv-orb").click(); }
});
window.addEventListener("resize", () => { if (S.jarvis) debounce("jvdraw", jvDraw, 200); });

/* ================================================================ commandes vocales instantanées (sans IA) */
/* Heure, date, minuteur, ouvrir un site, répéter, parler plus lentement, changer de langue, ajouter à la liste :
   ZEUS répond tout de suite, même hors ligne ou avec un modèle lent. Seulement pour ce qui est dit à la voix. */
const QI_NUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, quinze: 15,
  vingt: 20, trente: 30, quarante: 40, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15,
  twenty: 20, thirty: 30, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, diez: 10, quince: 15, veinte: 20, treinta: 30,
  eins: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, "fünf": 5, zehn: 10, "fünfzehn": 15, zwanzig: 20, "dreißig": 30 };
const QI_SITES = { youtube: "https://www.youtube.com", google: "https://www.google.com", gmail: "https://mail.google.com",
  "google maps": "https://www.google.com/maps", maps: "https://www.google.com/maps", wikipedia: "https://fr.wikipedia.org",
  "wikipédia": "https://fr.wikipedia.org", whatsapp: "https://web.whatsapp.com", "whatsapp web": "https://web.whatsapp.com",
  facebook: "https://www.facebook.com", instagram: "https://www.instagram.com", netflix: "https://www.netflix.com",
  spotify: "https://open.spotify.com", deepl: "https://www.deepl.com/translator", "google traduction": "https://translate.google.com",
  "google translate": "https://translate.google.com", outlook: "https://outlook.live.com", linkedin: "https://www.linkedin.com",
  tiktok: "https://www.tiktok.com", amazon: "https://www.amazon.fr", github: "https://github.com", claude: "https://claude.ai",
  chatgpt: "https://chatgpt.com", x: "https://x.com", twitter: "https://x.com" };
const LANG_OF_WORD = { francais: "fr", "français": "fr", french: "fr", frances: "fr", "francés": "fr", franzosisch: "fr",
  "französisch": "fr", anglais: "en", english: "en", ingles: "en", "inglés": "en", englisch: "en", espagnol: "es", spanish: "es",
  espanol: "es", "español": "es", spanisch: "es", allemand: "de", german: "de", aleman: "de", "alemán": "de", deutsch: "de" };
function qiSay(text, lang) {
  S.followUp = true;
  speak(text, { raw: true, lang });
  toast("" + text, "info", 4000);
  if (S.jarvis) $("#jv-reply").textContent = text;
}
function qiNumber(w) { const x = String(w || "").toLowerCase(); return /^\d+$/.test(x) ? parseInt(x, 10) : QI_NUM[x] || 0; }
function qiTr(map) { return map[micLangCode()] || map.fr; }
/** Renvoie true si la phrase dite est une commande instantanée (traitée sans passer par l'IA). */
function quickIntent(said) {
  const t = String(said || "").trim().replace(/[.!?¿¡]+$/g, "").replace(/^(zeus|jarvis)[,\s]+/i, "");
  const low = t.toLowerCase();
  if (!low) return false;
  const L = micLangCode(), loc = VOICE_LANGS[L];
  const m = sessionMode();
  const lesson = m && (m.id === "prof_langue" || m.id === "interprete");
  // répéter, parler plus lentement / plus vite : utile aussi pendant un cours
  if (/^(r[ée]p[èe]te|tu peux r[ée]p[ée]ter|redis|repeat|say (that|it) again|rep[ií]te(lo)?|otra vez|wiederhol|nochmal)/i.test(low)) {
    if (S.lastAnswer) { S.followUp = true; speak(S.lastAnswer); return true; }
    return false;
  }
  if (/(plus lentement|moins vite|plus doucement|slower|more slowly|slow down|m[aá]s despacio|m[aá]s lento|langsamer)/i.test(low)) {
    S.voiceRate = Math.max(0.55, Math.round(((S.voiceRate || 1) - 0.15) * 100) / 100);
    store.set("voiceRate", S.voiceRate);
    qiSay(qiTr({ fr: "D'accord, je parle plus lentement.", en: "Okay, I'll speak more slowly.", es: "Vale, hablo más despacio.", de: "Okay, ich spreche langsamer." }), L);
    if (S.lastAnswer) speak(S.lastAnswer, { append: true });
    return true;
  }
  if (/(plus vite|parle plus vite|acc[ée]l[èe]re|faster|speed up|m[aá]s r[aá]pido|schneller)/i.test(low)) {
    S.voiceRate = Math.min(1.6, Math.round(((S.voiceRate || 1) + 0.15) * 100) / 100);
    store.set("voiceRate", S.voiceRate);
    qiSay(qiTr({ fr: "D'accord, je parle plus vite.", en: "Okay, I'll speak faster.", es: "Vale, hablo más rápido.", de: "Okay, ich spreche schneller." }), L);
    return true;
  }
  if (/(vitesse normale|normal speed|velocidad normal|normale geschwindigkeit|normales tempo)/i.test(low)) {
    S.voiceRate = 1; store.set("voiceRate", 1);
    qiSay(qiTr({ fr: "Vitesse normale.", en: "Normal speed.", es: "Velocidad normal.", de: "Normales Tempo." }), L);
    return true;
  }
  if (lesson) return false; // en cours ou en interprétation, le reste de ce qui est dit va au professeur / à l'interprète
  if (/\b(quelle heure|l'heure qu'il est|what time is it|what's the time|qu[ée] hora es|wie sp[äa]t ist es|wie viel uhr)\b/i.test(low)) {
    const hm = new Date().toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    qiSay(qiTr({ fr: `Il est ${hm}.`, en: `It's ${hm}.`, es: `Son las ${hm}.`, de: `Es ist ${hm} Uhr.` }), L);
    return true;
  }
  if (/\b(quel jour|quelle date|on est le combien|what day is it|what's the date|today's date|qu[ée] d[ií]a es|qu[ée] fecha|welcher tag|welches datum|der wievielte)\b/i.test(low)) {
    const ds = new Date().toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    qiSay(qiTr({ fr: `Nous sommes le ${ds}.`, en: `Today is ${ds}.`, es: `Hoy es ${ds}.`, de: `Heute ist ${ds}.` }), L);
    return true;
  }
  if (/((annule|arr[eê]te|supprime|stoppe)\s+(le|les|mon|mes)\s+(minuteurs?|chronos?)|cancel (the |my )?timers?|stop (the )?timers?|cancela (el|los) temporizadors?|timer (abbrechen|stoppen))/i.test(low)) {
    for (const x of S.timers) clearTimeout(x.handle);
    S.timers = []; renderTimers();
    qiSay(qiTr({ fr: "Minuteur annulé.", en: "Timer cancelled.", es: "Temporizador cancelado.", de: "Timer abgebrochen." }), L);
    return true;
  }
  const tm = low.match(/(minuteur|chrono|compte à rebours|timer|countdown|temporizador|cuenta atr[aá]s|wecker)\D{0,24}?(\d+|[a-zäöüßéèñ]+)\s*(secondes?|seconds?|segundos?|sekunden?|sec|s|minutes?|minutos?|minuten?|mins?|heures?|hours?|horas?|stunden?|h)\b/i);
  if (tm) {
    const n = qiNumber(tm[2]);
    const unit = /^(h|heure|hour|hora|stund)/.test(tm[3]) ? 3600 : /^(s|sec|seg|sek)/.test(tm[3]) ? 1 : 60;
    if (n > 0 && n * unit <= 24 * 3600) {
      startTimer(n * unit);
      const lab = unit === 1 ? { fr: "secondes", en: "seconds", es: "segundos", de: "Sekunden" } : unit === 60 ? { fr: "minutes", en: "minutes", es: "minutos", de: "Minuten" } : { fr: "heures", en: "hours", es: "horas", de: "Stunden" };
      qiSay(qiTr({ fr: `Minuteur de ${n} ${lab.fr} lancé.`, en: `Timer set for ${n} ${lab.en}.`, es: `Temporizador de ${n} ${lab.es} en marcha.`, de: `Timer für ${n} ${lab.de} gestellt.` }), L);
      return true;
    }
  }
  const lm = low.match(/^(?:parle|parlons|on parle|parle-moi|parle moi|speak|let's speak|talk to me|habla|hablemos|h[aá]blame|sprich|sprechen wir|lass uns)\s+(?:en\s+|in\s+|(?:to me\s+)?in\s+|mit mir\s+)?([a-zçéèñäöüß]+)/i);
  if (lm && LANG_OF_WORD[lm[1]]) {
    const code = LANG_OF_WORD[lm[1]];
    S.micLang = code; store.set("micLang", code);
    $("#opt-lang").value = code; $("#jv-lang").value = code;
    if (S.wake) startWake();
    qiSay(({ fr: "D'accord, parlons français.", en: "Sure, let's speak English.", es: "Claro, hablemos español.", de: "Gern, sprechen wir Deutsch." })[code], code);
    return true;
  }
  const td = t.match(/^(?:ajoute|rajoute|note|mets|inscris)\s+(?:à|a|dans|sur)\s+(?:ma\s+|la\s+)?(?:liste(?:\s+de\s+(?:tâches|taches|courses))?|to-?do(?:\s+list)?)\s*:?\s*(.+)$/i)
    || t.match(/^(?:add|put)\s+(.+?)\s+(?:to|on)\s+my\s+(?:to-?do\s+|shopping\s+)?list$/i)
    || t.match(/^add\s+to\s+my\s+(?:to-?do\s+|shopping\s+)?list\s*:?\s+(.+)$/i)
    || t.match(/^(?:a[ñn]ade|apunta)\s+(.+?)\s+a\s+(?:mi|la)\s+lista$/i)
    || t.match(/^(?:a[ñn]ade|apunta)\s+a\s+(?:mi|la)\s+lista\s*:?\s+(.+)$/i)
    || t.match(/^(?:schreib|setz)\s+(.+?)\s+auf\s+(?:meine|die)\s+liste$/i);
  if (td && td[1].trim().length > 1) {
    const item = td[1].trim().replace(/^(de |d')/i, "");
    api("/api/office/todos", { body: { text: item[0].toUpperCase() + item.slice(1) } }).then(() => { if (S.view === "agenda") loadAgenda(); }).catch((err) => toast(err.message, "error"));
    qiSay(qiTr({ fr: `C'est noté : ${item}.`, en: `Added: ${item}.`, es: `Apuntado: ${item}.`, de: `Notiert: ${item}.` }), L);
    return true;
  }
  const os = t.match(/^(?:ouvre|lance|va sur|open|go to|launch|abre|ve a|[öo]ffne|geh auf)\s+(?:le site\s+|the\s+|el\s+|la\s+)?(.+)$/i);
  if (os && !/t[ée]l[ée]phone|portable|\btel\b|phone|m[oó]vil|handy|celular/i.test(t)) {
    const key = os[1].toLowerCase().replace(/\s+(s'il te pla[iî]t|please|por favor|bitte)$/i, "").trim();
    const url = QI_SITES[key];
    if (url) {
      api("/api/open", { body: { url } }).catch((err) => toast(err.message, "error"));
      qiSay(qiTr({ fr: `J'ouvre ${os[1]}.`, en: `Opening ${os[1]}.`, es: `Abro ${os[1]}.`, de: `Ich öffne ${os[1]}.` }), L);
      return true;
    }
  }
  return false;
}
/* minuteurs dans la page (pour une alarme qui doit sonner même page fermée : « mets une alarme » sur le téléphone) */
function startTimer(secs) {
  const t = { end: Date.now() + secs * 1000, secs };
  t.handle = setTimeout(() => timerDone(t), secs * 1000);
  S.timers.push(t);
  renderTimers();
}
function timerDone(t) {
  S.timers = S.timers.filter((x) => x !== t);
  renderTimers();
  beep();
  const txt = qiTr({ fr: "Le minuteur est terminé !", en: "Time's up!", es: "¡Se acabó el tiempo!", de: "Die Zeit ist um!" });
  toast("" + txt, "success", 12000);
  speak(txt, { raw: true, append: S.speaking });
  if ("Notification" in window && Notification.permission === "granted") new Notification("ZEUS ⏰", { body: txt });
}
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((d) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.25);
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* pas de son */ }
}
function renderTimers() {
  const box = $("#timers");
  box.innerHTML = "";
  box.hidden = !S.timers.length;
  for (const t of S.timers) {
    const left = Math.max(0, Math.round((t.end - Date.now()) / 1000));
    const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
    box.append(h("button", { type: "button", class: "timer-chip", title: "Annuler ce minuteur", onclick: () => { clearTimeout(t.handle); S.timers = S.timers.filter((x) => x !== t); renderTimers(); } },
      `${hh ? hh + ":" + String(mm).padStart(2, "0") : mm}:${String(ss).padStart(2, "0")}`));
  }
}
setInterval(() => { if (S.timers.length) renderTimers(); }, 1000);

/* ================================================================ accueil Jarvis personnalisé */
async function jvGreeting() {
  const L = micLangCode();
  const name = (S.status && S.status.owner) || "";
  const hr = new Date().getHours();
  const hello = { fr: hr < 18 ? "Bonjour" : "Bonsoir", en: hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening",
    es: hr < 12 ? "Buenos días" : hr < 20 ? "Buenas tardes" : "Buenas noches", de: hr < 11 ? "Guten Morgen" : hr < 18 ? "Guten Tag" : "Guten Abend" }[L];
  const m = sessionMode();
  if (m && m.id === "interprete") {
    return `${hello}${name ? " " + name : ""}. ` + ({ fr: "Mode interprète prêt. Parle, je traduis.", en: "Interpreter ready. Speak, I'll translate.",
      es: "Intérprete listo. Habla y traduzco.", de: "Dolmetscher bereit. Sprich, ich übersetze." })[L];
  }
  const bits = [];
  const timeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("délai")), 1500))]);
  try {
    const [o, l] = await Promise.all([timeout(api("/api/office")), timeout(api("/api/learn"))]);
    const now = Date.now() / 1000, night = new Date(); night.setHours(23, 59, 59, 0);
    const today = o.events.filter((e) => e.start >= now && e.start <= night.getTime() / 1000);
    if (today.length) {
      const e = today[0], n = today.length, s = n > 1;
      const hm = new Date(e.start * 1000).toLocaleTimeString(VOICE_LANGS[L], { hour: "2-digit", minute: "2-digit" });
      bits.push({ fr: `Tu as ${n} rendez-vous aujourd'hui ; le prochain : ${e.title}, à ${hm}.`, en: `You have ${n} appointment${s ? "s" : ""} today; next: ${e.title} at ${hm}.`,
        es: `Tienes ${n} cita${s ? "s" : ""} hoy; la próxima: ${e.title} a las ${hm}.`, de: `Du hast heute ${n} Termin${s ? "e" : ""}; als Nächstes: ${e.title} um ${hm}.` }[L]);
    }
    const urgent = o.todos.filter((x) => x.priority === 1).length;
    if (urgent) bits.push({ fr: `${urgent} tâche${urgent > 1 ? "s" : ""} urgente${urgent > 1 ? "s" : ""}.`, en: `${urgent} urgent task${urgent > 1 ? "s" : ""}.`,
      es: `${urgent} tarea${urgent > 1 ? "s" : ""} urgente${urgent > 1 ? "s" : ""}.`, de: `${urgent} dringende Aufgabe${urgent > 1 ? "n" : ""}.` }[L]);
    const due = l.decks.reduce((n, d) => n + (d.due || 0), 0);
    if (due) bits.push({ fr: `${due} carte${due > 1 ? "s" : ""} à réviser.`, en: `${due} card${due > 1 ? "s" : ""} to review.`,
      es: `${due} tarjeta${due > 1 ? "s" : ""} para repasar.`, de: `${due} Karte${due > 1 ? "n" : ""} zum Wiederholen.` }[L]);
  } catch { /* accueil simple */ }
  const listen = { fr: "Je t'écoute.", en: "I'm listening.", es: "Te escucho.", de: "Ich höre dir zu." }[L];
  return `${hello}${name ? " " + name : ""}. ${bits.join(" ")} ${listen}`.replace(/\s+/g, " ").trim();
}
/** Interprète : deux boutons de langue sous l'orbe ; après chaque traduction, le micro passe à l'autre langue. */
function jvInterp() {
  const m = sessionMode();
  const box = $("#jv-interp");
  box.hidden = !(m && m.id === "interprete");
  box.innerHTML = "";
  if (box.hidden) return;
  for (const l of [m.lang, m.lang2]) {
    box.append(h("button", { type: "button", class: "btn" + (micLangCode() === l ? " bolt" : ""), onclick: () => {
      S.interpLang = l; stopSpeaking(); if (rec) stopListening();
      setTimeout(() => listenOnce({ followUp: true }), 250);
      jvInterp();
    } }, `${LANG_FLAG[l]} ${({ fr: "Français", en: "English", es: "Español", de: "Deutsch" })[l]}`));
  }
}

/* ================================================================ dictaphone de réunion → compte rendu */
let meeting = null;
$("#meeting-rec").addEventListener("click", async () => {
  if (meeting) { meeting.mr.stop(); return; }
  if (!(navigator.mediaDevices && window.MediaRecorder)) { toast("Enregistrement impossible dans ce navigateur.", "error"); return; }
  if (S.status && !S.status.stt) toast("Pour transcrire la réunion, ajoute une clé Groq (gratuite) ou OpenAI dans Réglages → Voix.", "info", 9000);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    const chunks = [], t0 = Date.now();
    meeting = { mr, timer: setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); $("#meeting-time").textContent = `● ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }, 1000) };
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      clearInterval(meeting.timer);
      stream.getTracks().forEach((t) => t.stop());
      meeting = null;
      $("#meeting-rec").textContent = "Enregistrer une réunion";
      $("#meeting-time").textContent = "Envoi…";
      const blob = new Blob(chunks, { type: (mr.mimeType || "audio/webm").split(";")[0] });
      try {
        const name = `reunion-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.webm`;
        const up = await api("/api/upload", { body: blob, raw: true, headers: { "X-Filename": encodeURIComponent(name), "Content-Type": blob.type } });
        $("#meeting-time").textContent = "";
        S.attachments = [{ name: up.name, path: up.path }];
        startRoleSession({ id: "secretaire" }, "Voici l'enregistrement de ma réunion. Rédige le compte rendu : participants (si on les entend), points abordés, décisions, actions avec responsable et échéance. Propose ensuite d'ajouter les actions à ma liste de tâches et les échéances à mon agenda.");
      } catch (err) { $("#meeting-time").textContent = ""; toast(err.message, "error"); }
    };
    mr.start(1000);
    $("#meeting-rec").textContent = "Terminer la réunion";
  } catch (err) { toast("Micro : " + err.message, "error"); }
});

/* ================================================================ téléphone */
function stopPhoneTimer() { if (S.phoneTimer) { clearInterval(S.phoneTimer); S.phoneTimer = null; } }
async function initPhone() {
  try {
    const st = await api("/api/phone/status");
    renderPhoneStatus(st);
    if (st.connected) { refreshPhone(); loadQuick(); } else { $("#phone-empty").textContent = st.hint || "Aucun téléphone Android connecté. Suis les étapes à droite."; $("#phone-empty").hidden = false; renderQuick(null); }
  } catch (err) { toast(err.message, "error"); }
  if ($("#phone-auto").checked) S.phoneTimer = setInterval(refreshPhone, 2500);
}
const QUICK = [["wifi", "Wi-Fi"], ["bluetooth", "Bluetooth"], ["donnees", "Données mobiles"], ["ne_pas_deranger", "Ne pas déranger"],
  ["silencieux", "Silencieux"], ["rotation", "Rotation auto"], ["localisation", "Localisation"], ["avion", "Mode avion"]];
async function loadQuick() {
  try { renderQuick((await api("/api/phone/settings")).settings); } catch { renderQuick(null); }
}
async function setPhone(setting, value, silent) {
  try {
    const r = await api("/api/phone/settings", { body: { setting, value: String(value) } });
    if (!silent) toast(r.text, "success", 3500);
  } catch (err) { toast(err.message, "error", 7000); }
}
function renderQuick(st) {
  const grid = $("#phone-quick"), sl = $("#phone-sliders");
  grid.innerHTML = ""; sl.innerHTML = "";
  $("#quick-hint").textContent = st ? "Instantané, sans passer par l'écran." : "Branche un téléphone Android pour utiliser les commandes directes.";
  if (!st) return;
  const state = { ...st, silencieux: st.sonnerie === "0 %" };
  for (const [key, label] of QUICK) {
    const known = typeof state[key] === "boolean";
    const on = !!state[key];
    const b = h("button", { type: "button", class: "quick" + (on ? " on" : ""), "aria-pressed": String(on) },
      h("span", { class: "q-name" }, label), h("span", { class: "q-state" }, known ? (on ? "Activé" : "Désactivé") : "—"));
    b.onclick = async () => {
      if (key === "avion" && !on && !confirm("Activer le mode avion coupe le réseau du téléphone (et ZEUS si le téléphone est relié en Wi-Fi). Continuer ?")) return;
      b.disabled = true;
      await setPhone(key, on ? "off" : "on");
      loadQuick();
    };
    grid.append(b);
  }
  const slider = (label, key, value, extra) => {
    const num = parseInt(value, 10);
    const r = h("input", { type: "range", min: 0, max: 100, step: 5, value: Number.isFinite(num) ? num : 50, "aria-label": label });
    const out = h("span", { class: "muted small" }, Number.isFinite(num) ? num + " %" : String(value || "—"));
    r.oninput = () => { out.textContent = r.value + " %"; };
    r.onchange = () => debounce("sl-" + key, () => setPhone(key, r.value, true), 250);
    sl.append(h("div", { class: "slider-row" }, h("span", {}, label), r, out, extra || h("span")));
  };
  slider("Luminosité", "luminosite", st.luminosite, h("button", { type: "button", class: "btn small", onclick: async () => { await setPhone("luminosite", "auto"); loadQuick(); } }, "Auto"));
  if (st.volume !== undefined) slider("Volume médias", "volume", st.volume);
  if (st.sonnerie !== undefined) slider("Sonnerie", "sonnerie", st.sonnerie);
}
$("#alarm-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = { kind: "alarme", time: $("#alarm-time").value, label: $("#alarm-label").value.trim() };
  if ($("#alarm-week").checked) body.days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"];
  try { toast((await api("/api/phone/alarm", { body })).text, "success"); $("#alarm-label").value = ""; } catch (err) { toast(err.message, "error"); }
});
$("#timer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const m = Math.max(1, parseInt($("#timer-min").value, 10) || 0);
  try { toast((await api("/api/phone/alarm", { body: { kind: "minuteur", seconds: m * 60 } })).text, "success"); } catch (err) { toast(err.message, "error"); }
});
function renderPhoneStatus(st) {
  const rows = st.connected ? [
    ["Appareil", `${st.manufacturer || ""} ${st.model || ""}`], ["Android", st.android], ["Batterie", st.battery ? `${st.battery.level} %${st.battery.charging ? " (en charge)" : ""}` : "—"],
    ["Écran", st.on ? (st.locked ? "allumé, verrouillé" : "allumé") : "éteint"], ["Appli", st.app || "—"],
    ["Accents à la saisie", st.adb_keyboard ? "oui (ADBKeyboard)" : "non — installe ADBKeyboard"], ["Série", st.serial],
  ] : [["ADB", st.adb ? "installé" : "absent — lance « python zeus.py phone »"], ["Appareils vus", (st.devices || []).map((d) => `${d.serial} (${d.state})`).join(", ") || "aucun"],
    ["Termux:API", st.termux_api ? "oui" : "non"], ["Conseil", st.hint || st.error || "Active le débogage USB puis branche le téléphone."]];
  $("#phone-status").innerHTML = rows.map(([k, v]) => `<span class="k">${esc(k)}</span><span>${esc(v ?? "—")}</span>`).join("");
  $("#phone-sub").textContent = st.connected ? `${st.manufacturer || ""} ${st.model || ""} connecté.` : "Aucun téléphone connecté.";
}
async function refreshPhone() {
  const img = $("#phone-img");
  const url = "/api/phone/screen.png?fresh=1&t=" + Date.now();
  await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
  const ok = img.naturalWidth > 0;
  $("#phone-empty").hidden = ok;
  if (ok && $("#phone-boxes").checked) drawBoxes(); else $("#phone-overlay").innerHTML = "";
}
async function drawBoxes() {
  try {
    const r = await api("/api/phone/elements?fresh=1");
    const img = $("#phone-img");
    const W = img.naturalWidth, H = img.naturalHeight;
    const svg = $("#phone-overlay");
    const box = img.getBoundingClientRect();
    const scale = Math.min(box.width / W, box.height / H);
    const ox = (box.width - W * scale) / 2, oy = (box.height - H * scale) / 2;
    svg.setAttribute("viewBox", `${-ox / scale} ${-oy / scale} ${box.width / scale} ${box.height / scale}`);
    svg.innerHTML = r.elements.filter((e) => e.clickable || e.editable).map((e) => {
      const [x1, y1, x2, y2] = e.bounds;
      return `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" rx="8"/><text x="${x1 + 6}" y="${y1 + 30}">${e.i}</text>`;
    }).join("");
  } catch { /* pas d'éléments */ }
}
function imgPoint(e) {
  const img = $("#phone-img");
  const r = img.getBoundingClientRect();
  const W = img.naturalWidth, H = img.naturalHeight;
  const scale = Math.min(r.width / W, r.height / H);
  const ox = (r.width - W * scale) / 2, oy = (r.height - H * scale) / 2;
  return { x: Math.round((e.clientX - r.left - ox) / scale), y: Math.round((e.clientY - r.top - oy) / scale), W, H };
}
let drag = null;
$("#phone-img").addEventListener("pointerdown", (e) => { if (!$("#phone-img").naturalWidth) return; drag = { ...imgPoint(e), t: Date.now() }; e.preventDefault(); });
$("#phone-img").addEventListener("pointerup", async (e) => {
  if (!drag) return;
  const p = imgPoint(e), d = drag; drag = null;
  if (p.x < 0 || p.y < 0 || p.x > p.W || p.y > p.H) return;
  const dist = Math.hypot(p.x - d.x, p.y - d.y);
  const body = dist > 40 ? { action: "swipe", x1: d.x, y1: d.y, x2: p.x, y2: p.y, ms: Math.max(150, Math.min(Date.now() - d.t, 1200)) }
    : (Date.now() - d.t > 600 ? { action: "swipe", x1: d.x, y1: d.y, x2: d.x, y2: d.y, ms: 900 } : { action: "tap", x: d.x, y: d.y });
  try { await api("/api/phone/action", { body }); setTimeout(refreshPhone, 600); } catch (err) { toast(err.message, "error"); }
});
for (const b of $$("[data-key]")) b.addEventListener("click", async () => {
  try { await api("/api/phone/action", { body: b.dataset.key === "wake" ? { action: "wake" } : { action: "key", key: b.dataset.key } }); setTimeout(refreshPhone, 700); }
  catch (err) { toast(err.message, "error"); }
});
$("#phone-refresh").addEventListener("click", async () => { try { renderPhoneStatus(await api("/api/phone/status")); } catch { /* */ } refreshPhone(); });
$("#phone-auto").addEventListener("change", (e) => { stopPhoneTimer(); if (e.target.checked) S.phoneTimer = setInterval(refreshPhone, 2500); });
$("#phone-boxes").addEventListener("change", () => refreshPhone());
$("#phone-type-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = $("#phone-type").value; if (!t) return;
  try { await api("/api/phone/action", { body: { action: "text", text: t } }); $("#phone-type").value = ""; setTimeout(refreshPhone, 600); } catch (err) { toast(err.message, "error"); }
});
$("#phone-ask").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = $("#phone-ask-input").value.trim(); if (!t) return;
  $("#phone-ask-input").value = "";
  $("#phone-auto").checked = true; stopPhoneTimer(); S.phoneTimer = setInterval(refreshPhone, 2500);
  await sendMessage("Sur mon téléphone : " + t, { keepInput: true });
  toast("ZEUS s'en occupe — suis l'écran ici, ou le détail dans Parler.", "success");
});

/* ================================================================ dossiers */
const DOSSIER_FILTERS = [["", "Tous"], ["nouveau", "Nouveaux"], ["incomplet", "Pièces manquantes"], ["complet", "Complets"], ["en_verification", "En vérification"], ["besoin_humain", "Besoin d'un agent"], ["valide", "Validés"], ["rejete", "Rejetés"], ["cloture", "Clôturés"]];
$("#dossier-search").addEventListener("input", () => debounce("dsearch", () => loadDossiers(S.dossierSel), 300));
$("#dossier-new-btn").addEventListener("click", async () => {
  const procs = (await api("/api/procedures")).procedures;
  const f = $("#dialog-form");
  f.innerHTML = "";
  const sel = h("select", { name: "procedure" }, procs.map((p) => h("option", { value: p.id }, p.name)));
  const name = h("input", { name: "applicant_name", placeholder: "Nom du demandeur" });
  const contact = h("input", { name: "contact", placeholder: "Numéro WhatsApp, chat Telegram ou e-mail (facultatif)" });
  const ch = h("select", { name: "channel" }, [["manuel", "Saisie manuelle"], ["whatsapp", "WhatsApp"], ["telegram", "Telegram"], ["email", "E-mail"]].map(([v, l]) => h("option", { value: v }, l)));
  f.append(h("h3", { style: "margin:0" }, "Nouveau dossier"), h("label", {}, "Démarche"), sel, h("label", {}, "Demandeur"), name, contact, ch,
    h("div", { class: "dialog-actions" }, h("button", { class: "btn", value: "cancel" }, "Annuler"), h("button", { class: "btn bolt", value: "ok" }, "Créer le dossier")));
  $("#dialog").showModal();
  $("#dialog").onclose = async () => {
    if ($("#dialog").returnValue !== "ok") return;
    const d = await api("/api/dossiers", { body: { procedure: sel.value, applicant_name: name.value, contact: contact.value, channel: ch.value } });
    location.hash = "#dossiers/" + d.id;
  };
});
async function loadDossiers(sel) {
  if (sel !== undefined) S.dossierSel = sel || null;
  const q = $("#dossier-search").value.trim();
  let data;
  try { data = await api(`/api/dossiers?status=${encodeURIComponent(S.dossierFilter)}&q=${encodeURIComponent(q)}`); } catch (err) { return toast(err.message, "error"); }
  const counts = data.counts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const fbox = $("#dossier-filters");
  fbox.innerHTML = "";
  for (const [v, l] of DOSSIER_FILTERS) {
    const n = v ? counts[v] || 0 : total;
    if (v && !n && S.dossierFilter !== v) continue;
    fbox.append(h("button", { class: "filter" + (S.dossierFilter === v ? " active" : ""), onclick: () => { S.dossierFilter = v; loadDossiers(); } }, l, h("b", {}, n)));
  }
  const list = $("#dossier-list");
  list.innerHTML = "";
  if (!data.dossiers.length) {
    list.append(h("div", { class: "item" }, h("p", {}, "Aucun dossier ici."), h("p", { class: "muted small" }, "Les dossiers arrivent tout seuls quand un usager écrit sur WhatsApp, Telegram ou par e-mail (si le guichet est activé). Tu peux aussi en créer un.")));
  }
  for (const d of data.dossiers) {
    const pct = d.required ? Math.round((d.received || 0) / d.required * 100) : 0;
    list.append(h("button", { class: "dossier-row" + (d.id === S.dossierSel ? " active" : ""), onclick: () => { location.hash = "#dossiers/" + d.id; } },
      h("span", {}, h("span", { class: "id" }, d.id), " ", h("span", {}, d.title)),
      h("span", { class: `pill ${d.status}` }, d.status_label),
      h("span", { class: "who" }, `${d.applicant_name || d.contact || "—"} · ${d.missing ? d.missing + " pièce(s) manquante(s)" : "aucune pièce manquante"}${d.problems ? " · " + d.problems + " à refaire" : ""}`),
      h("span", { class: "who" }, fmtTime(d.updated)),
      h("span", { class: "prog" }, h("i", { style: `width:${pct}%` }))));
  }
  $(".dossier-layout").classList.toggle("single", !S.dossierSel);
  if (S.dossierSel) showDossier(S.dossierSel); else $("#dossier-detail").hidden = true;
}
async function showDossier(id) {
  let r;
  try { r = await api(`/api/dossiers/${id}`); } catch (err) { $("#dossier-detail").hidden = true; return toast(err.message, "error"); }
  const d = r.dossier, c = r.check;
  const box = $("#dossier-detail");
  box.hidden = false;
  box.innerHTML = "";
  box.append(h("div", { class: "row between" }, h("div", {}, h("h2", { style: "font-size:1.5rem" }, d.id), h("p", { class: "muted", style: "margin:.2rem 0" }, d.title)), h("span", { class: `pill ${d.status}` }, r.status_label)));
  box.append(h("div", { class: "kv", style: "margin-top:.8rem" },
    h("span", { class: "k" }, "Demandeur"), h("span", {}, d.applicant_name || "—"),
    h("span", { class: "k" }, "Contact"), h("span", {}, `${CHANNEL_ICON[d.channel] || ""} ${d.contact || "—"}`),
    h("span", { class: "k" }, "Créé"), h("span", {}, fmtTime(d.created)),
    h("span", { class: "k" }, "Échéance"), h("span", {}, d.due ? fmtTime(d.due) : "—"),
    ...Object.entries(d.fields || {}).flatMap(([k, v]) => [h("span", { class: "k" }, k.replace(/_/g, " ")), h("span", {}, String(v))])));
  box.append(h("h3", {}, "Pièces demandées"));
  const ul = h("ul", { class: "checklist" });
  for (const x of c.received) {
    const pb = c.problems.find((p) => p.doc === x.doc);
    ul.append(h("li", { class: pb ? "bad" : "yes" }, h("span", { class: "mark" }, pb ? "!" : "✓"), h("span", {}, h("strong", {}, x.label), h("br"), h("span", { class: "muted small" }, pb ? `${x.file} — ${pb.problem}` : x.file))));
  }
  for (const m of c.missing) ul.append(h("li", { class: "no" }, h("span", { class: "mark" }, "○"), h("span", {}, h("strong", {}, m.label), m.note ? h("span", { class: "muted small" }, " — " + m.note) : "")));
  box.append(ul);
  if (c.optional_missing && c.optional_missing.length) box.append(h("p", { class: "muted small" }, "Facultatif non fourni : " + c.optional_missing.join(", ")));
  const actions = h("div", { class: "actions-bar" });
  const setStatus = async (status, needNote) => {
    let note = "";
    if (needNote) { note = prompt(status === "rejete" ? "Motif du rejet (envoyé au demandeur) :" : "Note :") || ""; if (status === "rejete" && !note) return; }
    const notify = r.can_message && ["valide", "rejete", "en_verification"].includes(status) ? confirm("Prévenir le demandeur par message ?") : false;
    await api(`/api/dossiers/${d.id}`, { body: { status, note, notify } });
    toast("Dossier mis à jour.", "success"); loadDossiers(d.id);
  };
  if (["complet", "nouveau", "incomplet", "besoin_humain"].includes(d.status)) actions.append(h("button", { class: "btn", onclick: () => setStatus("en_verification") }, "Passer en vérification"));
  if (d.status !== "valide") actions.append(h("button", { class: "btn bolt", onclick: () => setStatus("valide", true) }, "Valider"));
  if (d.status !== "rejete") actions.append(h("button", { class: "btn", onclick: () => setStatus("rejete", true) }, "Rejeter"));
  if (!c.complete) actions.append(h("button", { class: "btn", onclick: () => relanceDialog(d, r) }, "Relancer"));
  actions.append(h("a", { class: "btn", href: `/api/dossiers/${d.id}/export` }, "Exporter (ZIP)"));
  const up = h("input", { type: "file", hidden: true, multiple: true, onchange: async (e) => {
    for (const f of e.target.files) {
      const u = await api("/api/upload", { body: f, raw: true, headers: { "X-Filename": encodeURIComponent(f.name), "Content-Type": "application/octet-stream" } });
      await api(`/api/dossiers/${d.id}/attach`, { body: { path: u.path, name: f.name } });
    }
    toast("Pièce(s) ajoutée(s) et classée(s).", "success"); loadDossiers(d.id);
  } });
  actions.append(h("button", { class: "btn", onclick: () => up.click() }, "Ajouter une pièce"), up);
  if (d.session_id) actions.append(h("button", { class: "btn ghost", onclick: () => { location.hash = "#chat"; openSession(d.session_id); } }, "Voir la conversation"));
  if (d.status !== "cloture") actions.append(h("button", { class: "btn ghost", onclick: () => setStatus("cloture") }, "Clôturer"));
  box.append(actions);
  if (r.documents.length) {
    box.append(h("h3", {}, `Pièces reçues (${r.documents.length})`));
    const grid = h("div", { class: "docs" });
    const types = (S.status && S.status.doc_types) || {};
    for (const x of r.documents) {
      const sel = h("select", { onchange: async (e) => { await api(`/api/documents/${x.id}`, { body: { doc_type: e.target.value } }); toast("Pièce reclassée.", "success"); loadDossiers(d.id); } },
        Object.entries(types).map(([k, l]) => h("option", { value: k, selected: k === x.doc_type }, l)));
      grid.append(h("div", { class: "doc" },
        x.image ? h("img", { src: x.url, alt: x.filename, onclick: () => zoom(x.url) }) : h("a", { class: "ph", href: x.url, target: "_blank", style: "text-decoration:none" }, "📄"),
        h("div", { style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap", title: x.filename }, x.filename),
        h("div", { class: "muted" }, `${Math.round((x.confidence || 0) * 100)} % sûr`),
        x.problem ? h("div", { class: "prob" }, "" + x.problem) : null, sel));
    }
    box.append(grid);
  }
  if (d.notes) box.append(h("h3", {}, "Notes"), h("pre", {}, d.notes.trim()));
  box.append(h("h3", {}, "Journal du dossier"));
  const kinds = { creation: "Création", piece: "Pièce reçue", statut: "Statut", relance: "Relance envoyée", relance_brouillon: "Relance préparée", message: "Message envoyé", note: "Note", info: "Information", reclassement: "Reclassement", export: "Export", procedure: "Démarche", erreur: "Erreur" };
  box.append(h("ul", { class: "timeline" }, r.events.slice().reverse().map((e) => {
    let detail = e.detail;
    try { const j = JSON.parse(e.detail); detail = j.fichier ? `${j.fichier} → ${types[j.type] || j.type}${j.problemes && j.problemes.length ? " ⚠ " + j.problemes.join(", ") : ""}` : j.vers ? `${j.de || ""} → ${j.vers}${j.note ? " : " + j.note : ""}` : (j.texte || j.note || j.info || j.procedure || JSON.stringify(j)); } catch { /* texte brut */ }
    return h("li", {}, h("time", {}, fmtTime(e.ts)), h("span", {}, h("strong", {}, kinds[e.kind] || e.kind), " — ", String(detail).slice(0, 300), e.actor ? h("span", { class: "muted" }, ` (${e.actor})`) : ""));
  })));
}
function relanceDialog(d, r) {
  const f = $("#dialog-form");
  f.innerHTML = "";
  const ta = h("textarea", { class: "draft" });
  f.append(h("h3", { style: "margin:0" }, `Relancer ${d.applicant_name || d.contact || d.id}`), h("p", { class: "muted small", style: "margin:0" }, r.can_message ? `Envoyé via ${d.channel} à ${d.contact}.` : "Le canal du demandeur n'est pas connecté : copie le texte pour l'envoyer toi-même."), ta,
    h("div", { class: "dialog-actions" }, h("button", { class: "btn", value: "cancel" }, "Annuler"), r.can_message ? h("button", { class: "btn bolt", value: "send" }, "Envoyer la relance") : h("button", { class: "btn bolt", value: "copy" }, "Copier le texte")));
  api(`/api/dossiers/${d.id}/relance`, { body: { send: false } }).then((x) => { ta.value = r.draft || x.text; });
  $("#dialog").showModal();
  $("#dialog").onclose = async () => {
    const v = $("#dialog").returnValue;
    if (v === "send") { const x = await api(`/api/dossiers/${d.id}/relance`, { body: { send: true, message: ta.value } }); toast(x.sent ? "Relance envoyée." : "Envoi impossible.", x.sent ? "success" : "error"); loadDossiers(d.id); }
    if (v === "copy") { navigator.clipboard?.writeText(ta.value); toast("Texte copié.", "success"); }
  };
}

/* ================================================================ mémoire */
$("#memory-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = $("#memory-input").value.trim(); if (!t) return;
  await api("/api/memories", { body: { content: t, kind: "fait", importance: 3 } });
  $("#memory-input").value = ""; loadMemory();
});
$("#memory-search").addEventListener("input", () => debounce("msearch", loadMemory, 300));
async function loadMemory() {
  const q = $("#memory-search").value.trim();
  const [mems, skills] = await Promise.all([api("/api/memories?q=" + encodeURIComponent(q)), api("/api/skills")]);
  if (S.status) $("#skills-dir").textContent = S.status.home + "/skills";
  const ml = $("#memory-list");
  ml.innerHTML = "";
  if (!mems.length) ml.append(h("p", { class: "muted" }, q ? "Rien trouvé." : "ZEUS n'a encore rien mémorisé. Il retient tout seul ce qui compte, ou ajoute un souvenir ici."));
  const kinds = { preference: "Préférence", profil: "Profil", contact: "Contact", fait: "Fait", projet: "Projet" };
  for (const m of mems) {
    ml.append(h("div", { class: "item" }, h("div", { class: "top" }, h("span", {}, m.content),
      h("button", { class: "btn ghost small", title: "Supprimer", onclick: async () => { await api(`/api/memories/${m.id}`, { method: "DELETE" }); loadMemory(); } }, "Oublier")),
      h("div", { class: "meta" }, `${kinds[m.kind] || m.kind} · importance ${m.importance}/5 · ${m.source || ""} · ${fmtTime(m.updated)}`)));
  }
  const sl = $("#skill-list");
  sl.innerHTML = "";
  if (!skills.length) sl.append(h("p", { class: "muted" }, "Aucune compétence encore. Après une tâche complexe réussie, ZEUS enregistre la méthode pour la refaire plus vite."));
  const srcLabel = (src) => (src || "").startsWith("lien:") ? "installée" : ({ zeus: "apprise", "zeus-base": "de base", web: "ajoutée par toi", fichier: "fichier SKILL.md" })[src] || "";
  for (const s of skills) {
    const lab = srcLabel(s.source);
    sl.append(h("details", { class: "item" }, h("summary", { style: "cursor:pointer" }, h("strong", {}, s.name), lab ? h("span", { class: "pill", style: "margin-left:.5em", title: (s.source || "").replace(/^lien:/, "") }, lab) : null, h("span", { class: "meta" }, ` — ${s.description} · utilisée ${s.uses} fois`)),
      h("pre", {}, s.content), h("button", { class: "btn ghost small", onclick: async () => { if (confirm("Supprimer cette compétence ?")) { await api(`/api/skills/${encodeURIComponent(s.name)}`, { method: "DELETE" }); loadMemory(); } } }, "Supprimer")));
  }
}

$("#skill-install").addEventListener("submit", (e) => { e.preventDefault(); installSkill($("#skill-url").value.trim(), false); });
async function installSkill(url, force) {
  const box = $("#skill-install-result");
  box.innerHTML = "";
  if (!url) return;
  let r;
  try { r = await api("/api/skills/install", { body: { url, force } }); } catch (err) { box.append(h("p", { class: "error" }, err.message)); return; }
  if (r.ok) {
    toast(`Compétence « ${r.name} » ${r.replaced ? "mise à jour" : "installée"}.`, "success");
    $("#skill-url").value = "";
    loadMemory();
    return;
  }
  box.append(h("div", { class: "warn-box" },
    h("p", { class: "what" }, `« ${r.name} » n'a pas été installée : la vérification de sécurité a trouvé des points suspects.`),
    h("ul", {}, (r.warnings || []).map((w) => h("li", {}, w))),
    h("p", { class: "muted small" }, "Une compétence est une suite d'instructions que ZEUS suivra. N'installe que si tu fais confiance à sa source."),
    h("div", { class: "row gap" }, h("button", { class: "btn small", onclick: () => { if (confirm("Installer malgré ces alertes ?")) installSkill(url, true); } }, "Installer quand même"),
      h("button", { class: "btn ghost small", onclick: () => { box.innerHTML = ""; } }, "Annuler"))));
}

/* ================================================================ tâches */
$("#task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#task-error").textContent = "";
  try {
    await api("/api/tasks", { body: { prompt: $("#task-prompt").value.trim(), when: $("#task-when").value.trim(), kind: $("#task-kind").value } });
    $("#task-prompt").value = ""; $("#task-when").value = ""; loadTasks(); toast("Tâche planifiée.", "success");
  } catch (err) { $("#task-error").textContent = err.message; }
});
async function loadTasks() {
  loadBrief();
  loadTriggers();
  const rows = await api("/api/tasks");
  const box = $("#task-list");
  box.innerHTML = "";
  if (!rows.length) box.append(h("p", { class: "muted" }, "Aucune tâche. Exemple : « Résume mes e-mails non lus » chaque jour à 8h."));
  for (const t of rows) {
    const system = (t.kind || "").startsWith("system");
    box.append(h("div", { class: "item" },
      h("div", { class: "top" }, h("strong", {}, t.name), h("span", { class: "meta" }, t.when)),
      h("div", { class: "meta" }, `${t.enabled ? "Prochaine fois : " + fmtTime(t.next_run) : "En pause"} · exécutée ${t.runs} fois${t.last_run ? " · dernière : " + fmtTime(t.last_run) : ""}`),
      t.last_result ? h("details", {}, h("summary", { class: "muted small" }, "Dernier résultat"), h("div", { class: "md small", html: md(t.last_result) })) : null,
      h("div", { class: "row wrap gap", style: "margin-top:.5rem" },
        h("button", { class: "btn small", onclick: async () => { await api(`/api/tasks/${t.id}/run`, { body: {} }); toast("Lancée.", "success"); } }, "Lancer maintenant"),
        h("button", { class: "btn small", onclick: async () => { await api(`/api/tasks/${t.id}`, { body: { enabled: !t.enabled } }); loadTasks(); } }, t.enabled ? "Mettre en pause" : "Reprendre"),
        system ? null : h("button", { class: "btn ghost small", onclick: async () => { if (confirm("Supprimer cette tâche ?")) { await api(`/api/tasks/${t.id}`, { method: "DELETE" }); loadTasks(); } } }, "Supprimer"))));
  }
}

/* ---------------------------------------------------------------- brief du matin */
async function loadBrief() {
  let b;
  try { b = await api("/api/brief"); } catch { return; }
  const card = $("#brief-card");
  card.innerHTML = "";
  const city = h("input", { value: b.city || "", placeholder: "Ta ville (ex. Kinshasa)", "aria-label": "Ville pour la météo" });
  const time = h("input", { type: "time", value: b.time || "07:00", "aria-label": "Heure du brief", class: "time-input" });
  const daily = h("input", { type: "checkbox", checked: b.scheduled && b.enabled });
  appendAll(card, 
    h("div", { class: "row between wrap" }, h("div", {}, h("h3", { style: "margin:0" }, "Brief du matin"),
      h("p", { class: "muted small", style: "margin:.25rem 0 0" }, "Météo, messages importants reçus sur ton téléphone, rendez-vous, dossiers et 3 priorités du jour.")),
      h("button", { class: "btn bolt", onclick: async () => {
        try { const r = await api("/api/brief", { body: { action: "run", city: city.value.trim() } }); S.sid = r.session_id; store.set("sid", r.session_id); location.hash = "#chat"; await loadSessions(); openSession(r.session_id); }
        catch (err) { toast(err.message, "error"); }
      } }, "Faire mon brief maintenant")),
    h("div", { class: "row wrap gap", style: "margin-top:.8rem" }, city,
      h("label", { class: "toggle" }, daily, "Chaque jour à"), time,
      h("button", { class: "btn", onclick: async () => {
        try {
          const r = daily.checked ? await api("/api/brief", { body: { action: "schedule", time: time.value || "07:00", city: city.value.trim() } })
            : await api("/api/brief", { body: { action: "unschedule", city: city.value.trim() } });
          toast(r.scheduled ? `Brief programmé chaque jour à ${r.time}.` : "Brief quotidien désactivé.", "success");
          loadTasks();
        } catch (err) { toast(err.message, "error"); }
      } }, "Enregistrer")),
    b.scheduled ? h("p", { class: "muted small", style: "margin:.5rem 0 0" }, b.enabled ? `Prochain brief : ${fmtTime(b.next_run)} — envoyé ici et sur tes canaux (Telegram…).` : "Programmé, mais en pause.") : null);
}

/* ---------------------------------------------------------------- surveillance du téléphone */
$("#trg-action").addEventListener("change", () => { $("#trg-prompt").hidden = $("#trg-action").value !== "agent"; });
$("#trigger-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#trigger-error").textContent = "";
  const body = { name: $("#trg-name").value.trim(), app: $("#trg-app").value, sender: $("#trg-sender").value.trim(),
    contains: $("#trg-contains").value.trim(), action: $("#trg-action").value, prompt: $("#trg-prompt").value.trim() };
  try {
    await api("/api/triggers", { body });
    for (const id of ["#trg-name", "#trg-sender", "#trg-contains", "#trg-prompt"]) $(id).value = "";
    toast("Surveillance ajoutée.", "success");
    loadTriggers();
  } catch (err) { $("#trigger-error").textContent = err.message; }
});
async function loadTriggers() {
  let r;
  try { r = await api("/api/triggers"); } catch { return; }
  const w = r.watcher || {};
  const ph = (S.status || {}).phone || {};
  $("#watch-state").textContent = !r.triggers.length ? "" : !ph.connected ? "En attente du téléphone : la surveillance démarre dès qu'il est connecté."
    : w.last_poll ? `Surveillance active — dernière lecture ${fmtTime(w.last_poll)}${w.error ? " · ⚠️ " + w.error : ""}` : "Surveillance active.";
  const box = $("#trigger-list");
  box.innerHTML = "";
  if (!r.triggers.length) box.append(h("p", { class: "muted" }, "Aucune surveillance. Exemple : WhatsApp + « Maman » → me prévenir. Ou dis simplement à ZEUS : « préviens-moi si mon patron m'écrit »."));
  const appName = { "": "toutes les applis", whatsapp: "WhatsApp", sms: "SMS", appel: "Appels", telegram: "Telegram", gmail: "Gmail", mpesa: "M-Pesa" };
  for (const t of r.triggers) {
    const cond = [`${appName[t.app] || t.app || "toutes les applis"}`, t.sender ? `${t.sender}` : "", t.contains ? `${t.contains}` : ""].filter(Boolean).join(" · ");
    box.append(h("div", { class: "item" + (t.enabled ? "" : " paused") },
      h("div", { class: "top" }, h("strong", {}, t.name), h("span", { class: "meta" }, t.action === "agent" ? "ZEUS agit" : "te prévient")),
      h("div", { class: "meta" }, cond),
      t.action === "agent" && t.prompt ? h("div", { class: "meta" }, "→ " + t.prompt) : null,
      h("div", { class: "meta" }, `${t.enabled ? "Active" : "En pause"} · déclenchée ${t.fires} fois${t.last_fired ? " · dernière : " + fmtTime(t.last_fired) : ""}`),
      t.last_event ? h("div", { class: "meta mono" }, t.last_event) : null,
      h("div", { class: "row wrap gap", style: "margin-top:.5rem" },
        h("button", { class: "btn small", onclick: async () => { const x = await api(`/api/triggers/${t.id}/test`, { body: {} }); toast(`Test envoyé (${x.event.title} : ${x.event.text}).`, "success"); loadTriggers(); } }, "Tester"),
        h("button", { class: "btn small", onclick: async () => { await api(`/api/triggers/${t.id}`, { body: { enabled: !t.enabled } }); loadTriggers(); } }, t.enabled ? "Mettre en pause" : "Reprendre"),
        h("button", { class: "btn ghost small", onclick: async () => { if (confirm("Supprimer cette surveillance ?")) { await api(`/api/triggers/${t.id}`, { method: "DELETE" }); loadTriggers(); } } }, "Supprimer"))));
  }
}

/* ================================================================ journal */
$("#audit-search").addEventListener("input", () => debounce("asearch", loadAudit, 300));
async function loadAudit() {
  const rows = await api("/api/audit?q=" + encodeURIComponent($("#audit-search").value.trim()));
  $("#audit-list").innerHTML = rows.length ? `<table class="data"><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Détail</th></tr>${rows.map((r) =>
    `<tr><td>${fmtTime(r.ts)}</td><td>${esc(r.actor)}</td><td>${esc(r.action)}</td><td class="mono">${esc((r.detail || "").slice(0, 400))}</td></tr>`).join("")}</table>` : '<p class="muted">Rien pour l\'instant.</p>';
}

/* ================================================================ réglages */
let CFG = null;
function field(label, input, hint, wide) { return h("div", { class: "field" + (wide ? " wide" : "") }, h("label", {}, label), input, hint ? h("span", { class: "hint" }, hint) : null); }
function inp(path, attrs = {}) {
  const v = getPath(CFG, path);
  const el = h("input", { ...attrs, value: Array.isArray(v) ? v.join(", ") : (v ?? "") });
  el.dataset.path = path;
  if (Array.isArray(v) || attrs["data-list"]) el.dataset.list = "1";
  return el;
}
function chk(path, label) {
  const el = h("input", { type: "checkbox", checked: !!getPath(CFG, path) });
  el.dataset.path = path; el.dataset.bool = "1";
  return h("label", { class: "toggle" }, el, label);
}
function getPath(o, p) { return p.split(".").reduce((a, k) => (a && a[k] !== undefined ? a[k] : undefined), o); }
function setPath(o, p, v) { const ks = p.split("."); let c = o; for (const k of ks.slice(0, -1)) c = c[k] = c[k] || {}; c[ks.at(-1)] = v; }
function collect(root) {
  const patch = {};
  for (const el of $$("[data-path]", root)) {
    let v = el.dataset.bool ? el.checked : el.value;
    if (el.dataset.list) v = String(v).split(",").map((x) => x.trim()).filter(Boolean);
    if (el.type === "number") v = v === "" ? null : Number(v);
    setPath(patch, el.dataset.path, v);
  }
  return patch;
}
async function saveSection(root, extra) {
  const patch = Object.assign(collect(root), extra || {});
  try { const r = await api("/api/config", { body: patch }); CFG = r.config; toast("Réglages enregistrés.", "success"); loadStatus(); }
  catch (err) { toast(err.message, "error"); }
}
function section(title, open, ...kids) {
  const body = h("div", { class: "settings-body" }, ...kids);
  const save = h("button", { class: "btn bolt", style: "margin-top:1rem", onclick: () => saveSection(body) }, "Enregistrer");
  body.append(save);
  return h("details", { class: "settings-section", open }, h("summary", {}, title), body);
}
async function loadSettings() {
  CFG = await api("/api/config");
  const st = S.status || (await api("/api/status"));
  const box = $("#settings");
  box.innerHTML = "";
  if (!(CFG.models || []).length) box.append(h("div", { class: "decree question" }, h("p", { class: "what" }, "Branche d'abord un modèle d'IA"), h("p", { class: "risk" }, "Sans modèle, ZEUS ne peut pas réfléchir. Le plus simple et 100 % privé : installe Ollama (ollama.com), lance « ollama pull qwen3:8b », puis clique « Détecter Ollama » ci-dessous.")));
  box.append(section("Toi et ZEUS", !(CFG.owner || {}).name, h("div", { class: "fields" },
    field("Ton prénom", inp("owner.name"), "ZEUS t'appellera ainsi."), field("Nom de l'assistant", inp("assistant.name")),
    field("Ta ville", inp("owner.city", { placeholder: "Kinshasa" }), "Pour la météo du brief du matin."),
    field("Personnalité", inp("assistant.personality"), "", true),
    field("Thème", (() => { const s = h("select", { onchange: (e) => { const v = e.target.value; store.set("theme", v); if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme; } },
      [["", "Selon l'appareil"], ["dark", "Orage (sombre)"], ["light", "Marbre (clair)"]].map(([v, l]) => h("option", { value: v, selected: store.get("theme", "") === v }, l))); return s; })()),
    field("Détails techniques", (() => { const c = h("input", { type: "checkbox", checked: store.get("tech", false), onchange: (e) => { store.set("tech", e.target.checked); applyTech(); renderMessages(); } }); return h("label", { class: "row gap" }, c, "Afficher les modèles d'IA utilisés"); })(), "Pour le développeur : liste des modèles et nom du modèle sous chaque réponse."))));
  box.append(modelsSection(st));
  const auto = h("div", { class: "radio-cards" }, Object.entries(st.autonomy_labels).map(([k, l]) => {
    const r = h("input", { type: "radio", name: "autonomy", value: k, checked: (CFG.security || {}).autonomy === k });
    r.addEventListener("change", () => { r.dataset.path = "security.autonomy"; });
    if (r.checked) r.dataset.path = "security.autonomy";
    return h("label", {}, r, h("span", {}, h("strong", {}, l.split(" — ")[0]), h("br"), h("span", { class: "muted small" }, l.split(" — ")[1] || "")));
  }));
  const secBody = h("div", {}, auto, h("p", {}), chk("security.confirm_payments", "Toujours demander avant un paiement, un transfert d'argent, un code PIN ou un code USSD (recommandé)"),
    h("div", { class: "fields", style: "margin-top:.8rem" }, field("Outils toujours autorisés", inp("security.always_allow"), "Séparés par des virgules. Retire un outil pour que ZEUS redemande.", true),
      field("Délai pour valider (secondes)", inp("security.approval_timeout", { type: "number" })), field("Dossier de travail", inp("security.workspace"), "Vide = dossier « workspace » de ZEUS.")));
  box.append(h("details", { class: "settings-section" }, h("summary", {}, "Autonomie et sécurité"), h("div", { class: "settings-body" }, secBody,
    h("button", { class: "btn bolt", style: "margin-top:1rem", onclick: () => { const sel = $('input[name="autonomy"]:checked', secBody); saveSection(secBody, sel ? { security: { ...collect(secBody).security, autonomy: sel.value } } : undefined); } }, "Enregistrer"))));
  box.append(section("Téléphone", false, h("div", { class: "fields" },
    field("Indicatif pays", inp("phone.country_code", { placeholder: "243" }), "Pour convertir 08… en +243 8…"),
    field("Chemin d'ADB", inp("phone.adb_path", { placeholder: "automatique" })), field("Appareil (numéro de série)", inp("phone.serial", { placeholder: "le premier connecté" })),
    field("Code de déverrouillage", inp("phone.unlock_pin", { type: "password", autocomplete: "new-password" }), "Facultatif. Stocké sur ce PC uniquement ; ZEUS ne le voit jamais."),
    field("Lecture des notifications (s)", inp("phone.watch_seconds", { type: "number", min: 5 }), "Pour la surveillance et les SMS : toutes les 20 s par défaut."))));
  box.append(section("Canaux : Telegram, WhatsApp, e-mail, SMS", false,
    h("h3", {}, "Telegram"), h("p", { class: "muted small" }, "Crée un bot avec @BotFather, colle son jeton, puis envoie au bot le code d'appairage pour être reconnu comme propriétaire."),
    h("div", { class: "fields" }, field("Activer", chk("telegram.enabled", "Telegram actif")), field("Jeton du bot", inp("telegram.bot_token", { type: "password" })),
      field("Code d'appairage", h("div", { class: "secret-box" }, h("code", {}, st.pairing_code || "—")), "Envoie ce code au bot depuis ton compte."),
      field("Usagers externes", chk("telegram.allow_external", "Le guichet répond aux inconnus"))),
    h("h3", {}, "WhatsApp Business (API officielle)"), h("p", { class: "muted small" }, `Webhook à déclarer chez Meta : https://TON-ADRESSE-PUBLIQUE/webhook/whatsapp. Sans API, ZEUS peut utiliser WhatsApp sur ton téléphone.`),
    h("div", { class: "fields" }, field("Activer", chk("whatsapp.enabled", "WhatsApp API actif")), field("Phone number ID", inp("whatsapp.phone_number_id")),
      field("Jeton d'accès", inp("whatsapp.access_token", { type: "password" })), field("Jeton de vérification", inp("whatsapp.verify_token", { type: "password" })),
      field("Secret de l'app", inp("whatsapp.app_secret", { type: "password" })), field("Usagers externes", chk("whatsapp.allow_external", "Le guichet répond aux inconnus"))),
    h("h3", {}, "E-mail"), h("p", { class: "muted small" }, "Gmail : imap.gmail.com / smtp.gmail.com, avec un mot de passe d'application."),
    h("div", { class: "fields" }, field("Activer la lecture", chk("email.enabled", "Lire et répondre aux e-mails")), field("Adresse", inp("email.username")),
      field("Mot de passe", inp("email.password", { type: "password" })), field("Serveur IMAP", inp("email.imap_host")), field("Port IMAP", inp("email.imap_port", { type: "number" })),
      field("Serveur SMTP", inp("email.smtp_host")), field("Port SMTP", inp("email.smtp_port", { type: "number" })), field("Vérifier toutes les (s)", inp("email.poll_seconds", { type: "number" })),
      field("Usagers externes", chk("email.allow_external", "Le guichet répond aux inconnus"))),
    h("h3", {}, "SMS (avec ton téléphone Android)"),
    h("p", { class: "muted small" }, "ZEUS lit les SMS reçus sur ton téléphone et y répond avec lui : aucun abonnement. Idéal pour le guichet (usagers sans internet) ou pour commander ZEUS depuis un autre téléphone. Les numéros courts et les expéditeurs nommés (opérateurs, banques, M-Pesa) sont ignorés ; chaque SMS envoyé est facturé par ton opérateur."),
    h("div", { class: "fields" }, field("Activer", chk("sms.enabled", "Recevoir et répondre par SMS")), field("Usagers externes", chk("sms.allow_external", "Le guichet répond aux inconnus")),
      field("Réponses max. par numéro et par heure", inp("sms.max_per_hour", { type: "number", min: 1 })), field("Longueur max. d'une réponse", inp("sms.max_chars", { type: "number", min: 70 }), "459 = 3 SMS."),
      field("Notifications", chk("sms.notify_owner", "M'envoyer aussi les notifications de ZEUS par SMS"))),
    h("h3", {}, "Tes comptes (propriétaire)"),
    h("div", { class: "fields" }, field("Identifiants Telegram", inp("owner.telegram_ids"), "Remplis automatiquement par l'appairage."), field("Numéros WhatsApp", inp("owner.whatsapp_numbers"), "Ex. +243812345678"),
      field("Tes numéros de téléphone", inp("owner.phone_numbers"), "Pour te reconnaître quand tu écris à ZEUS par SMS."), field("Adresses e-mail", inp("owner.emails")))));
  box.append(section("Guichet administratif", false, h("div", { class: "fields" },
    field("Activer", chk("guichet.enabled", "Accueillir les usagers et gérer leurs dossiers")), field("Organisation", inp("guichet.organisation", { placeholder: "Mairie de …" })),
    field("Message d'accueil", inp("guichet.welcome"), "", true), field("Relances automatiques", chk("guichet.auto_relance", "Envoyer seul les relances (sinon : préparées pour toi)")),
    field("Relancer après (heures)", inp("guichet.relance_hours", { type: "number" })), field("Relances maximum", inp("guichet.max_relances", { type: "number" })))));
  box.append(section("Voix", false, h("p", { class: "muted small" }, "Sur ordinateur, Chrome reconnaît la voix tout seul. Pour Telegram et les téléphones sans HTTPS, ZEUS a besoin d'une transcription : Groq (gratuit), OpenAI, ou un serveur Whisper local."),
    h("div", { class: "fields" }, field("Transcription — adresse", inp("voice.stt.base_url", { placeholder: "https://api.groq.com/openai/v1" })), field("Clé", inp("voice.stt.api_key", { type: "password" })),
      field("Modèle", inp("voice.stt.model", { placeholder: "whisper-large-v3-turbo" })), field("Mot d'éveil", inp("voice.wake_word")))));
  box.append(section("Recherche web", false, h("p", { class: "muted small" }, "DuckDuckGo et Bing sont utilisés sans clé. Une clé rend la recherche plus fiable."),
    h("div", { class: "fields" }, field("Clé Brave Search", inp("search.brave_api_key", { type: "password" })), field("Clé Tavily", inp("search.tavily_api_key", { type: "password" })), field("Adresse SearXNG", inp("search.searxng_url")))));
  box.append(mcpSection(st));
  box.append(mcpServerSection());
  const lan = st.web || {};
  box.append(h("details", { class: "settings-section" }, h("summary", {}, "Accès et connexion"), h("div", { class: "settings-body" },
    h("div", { class: "kv" }, h("span", { class: "k" }, "Sur ce PC"), h("span", {}, `${lan.scheme}://127.0.0.1:${lan.port}/`),
      h("span", { class: "k" }, "Depuis ton téléphone (même Wi-Fi)"), h("span", {}, lan.public ? lan.lan_url : "désactivé"),
      h("span", { class: "k" }, "Dossier des données"), h("span", {}, st.home), h("span", { class: "k" }, "Version"), h("span", {}, `ZEUS ${st.version} · ${st.tools} outils`)),
    h("p", {}, h("label", { class: "toggle" }, (() => { const c = h("input", { type: "checkbox", checked: lan.public }); c.onchange = async () => { await api("/api/config", { body: { web: { host: c.checked ? "0.0.0.0" : "127.0.0.1" } } }); toast("Pris en compte au prochain démarrage de ZEUS.", "success"); }; return c; })(), "Autoriser l'accès depuis le réseau local (redémarrage nécessaire)")),
    h("p", {}, h("label", { class: "toggle" }, (() => { const c = h("input", { type: "checkbox", checked: !!(S.status && S.status.web && S.status.web.scheme === "https") }); c.onchange = async () => { await api("/api/config", { body: { web: { https: c.checked } } }); toast("Pris en compte au prochain démarrage de ZEUS.", "success"); }; return c; })(), "HTTPS : micro et mode Jarvis sur le téléphone (certificat créé par ZEUS ; au premier accès, accepte l'avertissement du navigateur)")),
    accessBox(),
    h("button", { class: "btn", style: "margin-top:1rem", onclick: async () => { await api("/api/logout", { body: {} }); location.reload(); } }, "Se déconnecter"))));
}

function accessBox() {
  const box = h("div", { class: "access" });
  const show = h("button", { class: "btn small", onclick: async () => {
    const a = await api("/api/access");
    box.innerHTML = "";
    box.append(h("div", { class: "kv" }, h("span", { class: "k" }, "Jeton"), h("code", {}, a.token),
      h("span", { class: "k" }, "Lien direct (ce PC)"), h("a", { href: a.local }, a.local)));
    if (a.qr) {
      box.append(h("p", {}, "Scanne ce code avec l'appareil photo de ton téléphone (même Wi-Fi) : ZEUS s'ouvre déjà connecté."),
        h("div", { class: "qr", html: a.qr }), h("p", { class: "muted small" }, a.lan));
    } else box.append(h("p", { class: "muted small" }, "Active l'accès depuis le réseau local ci-dessus et redémarre ZEUS pour obtenir le QR code du téléphone."));
  } }, "Afficher le jeton et le QR code du téléphone");
  box.append(show);
  return box;
}

function modelsSection(st) {
  const body = h("div", { class: "settings-body" });
  const list = h("div");
  const presets = { ollama: ["Ollama (local)", "http://localhost:11434"], lmstudio: ["LM Studio (local)", "http://localhost:1234/v1"], anthropic: ["Anthropic (Claude)", "https://api.anthropic.com"],
    openai: ["OpenAI", "https://api.openai.com/v1"], openrouter: ["OpenRouter", "https://openrouter.ai/api/v1"], groq: ["Groq", "https://api.groq.com/openai/v1"],
    gemini: ["Google Gemini", "https://generativelanguage.googleapis.com/v1beta/openai"], mistral: ["Mistral", "https://api.mistral.ai/v1"], deepseek: ["DeepSeek", "https://api.deepseek.com/v1"], llamacpp: ["llama.cpp (local)", "http://localhost:8080/v1"] };
  let models = JSON.parse(JSON.stringify(CFG.models || []));
  const health = Object.fromEntries((st.models || []).map((m) => [m.id, m]));
  const render = () => {
    list.innerHTML = "";
    if (!models.length) list.append(h("p", { class: "muted" }, "Aucun modèle."));
    models.forEach((m, i) => {
      const prov = h("select", {}, Object.entries(presets).map(([k, [l]]) => h("option", { value: k, selected: m.provider === k }, l)));
      prov.onchange = () => { m.provider = prov.value; m.base_url = presets[prov.value][1]; render(); };
      const mk = (key, attrs = {}) => { const e = h("input", { ...attrs, value: m[key] ?? "" }); e.oninput = () => { m[key] = attrs.type === "number" ? Number(e.value) || undefined : e.value; }; return e; };
      const vis = h("input", { type: "checkbox", checked: !!m.vision }); vis.onchange = () => { m.vision = vis.checked; };
      const hl = health[m.id];
      const groqFree = /api\.groq\.com/i.test(m.base_url || "") && m.tier !== "paid";
      const priced = groqFree || /claude-(fable|mythos|opus|sonnet|haiku)/i.test(m.model || "") || ["ollama", "lmstudio", "llamacpp"].includes(m.provider);
      const extra = [field("Prix entrée ($ / M jetons)", mk("price_in", { type: "number", step: "0.01", min: 0, placeholder: groqFree ? "0 (offre gratuite)" : priced ? "automatique" : "à renseigner" }), groqFree ? "Offre gratuite de Groq : rien à payer." : priced ? "" : "Pour compter les dépenses de ce modèle."),
        field("Prix sortie ($ / M jetons)", mk("price_out", { type: "number", step: "0.01", min: 0, placeholder: groqFree ? "0 (offre gratuite)" : priced ? "automatique" : "à renseigner" }))];
      if (m.provider === "anthropic") extra.push(field("Workspace (facultatif)", mk("workspace_id", { placeholder: "wrkspc_…" }), "Seulement si ta clé n'est liée à aucun workspace."));
      list.append(h("div", { class: "model-card" },
        h("div", { class: "row between" }, h("strong", {}, `${m.id || "nouveau"} `, hl ? h("span", { class: "muted small" }, hl.healthy ? "· en ligne" : "· en pause : " + (hl.last_error || "").slice(0, 80)) : ""),
          h("div", { class: "row gap" }, h("button", { class: "btn small", onclick: async () => { const r = await api("/api/models/test", { body: { id: m.id } }); toast(r.ok ? `${m.id} répond en ${r.latency} s : ${r.reply}` : `${r.error}`, r.ok ? "success" : "error", 9000); } }, "Tester"),
            h("button", { class: "btn ghost small", onclick: () => { models.splice(i, 1); render(); } }, "Retirer"))),
        h("div", { class: "fields", style: "margin-top:.6rem" }, field("Nom court", mk("id")), field("Fournisseur", prov), field("Modèle", mk("model", { placeholder: m.provider === "ollama" ? "qwen3:8b" : "nom du modèle" })),
          field("Adresse", mk("base_url")), field("Clé API", mk("api_key", { type: "password", placeholder: m.provider === "ollama" ? "inutile en local" : "ou env:NOM_VARIABLE" })),
          field("Contexte (jetons)", mk("context", { type: "number", placeholder: m.provider === "ollama" ? "16384" : "" })), field("Voit les images", h("label", { class: "toggle" }, vis, "Modèle avec vision")), ...extra)));
    });
  };
  render();
  const routing = CFG.routing || {};
  const routeSel = (key, label, hint) => {
    const s = h("select", {}, [h("option", { value: "" }, "automatique"), ...models.map((m) => h("option", { value: m.id, selected: routing[key] === m.id }, m.id))]);
    s.dataset.route = key;
    return field(label, s, hint);
  };
  const routes = h("div", { class: "fields", style: "margin-top:1rem" });
  const renderRoutes = () => { routes.innerHTML = ""; routes.append(routeSel("default", "Modèle principal"), routeSel("fast", "Modèle rapide", "Résumés, classement, apprentissage"), routeSel("vision", "Modèle vision", "Images et captures d'écran"), routeSel("max", "Mode maximum", "Choisi par conversation (menu « Cerveau »)")); };
  renderRoutes();
  const discover = h("div", { class: "row wrap gap", style: "margin:.8rem 0" });
  const preset = h("div", { class: "preset-card" },
    h("div", {}, h("strong", {}, "Puissance maximale — Claude"),
      h("p", { class: "muted small", style: "margin:.2rem 0 0" }, "Opus 5.5 en cerveau principal (4 $ / 20 $ par million de jetons), Fable 5.1 en mode maximum (10 $ / 50 $), Haiku 5.5 pour les tâches de fond (0,10 $ / 0,50 $). Tes modèles locaux restent en secours.")),
    h("button", { class: "btn bolt", type: "button", onclick: () => presetDialog() }, "Configurer"));
  const groqCard = h("div", { class: "preset-card" },
    h("div", {}, h("strong", {}, "Rapide et gratuit — Groq"),
      h("p", { class: "muted small", style: "margin:.2rem 0 0" }, "Offre gratuite, réponses en 1 à 2 secondes. ZEUS choisit le meilleur modèle disponible et branche la voix. Idéal si ton PC n'a pas de carte graphique.")),
    h("button", { class: "btn bolt", type: "button", onclick: () => groqDialog() }, "Configurer"));
  const freeCard = h("div", { class: "preset-card" },
    h("div", {}, h("strong", {}, "2e cerveau gratuit — Cerebras ou Gemini"),
      h("p", { class: "muted small", style: "margin:.2rem 0 0" }, "Prend le relais quand Groq atteint sa limite du jour, avant le modèle local. Gemini voit aussi les images.")),
    h("button", { class: "btn bolt", type: "button", onclick: () => freeDialog() }, "Configurer"));
  body.append(preset, groqCard, freeCard, spendingBox(), h("p", { class: "muted small" }, "ZEUS essaie le modèle principal, puis bascule tout seul sur les autres en cas de panne. Local = gratuit et privé ; cloud = plus puissant."), list,
    h("div", { class: "row wrap gap" },
      h("button", { class: "btn", onclick: () => { models.push({ id: "modele" + (models.length + 1), provider: "ollama", base_url: presets.ollama[1], model: "" }); render(); renderRoutes(); } }, "Ajouter un modèle"),
      h("button", { class: "btn", onclick: async () => {
        const r = await api("/api/models/discover");
        discover.innerHTML = "";
        if (!r.ollama.length) { discover.append(h("span", { class: "muted small" }, "Ollama introuvable sur ce PC (installe-le depuis ollama.com, puis « ollama pull qwen3:8b »).")); return; }
        for (const o of r.ollama) discover.append(h("button", { class: "btn small", onclick: () => { models.push({ id: o.name.split(":")[0].replace(/[^a-z0-9]/gi, ""), provider: "ollama", base_url: presets.ollama[1], model: o.name, vision: /vl|vision|llava|gemma3|minicpm-v/i.test(o.name) }); render(); renderRoutes(); } }, `+ ${o.name}${o.params ? " (" + o.params + ")" : ""}`));
      } }, "Détecter Ollama")),
    discover, h("h3", {}, "Répartition"), routes,
    h("button", { class: "btn bolt", style: "margin-top:1rem", onclick: async () => {
      const r = {}; for (const s of $$("[data-route]", routes)) r[s.dataset.route] = s.value;
      r.fallback = models.map((m) => m.id).filter((id) => id !== r.default);
      try { const res = await api("/api/config", { body: { models, routing: r } }); CFG = res.config; models = JSON.parse(JSON.stringify(CFG.models)); toast("Modèles enregistrés.", "success"); await loadStatus(); render(); renderRoutes(); }
      catch (err) { toast(err.message, "error"); }
    } }, "Enregistrer les modèles"));
  return h("details", { class: "settings-section", open: !(CFG.models || []).length }, h("summary", {}, "Modèles d'IA"), body);
}

function presetDialog() {
  const f = $("#dialog-form");
  f.innerHTML = "";
  const key = h("input", { type: "password", placeholder: "sk-ant-…", autocomplete: "off", "aria-label": "Clé API Claude" });
  const ws = h("input", { placeholder: "facultatif", "aria-label": "Workspace" });
  const bud = h("input", { type: "number", min: 0, step: 1, value: (CFG.budget && CFG.budget.monthly_usd) || 30, "aria-label": "Plafond mensuel" });
  const err = h("p", { class: "error" });
  f.append(h("h3", { style: "margin:0" }, "Puissance maximale — Claude"),
    h("p", { class: "muted small" }, "1. Achète des crédits sur platform.claude.com → Settings → Billing. 2. Crée une clé dans Settings → API keys, en choisissant un workspace. 3. Colle-la ici : elle reste sur ton ordinateur."),
    field("Clé API Claude", key), field("Workspace", ws, "Seulement si ta clé n'est liée à aucun workspace."),
    field("Plafond de dépenses par mois ($)", bud, "À 80 %, ZEUS te prévient ; à 100 %, il passe sur tes modèles gratuits. 0 = sans plafond."), err,
    h("div", { class: "dialog-actions" }, h("button", { class: "btn", value: "cancel", formnovalidate: true }, "Annuler"),
      h("button", { class: "btn bolt", type: "button", onclick: async (e) => {
        err.textContent = ""; e.target.disabled = true; e.target.textContent = "Test de la clé…";
        try {
          const r = await api("/api/models/preset", { body: { api_key: key.value.trim(), workspace_id: ws.value.trim(), budget: bud.value } });
          $("#dialog").close();
          toast(r.test && r.test.ok ? `Claude répond (${r.test.latency} s). Puissance maximale activée.` : `Réglages enregistrés, mais le test a échoué : ${(r.test && r.test.error) || "?"}`, r.test && r.test.ok ? "success" : "error", 12000);
          await loadStatus(); loadSettings();
        } catch (x) { err.textContent = x.message; e.target.disabled = false; e.target.textContent = "Activer"; }
      } }, "Activer")));
  $("#dialog").showModal();
}

function spendingBox() {
  const box = h("div", { class: "spending" }, h("p", { class: "muted small" }, "Chargement des dépenses…"));
  api("/api/usage").then((u) => {
    box.innerHTML = "";
    const pct = u.limit ? Math.min(100, Math.round((u.month / u.limit) * 100)) : 0;
    box.append(h("div", { class: "row between wrap" }, h("strong", {}, "Dépenses"),
      h("span", { class: u.exhausted ? "error-text" : "muted small" }, `Ce mois : ${fmtUsd(u.month)}${u.limit ? " sur " + fmtUsd(u.limit) : ""} · aujourd'hui : ${fmtUsd(u.today)}`)));
    if (u.limit) box.append(h("div", { class: "meter", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 }, h("span", { style: `width:${pct}%`, class: pct >= 80 ? "hot" : "" })));
    if (u.by_model && u.by_model.length) box.append(h("table", { class: "data small" }, h("tr", {}, h("th", {}, "Modèle"), h("th", {}, "Appels"), h("th", {}, "Jetons (entrée / cache / sortie)"), h("th", {}, "Coût")),
      u.by_model.map((m) => h("tr", {}, h("td", {}, m.model_id), h("td", {}, m.calls), h("td", {}, `${(m.tokens_in || 0).toLocaleString("fr-FR")} / ${(m.cache_read || 0).toLocaleString("fr-FR")} / ${(m.tokens_out || 0).toLocaleString("fr-FR")}`), h("td", {}, m.unpriced && !m.cost && (u.unknown_prices || []).includes(m.model_id) ? "prix inconnu" : fmtUsd(m.cost))))));
    if ((u.unknown_prices || []).length) box.append(h("p", { class: "muted small" }, `Prix inconnus pour : ${u.unknown_prices.join(", ")} — renseigne-les ci-dessous pour suivre leurs dépenses.`));
    const sel = h("select", {}, [["local", "Passer aux modèles gratuits"], ["stop", "Tout arrêter"]].map(([v, l]) => h("option", { value: v, selected: (u.on_limit || "local") === v }, l)));
    sel.dataset.path = "budget.on_limit";
    const fields = h("div", { class: "fields", style: "margin-top:.6rem" }, field("Plafond par mois ($)", inp("budget.monthly_usd", { type: "number", min: 0, step: 1 }), "0 = sans plafond."),
      field("Me prévenir à (%)", inp("budget.warn_percent", { type: "number", min: 10, max: 100 })), field("Plafond atteint", sel));
    box.append(fields, h("button", { class: "btn small", type: "button", onclick: () => saveSection(fields) }, "Enregistrer le plafond"));
  }).catch(() => { box.innerHTML = ""; });
  return box;
}

function mcpSection(st) {
  const ta = h("textarea", { rows: 8, style: "width:100%;font-family:var(--font-mono);font-size:.85rem" });
  ta.value = JSON.stringify(CFG.mcp_servers || {}, null, 2);
  const status = h("div", { class: "kv", style: "margin:.6rem 0" }, Object.entries(st.mcp || {}).flatMap(([n, s]) => [h("span", { class: "k" }, n), h("span", {}, s.connected ? `${s.tools} outils` : `${s.error || "non connecté"}`)]));
  return h("details", { class: "settings-section" }, h("summary", {}, "Serveurs MCP (extensions)"), h("div", { class: "settings-body" },
    h("p", { class: "muted small" }, 'Branche ZEUS sur des serveurs MCP. Exemple : {"fichiers": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/Users/moi/Documents"], "trust": "read"}}'),
    status, ta, h("button", { class: "btn bolt", style: "margin-top:.8rem", onclick: async () => {
      let v; try { v = JSON.parse(ta.value || "{}"); } catch (e) { return toast("JSON invalide : " + e.message, "error"); }
      await api("/api/config", { body: { mcp_servers: v } }); toast("Serveurs MCP rechargés.", "success"); setTimeout(loadStatus, 3000);
    } }, "Enregistrer et reconnecter")));
}

function mcpServerSection() {
  const body = h("div", { class: "settings-body" });
  const snippet = h("pre", { class: "snippet" }, "…");
  body.append(
    h("p", { class: "muted small" }, "Claude Desktop, Cursor, VS Code, Hermes… peuvent utiliser ZEUS comme extension : ton téléphone Android, tes dossiers et ton ordinateur deviennent leurs outils, et l'outil « zeus_ask » leur permet de confier une tâche entière à ZEUS. Colle ce bloc dans la configuration MCP de l'application, puis redémarre-la."),
    h("div", { class: "snippet-box" }, snippet, h("button", { class: "btn small copy", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(snippet.textContent); toast("Copié.", "success", 2000); } catch { toast("Sélectionne le texte et copie-le.", "info"); } } }, "Copier")),
    h("p", { class: "muted small" }, "Sécurité : l'application te demande ton accord avant chaque action. ZEUS bloque en plus, toujours, l'argent (paiements, Mobile Money, codes PIN, USSD) et les actions irréversibles : celles-là se font depuis ZEUS."),
    h("div", { class: "fields" }, field("Tâches complètes", chk("mcp_server.allow_tasks", "Proposer l'outil zeus_ask")),
      field("Boîtes à outils exposées", inp("mcp_server.toolsets"), "phone, dossiers, computer, browser, files, comms…"),
      field("Outils en plus", inp("mcp_server.tools"), "", true)));
  const save = h("button", { class: "btn bolt", style: "margin-top:1rem", onclick: () => saveSection(body) }, "Enregistrer");
  body.append(save);
  const det = h("details", { class: "settings-section" }, h("summary", {}, "ZEUS pour tes autres IA (serveur MCP)"), body);
  det.addEventListener("toggle", async () => {
    if (!det.open || snippet.dataset.done) return;
    try { const r = await api("/api/mcp_server"); snippet.textContent = JSON.stringify(r.config, null, 2); snippet.dataset.done = "1"; body.querySelector(".muted.small").title = `${r.tools.length} outils exposés`; }
    catch (err) { snippet.textContent = err.message; }
  });
  return det;
}

if ("Notification" in window && Notification.permission === "default") document.addEventListener("click", () => Notification.requestPermission().catch(() => {}), { once: true });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
boot();
