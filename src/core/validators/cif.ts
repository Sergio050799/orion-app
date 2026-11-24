// ─── Validador de identificadores fiscales españoles (CIF / NIF / NIE) ────────
// Puro, sin dependencias. Comprueba formato y carácter de control.

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
const LETRAS_CIF = 'JABCDEFGHI';

/** Mayúsculas y sin espacios, puntos ni guiones. */
export function normalizarCif(s: string): string {
  return String(s ?? '').toUpperCase().replace(/[\s.\-_/]/g, '');
}

function letraDni(numero: string): string {
  return LETRAS_DNI[parseInt(numero, 10) % 23];
}

function esNifValido(v: string): boolean {
  // DNI: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(v)) return letraDni(v.slice(0, 8)) === v[8];
  // NIF especial K/L/M: letra + 7 dígitos + letra
  if (/^[KLM]\d{7}[A-Z]$/.test(v)) return letraDni(v.slice(1, 8)) === v[8];
  return false;
}

function esNieValido(v: string): boolean {
  if (!/^[XYZ]\d{7}[A-Z]$/.test(v)) return false;
  const prefijo = String('XYZ'.indexOf(v[0]));
  return letraDni(prefijo + v.slice(1, 8)) === v[8];
}

function esCifSocietarioValido(v: string): boolean {
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) return false;
  const digitos = v.slice(1, 8);
  let suma = 0;
  for (let i = 0; i < 7; i++) {
    const d = digitos.charCodeAt(i) - 48;
    if (i % 2 === 0) {
      // posiciones impares (1ª, 3ª, 5ª, 7ª): doble y suma de cifras
      const doble = d * 2;
      suma += doble > 9 ? doble - 9 : doble;
    } else {
      suma += d;
    }
  }
  const control = (10 - (suma % 10)) % 10;
  const esperadoDigito = String(control);
  const esperadoLetra = LETRAS_CIF[control];
  const ctrl = v[8];
  const tipo = v[0];
  // Control obligatoriamente letra
  if ('PQRSNW'.includes(tipo) || digitos.startsWith('00')) return ctrl === esperadoLetra;
  // Control obligatoriamente dígito
  if ('ABEH'.includes(tipo)) return ctrl === esperadoDigito;
  // Resto: se admite cualquiera de los dos
  return ctrl === esperadoDigito || ctrl === esperadoLetra;
}

/** true si `s` (tras normalizar) es un CIF, NIF o NIE español válido. Vacío → false. */
export function esCifValido(s: string): boolean {
  const v = normalizarCif(s);
  if (v.length !== 9) return false;
  return esNifValido(v) || esNieValido(v) || esCifSocietarioValido(v);
}
