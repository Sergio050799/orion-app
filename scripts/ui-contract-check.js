const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const cache = new Map();

function resolveModule(specifier, fromFile) {
  if (specifier.startsWith('@/')) {
    const base = path.join(process.cwd(), 'src', specifier.slice(2));
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    throw new Error(`Cannot resolve alias module: ${specifier}`);
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    throw new Error(`Cannot resolve relative module: ${specifier} from ${fromFile}`);
  }

  return null;
}

function loadTsModule(filePath) {
  const fullPath = path.resolve(filePath);
  if (cache.has(fullPath)) return cache.get(fullPath).exports;

  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: fullPath,
  });

  const moduleObj = { exports: {} };
  cache.set(fullPath, moduleObj);

  const localRequire = (specifier) => {
    const resolved = resolveModule(specifier, fullPath);
    if (resolved) {
      if (resolved.endsWith('.ts') || resolved.endsWith('.tsx')) return loadTsModule(resolved);
      return require(resolved);
    }
    return require(specifier);
  };

  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    require: localRequire,
    process,
    console,
    __dirname: path.dirname(fullPath),
    __filename: fullPath,
  };

  vm.runInNewContext(transpiled.outputText, sandbox, { filename: fullPath });
  return moduleObj.exports;
}

const mapperPath = path.join(process.cwd(), 'src', 'core', 'pipelines', '_shared', 'ocrTableMapper.ts');
const docTypePath = path.join(process.cwd(), 'src', 'core', 'pipelines', '_shared', 'docType.ts');

const { getTableMapping } = loadTsModule(mapperPath);
const { resolveDocType } = loadTsModule(docTypePath);

const permisoDoc = {
  id: 'mock-permiso-v1',
  source: 'ocr',
  fileName: 'permiso-v1.pdf',
  uploadDate: '10:00',
  createdAt: '2026-03-05T10:00:00.000Z',
  status: 'completed',
  progress: 100,
  approved: false,
  error: null,
  snapshotPath: null,
  detectedType: 'PERMISO_V1',
  documentType: 'PERMISO_V1',
  isMixedPdf: false,
  extractedFields: {
    meta: { detected_type: 'PERMISO_V1' },
    identification: {
      license_plate: { value: '1234ABC' },
      first_registration_date: { value: '2020-03-15' },
    },
    vehicleCommercial: {
      brand: { value: 'MERCEDES-BENZ' },
      model: { value: null },
      commercial_name: { value: 'VITO TOURER' },
      service: { value: 'PARTICULAR' },
    },
    vehicleTechnical: {
      power_kw: { value: 100 },
    },
    fields: {
      D3: 'VITO TOURER',
      D4: 'PARTICULAR',
    },
  },
};

const resolvedType = resolveDocType(permisoDoc);
const mapped = getTableMapping(permisoDoc);
const missingDoc = {
  ...permisoDoc,
  id: 'mock-permiso-missing',
  extractedFields: {
    ...permisoDoc.extractedFields,
    vehicleCommercial: {
      brand: { value: null },
      model: { value: null },
      commercial_name: { value: null },
      service: { value: null },
    },
    vehicleTechnical: {
      power_kw: { value: null },
    },
    D3: null,
    fields: {},
  },
};
const mappedMissing = getTableMapping(missingDoc);

let failed = false;

if (resolvedType !== 'PERMISO_V1') {
  console.error(`FAIL resolvedType expected=PERMISO_V1 got=${resolvedType}`);
  failed = true;
} else {
  console.log('PASS resolvedType PERMISO_V1');
}

if (!mapped.model || mapped.model === '-') {
  console.error(`FAIL mapped.model expected non-empty fallback got=${mapped.model}`);
  failed = true;
} else {
  console.log(`PASS mapped.model ${mapped.model}`);
}

if (mapped.model !== 'VITO TOURER') {
  console.error(`FAIL mapped.model expected=VITO TOURER got=${mapped.model}`);
  failed = true;
}

if (mappedMissing.model !== '-') {
  console.error(`FAIL mappedMissing.model expected=- got=${mappedMissing.model}`);
  failed = true;
}

const serialized = JSON.stringify({ mapped, mappedMissing });
if (serialized.includes('Â') || serialized.includes('â')) {
  console.error('FAIL mojibake found in mapper output');
  failed = true;
}

if (failed) process.exit(1);
console.log('UI contract check passed.');
