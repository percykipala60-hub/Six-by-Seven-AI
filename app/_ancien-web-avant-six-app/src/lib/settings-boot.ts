/** Sans React : utilisable par le layout (côté serveur) comme par le navigateur. */
export const SETTINGS_KEY = 'six.reglages.v1';

/** Script court exécuté avant l'affichage : pas d'éclair de mauvais thème au démarrage. */
export const THEME_BOOT_SCRIPT = `try{var s=JSON.parse(localStorage.getItem('${SETTINGS_KEY}')||'{}');var r=document.documentElement;var d=s.theme==='clair'?false:s.theme==='auto'?matchMedia('(prefers-color-scheme: dark)').matches:true;r.dataset.theme=d?'dark':'light';r.dataset.contraste=s.contraste?'eleve':'normal';r.dataset.texte=s.grandTexte?'grand':'normal';var a={bleu:['#4d7cfe','#8fadff','#2f5fe0'],vert:['#22b07d','#7fdcb8','#137a55'],orange:['#f0a03c','#f7c98a','#a8620b'],gris:['#8a94a8','#c3cad8','#4a5670']}[s.accent||'bleu'];if(a){r.style.setProperty('--color-accent',d?a[0]:a[2]);r.style.setProperty('--color-accent-soft',d?a[1]:a[2]);}}catch(e){}`;
