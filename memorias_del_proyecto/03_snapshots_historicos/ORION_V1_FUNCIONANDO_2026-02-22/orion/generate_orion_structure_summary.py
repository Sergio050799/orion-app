import os
from pathlib import Path
from collections import Counter
from datetime import datetime

ROOT = Path(r"C:\Users\garci\Desktop\Proyecto_Cosmos\03_Cosmos_Constelaciones\01_ORION")
OUT_LOCAL = ROOT / "estructura_orion_resumen.txt"
OUT_DESKTOP = Path(r"C:\Users\garci\Desktop\estructura_orion_resumen.txt")

# Carpetas muy voluminosas/no funcionales para auditoria funcional breve
COLLAPSE_DIRS = {"node_modules", ".next", ".git", "__pycache__"}
MAX_EXT_SHOW = 6

DESC_BY_NAME = {
    "src": "Codigo fuente principal de la aplicacion.",
    "public": "Recursos estaticos servidos directamente por la app.",
    "docs": "Documentacion funcional y tecnica del proyecto.",
    "scripts": "Automatizaciones y tareas de soporte/operacion.",
    "data": "Datos internos del proyecto para procesamiento/consulta.",
    "datasets": "Conjuntos de datos de trabajo o entrenamiento.",
    "references_orion": "Material de referencia para analisis y decisiones.",
    "memorias_del_proyecto": "Bitacoras y memoria historica del proyecto.",
    "node_modules": "Dependencias de Node.js instaladas por npm.",
    ".next": "Salida de compilacion/cache de Next.js.",
}


def human_desc(path: Path, files: list[str], dirs: list[str]) -> str:
    name = path.name
    if name in DESC_BY_NAME:
        return DESC_BY_NAME[name]

    if not files and not dirs:
        return "Carpeta vacia o sin contenido relevante detectado."

    exts = Counter(Path(f).suffix.lower() or "[sin_extension]" for f in files)
    top_exts = ", ".join(f"{e}:{c}" for e, c in exts.most_common(MAX_EXT_SHOW))

    if top_exts:
        return f"Contiene {len(dirs)} subcarpetas y {len(files)} archivos; tipos principales: {top_exts}."
    return f"Contiene {len(dirs)} subcarpetas y {len(files)} archivos."


def write_tree_and_descriptions(outf):
    outf.write("=== ESTRUCTURA RESUMIDA DE ORION ===\n")
    outf.write(f"Raiz: {ROOT}\n")
    outf.write("Nota: 'node_modules' y '.next' se muestran colapsadas por volumen.\n\n")

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames.sort()
        filenames.sort()
        cur = Path(dirpath)
        rel = cur.relative_to(ROOT)
        depth = 0 if rel == Path('.') else len(rel.parts)
        indent = "  " * depth

        # Si estamos dentro de una carpeta colapsada, no seguir bajando
        if any(part in COLLAPSE_DIRS for part in rel.parts):
            if rel.name in COLLAPSE_DIRS:
                desc = DESC_BY_NAME.get(rel.name, "Carpeta colapsada por volumen.")
                outf.write(f"{indent}- {rel.name}/ -> {desc} (contenido interno omitido)\n")
            dirnames[:] = []
            continue

        name = ROOT.name if rel == Path('.') else rel.name
        desc = human_desc(cur, filenames, dirnames)
        outf.write(f"{indent}- {name}/ -> {desc}\n")


def main():
    if not ROOT.exists():
        raise SystemExit(f"No existe la ruta: {ROOT}")

    with OUT_LOCAL.open("w", encoding="utf-8", newline="\n") as outf:
        outf.write("AUDITORIA BREVE DE ESTRUCTURA - ORION\n")
        outf.write(f"Generado: {datetime.now().isoformat(sep=' ', timespec='seconds')}\n\n")
        write_tree_and_descriptions(outf)

    print(str(OUT_LOCAL))


if __name__ == "__main__":
    main()
