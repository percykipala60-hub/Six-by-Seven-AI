import { expect, test } from '@playwright/test';

test.describe('Bienvenue et accueil', () => {
  test('la promesse, puis l’accueil avec ses sources et outils', async ({ page }) => {
    await page.route('**/health', (route) => route.abort('internetdisconnected'));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('à ta place');
    await page.getByRole('link', { name: 'Commencer' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('répond');
    await expect(page.getByRole('link', { name: /Nouvelle conversation/ })).toHaveAttribute(
      'href',
      '/repondre',
    );
    await expect(page.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      '/repondre?source=fichier',
    );
    await expect(page.getByRole('status')).toContainText('injoignable');
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  });

  test('affiche « en ligne » quand le serveur répond', async ({ page }) => {
    await page.route('**/health', (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          service: 'six-api',
          version: '0.4.0',
          uptimeSeconds: 3,
          time: new Date().toISOString(),
        },
      }),
    );
    await page.goto('/accueil');
    await expect(page.getByRole('status')).toContainText('Serveur en ligne · v0.4.0');
  });

  test('porte les balises PWA et iOS', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    );
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /viewport-fit=cover/,
    );
  });

  test('le manifeste est installable, avec raccourcis et partage', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      display: string;
      icons: { sizes: string; purpose?: string }[];
      shortcuts: { url: string }[];
      share_target: { action: string; method: string };
    };
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(
      true,
    );
    expect(manifest.shortcuts.map((s) => s.url)).toContain('/quoi-dire');
    expect(manifest.share_target).toMatchObject({ action: '/partage', method: 'POST' });
  });

  test('envoie les en-têtes de sécurité', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).not.toContain('unsafe-eval');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
