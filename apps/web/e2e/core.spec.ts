import { expect, test } from '@playwright/test';
import { capture, login, nav, openNode, panel, unique, USER } from './helpers';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('capturo una idea sin clasificarla y después la clasifico como tarea', async ({ page }) => {
  const title = unique('Quiero mejorar la facturación del ERP');
  await nav(page, 'Bandeja de entrada');
  await capture(page, title);

  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible();

  await row.getByLabel('Clasificar').selectOption('TASK');
  await expect(page.getByText('Clasificado como tarea')).toBeVisible();
  await expect(row).toHaveCount(0);

  await nav(page, 'Backlog');
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
});

test('aviso de posible duplicado al capturar', async ({ page }) => {
  const title = unique('Configurar certificado digital');
  await nav(page, 'Bandeja de entrada');
  await capture(page, title);
  await page.getByLabel('Captura rápida').fill(title.toLowerCase());
  await expect(page.getByText('Puede que ya lo tengas anotado')).toBeVisible();
});

test('agrego una tarea para hoy y la completo', async ({ page }) => {
  const title = unique('Llamar al contador');
  await nav(page, 'Hoy');
  await capture(page, title);

  const row = page.getByRole('listitem').filter({ hasText: title });
  await row.getByRole('checkbox', { name: `Completar ${title}` }).check();
  await expect(page.getByText('Completada', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Completadas hoy/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
});

test('proyecto con tareas, dependencia y vista de bloqueadas', async ({ page }) => {
  const project = unique('ERP');
  const invoice = unique('Emitir facturas');
  const cert = unique('Obtener certificado');

  await nav(page, 'Proyectos');
  await capture(page, project);
  await openNode(page, project);

  const addTask = panel(page).getByPlaceholder('Agregar tarea…');
  await addTask.fill(invoice);
  await addTask.press('Enter');
  await expect(panel(page).getByRole('button', { name: invoice })).toBeVisible();
  await addTask.fill(cert);
  await addTask.press('Enter');
  await expect(panel(page).getByRole('button', { name: cert })).toBeVisible();

  // The project tree shows both tasks.
  await expect(page.getByRole('main').getByRole('button', { name: invoice })).toBeVisible();

  // invoice depends on cert
  await panel(page).getByRole('button', { name: invoice }).click();
  await panel(page).getByRole('tab', { name: /Relaciones/ }).click();
  await panel(page).getByRole('button', { name: 'Agregar relación' }).click();
  await panel(page).getByLabel('Este elemento…').selectOption('DEPENDS_ON:out');
  await panel(page).getByLabel('Buscar elemento').fill(cert);
  await panel(page).getByRole('option', { name: new RegExp(cert) }).click();
  await expect(page.getByText('Relación creada')).toBeVisible();
  await expect(panel(page).getByText('depende de')).toBeVisible();

  await nav(page, 'Bloqueadas');
  const row = page.getByRole('main').getByRole('listitem').filter({ hasText: invoice });
  await expect(row).toContainText(`Espera a: ${cert}`);

  // The reverse dependency would be a cycle: rejected with an explanation.
  await nav(page, 'Proyectos');
  await openNode(page, cert);
  await panel(page).getByRole('tab', { name: /Relaciones/ }).click();
  await panel(page).getByRole('button', { name: 'Agregar relación' }).click();
  await panel(page).getByLabel('Este elemento…').selectOption('DEPENDS_ON:out');
  await panel(page).getByLabel('Buscar elemento').fill(invoice);
  await panel(page).getByRole('option', { name: new RegExp(invoice) }).click();
  await expect(page.getByText(/crearía un ciclo/)).toBeVisible();
});

test('edito el detalle y el elemento seleccionado se mantiene al cambiar de vista', async ({ page }) => {
  const title = unique('Preparar presentación');
  await nav(page, 'Backlog');
  await page.goto('/inbox');
  await capture(page, title);
  await page.getByRole('listitem').filter({ hasText: title }).getByLabel('Clasificar').selectOption('TASK');

  await nav(page, 'Backlog');
  await openNode(page, title);
  await panel(page).getByLabel('Próxima acción concreta').fill('Armar el índice');
  await panel(page).getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Cambios guardados')).toBeVisible();

  await nav(page, 'Hoy');
  await expect(page).toHaveURL(/node=/);
  await expect(panel(page).getByLabel('Próxima acción concreta')).toHaveValue('Armar el índice');

  await panel(page).getByRole('tab', { name: 'Historial' }).click();
  await expect(panel(page).getByText('Próxima acción: — → Armar el índice')).toBeVisible();
});

test('elimino un elemento, queda en la papelera y lo restauro', async ({ page }) => {
  const title = unique('Idea descartable');
  await nav(page, 'Bandeja de entrada');
  await capture(page, title);
  await openNode(page, title);

  await panel(page).getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar a la papelera' }).click();
  await expect(page.getByText('Enviado a la papelera')).toBeVisible();
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: title })).toHaveCount(0);

  await nav(page, 'Papelera');
  const row = page.getByRole('listitem').filter({ hasText: title });
  await row.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByText('Restaurado')).toBeVisible();

  await nav(page, 'Bandeja de entrada');
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
});

test('la búsqueda global ignora tildes', async ({ page }) => {
  const title = unique('Revisión de facturación');
  await nav(page, 'Bandeja de entrada');
  await capture(page, title);
  await page.getByLabel('Buscar', { exact: true }).fill('revision facturacion');
  await page.getByLabel('Buscar', { exact: true }).press('Enter');
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: title })).toBeVisible();
});

test('el admin invita a una persona y ella crea su cuenta', async ({ page, browser }) => {
  await nav(page, 'Administración');
  const email = `${unique('invitada').replace(/\s/g, '-').toLowerCase()}@test.local`;
  await page.getByLabel(/^Email/).fill(email);
  await page.getByRole('button', { name: 'Generar link' }).click();
  const link = await page.getByLabel('Link de invitación').inputValue();
  expect(link).toContain('/invite/');

  const other = await browser.newContext();
  const guest = await other.newPage();
  await guest.goto(link);
  await expect(guest.getByLabel('Email')).toHaveValue(email);
  await guest.getByLabel('Nombre').fill('Invitada Prueba');
  await guest.getByLabel(/^Contraseña/).fill('clave-de-prueba-123');
  await guest.getByLabel('Repetir contraseña').fill('clave-de-prueba-123');
  await guest.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(guest.getByRole('heading', { name: 'Hola, Invitada' })).toBeVisible();

  // Her data is separate: the admin's items are not visible.
  await guest.goto('/backlog');
  await expect(guest.getByText('El backlog está vacío')).toBeVisible();

  // The link cannot be reused.
  const third = await browser.newContext();
  const again = await third.newPage();
  await again.goto(link);
  await expect(again.getByRole('heading', { name: 'Invitación no válida' })).toBeVisible();
  await other.close();
  await third.close();

  await page.reload();
  await expect(page.getByText(`Usada por ${email}`)).toBeVisible();
  expect(USER.email).not.toBe(email);
});
