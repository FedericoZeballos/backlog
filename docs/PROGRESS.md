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

## Fase 3: gestión de tareas e interfaz web ✅ (2026-10-22)

### Implementado

**API**
- Vistas de ejecución:
  - **Hoy**: vencidas, con fecha de hoy o en curso, más las completadas hoy. Usa la fecha local del cliente para respetar su zona horaria.
  - **Próximas**: vencen dentro de una ventana de N días.
  - **Bloqueadas**: tienen estado bloqueado o dependen de algo sin terminar, y cada una lista lo que la bloquea.
  - **Backlog**: ideas, problemas, tareas y proyectos ya procesados y sin terminar.
  - **Árbol estructural** para proyectos y objetivos.
- Jerarquía: crear un elemento directamente dentro de un padre (`parentId`, en la misma transacción) y moverlo o desvincularlo (`PUT /nodes/:id/parent`, atómico y con detección de ciclos).
- Búsqueda en español que ignora tildes y mayúsculas (`tsvector` + `unaccent`, con índice GIN) y que también encuentra coincidencias parciales de una palabra. Los comodines de `LIKE` se escapan.
- Posibles duplicados por similitud de trigramas (`pg_trgm`) al capturar.
- Estados configurables: crear, renombrar, cambiar la categoría (solo si no está en uso), elegir el estado por defecto (no puede ser de tipo terminado), reordenar y borrar moviendo los elementos a otro estado, con ajuste de la fecha de completado.
- Comentarios por elemento.
- Los nodos relacionados incluyen `version` y estado, así una subtarea se completa sin pedirla aparte.

**Web** (React 19, Vite 8, TanStack Query 5, React Router 7, Tailwind 4)
- Login y registro por invitación.
- Inicio:
  - Saludo e inbox pendiente.
  - Captura rápida.
  - Tarjeta "Para empezar" con la primera tarea de hoy por prioridad y fecha.
  - Resúmenes de hoy, próximas, bloqueadas y objetivos con su progreso.
- Bandeja de entrada:
  - Captura de una línea con aviso de duplicados.
  - Clasificación individual o en lote.
  - Eliminación con opción de deshacer.
- Hoy, Próximas (agrupadas por día), Bloqueadas (con lo que espera cada una) y Backlog (filtros por tipo y texto).
- Proyectos (árbol de áreas, objetivos, proyectos y tareas con barra de progreso) y Objetivos.
- Notas y decisiones, Papelera (restaurar o eliminar definitivamente) y búsqueda global.
- Panel de detalle, disponible en todas las vistas:
  - Edición de los campos con guardado explícito y manejo de conflictos de versión.
  - Jerarquía: pertenece a, mover, y agregar subtareas o tareas.
  - Relaciones separadas en "Dependencias" y "Relaciones conceptuales", con selector filtrado por los tipos permitidos.
  - Comentarios e historial de cambios legible.
  - Archivar y eliminar.
- Modo foco: qué conseguir, por qué importa (resultado del objetivo o proyecto padre), criterio de terminado, bloqueos, pasos, información vinculada y siguiente acción editable.
- Configuración de estados y administración (invitaciones con link para copiar, revocar, desactivar y reactivar usuarios).
- Captura global con `N`. El elemento seleccionado queda en la URL y se conserva al cambiar de vista. En pantallas anchas, el panel se ubica al costado del contenido sin taparlo.
- Modo claro y oscuro automático y diseño adaptable a celular.

### Pruebas ejecutadas
- `npm test`: 58 en verde (4 en `shared` y 54 de integración en la API, de los cuales 14 son nuevos de esta fase).
- `npm run e2e`: 9 en verde en Chromium (8 de escritorio y 1 de móvil), contra una API y una base reales y aisladas:
  - Capturar sin clasificar y después clasificar como tarea.
  - Aviso de duplicado.
  - Tarea para hoy y completarla.
  - Proyecto con tareas, dependencia, vista de bloqueadas y rechazo de un ciclo.
  - Editar el detalle y conservar la selección entre vistas, con el historial.
  - Papelera y restauración.
  - Búsqueda sin tildes.
  - Invitación, registro, aislamiento de datos y link de un solo uso.
  - Uso en el celular sin scroll horizontal.
- `npm run typecheck` y `npm run build`: sin errores.
- Prueba manual: `npm run dev` levanta la API y la web, y el proxy responde.
- Revisión visual con capturas en escritorio (claro y oscuro), modo foco y móvil.

### Problemas encontrados y corregidos en el camino
- El panel de detalle tapaba el contenido en escritorio. Ahora el contenido se corre al costado.
- El checkbox de completar volvía a destildarse hasta que respondía el servidor. Ahora se actualiza al instante y se revierte si hay error.
- El modo foco no mostraba los textos "sin bloqueos" ni "sin información".
- Al abrir otro elemento, el panel conservaba la pestaña anterior. Ahora vuelve a "Detalle".
- Había dos versiones de Vite (7 y 8) en el monorepo; quedó una sola (8).

### Pendiente / notas
- La recomendación de qué hacer a continuación es por ahora determinista (prioridad y fecha). La versión con IA y su explicación llegan en la fase 5.
- El cuerpo en Markdown se edita como texto. La vista previa con formato y los enlaces `[[...]]` se suman con la integración de Obsidian (fase 6).
- El grafo interactivo es la fase 4. Las listas, el árbol y el panel ya sirven como alternativa sin grafo.
- Si Playwright corta sus servidores sin cerrarlos bien, el Postgres de e2e puede quedar corriendo. La próxima ejecución lo detecta y lo detiene.

## Fase 4: grafo interactivo ✅ (2026-10-22)

### Implementado

**API**
- `GET /graph`:
  - Vista global, o vecindario de 1 a 4 saltos desde uno o varios nodos.
  - Filtros por tipo, categoría de relación y completadas.
  - Excluye la papelera, lo archivado y, por defecto, lo que sigue sin clasificar.
  - Cada nodo informa cuántas relaciones quedan fuera de la vista, para poder expandirlo.
  - Límite de 1500 nodos en la vista global, con aviso.
- Posiciones guardadas por vista (tabla `NodeLayout`, separada de los datos del nodo), con upsert en lote que ignora nodos ajenos. También se pueden reiniciar.
- `GET /graph/issues`:
  - Nodos aislados.
  - Tareas terminadas que dependen de algo abierto.
  - Contenedores terminados con trabajo abierto.
  - Dependencias de elementos archivados.
  - Posibles duplicados por similitud de títulos, sin repetir los pares ya marcados como `DUPLICATES`.
- Sin base de datos de grafos: una tabla de aristas y un recorrido en memoria alcanzan para la escala personal.

**Web** (React Flow 12 + elkjs)
- Zoom, desplazamiento, minimapa y controles. Modo claro y oscuro.
- Nodos con tipo, estado y fecha. Estilos por categoría de relación: jerarquía en línea gris, dependencias con flecha naranja, conceptuales con línea punteada, y etiquetas con el nombre de la relación.
- Interacción:
  - Click en un nodo: abre el panel de detalle (la misma selección `?node=` del resto de la app).
  - Click en una relación: muestra qué relación es y permite quitarla, con confirmación.
- Edición:
  - Conectar arrastrando de un nodo a otro, y elegir el tipo de relación entre las permitidas, en ambas direcciones.
  - Crear un nodo con doble click en el lienzo o con el botón "Nodo".
  - Seleccionar varios nodos (Shift + arrastrar) para enfocar o eliminar.
- Vistas:
  - "Todo" o "Enfocado", con saltos configurables y guardados en la URL.
  - Botón "+N" para expandir un nodo y descubrir sus conexiones.
  - Si el elemento abierto no está en la vista, avisa y permite mostrarlo.
- Filtros por tipo, relación y completadas. La búsqueda resalta coincidencias y atenúa el resto, y con Enter abre la primera.
- Posiciones:
  - Ordenamiento automático con elkjs la primera vez.
  - Los nodos nuevos se ubican junto a un vecino, sin mover lo que acomodaste a mano.
  - Las posiciones se guardan al soltar un nodo, y "Reordenar" las recalcula.
- Panel "Revisar" con los problemas detectados. Click en un elemento lo abre y lo centra.
- Enlace "Ver en el grafo" desde el panel de detalle y "Árbol" como alternativa sin grafo.

### Pruebas ejecutadas
- `npm test`: 69 en verde (4 en `shared` y 65 en la API, de los cuales 11 son nuevos de grafo: vistas global y enfocada, expansión desde varios nodos, filtros, reflejo de cambios persistidos, aislamiento entre usuarios, posiciones por vista, problemas).
- `npm run e2e`: 15 en verde, de los cuales 6 nuevos de grafo:
  - El grafo muestra lo persistido y abre el detalle.
  - Conectar arrastrando, elegir "depende de" y verlo en Bloqueadas.
  - Mover un nodo y conservar la posición al recargar.
  - Crear un nodo con doble click.
  - Vista enfocada con expansión y vuelta a "Todo".
  - Filtros, búsqueda resaltada y panel de problemas.
- `npm run typecheck` y `npm run build`: sin errores.
- Revisión visual en modo claro y oscuro.

### Problemas encontrados y corregidos
- El botón "+N" quedaba encima del punto de conexión y, al hacer click, empezaba a arrastrar una conexión. Se movió a la esquina superior derecha.
- El botón "+N" no tenía nombre accesible; ahora lo tiene, con el plural correcto.
- Se volvió a mostrar la atribución de React Flow, porque ocultarla corresponde a la licencia Pro.

### Pendiente / notas
- En grafos con muchas relaciones cruzadas, el ordenamiento automático puede superponer líneas; se corrige moviendo nodos (la posición queda guardada).
- La vista previa de nodos y relaciones propuestos por la IA, antes de aceptarlos, llega con la fase 5.
- En el celular, el grafo se puede explorar y abrir nodos. Para editar relaciones conviene usar el panel o el árbol.

## Fase 5: asistente de IA ✅ (2026-10-23)

### Implementado
- **Proveedores intercambiables**:
  - Ollama local, con un JSON Schema en `format`, un reintento ante formato inválido y errores claros.
  - Claude, con salidas estructuradas y `fallbacks: "default"`.
  - Modo de prueba `FAKE`, determinista.
  - Cada usuario elige proveedor y modelo en Configuración. Las URLs y las claves quedan solo en el servidor.
- **Conversación por elemento**, persistida y retomable: interpretación, supuestos marcados como sin confirmar, y hasta 3 preguntas priorizadas solo si cambian el plan.
- **Propuestas revisables**:
  - Qué incluyen: campos refinados con los inferidos marcados, contenedor, pasos con dependencias, relaciones con lo existente, preguntas pendientes y riesgos.
  - Antes de guardarse, el backend verifica:
    - que las refs existan;
    - que las relaciones estén permitidas;
    - que no haya ciclos ni duplicados de elementos existentes.
  - Repara errores típicos de modelos chicos: refs con texto pegado, "depende de una nota" que pasa a "la nota aporta información", un elemento existente copiado como paso nuevo. Todo lo que ajusta o descarta queda informado.
- **Aplicación** selectiva, editable, atómica e idempotente. Queda registrada con la IA como actor. La prioridad aceptada se sigue mostrando como "sugerida por IA".
- **Recomendación** "¿Qué hago ahora?" entre las tareas sin bloqueos, con motivo y primer paso. Si la IA no está disponible, usa el orden por prioridad y fecha.
- **Modo foco**: botón "Reducir con IA". **Bandeja**: "Procesar con IA".
- **Seguridad**: el contenido del usuario va delimitado como datos y no puede cerrar los delimitadores. Hay un solo pedido de IA por usuario a la vez (doble click: 409) y límite de frecuencia. Si la IA falla, no se pierde el mensaje del usuario ni quedan datos a medias.
- `npm run ai:smoke`: prueba el modelo configurado con un caso de ejemplo, sin tocar la base.

### Pruebas ejecutadas
- `npm test`: 98 en verde.
  - Fase 5: conversación, contexto e inyección de prompts, validación de propuestas, aplicación parcial, idempotente y atómica, fallas del proveedor, pedidos simultáneos, aislamiento entre usuarios y recomendación.
  - Proveedor Ollama contra un servidor HTTP simulado.
  - Validador con salidas reales de qwen2.5.
- `npm run e2e`: 19 en verde. Los 4 nuevos usan el modo de prueba: procesar con IA, responder, proponer, aplicar una parte y verlo en el árbol; descartar y retomar; "¿Qué hago ahora?"; configuración.
- **Con Ollama real** (Windows, GTX 1050 de 4 GB y 24 GB de RAM):
  - `qwen2.5:7b`: buena calidad, pero 55 % del modelo corre en CPU, con 2,5 a 4 minutos por respuesta. El timeout está en 6 minutos.
  - `qwen2.5:3b`: 100 % en la placa, 17 a 50 s por respuesta. Calidad aceptable y más desprolija.
  - Flujo completo verificado contra la API real con el 3b: turno (17 s), propuesta (28 s) y aplicación. El resultado fue un proyecto dentro del objetivo correcto, con sus tareas y el historial con la IA como actor.
- Claude: implementado y con typecheck, pero **no probado contra la API real** (no hay `ANTHROPIC_API_KEY`).

### Problemas encontrados y corregidos
- La búsqueda de candidatos exigía todas las palabras y no encontraba elementos relacionados. Ahora busca por cualquier palabra significativa, ordenada por relevancia.
- En Chromium, `scrollIntoView()` devuelve una Promise, y un `useEffect` con cuerpo de expresión rompía la pantalla.
- Ollama no pudo crear la carpeta de modelos en `D:\ollama` por permisos de Windows. Se usa `D:\Documents\ollama\models`.

### Pendiente / notas
- La vista previa de la propuesta como nodos "fantasma" en el grafo no está hecha; la revisión se hace en el panel.
- El test e2e de móvil falló una vez de forma intermitente con la máquina muy cargada y después pasó.

## Fase 6: Obsidian ⏳
