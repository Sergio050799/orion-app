const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

const classifierPath = path.join(process.cwd(), 'src', 'core', 'router', 'documentClassifier.ts');
const source = fs.readFileSync(classifierPath, 'utf8');
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
vm.runInNewContext(transpiled.outputText, sandbox, { filename: classifierPath });

const { classifyDocument } = moduleObj.exports;
if (typeof classifyDocument !== 'function') {
  throw new Error('Failed to load classifyDocument from documentClassifier.ts');
}

process.env.NEXT_PUBLIC_ENABLE_PERMISO_PIPELINE = 'true';

const cases = [
  {
    name: 'ficha',
    text: 'Tarjeta de Inspeccion Tecnica ITV Ficha Tecnica Ministerio de Industria Caracteristicas tecnicas',
    expected: 'FICHA_TECNICA',
  },
  {
    name: 'permiso_v1',
    text: 'Permiso de circulacion Comunidad Europea Reino de Espana Ministerio del Interior C.1.1 C.1.2 C.1.3 C.4 D.1 D.2 D.3 D.4 E F.1 G I J P.1 P.2 P.3 Q S.1 S.2',
    expected: 'PERMISO_V1',
  },
  {
    name: 'permiso_v2',
    text: 'Autorizacion Provisional de Circulacion Direccion General de Trafico Matricula Bastidor Titular Jefatura Valido hasta',
    expected: 'PERMISO_V2',
  },
];

let failed = false;
for (const c of cases) {
  const res = classifyDocument({ content: c.text });
  const ok = res.type === c.expected;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: expected=${c.expected}, got=${res.type}`);
  if (!ok) failed = true;
}

if (failed) {
  process.exit(1);
}

console.log('Classifier hotfix checks passed.');
