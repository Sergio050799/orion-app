// Ejecutado por Next.js al arrancar el servidor (antes del primer request).
// Pre-carga el catálogo CSV en memoria para eliminar el cold-start lag.
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            const { getAllMarcas } = await import('./core/catalogo/catalogoDataSource.csv');
            const marcas = getAllMarcas();
            console.log(`[orion] Catálogo precargado: ${marcas.length} marcas`);
        } catch {
            // Sin CSV aún (primer deploy) — se cargará en el primer request
        }
    }
}
