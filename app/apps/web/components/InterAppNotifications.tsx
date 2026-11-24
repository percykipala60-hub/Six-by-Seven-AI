'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  INTER_APP_APPS,
  notificationDraft,
  type InterAppId,
  type ReceivedAppNotification,
} from '@/lib/inter-app-notifications';
import { deposerCapture } from '@/lib/raccourcis-ios';
import { AppIcon } from './AppIcon';
import { Icon } from './Icon';

interface NativeStatus {
  selectedApps: InterAppId[];
  installedApps: InterAppId[];
  notificationAccess: boolean;
  overlayAccess: boolean;
  bubbleEnabled: boolean;
}

interface SixInterAppPlugin {
  getStatus(): Promise<NativeStatus>;
  setSelectedApps(options: { appIds: InterAppId[] }): Promise<void>;
  requestNotificationAccess(): Promise<void>;
  requestOverlayAccess(): Promise<void>;
  setBubbleEnabled(options: { enabled: boolean }): Promise<void>;
  getNotifications(): Promise<{ items: ReceivedAppNotification[] }>;
  clearNotifications(): Promise<void>;
  consumeOpenInbox(): Promise<{ open: boolean }>;
}

const SixInterApp = registerPlugin<SixInterAppPlugin>('SixInterApp');
const ONBOARDING_KEY = 'six-inter-app-choice-made';

export function InterAppOnboarding({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(ONBOARDING_KEY) === 'true');
    } catch {
      setDismissed(false);
      setError('Six ne peut pas mémoriser ton choix sur cet appareil.');
    }
  }, []);

  function finishLater() {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true');
      setDismissed(true);
      setError('');
    } catch {
      setError(
        "Six n'a pas pu mémoriser ton choix. Tu peux fermer cet écran et le régler plus tard.",
      );
    }
  }

  function startSetup() {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true');
      setDismissed(true);
      const cible = '/reglages?v=notifications';
      if (window.location.pathname === '/reglages') {
        // Déjà dans Réglages : la page ne relit l'URL qu'au chargement et sur « popstate ».
        // router.push ne change que la query, donc rien ne bougeait : on prévient la page.
        window.history.pushState(null, '', cible);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } else {
        router.push(cible);
      }
    } catch {
      setError(
        "Six n'a pas pu mémoriser ton choix. Réessaie ou ouvre Notifications des apps dans Réglages.",
      );
    }
  }

  if (!connected || dismissed) return null;
  return (
    <section className="card stack" aria-labelledby="inter-app-onboarding">
      <b id="inter-app-onboarding">
        Tu veux aussi recevoir les notifications de tes apps dans Six ?
      </b>
      <p className="muted small">
        Sur Android, tu choisis les apps et autorises séparément l&apos;accès aux notifications et
        la bulle flottante. Les messages restent sur cet appareil et ne sont jamais envoyés à
        l&apos;IA sans ton action.
      </p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary" onClick={startSetup}>
        Choisir mes apps
      </button>
      <button className="btn ghost" onClick={finishLater}>
        Pas maintenant
      </button>
    </section>
  );
}

export function InterAppNotifications() {
  const router = useRouter();
  const [android, setAndroid] = useState<boolean | null>(null);
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [selected, setSelected] = useState<InterAppId[]>([]);
  const [items, setItems] = useState<ReceivedAppNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const next = await SixInterApp.getStatus();
      setStatus(next);
      setSelected(next.selectedApps);
      const inbox = await SixInterApp.getNotifications();
      setItems(inbox.items);
      setError('');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Les réglages Android sont indisponibles.');
      return false;
    }
  }, []);

  useEffect(() => {
    const isAndroid = Capacitor.getPlatform() === 'android';
    setAndroid(isAndroid);
    if (!isAndroid) return;
    const update = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);

  function toggleApp(id: InterAppId, checked: boolean) {
    setSelected((previous) =>
      checked ? [...new Set([...previous, id])] : previous.filter((item) => item !== id),
    );
  }

  async function saveApps() {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await SixInterApp.setSelectedApps({ appIds: selected });
      try {
        localStorage.setItem(ONBOARDING_KEY, 'true');
      } catch {
        setInfo(
          'Tes applications sont enregistrées sur Android. Six ne peut pas mémoriser la fin de la présentation.',
        );
      }
      const current = await SixInterApp.getStatus();
      setStatus(current);
      setSelected(current.selectedApps);
      if (selected.length === 0) {
        setInfo('Aucune application sélectionnée : Six ne reçoit plus de notifications inter-app.');
      } else if (!current.notificationAccess) {
        await SixInterApp.requestNotificationAccess();
        setInfo('Dans les réglages Android, active « Six », puis reviens ici.');
      } else {
        setInfo('Sélection enregistrée sur cet appareil.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Six n'a pas pu enregistrer la sélection.");
    } finally {
      setBusy(false);
    }
  }

  async function clearInbox() {
    setBusy(true);
    setError('');
    try {
      await SixInterApp.clearNotifications();
      setItems([]);
      setInfo('Notifications locales effacées.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Les notifications n'ont pas pu être effacées.",
      );
    } finally {
      setBusy(false);
    }
  }

  function importNotification(item: ReceivedAppNotification) {
    const draft = notificationDraft(item);
    if (!draft) {
      setError('Cette notification ne contient pas de texte à importer.');
      return;
    }
    try {
      sessionStorage.setItem('six-notification-draft', draft);
      router.push('/responsive');
    } catch {
      setError(
        "Six n'a pas pu préparer ce message sur cet appareil. Le texte n'a pas été transmis.",
      );
    }
  }

  if (android === null) {
    return (
      <p className="muted small" role="status">
        Vérification de la plateforme…
      </p>
    );
  }

  if (!android) {
    return (
      <section className="group-list pad stack">
        <b>Notifications des autres apps</b>
        <p className="muted small">
          Cette intégration nécessite l&apos;application Android installée. Les navigateurs et iOS
          n&apos;autorisent pas Six à lire les notifications de WhatsApp, Instagram ou d&apos;autres
          apps. Tu peux toujours partager manuellement une conversation vers Six.
        </p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="group-list pad stack" aria-labelledby="notification-choice">
        <b id="notification-choice">Choisis les applications</b>
        <p className="muted small">
          Six ne lit que les notifications des apps cochées et conserve les 25 plus récentes sur cet
          appareil. L&apos;accès peut être retiré à tout moment dans les réglages Android.
        </p>
        {INTER_APP_APPS.map((app) => {
          const installed = status?.installedApps.includes(app.id) ?? false;
          return (
            <label className="toggle" key={app.id}>
              <AppIcon id={app.id} size={32} />
              <span className="grow">
                <b>{app.label}</b>
                {!installed && <span className="muted small">Non installée sur cet appareil</span>}
              </span>
              <input
                type="checkbox"
                className="sw"
                checked={selected.includes(app.id)}
                disabled={(!installed && !selected.includes(app.id)) || busy}
                onChange={(event) => toggleApp(app.id, event.target.checked)}
                aria-label={`Recevoir dans Six les notifications de ${app.label}`}
              />
            </label>
          );
        })}
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="small" role="status">
            {info}
          </p>
        )}
        <button className="btn primary" disabled={busy || !status} onClick={saveApps}>
          {busy
            ? 'Enregistrement…'
            : selected.length === 0
              ? 'Désactiver les notifications inter-app'
              : status?.notificationAccess
                ? 'Enregistrer les apps choisies'
                : 'Enregistrer et autoriser'}
        </button>
        {status?.notificationAccess && (
          <p className="small" role="status">
            Accès aux notifications Android activé sur cet appareil.
          </p>
        )}
      </section>

      <section className="group-list pad stack" aria-labelledby="received-notifications">
        <div className="row sp">
          <b id="received-notifications">Notifications reçues sur cet appareil</b>
          {items.length > 0 && (
            <button className="btn ghost small" disabled={busy} onClick={clearInbox}>
              Effacer
            </button>
          )}
        </div>
        <p className="muted small">
          Le contenu reste local. Choisis « Préparer dans Six » pour l&apos;importer; il ne sera
          envoyé à l&apos;IA qu&apos;après ton action dans le parcours d&apos;analyse.
        </p>
        {items.length === 0 ? (
          <p className="muted small">Aucune notification enregistrée.</p>
        ) : (
          items.map((item) => (
            <article className="card stack" key={item.id}>
              <div className="row sp" style={{ alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <AppIcon id={item.appId} size={22} />
                  <b>{item.appName}</b>
                </span>
                <time className="muted small" dateTime={new Date(item.receivedAt).toISOString()}>
                  {new Date(item.receivedAt).toLocaleString()}
                </time>
              </div>
              {item.title && <b>{item.title}</b>}
              {item.text && (
                <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
                  {item.text}
                </p>
              )}
              <button className="btn ghost small" onClick={() => importNotification(item)}>
                <Icon name="chat" size={16} /> Préparer dans Six
              </button>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

/**
 * Pages que les raccourcis iPhone (App Intents, liens six://) peuvent ouvrir. Les anciennes adresses restent
 * comprises, car l'app iPhone déjà installée les envoie encore : « / » voulait dire Responsive, « /seven-ai » le Chat.
 */
const PAGES_RACCOURCIS: Record<string, string> = {
  '/': '/responsive',
  '/responsive': '/responsive',
  '/seven-ai': '/chat',
  '/chat': '/chat',
  '/sixtouch': '/cosinus',
  '/cosinus': '/cosinus',
  '/sujets': '/sujets',
  '/espace-jeu': '/espace-jeu',
};

/** Un message partagé ou une capture à analyser s'ouvre dans Responsive (l'app démarre sur le Chat). */
const RESPONSIVE = '/responsive';

export function InterAppLaunchHandler() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') {
      let active = true;
      const importSharedDraft = async () => {
        try {
          const share = registerPlugin<{
            consumeSharedDraft(): Promise<{ text: string }>;
            consumePendingRoute?(): Promise<{ route: string }>;
            consumeSharedCapture?(): Promise<{ data: string; type: string }>;
          }>('SixShare');
          const { text } = await share.consumeSharedDraft();
          if (active && text) {
            sessionStorage.setItem('six-notification-draft', text);
            window.dispatchEvent(new Event('six-shared-draft'));
            if (window.location.pathname !== RESPONSIVE) router.push(RESPONSIVE);
          }
          // Capture d'écran du raccourci « Analyser une capture avec Six » : lue ensuite sur le téléphone.
          const capture = await share.consumeSharedCapture?.().catch(() => null);
          if (active && capture?.data && deposerCapture(capture.data, capture.type)) {
            if (window.location.pathname !== RESPONSIVE) router.push(RESPONSIVE);
          }
          // Raccourci (Siri, bouton Action…) ou lien six:// : ouvre la page demandée, parmi celles connues.
          const { route } = (await share.consumePendingRoute?.().catch(() => null)) ?? {
            route: '',
          };
          const cible = PAGES_RACCOURCIS[route];
          if (active && cible && cible !== window.location.pathname) router.push(cible);
        } catch {
          // Le plugin n'existe que dans l'application iOS native.
        }
      };
      void importSharedDraft();
      const resume = () => {
        if (document.visibilityState === 'visible') void importSharedDraft();
      };
      window.addEventListener('focus', resume);
      document.addEventListener('visibilitychange', resume);
      return () => {
        active = false;
        window.removeEventListener('focus', resume);
        document.removeEventListener('visibilitychange', resume);
      };
    }
    if (platform !== 'android') return;
    let active = true;
    const openInbox = () => {
      void SixInterApp.consumeOpenInbox()
        .then(({ open }) => {
          if (active && open) router.push('/reglages?v=notifications');
        })
        .catch((cause: unknown) => {
          if (active) {
            setError(
              cause instanceof Error
                ? cause.message
                : "La boîte de notifications n'a pas pu s'ouvrir.",
            );
          }
        });
    };
    window.addEventListener('six-open-notification-inbox', openInbox);
    openInbox();
    return () => {
      active = false;
      window.removeEventListener('six-open-notification-inbox', openInbox);
    };
  }, [router]);

  if (!error) return null;
  return (
    <p className="err" role="alert">
      {error}
    </p>
  );
}
