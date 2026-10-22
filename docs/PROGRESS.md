# Avance

## Fase 1: auditoría y diseño ✅ (2026-10-21)

- [AI_TASK_SYSTEM_AUDIT.md](AI_TASK_SYSTEM_AUDIT.md): el repositorio estaba vacío; no hay código previo que preservar.
- [AI_TASK_SYSTEM_PLAN.md](AI_TASK_SYSTEM_PLAN.md): arquitectura, modelo de datos, IA, grafo, Obsidian y etapas.
- Decisiones confirmadas: React + Node/TypeScript, multiusuario con registro por invitación y rol admin, Claude + Ollama, entorno local primero.

## Fase 2: núcleo ✅ (2026-10-22)

### Implementado
- Monorepo npm workspaces: `apps/api`, `packages/shared`.
- PostgreSQL local sin instalación (`embedded-postgres`), cluster UTF-8, migraciones automáticas al levantar y recuperación de un servidor que quedó huérfano.
- Esquema Prisma + migración inicial: `User`, `Session`, `Invitation`, `Status`, `Node`, `Edge`, `ActivityLog`. Restricciones extra en SQL: sin auto-relaciones, título no vacío, versión ≥ 1.
- Auth: login y logout con sesión en cookie httpOnly (en la base se guarda solo el hash del token), límite de intentos, mismo error para un email inexistente y para una contraseña incorrecta.
- Invitaciones: un solo uso, con vencimiento, opcionalmente atadas a un email y revocables. Script `create-admin`. El admin lista, desactiva y reactiva usuarios (al desactivar se cierran sus sesiones) y no accede a datos ajenos.
- Nodos: captura rápida con solo un título (va a la bandeja como `INBOX_ITEM` sin procesar), CRUD, filtros (tipo, estado, procesado, archivado, papelera), búsqueda en título y cuerpo, slugs únicos, estados por defecto para tipos accionables, registro de completado y reapertura, concurrencia optimista (`version`), papelera (borrar, restaurar, eliminar definitivamente) e historial de cambios.
- Relaciones: matriz de tipos permitidos (`packages/shared/src/relations.ts`), tres categorías (estructural, ejecución, conceptual), duplicados (incluidos los simétricos invertidos), un solo padre estructural, y detección de ciclos en dependencias y jerarquía (con la cadena encontrada). Los ciclos conceptuales están permitidos.
- Integridad: un cambio de tipo que rompería relaciones se rechaza. Al restaurar, se eliminan e informan las relaciones que quedaron inválidas. Las operaciones de grafo de cada usuario se serializan con un advisory lock.

### Pruebas ejecutadas
- `npm test`: 44 tests en verde (4 de reglas de relaciones en `shared` y 40 de integración en la API contra PostgreSQL real).
- `npm run typecheck`: sin errores.
- Prueba manual contra el servidor de desarrollo: `create-admin` → login → captura con tildes y emoji → listado de la bandeja → creación de invitación. Esta prueba detectó que el cluster se había inicializado en WIN1252; se corrigió y se agregó un test de Unicode.

### Cómo verificar
Seguir el [README](../README.md) y probar con curl, o correr `npm test`.

### Pendiente / notas
- **Idempotency-Key** en las creaciones: pasa a la fase 5, donde importa para aplicar propuestas de IA. Las relaciones ya son únicas por restricción.
- La búsqueda es `ILIKE` por ahora; en la fase 3 se suman texto completo (`tsvector`) y `pg_trgm` para detectar duplicados.
- `npm audit` reporta `deepmerge-ts` (high) dentro del CLI de Prisma 6, que se usa solo en desarrollo y no entra al runtime de la API. Se resuelve al migrar a Prisma 7.
- npm 11.2.0 tiene un bug (`Cannot read properties of null (reading 'edgesOut')`) al resolver dependencias de vitest 4 sin lockfile. Con el `package-lock.json` del repo, `npm install` funciona.
- Si se cierra la terminal de `npm run db` sin Ctrl+C, PostgreSQL queda corriendo; el próximo `npm run db` lo detecta y lo detiene.

## Fase 3: gestión de tareas ⏳
