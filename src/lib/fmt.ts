/**
 * Formato numérico único de ORION (es-ES). Solo presentación.
 * Miles con punto incluso con 4 cifras (2.055), decimales con coma, signo menos U+2212.
 * Importes: 100.316,00 €  ·  Porcentajes: 50 %  ·  Variaciones: +24,2 %
 */
export const dec = (n: number, d = 1): string => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  const [i, f] = Math.abs(n).toFixed(d).split('.');
  return (n < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
};
export const nf = (n: number): string => dec(Math.round(n), 0);
export const eur = (n: number, d = 0): string => (n == null || isNaN(n) ? '—' : dec(n, d) + ' €');
export const eur2 = (n: number): string => eur(n, 2);
export const pc = (n: number, d = 1): string => (n == null || isNaN(n) ? '—' : dec(n, d) + ' %');
export const signedPc = (n: number, d = 1): string => (n > 0 ? '+' : '') + pc(n, d);
