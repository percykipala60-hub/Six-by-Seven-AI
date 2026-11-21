// Teste la logique des Défis malins de Kin Rush avec un DOM minimal.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
  'utf8',
);

// ---------- DOM minimal ----------
function makeEl(tag) {
  const el = {
    tagName: tag,
    children: [],
    childNodes: [],
    style: {},
    dataset: {},
    hidden: false,
    textContent: '',
    value: '',
    className: '',
    listeners: {},
    scrollTop: 0,
    clientWidth: 300,
    _html: '',
    append(...kids) {
      for (const k of kids) {
        this.children.push(k);
        this.childNodes.push(k);
      }
    },
    appendChild(k) {
      this.children.push(k);
      this.childNodes.push(k);
      return k;
    },
    addEventListener(t, f) {
      (this.listeners[t] ||= []).push(f);
    },
    click() {
      (this.listeners.click || []).forEach((f) => f({ target: el }));
    },
    getContext() {
      const noop = () => {};
      return new Proxy(
        {},
        {
          get: (o, p) =>
            p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern'
              ? () => ({ addColorStop: noop })
              : p === 'measureText'
                ? () => ({ width: 10 })
                : noop,
          set: () => true,
        },
      );
    },
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    closest: () => null,
    focus: () => {},
    setAttribute() {},
    removeAttribute() {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() {
      return el._html;
    },
    set(v) {
      el._html = v;
      if (v === '') {
        el.children.length = 0;
        el.childNodes.length = 0;
      }
    },
  });
  return el;
}

const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const byId = {};
for (const id of ids) byId[id] = makeEl('div');
const documentShim = {
  querySelector: (s) => (s.startsWith('#') ? (byId[s.slice(1)] ?? null) : makeEl('div')),
  createElement: (t) => makeEl(t),
  addEventListener() {},
  hidden: false,
  documentElement: makeEl('html'),
  fonts: { ready: Promise.resolve() },
};
const storage = {};
const sandbox = {
  document: documentShim,
  window: {},
  localStorage: {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => {
      storage[k] = String(v);
    },
  },
  location: { origin: 'http://localhost' },
  navigator: { maxTouchPoints: 0 },
  addEventListener() {},
  fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
  requestAnimationFrame: () => {},
  setTimeout: (fn, ms, ...a) => {
    const t = setTimeout(fn, ms, ...a);
    t.unref?.();
    return t;
  },
  clearTimeout,
  setInterval: (fn, ms, ...a) => {
    const t = setInterval(fn, ms, ...a);
    t.unref?.();
    return t;
  },
  clearInterval,
  Math,
  Date,
  JSON,
  console,
  Promise,
  Array,
  Object,
  Number,
  String,
  Boolean,
  Set,
  Map,
  Infinity,
  NaN,
  parseInt,
  parseFloat,
  isNaN,
  AudioContext: undefined,
  webkitAudioContext: undefined,
  Audio: function () {
    return { play: () => Promise.resolve(), addEventListener() {} };
  },
  DOMMatrix: class {
    translateSelf() {
      return this;
    }
  },
  Image: function () {
    return {};
  },
  innerWidth: 800,
  innerHeight: 600,
  devicePixelRatio: 1,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.localStorage.getItem.bind(sandbox.localStorage);

const vm = await import('node:vm');
const { test } = await import('node:test');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

test('défis malins : 100 devinettes + 50 énigmes, récompenses, limite et sauvegarde', () => {
  const context = vm.createContext(sandbox);
  vm.runInContext(code, context);

  const run = (js) => vm.runInContext(js, context);
  const assert = (cond, msg) => {
    if (!cond) throw new Error('ÉCHEC: ' + msg);
  };

  assert(run('DEVINETTES.length') === 100, '100 devinettes chargées');
  assert(run('ENIGMES.length') === 50, '50 énigmes chargées');
  run('openQuiz()');
  assert(byId.quizOv.hidden === false, 'overlay quiz ouvert');
  assert(byId.quizPick.hidden === false, 'choix des défis visible');

  // bonne réponse à une devinette
  const banqueAvant = run('SAVE.bank');
  run('quizNew("dev")');
  const cur = run('quizCur');
  const bonIdx = cur.ordre.findIndex((o) => o.ok);
  run(`quizAnswer(${bonIdx})`);
  assert(run('SAVE.bank') === banqueAvant + 40, 'devinette réussie : +40 FC');
  assert(run('quizCount("dev")') === 1, 'compteur devinettes à 1');
  assert(run('SAVE.quizDone') === 1, '1 défi consommé');

  // mauvaise réponse à une énigme
  run('quizNew("eni")');
  const cur2 = run('quizCur');
  const mauvaisIdx = cur2.ordre.findIndex((o) => !o.ok);
  const banque2 = run('SAVE.bank');
  run(`quizAnswer(${mauvaisIdx})`);
  assert(run('SAVE.bank') === banque2, 'énigme ratée : pas de gain');
  assert(run('quizCount("eni")') === 0, 'énigme non comptée comme résolue');
  assert(run('SAVE.quizDone') === 2, '2 défis consommés');

  // 3e défi puis limite quotidienne
  run('quizNew("dev")');
  const cur3 = run('quizCur');
  run(`quizAnswer(${cur3.ordre.findIndex((o) => o.ok)})`);
  assert(run('quizRemaining()') === 0, 'limite de 3 défis atteinte');
  assert(byId.quizPick.hidden === true, 'choix masqué après la limite');
  run('closeQuiz()');
  assert(byId.menu.hidden === false, 'retour au menu');

  // persistance : les données du jour sont écrites dans la sauvegarde
  const sauvegarde = JSON.parse(storage['kinrush-save']);
  assert(sauvegarde.quizSolved.length === 2, 'sauvegarde : 2 défis résolus persistés');
  assert(sauvegarde.quizDone === 3, 'sauvegarde : 3 défis du jour persistés');
  assert(Array.isArray(sauvegarde.quizSolved), 'quizSolved est un tableau');
});
