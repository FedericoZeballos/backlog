import { expect, type Page } from '@playwright/test';

// Must match apps/api/scripts/e2e-server.ts
export const USER = { email: 'e2e@test.local', name: 'Ana Prueba', password: 'e2e-password-123' };

let counter = 0;
/** Titles unique per run, since all tests share one database. */
export const unique = (label: string) => `${label} ${Date.now().toString(36)}${++counter}`;

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Contraseña').fill(USER.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: /Hola/ })).toBeVisible();
}

export async function capture(page: Page, text: string) {
  const input = page.getByLabel('Captura rápida').first();
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}

export const panel = (page: Page) => page.getByRole('complementary', { name: 'Detalle del elemento' });

export async function openNode(page: Page, title: string) {
  await page.getByRole('main').getByText(title, { exact: true }).first().click();
  await expect(panel(page).getByLabel('Título')).toHaveValue(title);
}

export async function nav(page: Page, label: string) {
  if (await page.getByRole('button', { name: 'Abrir menú' }).isVisible()) {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  }
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: label }).click();
  // Wait for the new page: the previous one may have an input with the same label.
  await expect(page.getByRole('heading', { level: 1, name: label, exact: true })).toBeVisible();
}
