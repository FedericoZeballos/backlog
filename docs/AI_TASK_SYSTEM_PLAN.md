# Plan de arquitectura e implementación — Gestor inteligente de tareas y conocimiento

Fecha: 2026-10-21 · Basado en [AI_TASK_SYSTEM_AUDIT.md](AI_TASK_SYSTEM_AUDIT.md)

## 1. Objetivo

Una aplicación web multiusuario que convierte pensamientos desordenados en conocimiento organizado y planes ejecutables:
captura rápida → refinamiento conversacional con IA → propuestas revisables → tareas, proyectos, objetivos y notas conectados en un grafo → ejecución enfocada → exportación a Obsidian.

Principios:
- **La base de datos es la única fuente de verdad.** Markdown/Obsidian es una vista exportada.
- **La IA propone, el usuario dispone.** Ninguna salida de un modelo escribe en la base sin validación de esquema, validación de dominio y aprobación explícita.
- **Ideas ≠ compromisos.** Nada se convierte en tarea activa automáticamente.
- **Relaciones conceptuales ≠ dependencias de ejecución.** Son categorías distintas con reglas distintas.
- **Incremental y verificable.** Módulos pequeños, cada uno con pruebas.

## 2. Stack

| Capa | Elección | Motivo |
|---|---|---|
| Monorepo | npm workspaces: `apps/api`, `apps/web`, `packages/shared` | Tipos y esquemas compartidos sin herramientas extra |
| Lenguaje | TypeScript en todo el proyecto | Decisión del usuario; un solo lenguaje para tipos y validación |
| Backend | Node 22 + Fastify | Rápido, buen soporte de esquemas, `inject()` para tests sin red |
| ORM / migraciones | Prisma | Migraciones versionadas, tipos generados, transacciones interactivas |
| Base de datos | PostgreSQL 16 | Relacional + CTE recursivas + `tsvector` + `pg_trgm` |
| Validación | Zod (en `packages/shared`) | Mismos esquemas en front, back y salidas de IA |
| Frontend | React 18 + Vite + React Router + TanStack Query | Estándar, cache y sincronización de servidor resueltas |
| Estilos | Tailwind CSS + Radix UI (headless) | Interfaz limpia y accesible sin un kit pesado |
| Grafo | React Flow (`@xyflow/react`) + `elkjs` para layout | Ver §6 |
| Auth | Email + contraseña (argon2), sesiones en DB con cookie httpOnly | Simple, sin dependencias externas, revocable |
| IA | `@anthropic-ai/sdk` + Ollama HTTP, detrás de una interfaz propia | Ver §7 |
| Tests | Vitest (unit + integración), Playwright (e2e) | Rápidos, compatibles con TS/Vite |

### ¿Por qué no una base de datos de grafos?
El volumen por usuario es pequeño (miles de nodos, no millones) y las consultas necesarias son: vecinos de un nodo, subárbol de un proyecto, cadena de dependencias y detección de ciclos. Todo se resuelve con una tabla de aristas indexada y `WITH RECURSIVE` en Postgres, manteniendo transacciones ACID, integridad referencial y un solo sistema que operar. Una DB de grafos (Neo4j, etc.) agregaría sincronización entre dos almacenes sin un beneficio real a esta escala.

## 3. Modelo de datos

Se usa una **tabla `Node` única** para todos los tipos de entidad, en lugar de una tabla por tipo. Motivo: el grafo, la búsqueda global, las relaciones y la exportación operan sobre "cualquier nodo"; con tablas separadas cada relación necesitaría claves polimórficas sin integridad referencial real. Los campos específicos de tareas son columnas opcionales.

### 3.1 Entidades

**User** — `id`, `email` (único), `passwordHash`, `name`, `createdAt`.
**Session** — `id` (token aleatorio hasheado), `userId`, `expiresAt`.

**Node**
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | Estable; nunca cambia (también en Obsidian) |
| `ownerId` | uuid → User | Todas las consultas filtran por este campo |
| `type` | enum `NodeType` | AREA, GOAL, PROJECT, TASK, IDEA, PROBLEM, NOTE, DECISION, RESOURCE, INBOX_ITEM |
| `title` | text | Obligatorio |
| `body` | text | Markdown libre |
| `slug` | text | Único por usuario; nombre de archivo en Obsidian |
| `statusId` | uuid? → Status | Solo tipos accionables (TASK, PROJECT, GOAL) |
| `priority` | enum? | NONE, LOW, MEDIUM, HIGH, URGENT |
| `prioritySource` | enum? | USER, AI_SUGGESTED (nunca se presenta una sugerencia como dato confirmado) |
| `dueDate` | date? | |
| `outcome` | text? | Resultado esperado |
| `doneCriteria` | text? | Criterios de finalización |
| `nextAction` | text? | Próxima acción concreta |
| `effort` | int? + `effortSource` | Igual que prioridad: confirmado o sugerido |
| `url` | text? | Para RESOURCE |
| `processed` | bool | Para la bandeja de entrada |
| `completedAt` | timestamp? | |
| `archivedAt` | timestamp? | |
| `deletedAt` | timestamp? | Eliminación lógica (papelera) |
| `version` | int | Se incrementa en cada cambio; concurrencia optimista y sync |
| `searchVector` | tsvector | Generado (`spanish`) sobre título + cuerpo |
| `createdAt`, `updatedAt` | timestamp | |

Un INBOX_ITEM es texto crudo sin clasificar. Al procesarlo, el usuario (o una propuesta aceptada) cambia su `type` o lo usa como origen de nodos nuevos, conservando el vínculo con una arista `DERIVED_FROM`.

**Edge**
| Campo | Notas |
|---|---|
| `id`, `ownerId` | |
| `sourceId`, `targetId` | FK → Node |
| `type` | enum `EdgeType` |
| `createdBy` | USER o AI (vía propuesta aceptada) |
| `note` | Texto opcional que explica la relación |

Restricciones: `UNIQUE(sourceId, targetId, type)`, `CHECK(sourceId <> targetId)`, índices en `(ownerId, sourceId)` y `(ownerId, targetId)`.

**Categorías de relación** (derivadas del tipo, definidas en `packages/shared/relations.ts`):

| Categoría | Tipos | Semántica | Ciclos |
|---|---|---|---|
| STRUCTURAL | `CONTAINS` (área/objetivo/proyecto → hijo), `PARENT_OF` (tarea → subtarea) | Jerarquía; un nodo tiene a lo sumo un padre estructural | Prohibidos |
| EXECUTION | `DEPENDS_ON` (A no puede empezar/terminar sin B) | Orden de ejecución. "A bloquea B" se guarda como `B DEPENDS_ON A` (una sola representación) | Prohibidos |
| CONCEPTUAL | `RELATED_TO`, `DOCUMENTS`, `DEVELOPS`, `INFORMS`, `SUPPORTS`, `DERIVED_FROM`, `DUPLICATES` | Significado, sin efecto en ejecución | Permitidos |

Una **matriz de tipos permitidos** valida cada combinación (p. ej. `CONTAINS` solo GOAL→PROJECT, AREA→GOAL/PROJECT, PROJECT→TASK; `DOCUMENTS` solo NOTE/RESOURCE→cualquiera; `DEPENDS_ON` solo entre TASK/PROJECT). El bloqueo de una tarea se calcula (tiene `DEPENDS_ON` hacia algo no completado) o se marca con el estado de categoría BLOCKED; no hace falta un nodo "Bloqueo" separado, aunque un PROBLEM puede ser el origen de una dependencia.

**Status** — estados configurables por usuario: `name`, `category` (TODO, IN_PROGRESS, BLOCKED, DONE), `order`, `isDefault`. Se crean por defecto: Pendiente, En progreso, Bloqueada, Completada.

**Comment** — `nodeId`, `authorId`, `body`, `createdAt`.

**ActivityLog** — `ownerId`, `actor` (USER/AI_PROPOSAL), `action` (CREATE, UPDATE, DELETE, RESTORE, COMPLETE, REOPEN, LINK, UNLINK, APPLY_PROPOSAL), `nodeId?`, `edgeId?`, `proposalId?`, `diff` (JSON antes/después), `createdAt`. Es el historial de cambios y el registro de finalización/reapertura.

**Conversation** — `ownerId`, `nodeId?` (una conversación puede estar anclada a un nodo o agrupar varios), `title`, `state` (OPEN, RESOLVED), `context` (JSON: hechos confirmados, supuestos, preguntas abiertas).
**Message** — `conversationId`, `role` (USER, ASSISTANT, SYSTEM_EVENT), `content`, `structured` (JSON opcional: preguntas, propuesta), `provider`, `model`, `tokens`, `createdAt`.
**AIProposal** — `conversationId`, `ownerId`, `kind` (REFINE, DECOMPOSE, RELATE, CLASSIFY), `payload` (JSON validado por Zod), `status` (PENDING, ACCEPTED, PARTIAL, REJECTED, STALE), `appliedAt`, `appliedItems`, `idempotencyKey` (único).

**NodeLayout** — `ownerId`, `viewKey` (global o `focus:<nodeId>`), `nodeId`, `x`, `y`. Las posiciones del grafo no se mezclan con los datos del nodo.

**AISettings** — por usuario: proveedor (`anthropic` | `ollama` | `fake`), modelo, `ollamaBaseUrl`. La clave de Anthropic vive solo en variables de entorno del servidor.

**ExportState** — `ownerId`, `nodeId`, `exportedVersion`, `contentHash`, `path`, `exportedAt` (para exportaciones incrementales).

### 3.2 Integridad y operaciones

- **Borrado**: lógico por defecto (`deletedAt`). Las aristas de un nodo borrado quedan ocultas y se restauran con él. El vaciado de papelera hace borrado físico y las aristas caen por `ON DELETE CASCADE`. Así ninguna relación apunta a algo inexistente.
- **Ciclos**: al crear una arista STRUCTURAL o EXECUTION, dentro de la misma transacción se ejecuta una CTE recursiva desde `target` buscando `source`; si existe camino, se rechaza con error `CYCLE_DETECTED` y la cadena encontrada.
- **Transacciones**: toda operación de varias filas (aplicar propuesta, mover subárbol, importar) es atómica (`prisma.$transaction`). Si falla un paso, no queda nada a medias.
- **Idempotencia**: los endpoints de creación aceptan `Idempotency-Key`; aplicar una propuesta dos veces devuelve el resultado original sin duplicar.
- **Concurrencia**: las actualizaciones envían `version`; si no coincide → `409 CONFLICT`.
- **Búsqueda**: `searchVector` con índice GIN para texto completo; `pg_trgm` sobre `title` para detectar posibles duplicados al capturar.
- **Migraciones**: `prisma migrate` con migraciones versionadas en el repo; SQL manual en la migración para `tsvector`, `pg_trgm` y `CHECK`.
- **Exportación/importación**: JSON completo (respaldo fiel, re-importable) + Markdown (Obsidian).

## 4. Arquitectura del backend

```
apps/api/src
├─ app.ts               # construcción de Fastify (usable en tests)
├─ server.ts            # arranque
├─ lib/                 # prisma, errores, auth guard, idempotencia, activity log
└─ modules/
   ├─ auth/             # registro, login, logout, sesión
   ├─ nodes/            # CRUD, filtros, búsqueda, duplicados, papelera
   ├─ edges/            # crear/borrar relaciones; matriz de tipos; ciclos
   ├─ tasks/            # vistas (hoy, próximas, bloqueadas, por proyecto/objetivo), completar/reabrir, estados
   ├─ graph/            # subgrafo global/enfocado, expansión, aislados, inconsistencias, layout
   ├─ ai/               # ver §7
   └─ export/           # JSON, Markdown/ZIP, incremental
```

Cada módulo: `routes.ts` (esquemas Zod de entrada/salida) → `service.ts` (reglas de negocio, transacciones, ActivityLog) → Prisma. Las rutas nunca acceden a Prisma directamente.

Errores con forma uniforme `{ error: { code, message, details? } }`.

## 5. Interfaz de usuario

Layout: barra lateral (navegación) + contenido principal + **panel de detalle** lateral reutilizable. El nodo seleccionado se guarda en la URL (`?node=<id>`), así al pasar de lista a grafo o a otra vista se conserva el contexto.

| Vista | Contenido |
|---|---|
| Inicio | Próxima acción recomendada, hoy, bloqueadas, inbox sin procesar, objetivos activos |
| Bandeja de entrada | Campo de captura de una línea (atajo `N` o `Ctrl+K`), lista sin procesar, aviso de posibles duplicados, "Procesar con IA", selección múltiple |
| Backlog | Ideas, problemas y tareas sin comprometer; filtros por tipo/estado/proyecto/fecha |
| Hoy / Próximas / Bloqueadas | Vistas de ejecución |
| Proyectos / Objetivos | Lista + árbol (estructura) con progreso |
| Notas y decisiones | Lista y editor Markdown |
| Grafo | §6 |
| Detalle (panel) | Pestañas: Detalle · Relaciones · Conversación IA · Historial |
| Modo foco | Qué conseguir, por qué importa, criterio de terminado, info necesaria, bloqueos, próxima acción, relacionadas, botón "reducir" (IA) |
| Configuración | Estados, proveedor IA, carpetas de exportación, exportar/importar |

Búsqueda global en la barra superior. Las acciones destructivas piden confirmación, y el borrado lleva a la papelera, que se puede deshacer. En móvil, la barra lateral es un menú, el panel de detalle ocupa la pantalla y el grafo se usa en modo exploración, con la vista árbol como alternativa.

**Revisión de propuestas IA**: cada propuesta se muestra como una lista de cambios (crear nodo, editar campo, crear relación), cada uno con casilla, edición en línea y marca de "confirmado por vos" o "inferido por la IA". Se acepta todo, una parte o nada.

## 6. Grafo interactivo

### Comparación de bibliotecas
| | React Flow (@xyflow/react) | Cytoscape.js | Sigma.js / vis-network |
|---|---|---|---|
| Nodos | Componentes React (edición inline, badges, menús) | Canvas, estilo por CSS-like | Canvas/WebGL |
| Interacción (drag, selección múltiple, conectar arrastrando) | Nativa | Nativa (conectar requiere extensión) | Parcial |
| Layout automático | Externo (elkjs/dagre) | Muchos incorporados | Incorporados |
| Escala | Cómodo hasta ~1–2k nodos visibles | Miles | Decenas de miles |
| Integración con React/TS | Excelente | Wrapper | Wrapper |

**Elección: React Flow + elkjs.** El grafo de un usuario es de cientos o pocos miles de nodos, y lo que importa es la edición rica y la integración con el panel de detalle, no la escala masiva. Para no saturar la vista se cargan vistas enfocadas (un proyecto/objetivo + N saltos) y se expanden nodos a demanda.

Funciones: zoom/paneo, mover nodos (posición persistida en `NodeLayout`), selección múltiple, panel de detalle, crear nodo con doble clic, conectar arrastrando (abre selector de tipo de relación validado por la matriz), editar/borrar aristas, filtros (tipo, estado, proyecto, categoría de relación), búsqueda con resaltado, expandir vecinos, estilos distintos por categoría (estructural sólida, dependencia con flecha y color, conceptual punteada), resaltado de nodos aislados e inconsistencias (dependencia hacia algo borrado/archivado, tarea completada que depende de una pendiente, posibles duplicados). Las propuestas IA pendientes se pueden previsualizar como nodos o aristas "fantasma" antes de aceptarlas.

## 7. Arquitectura de IA

### Proveedores
| | Claude (Anthropic API) | Ollama (local/self-hosted) |
|---|---|---|
| Calidad de preguntas y descomposición | Alta | Variable según modelo |
| Salida estructurada | Tool use / JSON schema | `format` con JSON schema |
| Costo | Por token | Gratis (hardware propio) |
| Privacidad | Datos salen al proveedor | Local |
| Despliegue | Funciona en cualquier hosting | Requiere un servidor Ollama accesible desde el backend |

Se implementan ambos desde el inicio, más un proveedor **`fake`** determinista para tests y para usar la app sin credenciales (claramente indicado en la interfaz como "modo de prueba").

### Capas
```
modules/ai
├─ providers/        LLMProvider { generateStructured(schema, messages, opts) }
│                    anthropic.ts · ollama.ts · fake.ts
├─ prompts/          plantillas de sistema por tarea, con delimitación de datos del usuario
├─ tasks/            interpret · extractEntities · generateQuestions · refine ·
│                    decompose · detectRelations · recommendNext · reduceTask
├─ context.ts        arma el contexto: nodo, respuestas previas, candidatos relacionados (por búsqueda)
├─ proposals.ts      valida (Zod + dominio) y guarda AIProposal; aplica en transacción
└─ routes.ts
```

Flujo de refinamiento:
1. El usuario abre la conversación sobre un elemento.
2. `generateQuestions` devuelve `{ interpretation, assumptions[], questions[{text, why, impact}], enoughInfo }`. Si `enoughInfo` es verdadero, no se pregunta y se pasa a proponer. Se limita a pocas preguntas priorizadas por impacto.
3. Las respuestas se guardan como `Message` y se incorporan a `Conversation.context.confirmed`.
4. `refine` / `decompose` devuelven una propuesta con todos los campos de §5 del requerimiento (título, descripción, tipo, resultado, motivación, criterios, proyecto asociado, subtareas, dependencias, prioridad + justificación, próxima acción, preguntas pendientes, relaciones), con cada valor marcado `confirmed` o `inferred`.
5. `detectRelations` recibe candidatos reales obtenidos por búsqueda (id + título) y solo puede referenciar esos ids, así la IA no inventa nodos existentes.
6. El backend valida: esquema, que los ids existan y sean del usuario, la matriz de relaciones, que no haya ciclos y que no se creen duplicados. Si la propuesta es inválida, se reintenta una vez mostrándole el error al modelo; si sigue fallando, se informa sin tocar datos.
7. El usuario acepta, edita o rechaza. Aplicar = una transacción idempotente que se registra en ActivityLog con `proposalId`.

Seguridad: el contenido de notas y tareas va delimitado como datos no confiables dentro del prompt, y las instrucciones que contenga no se obedecen. La salida del modelo nunca se ejecuta ni se escribe directamente. Timeouts, reintentos acotados con backoff, manejo de rate limit y límite de uso por usuario. Ante un error, la conversación y los borradores se conservan.

Recomendación de próxima tarea: un pre-filtro determinista (tareas no completadas, sin dependencias pendientes, ordenadas por fecha límite, prioridad y objetivo activo) y luego el modelo elige y explica entre los primeros N candidatos. Sin IA configurada, se muestra el orden determinista con su explicación.

## 8. Integración con Obsidian

### Restricción del entorno
La app es web, hosteada y multiusuario, y el servidor no puede leer ni escribir en la computadora del usuario. El navegador tiene la File System Access API, pero solo en Chromium, con permiso por sesión y sin soporte en móvil.

### Opciones
| Opción | Pros | Contras |
|---|---|---|
| A. Exportar ZIP desde la app | Funciona en todos lados, simple | Manual, sin vuelta |
| B. File System Access API en navegador | Escribe directo al vault | Solo Chromium escritorio, permisos frágiles |
| C. CLI local de sincronización (Node) | Bidireccional controlada, automatizable, sin depender del navegador | Requiere ejecutar un programa local |
| D. Plugin de Obsidian que consume la API | Integración más cómoda | Más trabajo, API de plugins propia |

**Elección por etapas:** A (MVP) → C (sincronización). B y D quedan como mejoras posibles.

### Formato
```markdown
---
id: 3f6c…            # uuid estable
type: task
status: En progreso
priority: high
due: 2026-11-15
project: "[[erp-facturacion]]"
updated: 2026-10-21T18:00:00Z
version: 7
aliases: ["Implementar facturación electrónica"]
---
# Implementar facturación electrónica

Cuerpo en Markdown…

## Relaciones
- Depende de: [[configurar-certificado-afip]]
- Documentada por: [[decision-proveedor-facturacion]]
```

- Carpetas configurables por tipo (por defecto `Areas/`, `Objetivos/`, `Proyectos/`, `Tareas/`, `Ideas/`, `Notas/`, `Decisiones/`, `Recursos/`).
- Nombre de archivo = `slug`, único por usuario. Ante una colisión se agrega un sufijo, y los enlaces usan siempre el slug real, así no hay referencias rotas. Al renombrar un nodo se conserva el slug viejo en `aliases`.
- La exportación incremental compara `version` y hash con `ExportState`. El manifest `.backlog/manifest.json` lista id, ruta, versión y hash, y también los archivos que hay que borrar.

### Sincronización (CLI)
- `npx backlog-sync pull|push|status --vault <ruta>` con un token personal (generado en Configuración, con alcance limitado).
- Editable desde Obsidian: `title`, cuerpo Markdown y `aliases`. Solo en la app: estado, prioridad, fechas, dependencias, tipo e id, que en el frontmatter son de solo lectura y se ignoran al hacer push.
- Conflictos: si el archivo local cambió y el servidor también (`version` distinta), no se sobrescribe nada. Se escribe `<slug>.conflict.md` y se informa.
- Detección de cambios externos: el hash del contenido editable contra el manifest.

## 9. Desarrollo local y despliegue

- No hay Docker ni Postgres en la máquina actual. Para desarrollo y tests se usa **`embedded-postgres`** (Postgres real descargado por npm y levantado con `npm run db:start`), sin instalar nada en el sistema. Se incluye también un `docker-compose.yml` para quien tenga Docker.
- `.env.example` con `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OLLAMA_BASE_URL`, `AI_PROVIDER_DEFAULT`.
- Despliegue sugerido: Railway o Render (API + Postgres gestionado), con el frontend estático servido por la API o por el mismo hosting.

## 10. Etapas de implementación

| Fase | Contenido | Hecho cuando |
|---|---|---|
| 1. Auditoría y diseño | Este documento y la auditoría | Docs revisados |
| 2. Núcleo | Monorepo, DB local, esquema Prisma + migración, auth, CRUD de nodos y aristas, matriz, ciclos, ActivityLog, papelera | Tests de integración en verde |
| 3. Tareas | Estados, inbox + captura rápida + duplicados, backlog, vistas de ejecución, subtareas, dependencias, completar/reabrir, búsqueda, UI de listas/árbol y panel de detalle | Flujo UI→DB verificado + tests |
| 4. Grafo | React Flow, vistas global/enfocada, edición, filtros, layout persistido, inconsistencias | Cambios en el grafo persisten y se reflejan en las listas |
| 5. IA | Proveedores, conversación, preguntas, refinamiento, descomposición, relaciones, revisión/aplicación, próxima tarea, modo foco | Flujo completo con `fake` en e2e; probado con Claude real si hay clave |
| 6. Obsidian | Export JSON/Markdown ZIP, incremental; CLI de sync | ZIP abierto en Obsidian con enlaces funcionando |
| 7. Validación | e2e de los 14 criterios, seguridad (rate limit, cabeceras, CSRF), README, guía de despliegue | Todos los criterios verificados |

Al cerrar cada fase se actualiza `docs/PROGRESS.md` con lo implementado, las pruebas ejecutadas (y su resultado), lo pendiente y cómo verificarlo.

## 11. Preguntas abiertas (no bloquean el avance)

1. **Hosting final**: ¿Railway, Render u otro? Afecta solo la guía de despliegue (fase 7).
2. **Ollama en producción**: con la app hosteada, Ollama solo funciona si hay un servidor Ollama accesible desde el backend. En desarrollo local funciona directo. ¿Tenés o vas a tener uno?
3. **Registro de usuarios**: ¿registro abierto o por invitación? Por defecto: registro abierto que se puede desactivar con la variable `ALLOW_SIGNUP=false`.
4. **Idioma de la interfaz**: por defecto en español rioplatense, con textos centralizados por si después se quiere i18n.
