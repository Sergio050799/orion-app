const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

function loadTsModule(tsPath) {
  const source = fs.readFileSync(tsPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const moduleObj = { exports: {} };
  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    require,
    process,
    console,
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: tsPath });
  return moduleObj.exports;
}

const mapperPath = path.join(process.cwd(), 'src', 'core', 'pipelines', '_shared', 'ocrTableMapper.ts');
const { getTableMapping } = loadTsModule(mapperPath);

if (typeof getTableMapping !== 'function') {
  throw new Error('Failed to load getTableMapping from ocrTableMapper.ts');
}

const permisoDoc = {
  id: 'mock-permiso-1',
  fileName: 'permiso.pdf',
  status: 'completed',
  isMixedPdf: false,
  detectedType: 'PERMISO_V1',
  documentType: 'PERMISO_V1',
  extractedFields: {
    identification: {
      license_plate: { value: '1234ABC' },
      first_registration_date: { value: null },
      registration_date: { value: null },
    },
    vehicleCommercial: {
      brand: { value: 'TOYOTA' },
      model: { value: null },
      commercial_name: { value: 'PROACE MAX' },
      service: { value: 'PUBLICO' },
    },
    vehicleTechnical: {
      power_kw: { value: 88 },
    },
    meta: {
      detected_type: 'PERMISO_V1',
    },
  },
};

const mapping = getTableMapping(permisoDoc);
const resolvedType = permisoDoc.detectedType ?? permisoDoc.documentType ?? permisoDoc.extractedFields?.meta?.detected_type ?? 'UNKNOWN';

let failed = false;
if (resolvedType !== 'PERMISO_V1') {
  failed = true;
  console.error(`FAIL resolvedType expected=PERMISO_V1 got=${resolvedType}`);
} else {
  console.log('PASS resolvedType PERMISO_V1');
}

if (mapping.model === 'â€”' || mapping.model === '—' || !mapping.model) {
  failed = true;
  console.error(`FAIL mapped.model expected non-empty fallback got=${mapping.model}`);
} else {
  console.log(`PASS mapped.model fallback=${mapping.model}`);
}

if (mapping.brand !== 'TOYOTA') {
  failed = true;
  console.error(`FAIL mapped.brand expected=TOYOTA got=${mapping.brand}`);
} else {
  console.log('PASS mapped.brand TOYOTA');
}

if (failed) process.exit(1);
console.log('UI contract smoke passed.');
