import { expect, test, type Page } from '@playwright/test';
import { capture, login, nav, openNode, panel, unique } from './helpers';

const graphNode = (page: Page, title: string) => page.locator(`[data-testid="graph-node"][data-title="${title}"]`);
const flowNode = (page: Page, title: string) => page.locator('.react-flow__node', { has: graphNode(page, title) });

/** Creates a project with two tasks from the projects page and returns their titles. */
async function seedProject(page: Page) {
  const project = unique('Proyecto grafo');
  const a = unique('Tarea A');
  const b = unique('Tarea B');
  await nav(page, 'Proyectos');
  await capture(page, project);
  await openNode(page, project);
  const add = panel(page).getByPlaceholder('Agregar tarea…');
  for (const t of [a, b]) {
    await add.fill(t);
    await add.press('Enter');
    await expect(panel(page).getByRole('button', { name: t })).toBeVisible();
  }
  await panel(page).getByRole('button', { name: 'Cerrar' }).first().click();
  return { project, a, b };
}

async function center(page: Page, selector: ReturnType<Page['locator']>) {
  const box = (await selector.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('el grafo muestra los elementos persistidos y abre el detalle al hacer click', async ({ page }) => {
  const { project, a } = await seedProject(page);
  await nav(page, 'Grafo');
  await expect(graphNode(page, project)).toBeVisible();
  await expect(graphNode(page, a)).toBeVisible();

  await graphNode(page, a).click();
  await expect(panel(page).getByLabel('Título')).toHaveValue(a);
  await expect(page).toHaveURL(/node=/);
});

test('conecto dos nodos arrastrando y elijo el tipo de relación', async ({ page }) => {
  const { a, b } = await seedProject(page);
  await nav(page, 'Grafo');
  await expect(graphNode(page, a)).toBeVisible();

  await graphNode(page, a).hover();
  const from = await center(page, flowNode(page, a).locator('.react-flow__handle-bottom'));
  await graphNode(page, b).hover();
  const to = await center(page, flowNode(page, b).locator('.react-flow__handle-top'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '¿Cómo se relacionan?' })).toBeVisible();
  await dialog.getByText(new RegExp(`${a}\\s*depende de\\s*${b}`)).click();
  await dialog.getByRole('button', { name: 'Crear relación' }).click();
  await expect(page.getByText('Relación creada')).toBeVisible();

  // Persisted: the blocked view knows about it.
  await nav(page, 'Bloqueadas');
  await expect(page.getByRole('main').getByRole('listitem').filter({ hasText: a })).toContainText(`Espera a: ${b}`);
});

test('muevo un nodo y la posición se mantiene al recargar', async ({ page }) => {
  const { a } = await seedProject(page);
  await nav(page, 'Grafo');
  const node = flowNode(page, a);
  await expect(node).toBeVisible();

  const start = await center(page, graphNode(page, a));
  const saved = page.waitForResponse((r) => r.url().includes('/api/graph/layout') && r.request().method() === 'PUT');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 160, start.y + 90, { steps: 10 });
  await page.mouse.up();
  await saved;
  const moved = await node.getAttribute('style');

  await page.reload();
  await expect(node).toBeVisible();
  expect(await node.getAttribute('style')).toContain(moved!.match(/translate\([^)]*\)/)![0]);
});

test('creo un nodo con doble click en el lienzo', async ({ page }) => {
  await nav(page, 'Grafo');
  const title = unique('Nodo nuevo');
  await page.locator('.react-flow__pane').dblclick({ position: { x: 120, y: 120 } });
  await page.getByLabel('Título del nodo').fill(title);
  await page.getByLabel('Tipo del nodo').selectOption('IDEA');
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(graphNode(page, title)).toBeVisible();
  await expect(panel(page).getByLabel('Título')).toHaveValue(title);
});

test('vista enfocada: muestra el vecindario y se expande', async ({ page }) => {
  const { project, a } = await seedProject(page);
  const outsider = unique('Idea suelta');
  await nav(page, 'Bandeja de entrada');
  await capture(page, outsider);
  await page.getByRole('listitem').filter({ hasText: outsider }).getByLabel('Clasificar').selectOption('IDEA');

  await nav(page, 'Grafo');
  await graphNode(page, a).click();
  await page.getByRole('button', { name: 'Enfocado' }).click();
  await expect(page).toHaveURL(/focus=/);
  await expect(graphNode(page, project)).toBeVisible();
  await expect(graphNode(page, outsider)).toHaveCount(0);

  // The project's other task is one hop further: expand it.
  await graphNode(page, project).getByRole('button', { name: 'Mostrar 1 relación oculta' }).click();
  await expect(page.locator('[data-testid="graph-node"]')).toHaveCount(3);

  await page.getByRole('button', { name: 'Todo' }).click();
  await expect(graphNode(page, outsider)).toBeVisible();
});

test('filtros, búsqueda y panel de problemas', async ({ page }) => {
  const { project, a } = await seedProject(page);
  const lonely = unique('Nota aislada');
  await nav(page, 'Notas y decisiones');
  await capture(page, lonely);

  await nav(page, 'Grafo');
  await page.getByText('Filtros').click();
  await page.getByRole('button', { name: 'Tarea', pressed: false }).click();
  await expect(graphNode(page, project)).toHaveCount(0);
  await expect(graphNode(page, a)).toBeVisible();
  await page.getByRole('button', { name: 'Tarea', pressed: true }).click();
  await expect(graphNode(page, project)).toBeVisible();

  await page.getByLabel('Buscar en el grafo').fill(a);
  await expect(graphNode(page, project)).toHaveClass(/opacity-30/);
  await expect(graphNode(page, a)).not.toHaveClass(/opacity-30/);
  await page.getByLabel('Buscar en el grafo').fill('');

  await page.getByRole('button', { name: 'Revisar' }).click();
  const issues = page.getByRole('region', { name: 'Problemas del grafo' });
  await issues.getByRole('button', { name: new RegExp(lonely) }).click();
  await expect(panel(page).getByLabel('Título')).toHaveValue(lonely);
});
