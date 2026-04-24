import os
import re
import json
import csv
from datetime import datetime
from pathlib import Path

ROOT = Path(r"C:\Users\garci\Desktop\Proyecto_Cosmos")
OUT = Path(r"C:\Users\garci\Desktop\Proyecto_Cosmos\03_Cosmos_Constelaciones\01_ORION\auditoria_proyecto_cosmos.txt")

TEXT_EXT = {
    '.txt', '.md', '.rst', '.log', '.ini', '.cfg', '.conf', '.toml', '.yaml', '.yml',
    '.json', '.jsonl', '.xml', '.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx',
    '.py', '.ipynb', '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.rs',
    '.php', '.rb', '.sh', '.ps1', '.bat', '.cmd', '.sql', '.csv', '.tsv'
}

BINARY_HINT_EXT = {
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.pdf', '.zip', '.rar',
    '.7z', '.tar', '.gz', '.xz', '.bz2', '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
    '.mp3', '.wav', '.ogg', '.flac', '.mp4', '.mov', '.avi', '.mkv', '.parquet', '.feather', '.db', '.duckdb'
}

MAX_BYTES = 65536
MAX_LINES_SNIPPET = 3


def safe_stat(path: Path):
    try:
        st = path.stat()
        return st.st_size, datetime.fromtimestamp(st.st_mtime).isoformat(sep=' ', timespec='seconds')
    except Exception:
        return -1, 'N/A'


def looks_binary(data: bytes) -> bool:
    if not data:
        return False
    if b'\x00' in data:
        return True
    text_chars = sum(32 <= b <= 126 or b in (9, 10, 13) for b in data)
    return (text_chars / max(len(data), 1)) < 0.75


def decode_text(data: bytes):
    for enc in ('utf-8', 'utf-8-sig', 'cp1252', 'latin-1'):
        try:
            return data.decode(enc), enc
        except Exception:
            continue
    return None, None


def summarize_json(text: str):
    try:
        obj = json.loads(text)
    except Exception:
        return None
    if isinstance(obj, dict):
        keys = list(obj.keys())[:8]
        return f"JSON objeto con {len(obj)} claves. Claves iniciales: {', '.join(map(str, keys))}" if keys else "JSON objeto vacio"
    if isinstance(obj, list):
        return f"JSON lista con {len(obj)} elementos"
    return f"JSON escalar tipo {type(obj).__name__}"


def summarize_csv(path: Path):
    try:
        with path.open('r', encoding='utf-8', errors='replace', newline='') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            row_count = 0
            for _ in reader:
                row_count += 1
                if row_count >= 10000:
                    break
        if header:
            return f"CSV tabular. Columnas: {len(header)}. Encabezado: {', '.join(header[:8])}. Filas inspeccionadas: {row_count}"
        return f"CSV sin encabezado claro. Filas inspeccionadas: {row_count}"
    except Exception:
        return None


def summarize_code(text: str, ext: str):
    lines = text.splitlines()
    non_empty = [ln.strip() for ln in lines if ln.strip() and not ln.strip().startswith(('#', '//', '/*', '*'))]
    snippet = '; '.join(non_empty[:MAX_LINES_SNIPPET])[:240]

    if ext in {'.py'}:
        funcs = len(re.findall(r'^\s*def\s+\w+\(', text, flags=re.M))
        classes = len(re.findall(r'^\s*class\s+\w+', text, flags=re.M))
        imports = len(re.findall(r'^\s*(import|from)\s+', text, flags=re.M))
        return f"Script Python con {funcs} funciones, {classes} clases y {imports} imports. Fragmento: {snippet or 'sin contenido significativo'}"
    if ext in {'.js', '.jsx', '.ts', '.tsx'}:
        funcs = len(re.findall(r'function\s+\w+\s*\(|=>', text))
        imports = len(re.findall(r'^\s*import\s+', text, flags=re.M))
        return f"Codigo JavaScript/TypeScript con {funcs} funciones aproximadas y {imports} imports. Fragmento: {snippet or 'sin contenido significativo'}"
    if ext in {'.sql'}:
        stmts = len(re.findall(r'\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b', text, flags=re.I))
        return f"Script SQL con {stmts} sentencias detectadas. Fragmento: {snippet or 'sin contenido significativo'}"
    return f"Archivo de codigo/configuracion. Fragmento: {snippet or 'sin contenido significativo'}"


def summarize_text(path: Path, data: bytes, ext: str):
    text, enc = decode_text(data)
    if text is None:
        return "Texto no decodificable con codificaciones comunes"

    if ext == '.json':
        s = summarize_json(text)
        if s:
            return s + f". Codificacion: {enc}"

    if ext in {'.csv', '.tsv'}:
        s = summarize_csv(path)
        if s:
            return s + f". Codificacion: {enc}"

    if ext in {'.py', '.js', '.jsx', '.ts', '.tsx', '.sql', '.ps1', '.sh', '.bat', '.cmd', '.java', '.go', '.rs', '.php', '.rb', '.c', '.cpp', '.h', '.hpp', '.cs'}:
        return summarize_code(text, ext) + f". Codificacion: {enc}"

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    preview = ' | '.join(lines[:MAX_LINES_SNIPPET])[:260]
    if not preview:
        preview = 'sin texto visible en el fragmento inspeccionado'
    return f"Documento de texto. Fragmento: {preview}. Codificacion: {enc}"


def file_summary(path: Path):
    rel = path.relative_to(ROOT)
    size, mtime = safe_stat(path)
    ext = path.suffix.lower()

    try:
        with path.open('rb') as f:
            data = f.read(MAX_BYTES)
    except Exception as e:
        return rel, size, mtime, ext, f"No se pudo leer el archivo: {type(e).__name__}"

    if ext in BINARY_HINT_EXT and looks_binary(data):
        return rel, size, mtime, ext, "Archivo binario/no textual (resumen por metadatos y extension)"

    if ext in TEXT_EXT or not looks_binary(data):
        summary = summarize_text(path, data, ext)
        return rel, size, mtime, ext, summary

    return rel, size, mtime, ext, "Archivo binario o formato desconocido"


def write_tree(outf):
    outf.write("=== ESTRUCTURA COMPLETA DE CARPETAS Y ARCHIVOS ===\n")
    outf.write(f"Raiz: {ROOT}\n\n")

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames.sort()
        filenames.sort()
        dpath = Path(dirpath)
        rel = dpath.relative_to(ROOT)
        depth = 0 if rel == Path('.') else len(rel.parts)
        indent = '  ' * depth
        name = ROOT.name if rel == Path('.') else rel.name
        outf.write(f"{indent}[D] {name}\n")
        for fn in filenames:
            outf.write(f"{indent}  [F] {fn}\n")


def write_summaries(outf):
    outf.write("\n=== RESUMEN POR ARCHIVO (LECTURA INDIVIDUAL) ===\n\n")

    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames.sort()
        filenames.sort()
        for fn in filenames:
            path = Path(dirpath) / fn
            rel, size, mtime, ext, summary = file_summary(path)
            outf.write(f"Archivo: {rel}\n")
            outf.write(f"Tamano: {size} bytes\n")
            outf.write(f"Modificado: {mtime}\n")
            outf.write(f"Extension: {ext or 'sin extension'}\n")
            outf.write(f"Resumen: {summary}\n")
            outf.write("-" * 80 + "\n")


def main():
    if not ROOT.exists():
        raise SystemExit(f"No existe la ruta: {ROOT}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8', newline='\n') as outf:
        outf.write("AUDITORIA DE ESTRUCTURA Y CONTENIDO DEL PROYECTO\n")
        outf.write(f"Generado: {datetime.now().isoformat(sep=' ', timespec='seconds')}\n")
        outf.write(f"Total archivos detectados: {sum(len(files) for _, _, files in os.walk(ROOT))}\n\n")
        write_tree(outf)
        write_summaries(outf)

    print(str(OUT))


if __name__ == '__main__':
    main()
