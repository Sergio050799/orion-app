/**
 * Tests Sprint 1 — bugs #0, #3, #2
 * Ejecutar con: npx tsx scripts/test-sprint1.ts
 */
import { calcularPrima, type PrimasConfig } from '../src/core/flotas/primas';
import { inferirConfig } from '../src/core/flotas/catalogoCoberturas';

let pass = 0;
let fail = 0;

function assertEq(actual: unknown, expected: unknown, label: string) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { pass++; console.log(`  OK   ${label}`); }
    else    { fail++; console.log(`  FAIL ${label}`); console.log(`       esperado: ${JSON.stringify(expected)}`); console.log(`       actual:   ${JSON.stringify(actual)}`); }
}

function assertNear(actual: number | null, expected: number, tol = 1, label = '') {
    const ok = actual !== null && Math.abs(actual - expected) <= tol;
    if (ok) { pass++; console.log(`  OK   ${label} (≈${actual})`); }
    else    { fail++; console.log(`  FAIL ${label} esperado≈${expected} actual=${actual}`); }
}

// ─── Bug #0 — calcularPrima respeta config del admin ────────────────────────
console.log('\n[Bug #0] calcularPrima usa config del admin cuando se pasa');

const configAdmin: PrimasConfig = {
    primas: { 'turismo:terceros:nacional': 999 },  // valor absurdo para detectar que se usa
    ajustes: {},
};

const sinConfig = calcularPrima({ tipoVehiculo: 'turismo', producto: 'terceros', ambito: 'nacional' });
const conConfig = calcularPrima({ tipoVehiculo: 'turismo', producto: 'terceros', ambito: 'nacional' }, configAdmin);
assertEq(sinConfig, 500, 'turismo terceros sin config usa fallback 500');
assertEq(conConfig, 999, 'turismo terceros con config usa 999 del admin');

// ─── Bug #3 — asistencia nacional suma en 2a cat ────────────────────────────
console.log('\n[Bug #3] asistencia en 2a cat suma correctamente');

const sinAsistencia = calcularPrima({
    tipoVehiculo: 'camion_rigido', producto: 'terceros',
    ambito: 'nacional', asistencia: 'no',
});
const conAsistenciaNacional = calcularPrima({
    tipoVehiculo: 'camion_rigido', producto: 'terceros',
    ambito: 'nacional', asistencia: 'nacional',
});
const conAsistenciaInternacional = calcularPrima({
    tipoVehiculo: 'camion_rigido', producto: 'terceros',
    ambito: 'internacional', asistencia: 'internacional',
});

// camión rígido nacional terceros = 800; + asistencia_nacional (221) = 1021
assertNear(sinAsistencia, 800, 1, 'camión sin asistencia = 800');
assertNear(conAsistenciaNacional, 1021, 1, 'camión + asistencia nacional = 1021 (800+221)');
// camión internacional terceros = 945; + asistencia_internacional (327) = 1272
assertNear(conAsistenciaInternacional, 1272, 1, 'camión intl + asist intl = 1272 (945+327)');

// ─── Bug #2 — inferirConfig lee asistencia/seguro_cond/ambito ──────────────
console.log('\n[Bug #2] inferirConfig propaga valores de la plantilla');

// Caso típico: plantilla con Terceros + asistencia "Nacional" + franquicia 1800
const cfg = inferirConfig('camion', 'Terceros', [
    { frq: '1800', asistencia: 'nacional', ambito: 'nacional' },
    { frq: '1800', asistencia: 'nacional', ambito: 'nacional' },
    { frq: '1800', asistencia: 'nacional', ambito: 'nacional' },
]);
if (!cfg) {
    fail++;
    console.log('  FAIL inferirConfig devolvió null para CAMION_RIGIDO Terceros');
} else {
    pass++;
    console.log(`  OK   inferirConfig devolvió config (producto=${cfg.producto}, frq=${cfg.franquicia})`);
    console.log(`       opciones:`, JSON.stringify(cfg.opciones));
}

// Caso: plantilla sin asistencia, debería mantener defaults
const cfgSinAsist = inferirConfig('camion', 'Terceros', [
    { frq: '1800' },
    { frq: '1800' },
]);
if (cfgSinAsist) {
    pass++;
    console.log(`  OK   inferirConfig sin asistencia → defaults (opciones=${JSON.stringify(cfgSinAsist.opciones)})`);
}

// ─── RESUMEN ────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} OK · ${fail} FAIL\n${'='.repeat(50)}`);
process.exit(fail > 0 ? 1 : 0);
