# Inventario Antigravity (Reset Controlado)

Este archivo lista los elementos creados o modificados por Antigravity durante la integración del Panel 3 (PDF Manager) en Orión.

## USER-OWNED — NO TOCAR (Movidos a `src/core/truth`)
- `src/core/normativa_md/*.md` -> `src/core/truth/md/`
- `src/core/data/*.json` -> `src/core/truth/dictionaries/`
- `src/core/dictionaries/*.json` -> `src/core/truth/dictionaries/`
- `src/core/plates/*` -> `src/core/truth/plates/`
- `references_orion/*` -> `src/core/truth/references/`
- `memorias_del_proyecto/memoria_general.md` (Backup de ejecución)

## ANTIGRAVITY — A ELIMINAR (Previa copia de seguridad)

### Componentes UI
- `src/components/orion/panel-3/**` (Todo el directorio: `workstation.tsx`, `ingest-zone.tsx`, `vehicle-grid.tsx`, `validation-report.tsx`, etc.)
- `src/components/orion` (Si queda vacío tras borrar panel-3)

### Rutas API y App
- `src/app/api/orion/**` (Rutas API creadas: `core-data`)
- `src/app/orion/**` (Posible ruta de página o layouts asociados)
- `src/lib/orion/**` (Lógica de negocio: `logic-core.ts`, `data-loader.ts`, `types.ts`)

### Archivos de Configuración y Logs
- `check_exports.js`
- `build_*.log`, `lint_*.txt`, `ts_errors.log`
- `RESUMEN_EJECUCION_PANEL3.md` (Ya movido a memorias)

### Dependencias (Package.json)
Se eliminarán las siguientes dependencias añadidas por Antigravity:
- `react-resizable-panels`
- `lucide-react`
- `@tanstack/react-table`
- `@tanstack/react-virtual`
- `pdfjs-dist`
- `@napi-rs/canvas`
- `@google/generative-ai`
- `clsx`
- `tailwind-merge`
- `zod`

## Notas
- El archivo `src/app/layout.tsx` y `src/app/page.tsx` se verificarán para asegurar que no contienen referencias rotas tras la eliminación.
- La carpeta `src/core` quedará limpia de los subdirectorios originales (`normativa_md`, `data`, `dictionaries`, `plates`) una vez movidos a `truth`.
