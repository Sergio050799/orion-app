// ─── J-3: NORMALIZACIÓN DE PÓLIZA ────────────────────────────────────────────

/**
 * Extrae los últimos 5 dígitos de una cadena de póliza.
 * Si hay menos de 5 dígitos, rellena con ceros por la izquierda.
 * Ejemplos: "123" → "00123" | "ABC12345" → "12345" | "" → "00000"
 */
export function normalizarPoliza(poliza: string): string {
    const digits = poliza.replace(/\D/g, '');
    return digits.slice(-5).padStart(5, '0');
}
