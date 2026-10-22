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
npm run create-admin -- --email vos@ejemplo.com --name "Tu nombre"
```

Después levantá la API:

```bash
npm run dev
```

La API queda en `http://localhost:3000` (health check: `/api/health`). La interfaz web llega en la fase 3.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run db` | Levanta PostgreSQL local (puerto 5433) y aplica migraciones |
| `npm run dev` | API con recarga automática |
| `npm run create-admin -- --email … --name …` | Crea un administrador (o promueve un usuario existente) |
| `npm test` | Tests unitarios y de integración; usan su propio PostgreSQL en el puerto 5434 |
| `npm run typecheck` | Chequeo de tipos de todos los paquetes |
| `npm run migrate:dev -w @backlog/api` | Crea una migración nueva después de cambiar `schema.prisma` (con `npm run db` corriendo) |

## Estructura

```
apps/api          API (Fastify + Prisma + PostgreSQL)
packages/shared   Tipos, enums, reglas de relaciones y esquemas Zod compartidos
docs/             Auditoría, plan y avance
```

## Usuarios

No hay registro público. El administrador genera invitaciones (`POST /api/admin/invitations`), que son links de un solo uso con vencimiento. El administrador gestiona cuentas pero no ve los datos de otros usuarios.
