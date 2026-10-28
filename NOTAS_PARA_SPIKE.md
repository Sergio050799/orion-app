# Notas para Spike — rediseño de front de ORION

Alcance: solo presentación. Todo lo de abajo son **peticiones o puntos a verificar con datos reales** (la BD real no se ha usado; se probó con datos inventados). Nada se ha inventado en el código: donde la maqueta pedía un dato que no existe, la pantalla lo omite.

## Cambios que tocan algo más que presentación (revisar)
1. `api/flotas/oferta/excel/route.ts`: nuevo campo opcional `franquicia` en cada vehículo (numérico), nueva columna FRANQUICIA, prima y fecha como tipos reales, pie y paneles congelados. `HojaOferta.tsx` y `flotas/page.tsx` envían `franquicia` (solo Todo Riesgo con Franquicia).
2. `flotas/page.tsx` → `descargarTodo`: hoja nueva `INFORME_TECNICO` al final de ESTUDIO.xlsx (usa `consolidarSinco`, sin cambiar su lógica).
3. `HojaAutomatico.tsx`: `let sd` → `const sd` (lint, mismo comportamiento) y se usa `SilverdatModal` compartido (mismo endpoint `/api/silverdat/login`).
4. `dashboard/page.tsx`: cálculo de desplazamientos del donut hecho puro (mismo resultado).

## NUEVO · Búsqueda en catálogo con desplegables en cascada (verificar con el catálogo real de 143k)
Se ha sustituido la búsqueda manual de texto libre (Vehículos y Pre-emisión) por desplegables Marca → Modelo → Año → Versión + filtros de combustible, kW y plazas.
- Añadido (solo lectura): `consultarCascada()` en `src/core/catalogo/catalogoDataSource.csv.ts` y la ruta `GET /api/catalogo/cascada`. Componente `src/components/saas/CatalogCascade.tsx`.
- Probado con un catálogo **inventado** de 13 filas (cascada, filtros, ventana de años, alias de marca, y flujo completo en Vehículos y Pre-emisión). **Falta probarlo con el CSV real.** Comprobar en concreto:
  1. Que `marcas`/`modelos` salen sin duplicados raros (mayúsculas, espacios, variantes del mismo modelo) y que el desplegable de modelos es manejable en marcas con cientos de modelos.
  2. Que el valor de `combustible` del CSV son letras DGT (D, G, E, X, Y, P, R…) y no texto; si es texto, ajustar `FUEL_LABEL` y el filtro.
  3. Que `fec_ini_comerc` / `fec_fin_comerc` vienen como `AAAA-MM-DD` (se usan los 4 primeros caracteres) y que fin vacío = sigue comercializándose.
  4. Que `num_plazas_min/max` y `kw` tienen valores útiles (el filtro de plazas usa el rango min–max).
  5. Tiempo de respuesta de `/api/catalogo/cascada` con 143k filas (recorre el índice en memoria; si tarda, indexar por marca+modelo).
- Revisión del algoritmo automático existente (`/api/catalogo/search`), sin cambios, para que lo valides:
  - `loadCsv` separa las líneas con `line.split(sep)`: si el CSV real trae campos entrecomillados con comas, se desplazarán las columnas. Comprobar.
  - El comentario de `search()` dice «año es solo puntuación, nunca filtro duro», pero `scoreVehiculo` descarta (puntuación 0) los vehículos fuera de su ventana de comercialización cuando llega `anyo`. Decidir cuál es la regla y alinear comentario y código.
  - `search()` devuelve como máximo 20 resultados con umbral 70 (55 en el segundo intento): en modelos con muchas versiones la lista puede quedarse corta; por eso la vía manual ahora es exacta.

## NUEVO · Tipo de vehículo (primer desplegable) a partir de `id_clase`
Decisiones de Sergio: más de 3.500 kg de PMA = categoría 2; los CAMI ligeros siguen siendo camión; minibús/autocar = categoría 2 y **no admitido**; **3.ª categoría = solo motos**; vehículos industriales / especiales = categoría 2.
- Añadido (Categoría 1/2/3 → Tipo): `src/core/catalogo/tipologia.ts` (tabla `CLASE_TIPO`, prefijos, `clasificar(id_clase, pma)`), campo `tipo` en `CatalogoVehiculo` (calculado en `parseRow`), parámetro `tipo` en `consultarCascada` y `GET /api/catalogo/cascada?categoria=&tipo=`, y los desplegables Categoría y Tipo en `CatalogCascade`. **El motor de primas (`primas.ts`, `VEH_META`) solo conoce categorías 1 y 2: las motos (3.ª) aún no tienen tarifa.**
- **Pre-calentado**: ya existía (`src/instrumentation.ts` llama a `getAllMarcas()` al arrancar, y el log muestra «Catálogo precargado»). No hay que añadir nada; solo comprobar que se ejecuta en el arranque de producción.
- **Pendiente para Spike con el catálogo real**:
  1. Rellenar `CLASE_TIPO` con las ~70 `id_clase` (nombre, nº de filas y tipo). Ahora solo están PO, BE, FA, TT, CO, CA, CDTUR, CDTT, MV, FUR (furgoneta), FURH (furgón), FURPES, CAMI, TCAMI, AUTOCAR2B, MIC2C y los prefijos MOT3 y CIC3 (moto, 3.ª) y REMOL (remolque). PATP no está asignada. El tipo `industrial` (2.ª categoría) existe pero ninguna clase apunta a él todavía: indicar qué clases son vehículos industriales / especiales.
  2. Confirmar con Sergio las clases dudosas: **CDTT** (ahora turismo; en tu primera tabla estaba en Moto/Otros), **MV**, **PATP**, qué clases son industriales/especiales y si existen más clases de minibús/autobús.
  3. Comprobar que `FURH` no cruza los 3.500 kg (la regla del PMA solo se aplica a las clases que `clasificar` trata como furgoneta).
  4. Al cargar el CSV real, mirar el log: lista las `id_clase` sin tipología. Si salen muchas, completar la tabla.
  5. Rendimiento con 143k filas: el recuento por tipo se calcula una vez al cargar; la lista de marcas por tipo se memoriza en la primera petición de cada tipo.
- Fuera de alcance (decisión de Spike): que el emparejamiento automático (`/api/catalogo/search`) use el tipo para buscar solo en su grupo, y que el flujo automático marque «no admitido» cuando el vehículo emparejado sea minibús/autocar.

## Datos o endpoints que las maquetas necesitan y no existen
- `/api/flotas/carpetas?summary=true` no trae nº de vehículos (`totalVehiculos`) ni primas: Flotas muestra «—» / 0 € cuando faltan.
- Ficha de flota: estudios anteriores, documentos, notas y estimación de vehículos no están en el modelo. `comisionExtra` (migración), prima por corredor, varios tomadores.
- Dashboard: el gráfico «año anterior» necesita carpetas de 12–24 meses; «Actividad reciente» no rellena la columna usuario en el seed.
- Vehículos: no hay persistencia/histórico de lotes → faltan KPIs (consultados, identificados, pendientes, consultas a Silverdat), barras por marca/categoría, directorio de lotes, ficha de vehículo y «Exportar» por lote; tampoco endpoint de desconexión de Silverdat.
- Oferta: la maqueta ajusta el precio de cada fila; el código solo informa el total. Pre-emisión: «Aceptar coincidencias ≥ 90 %» no implementado.
- Catálogo (143k) ausente: Vehículos y paso 08 devuelven 500 en local (esperado hasta cargar datos).
- El zip «Descargar todo» no pasa `cobAnexo` a la oferta (calculado en `HojaOferta`).

## Verificar al cargar los datos reales
- Tablas largas (paginación a 20 en Flotas; 30 filas/página en el PDF de oferta con altura estimada: comprobar desbordamiento con flotas de cientos de vehículos).
- `npx next build` no se pudo ejecutar en el sandbox (necesita Google Fonts); `tsc --noEmit` pasa sin errores.
- ESLint: quedan errores previos fuera de este alcance (HojaCoberturas, HojaOriginal ref en render, HojaTrabajos comillas, Corredores setState en efecto, DashboardCharts `any`).

## Seguridad
- El formulario de login ya no muestra la pista de credenciales. Si MMT/MMT2026 son reales, rotar la contraseña.
## Archivos ELIMINADOS (el zip no puede reflejar borrados: borrarlos a mano)
- src/app/(dashboard)/analysis/plates/ (duplicaba Vehículos; /api/plates y /api/silverdat se conservan)
- src/components/saas/layout/Sidebar.tsx (sustituido por Topbar)
- src/app/(dashboard)/flotas/components/HojaResultadosSinco.tsx, HojaCoberturas.tsx, FlotaGrid.tsx (sin importaciones; los tipos de types.ts se mantienen)

## Huérfanos que se CONSERVAN sin tocar (decisión pendiente de Sergio)
- gestion-documental (recibos → regularización, Excel, factura PDF; 5 endpoints en api/flotas/recibos/*): conserva funcionalidad propia, restilizar si se usa.
- analysis/detection + emission/components/EmissionOcrFlow/EmissionUploadModal + saas/DocumentScanner, Vehicle*/Carnet*/Permiso*: flujo OCR de permisos/fichas; depende de lo que se haga con el Escáner (hoy «En mantenimiento»).
- emission/CalibradorPrecios.tsx: sin importaciones; confirmar si se usa.
- «Fenómenos atmosféricos»: Sergio decide dejarla fuera.

## NUEVO · Coberturas, INFORME configurador, EMISIÓN (pendiente de revisión de Sergio; verificar con datos reales)
Todo se ha probado solo con datos inventados (BD semilla, corredor y catálogo ficticios).
- `catalogoCoberturas.ts` es la fuente única; si cambian IDs o franquicias, se toca solo ahí.
- Supuestos a confirmar: ID_INTERVINIENTE = ID perceptor del corredor; PRECIO_OBJETIVO = prima ofertada (2 decimales); ROBO/INCENDIO/LUNAS se emiten SI/NO según la cobertura; CP como texto; ID_TOM e ID_INTERVINIENTE numéricos si son dígitos; CODIGO_BASE7 y NUM_BASTIDOR en blanco; plazas desde `plazas` de TRABAJO.
- **RC en reposo**: ID aún sin asignar (por defecto 'sí' en 1.ª categoría): hoy solo avisa. Cuando exista el ID, añadirlo a `aEmision`.
- Sin columna en la plantilla: RC voluntaria extras, retención infantil, equipaje.
- AV Platino/Limitada se tarifa como Oro en el motor. Defensa jurídica de moto: la captura dice 1.000 €, el archivo de IDs 3.005,06/800/600; por defecto DEFM_1_2.
- Motos: sin tarifa en el motor y sin TR_MOTO_FRANQ; F_950 se ofrece aunque no está en el archivo de IDs; industrial emite solo AUTO_TERC; minibús/autocar no admitidos (bloquean).
- Tipología pendiente: clases CDTT, MV, PATP e industriales.
- Importador: comprobar el comportamiento con «No aplica» y con «Terceros Ampliado con Franquicia».
- ExcelJS genera validaciones solapadas (J10:J205 y J6:J205): ya ocurría en el generador original.
- PRE-EMISIÓN descarta `catalogoSeleccion` de vehículos sin resolver.
- Plantilla de emisión: validaciones de datos solo en filas 2–1001; `/api/flotas/emision` (pre-emisión) no se ha tocado.

## Parche v4.2 (ver DESIGN.md §28.7)
- Fuentes locales en `src/app/fonts` (no volver a Google Fonts). `.mini.sd` con contorno. PDF de oferta con `PAGINADOR` (JS en el propio documento; mide mm reales). Paso 02 a ancho completo. Configurador de INFORME como hoja blanca (`.paper.wide`).
- Ficheros: `HojaOferta.tsx`, `HojaAutomatico.tsx`, `ConfigCoberturas.tsx`, `HojaInforme.tsx`, `estudio-css.ts`, `orion-ui.css`, `layout.tsx`, `fonts/*`.
