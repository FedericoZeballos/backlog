import { expect, test } from '@playwright/test';
import { capture, login, nav, openNode, panel, unique } from './helpers';

test('en el celular puedo navegar, capturar y abrir el detalle', async ({ page }) => {
  await login(page);
  await nav(page, 'Bandeja de entrada');
  const title = unique('Desde el celular');
  await capture(page, title);
  await openNode(page, title);
  await expect(panel(page)).toBeVisible();

  // No horizontal scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await panel(page).getByRole('button', { name: 'Cerrar' }).first().click();
  await expect(panel(page)).toHaveCount(0);
});
