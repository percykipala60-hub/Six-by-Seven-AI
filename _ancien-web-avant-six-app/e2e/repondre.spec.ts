import { expect, test, type Page } from '@playwright/test';
import { json, preflight } from './api-factice';

const conversation = [
  '01/10/2026 21:02 - Mariane Kabongo🤍: Coucou ! Tu viens samedi chez Glodi ?',
  '01/10/2026 21:03 - Vous: je regarde',
  '01/10/2026 21:41 - Mariane Kabongo🤍: Appelle-moi au 0812345678',
].join('\n');

const analyse = {
  resume: '[NOM 1] veut savoir si tu viens samedi.',
  tension: 'pressant',
  intention: 'Savoir si tu viens',
  ton: 'Impatient',
  objectifs: ['Confirmer ma venue', 'Gagner du temps', 'Dire non poliment'],
  question: { texte: 'Tu es libre samedi ?', options: ['Oui', 'Non'] },
  arnaque: { niveau: 'aucun', raisons: [] },
  interlocuteur: '[NOM 1] [NOM 2]🤍',
  bouclier: false,
  secours: false,
  version: 'agent-six-v0.4',
  modele: 'faux/m',
  ms: 900,
};

const answer = {
  resume: '[NOM 1] veut savoir si tu viens samedi.',
  reponses: [
    { style: 'Directe', texte: 'Oui [NOM 1], je viens samedi !' },
    { style: 'Question', texte: 'Ça commence à quelle heure ?' },
    { style: 'Prudente', texte: 'Je te confirme demain.' },
  ],
  arnaque: { niveau: 'aucun', raisons: [] },
  interlocuteur: '[NOM 1] [NOM 2]🤍',
  bouclier: false,
  secours: false,
  avertissements: [],
  version: 'agent-six-v0.4',
  modele: 'faux/m',
  ms: 1200,
};

async function paste(page: Page, text: string) {
  await page.goto('/repondre');
  await page.getByLabel('Conversation à coller').fill(text);
  await page.getByRole('button', { name: 'Continuer' }).click();
}

test.describe('Parcours d’une réponse', () => {
  test('du collage à la copie : rien de sensible ne part, les vrais noms reviennent', async ({
    page,
  }) => {
    const sent: string[] = [];
    await page.route('**/v1/analyse', async (route) => {
      if (await preflight(route)) return;
      sent.push(route.request().postData() ?? '');
      await json(route, analyse);
    });
    await page.route('**/v1/reponses', async (route) => {
      if (await preflight(route)) return;
      sent.push(route.request().postData() ?? '');
      await json(route, answer);
    });
    await paste(page, conversation);

    // 2. Anonymisation
    await expect(page.getByText(/J’ai masqué 3 noms et 1 numéro/)).toBeVisible();
    await page.getByRole('button', { name: 'C’est bon' }).click();

    // 4. Compréhension : tension en niveau, jamais en pourcentage
    await expect(page.getByRole('heading', { name: /Voilà ce que j’ai compris/ })).toBeVisible();
    await expect(page.getByText('Mariane veut savoir si tu viens samedi.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Tension : Pressant' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('%');
    await page.getByRole('button', { name: 'Oui, c’est ça' }).click();

    // 5. Objectif + question
    await expect(page.getByRole('radio', { name: 'Confirmer ma venue' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('button', { name: 'Oui', exact: true }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    // 6. Ton et longueur
    await page.getByRole('radio', { name: 'Court' }).click();
    await page.getByRole('button', { name: 'Générer 3 réponses' }).click();

    // 8. Trois réponses
    await expect(page.getByText('Oui Mariane, je viens samedi !')).toBeVisible();
    const body = JSON.parse(sent[1] ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({
      objectif: 'Confirmer ma venue',
      longueur: 'court',
      precision: 'Tu es libre samedi ? Oui',
    });
    for (const s of sent) expect(s).not.toMatch(/Mariane|Kabongo|Glodi|0812345678/);

    await page.getByRole('button', { name: 'Copier la réponse A' }).click();
    await expect(page.getByRole('heading', { name: /Réponse copiée/ })).toBeVisible();
    await expect(page.getByText('Oui Mariane, je viens samedi !')).toBeVisible();
  });

  test('ajustement : la retouche part masquée, revient avec les vrais noms', async ({ page }) => {
    let adjustBody = '';
    await page.route('**/v1/analyse', (route) => json(route, analyse));
    await page.route('**/v1/reponses', (route) => json(route, answer));
    await page.route('**/v1/ajuster', async (route) => {
      if (await preflight(route)) return;
      adjustBody = route.request().postData() ?? '';
      await json(route, {
        texte: 'Oui [NOM 1], je serai là samedi 🙂',
        avertissements: [],
        secours: false,
        modele: 'faux/m',
        ms: 300,
      });
    });
    await paste(page, conversation);
    await page.getByRole('button', { name: 'C’est bon' }).click();
    await page.getByRole('button', { name: 'Oui, c’est ça' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Générer 3 réponses' }).click();
    await page.getByRole('button', { name: 'Ajuster' }).click();
    await page.getByRole('button', { name: 'Ajouter un emoji' }).click();
    await expect(page.getByLabel('Ton message')).toHaveValue('Oui Mariane, je serai là samedi 🙂');
    expect(adjustBody).toContain('[NOM 1]');
    expect(adjustBody).not.toContain('Mariane');
  });

  test('arnaque certaine : alerte sans pourcentage et réponses sûres, sans réseau', async ({
    page,
  }) => {
    let calls = 0;
    await page.route('**/v1/**', async (route) => {
      calls++;
      await route.abort();
    });
    await paste(
      page,
      '01/10/2026 09:41 - +243 81 234 5647: Service M-Pesa : votre compte sera bloqué. Envoyez votre code PIN.',
    );
    await expect(page.getByRole('heading', { name: /ressemble à une arnaque/ })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('%');
    await page.getByRole('button', { name: 'Répondre prudemment' }).click();
    await expect(page.getByText('Je ne communique pas mes codes.')).toBeVisible();
    expect(calls).toBe(0);
  });

  test('pas de réseau : rien n’est perdu, on peut réessayer', async ({ page }) => {
    let fail = true;
    await page.route('**/v1/analyse', async (route) => {
      if (await preflight(route)) return;
      if (fail) return route.abort('internetdisconnected');
      return json(route, analyse);
    });
    await paste(page, 'Ami: tu viens ?\nVous: je vois');
    await page.getByRole('button', { name: 'C’est bon' }).click();
    await expect(page.getByText(/Rien n’est perdu/)).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Réessayer maintenant' }).click();
    await expect(page.getByRole('heading', { name: /Voilà ce que j’ai compris/ })).toBeVisible();
  });
});

test.describe('Outils', () => {
  test('vérificateur de ton : signaux visibles sans réseau', async ({ page }) => {
    await page.route('**/v1/**', (route) => route.abort('internetdisconnected'));
    await page.goto('/ton');
    await page.getByLabel(/Ton brouillon/).fill('TU ES NUL, RÉPONDS !!');
    await expect(page.getByText(/MAJUSCULES/)).toBeVisible();
    await page.getByRole('button', { name: 'Vérifier le ton' }).click();
    await expect(page.getByRole('img', { name: 'Ton perçu : Agressif' })).toBeVisible();
  });

  test('Quoi dire ? : des idées prêtes, même sans réseau', async ({ page }) => {
    await page.route('**/v1/**', (route) => route.abort('internetdisconnected'));
    await page.goto('/quoi-dire');
    await page.getByRole('button', { name: 'Reprendre contact' }).click();
    await expect(page.getByText(/Ça fait longtemps/)).toBeVisible();
    await page.getByRole('button', { name: /Autres sujets/ }).click();
    await expect(page.getByText(/Pas de réseau/)).toBeVisible();
  });

  test('réglages : le thème clair s’applique et reste après rechargement', async ({ page }) => {
    await page.goto('/reglages');
    await page.getByRole('radio', { name: 'Clair' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
