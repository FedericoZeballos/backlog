# Backlog

Gestor de tareas y conocimiento conectado: captura rápida, refinamiento con IA, tareas, proyectos y objetivos relacionados en un grafo, y exportación a Obsidian.

- Diseño: [docs/AI_TASK_SYSTEM_PLAN.md](docs/AI_TASK_SYSTEM_PLAN.md)
- Avance por fase: [docs/PROGRESS.md](docs/PROGRESS.md)

## Requisitos

- Node.js 22 o superior
- Nada más: PostgreSQL se descarga con `npm install` (paquete `embedded-postgres`) y corre desde la carpeta `.data/`.

## Primer uso

```bash
npm install
cp apps/api/.env.example apps/api/.env
```

Terminal 1, la base de datos (dejala abierta y cerrala con Ctrl+C):

```bash
npm run db
```

Terminal 2, crear tu usuario administrador (te pide la contraseña):

```bash
npm run create-admin vos@ejemplo.com "Tu nombre"
```

Después levantá la app (API + web):

```bash
npm run dev
```

Abrí **http://localhost:5173** e iniciá sesión con el usuario que creaste. La API queda en `http://localhost:3000` y la web le pasa las llamadas `/api` a través de un proxy.

### Asistente de IA (Ollama local)

1. Ollama tiene que estar abierto (se inicia con Windows; si no, abrilo desde el menú Inicio). Los modelos están en `D:\Documents\ollama\models`.
2. En la app: **Configuración → Asistente de IA**, elegí `qwen2.5:7b` (mejor, 2-4 min) o `qwen2.5:3b` (rápido, menos preciso).
3. Para probar el modelo sin la app: `npm run ai:smoke -w @backlog/api -- --provider OLLAMA --model qwen2.5:3b`.

Sin IA instalada, elegí "Modo de prueba" para ver el flujo con respuestas fijas.

### Atajos

- `N`: captura rápida desde cualquier pantalla.
- `Esc`: cierra el panel de detalle.
- El elemento abierto queda en la URL (`?node=…`), así que podés cambiar de vista sin perderlo.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db` | Levanta PostgreSQL local (puerto 5433) y aplica migraciones |
| `npm run dev` | API y web con recarga automática |
| `npm run create-admin email "Nombre"` | Crea un administrador (o promueve un usuario existente) |
| `npm test` | Tests unitarios y de integración; usan su propio PostgreSQL en el puerto 5434 |
| `npm run e2e` | Tests de punta a punta en Chromium, en escritorio y móvil. Levantan su propia API y su base en el puerto 5435. La primera vez, corré `npx playwright install chromium` desde `apps/web` |
| `npm run typecheck` | Chequeo de tipos de todos los paquetes |
| `npm run build` | Build de producción de la web |
| `npm run migrate:dev -w @backlog/api` | Crea una migración nueva después de cambiar `schema.prisma` (con `npm run db` corriendo) |

## Estructura

```
apps/api          API (Fastify + Prisma + PostgreSQL)
apps/web          Interfaz (React + Vite + TanStack Query + Tailwind)
packages/shared   Tipos, enums, reglas de relaciones, esquemas Zod y contratos de la API
docs/             Auditoría, plan y avance
```

## Usuarios

No hay registro público. El administrador genera invitaciones (`POST /api/admin/invitations`), que son links de un solo uso con vencimiento. El administrador gestiona cuentas pero no ve los datos de otros usuarios.
