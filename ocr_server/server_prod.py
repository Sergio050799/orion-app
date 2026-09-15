"""
Servidor OCR Donut — Producción (solo ONNX, sin PyTorch)

Este servidor carga el encoder ONNX INT8 + decoder ONNX para inferencia
completamente sin PyTorch. Ideal para VPS con CPU limitada.

NOTA: Si el decoder ONNX no está disponible, este servidor NO funciona.
En ese caso, usar server.py (modo híbrido con PyTorch).

Para la versión actual (encoder ONNX + decoder PyTorch), usar server.py
con --onnx flag. Este archivo es el objetivo final cuando el decoder
también se exporte a ONNX.

Mientras tanto, el Dockerfile usa server.py con torch incluido.
"""

import argparse
import io
import re
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import DonutProcessor

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
processor = None
encoder_session = None

TASK_TOKEN = "<s_orion>"
MAX_LENGTH = 768

app = FastAPI(title="Orion OCR Server (Prod)", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Post-procesado
# ---------------------------------------------------------------------------

VALID_CATEGORIES = {
    "AM", "A1", "A2", "A", "B", "BE", "B1",
    "C1", "C1E", "C", "CE", "D1", "D1E", "D", "DE",
}


def clean_campo_9(campos: dict) -> dict:
    val = campos.get("campo_9_categorias", "")
    if not val:
        return campos
    val = re.sub(r"<[^>]+>", " ", val)
    val = re.sub(r"[^\w\s]", " ", val)
    tokens = val.upper().split()
    cleaned = [t for t in tokens if t in VALID_CATEGORIES]
    campos["campo_9_categorias"] = " ".join(cleaned) if cleaned else re.sub(r"<[^>]+>", "", campos.get("campo_9_categorias", "")).strip()
    return campos


def postprocess_campos(campos: dict) -> dict:
    tipo = str(campos.get("tipo_documento", "")).upper()
    if "CARNET" in tipo:
        campos = clean_campo_9(campos)
    return campos


# ---------------------------------------------------------------------------
# Preprocesado
# ---------------------------------------------------------------------------

def preprocess_image(image: Image.Image) -> Image.Image:
    gray = image.convert("L")
    arr = np.array(gray, dtype=np.float32)
    threshold = np.mean(arr)
    binary = ((arr > threshold) * 255).astype(np.uint8)
    return Image.fromarray(binary).convert("RGB")


# ---------------------------------------------------------------------------
# Token parser
# ---------------------------------------------------------------------------

def _parse_tags(s: str) -> dict:
    result = {}
    pattern = re.compile(r"<s_([^>]+)>(.*?)</s_\1>", re.DOTALL)
    for match in pattern.finditer(s):
        key = match.group(1)
        value = match.group(2).strip()
        inner = list(pattern.finditer(value))
        result[key] = _parse_tags(value) if inner else value
    return result


def token2json(token_str: str) -> dict:
    for tok in [processor.tokenizer.eos_token, processor.tokenizer.pad_token]:
        token_str = token_str.replace(tok, "")
    if hasattr(processor.tokenizer, "bos_token") and processor.tokenizer.bos_token:
        token_str = token_str.replace(processor.tokenizer.bos_token, "")
    return _parse_tags(token_str.strip())


# ---------------------------------------------------------------------------
# Inferencia (encoder ONNX + greedy decode manual)
# ---------------------------------------------------------------------------

def extract_fields(image: Image.Image) -> dict:
    """
    Inferencia completa con ONNX encoder.
    NOTA: El decoder autoregresivo todavía necesita PyTorch o un export ONNX del decoder.
    Por ahora este servidor es un placeholder — usar server.py para producción real.
    """
    # Para producción real sin PyTorch, necesitamos:
    # 1. Exportar el decoder a ONNX (complejo por ser autoregresivo)
    # 2. O usar onnxruntime-genai para generación autoregresiva
    #
    # Mientras tanto, este servidor sirve como template.
    # La versión funcional es server.py (modo híbrido).
    raise HTTPException(501, "Servidor ONNX puro aún no implementado. Usar server.py (modo híbrido).")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "encoder_loaded": encoder_session is not None,
        "engine": "onnx_pure",
        "version": "2.0.0",
    }


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    tipo_documento: str = Form(default="auto"),
    preprocess: str = Form(default="true"),
):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Tipo no soportado: {file.content_type}. Usa JPG/PNG.")

    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    if preprocess.lower() in ("true", "1", "yes"):
        image = preprocess_image(image)

    t0 = time.time()
    campos = extract_fields(image)
    elapsed = time.time() - t0

    campos = postprocess_campos(campos)

    return {
        "success": True,
        "campos": campos,
        "tipo_documento": campos.get("tipo_documento", "DESCONOCIDO"),
        "tiempo_ms": round(elapsed * 1000),
        "engine": "onnx_pure",
    }


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

def load_model(model_dir: str):
    global processor, encoder_session

    model_path = Path(model_dir).resolve()
    print(f"Cargando processor desde: {model_path}")
    processor = DonutProcessor.from_pretrained(str(model_path))

    # Buscar encoder ONNX
    encoder_candidates = [
        model_path / "encoder_2560x1920_int8.onnx",
        model_path / "encoder_1920x1440_int8.onnx",
        model_path / "encoder_2560x1920.onnx",
    ]
    for candidate in encoder_candidates:
        if candidate.exists():
            print(f"Cargando encoder ONNX: {candidate}")
            t0 = time.time()
            encoder_session = ort.InferenceSession(
                str(candidate),
                providers=["CPUExecutionProvider"],
            )
            print(f"Encoder cargado en {time.time()-t0:.1f}s")
            break
    else:
        print("WARN: No se encontró encoder ONNX")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orion OCR Server (Prod)")
    parser.add_argument("--model", type=str, default="./model", help="Ruta al modelo ONNX")
    parser.add_argument("--port", type=int, default=5050)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()

    load_model(args.model)
    uvicorn.run(app, host=args.host, port=args.port)
