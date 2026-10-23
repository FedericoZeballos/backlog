import { expect, test } from '@playwright/test';
import { capture, login, nav, panel, unique } from './helpers';

// The e2e server runs the deterministic FAKE provider (no real model).

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('proceso una idea con el asistente: pregunta, respondo, propone, acepto una parte', async ({ page }) => {
  const title = unique('Quiero implementar facturación en mi ERP');
  await nav(page, 'Bandeja de entrada');
  await capture(page, title);

  await page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: /Procesar con IA/ }).click();
  const assistant = panel(page).getByRole('region', { name: 'Asistente' });
  await expect(assistant.getByText('¿Qué tiene que estar listo para considerarlo terminado?')).toBeVisible();
  await expect(assistant.getByText('Supuestos sin confirmar')).toBeVisible();

  await assistant.getByLabel('Respuesta para el asistente').fill('Solo emitir comprobantes electrónicos');
  await assistant.getByRole('button', { name: 'Responder' }).click();
  await expect(assistant.getByText('Solo emitir comprobantes electrónicos')).toBeVisible();
  await expect(assistant.getByText('Con esto ya se puede proponer un plan.')).toBeVisible();

  await assistant.getByRole('button', { name: 'Proponer plan' }).click();
  const proposal = assistant.getByLabel('Propuesta pendiente');
  await expect(proposal).toBeVisible();
  await expect(proposal.getByText('inferido').first()).toBeVisible();

  // Keep two of the three steps, renaming one; nothing changes until applying.
  await proposal.getByLabel('Crear Probar').uncheck();
  await proposal.getByLabel('Título de T2').fill('Implementar la emisión');
  await proposal.getByRole('button', { name: 'Aplicar lo seleccionado' }).click();
  await expect(assistant.getByText('Aplicada en parte')).toBeVisible();
  await expect(assistant.getByRole('button', { name: '+ Implementar la emisión' })).toBeVisible();

  // The item became a project with its tasks, visible in the tree.
  await panel(page).getByRole('tab', { name: 'Detalle' }).click();
  await expect(panel(page).getByRole('combobox', { name: /^Tipo/ }).first()).toHaveValue('PROJECT');
  await nav(page, 'Proyectos');
  await expect(page.getByRole('main').getByText('Implementar la emisión', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Definir el alcance', { exact: true })).toBeVisible();
});

test('descarto una propuesta y la conversación queda para retomar', async ({ page }) => {
  const title = unique('Ordenar papeles');
  await nav(page, 'Bandeja de entrada');
  await capture(page, title);
  await page.getByRole('listitem').filter({ hasText: title }).getByRole('button', { name: /Procesar con IA/ }).click();
  const assistant = panel(page).getByRole('region', { name: 'Asistente' });
  await assistant.getByRole('button', { name: 'Proponer plan' }).click();
  await assistant.getByLabel('Propuesta pendiente').getByRole('button', { name: 'Descartar' }).click();
  await expect(assistant.getByText('Descartada')).toBeVisible();

  // Reload: the dialogue and the decision are still there.
  await page.reload();
  await panel(page).getByRole('tab', { name: 'Asistente' }).click();
  await expect(panel(page).getByText('Descartada')).toBeVisible();
  await expect(panel(page).getByText('¿Qué tiene que estar listo para considerarlo terminado?')).toBeVisible();
});

test('el asistente recomienda qué hacer ahora y explica por qué', async ({ page }) => {
  const title = unique('Tarea urgente');
  await nav(page, 'Hoy');
  await capture(page, title);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Qué hacer ahora' });
  await card.getByRole('button', { name: '¿Qué hago ahora?' }).click();
  await expect(card.getByText('Recomendación del asistente')).toBeVisible();
  await expect(card.getByText('Es la más urgente y no depende de nada.')).toBeVisible();
});

test('configuración muestra el proveedor y su estado', async ({ page }) => {
  await nav(page, 'Configuración');
  await expect(page.getByRole('status').filter({ hasText: /Modo de prueba/ })).toBeVisible();
  await expect(page.getByLabel(/Ollama \(local\)/)).toBeVisible();
});
