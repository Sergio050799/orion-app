"""
Servidor OCR Donut — Orion
Soporta dos modos:
  1. PyTorch completo (modelo .safetensors)
  2. Híbrido: encoder ONNX INT8 + decoder PyTorch (más rápido en CPU)

Uso:
    python server.py
    python server.py --port 5050 --model ../models/donut_orion
    python server.py --port 5050 --model ../models/donut_orion --onnx ../models/donut_orion_onnx/encoder_2560x1920_int8.onnx
"""

import argparse
import io
import re
import time
from pathlib import Path
from typing import Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# PyMuPDF opcional (para soporte PDF)
try:
    import fitz  # type: ignore[import]
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
processor = None
model = None           # VisionEncoderDecoderModel (PyTorch) — siempre cargado
onnx_session = None    # ONNX InferenceSession (opcional, para encoder)
device = None
use_onnx: bool = False

TASK_TOKEN = "<s_orion>"
MAX_LENGTH = 768

app = FastAPI(title="Orion OCR Server", version="2.1.0")

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
    """Limpia tokens basura del campo_9_categorias."""
    val = campos.get("campo_9_categorias", "")
    if not val:
        return campos
    val = re.sub(r"<[^>]+>", " ", val)
    val = re.sub(r"[^\w\s]", " ", val)
    tokens = val.upper().split()
    cleaned = [t for t in tokens if t in VALID_CATEGORIES]
    if cleaned:
        campos["campo_9_categorias"] = " ".join(cleaned)
    else:
        campos["campo_9_categorias"] = re.sub(r"<[^>]+>", "", campos.get("campo_9_categorias", "")).strip()
    return campos


def postprocess_campos(campos: dict) -> dict:
    tipo = str(campos.get("tipo_documento", "")).upper()
    if "CARNET" in tipo:
        campos = clean_campo_9(campos)
    return campos


# ---------------------------------------------------------------------------
# Preprocesado de imagen
# ---------------------------------------------------------------------------

def preprocess_image(image: Image.Image) -> Image.Image:
    """Binarización Otsu simplificada."""
    gray = image.convert("L")
    arr = np.array(gray, dtype=np.float32)
    threshold = np.mean(arr)
    binary = ((arr > threshold) * 255).astype(np.uint8)
    return Image.fromarray(binary).convert("RGB")


# ---------------------------------------------------------------------------
# PDF → imágenes
# ---------------------------------------------------------------------------

def pdf_to_images(contents: bytes, zoom: float = 2.0) -> list:
    """Convierte bytes de PDF a lista de PIL Images (una por página)."""
    if not HAS_FITZ:
        raise HTTPException(
            status_code=400,
            detail="PDF no soportado: instala pymupdf  (pip install pymupdf)",
        )
    doc = fitz.open(stream=contents, filetype="pdf")
    images = []
    mat = fitz.Matrix(zoom, zoom)  # zoom 2x → mejor resolución para OCR
    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)
    doc.close()
    return images


# ---------------------------------------------------------------------------
# Token -> JSON parser
# ---------------------------------------------------------------------------

def token2json(token_str: str) -> dict:
    for tok in [processor.tokenizer.eos_token, processor.tokenizer.pad_token]:
        token_str = token_str.replace(tok, "")
    if hasattr(processor.tokenizer, "bos_token") and processor.tokenizer.bos_token:
        token_str = token_str.replace(processor.tokenizer.bos_token, "")
    return _parse_tags(token_str.strip())


def _parse_tags(s: str) -> dict:
    result = {}
    pattern = re.compile(r"<s_([^>]+)>(.*?)</s_\1>", re.DOTALL)
    for match in pattern.finditer(s):
        key = match.group(1)
        value = match.group(2).strip()
        inner = list(pattern.finditer(value))
        result[key] = _parse_tags(value) if inner else value
    return result


# ---------------------------------------------------------------------------
# Inferencia
# ---------------------------------------------------------------------------

def extract_fields(image: Image.Image) -> dict:
    """Extrae campos de una imagen. Usa ONNX encoder si está disponible."""
    import torch

    decoder_input_ids = processor.tokenizer(
        TASK_TOKEN, add_special_tokens=False, return_tensors="pt"
    ).input_ids.to(device)

    if use_onnx and onnx_session is not None:
        # Modo híbrido: encoder ONNX + decoder PyTorch
        pixel_values_np = processor(image, return_tensors="np").pixel_values
        encoder_output = onnx_session.run(None, {"pixel_values": pixel_values_np})[0]
        encoder_hidden = torch.tensor(encoder_output, device=device)

        from transformers.modeling_outputs import BaseModelOutput
        encoder_outputs = BaseModelOutput(last_hidden_state=encoder_hidden)

        with torch.no_grad():
            outputs = model.generate(
                encoder_outputs=encoder_outputs,
                decoder_input_ids=decoder_input_ids,
                max_length=MAX_LENGTH,
                early_stopping=True,
                pad_token_id=processor.tokenizer.pad_token_id,
                eos_token_id=processor.tokenizer.eos_token_id,
                num_beams=3,
                do_sample=False,
            )
    else:
        # Modo PyTorch completo
        pixel_values = processor(image, return_tensors="pt").pixel_values.to(device)

        with torch.no_grad():
            outputs = model.generate(
                pixel_values,
                decoder_input_ids=decoder_input_ids,
                max_length=MAX_LENGTH,
                early_stopping=True,
                pad_token_id=processor.tokenizer.pad_token_id,
                eos_token_id=processor.tokenizer.eos_token_id,
                num_beams=3,
                do_sample=False,
            )

    raw = processor.tokenizer.decode(outputs[0], skip_special_tokens=False)
    return token2json(raw)


def process_image(image: Image.Image, do_preprocess: bool, tipo_documento: str) -> dict:
    """Procesa una imagen y devuelve el resultado OCR."""
    if do_preprocess:
        image = preprocess_image(image)
    t0 = time.time()
    campos = extract_fields(image)
    elapsed = time.time() - t0
    campos = postprocess_campos(campos)
    tipo_detectado = campos.get("tipo_documento", "DESCONOCIDO")
    if tipo_documento != "auto" and tipo_detectado != tipo_documento.upper():
        campos["_warning"] = f"Tipo solicitado '{tipo_documento}' difiere del detectado '{tipo_detectado}'"
    return {
        "success": True,
        "campos": campos,
        "tipo_documento": tipo_detectado,
        "tiempo_ms": round(elapsed * 1000),
        "preprocessed": do_preprocess,
        "engine": "onnx_hybrid" if use_onnx else "pytorch",
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "onnx": use_onnx,
        "pdf_support": HAS_FITZ,
        "version": "2.1.0",
    }


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    tipo_documento: str = Form(default="auto"),
    preprocess: str = Form(default="true"),
):
    """
    Extrae campos de un documento.

    - file: imagen (jpg, png, webp, tiff, bmp) o PDF
    - tipo_documento: "auto", "permiso_circulacion", "ficha_tecnica_moderna", "carnet_conducir"
    - preprocess: "true" o "false"

    Para PDF devuelve `{ success, pages[], total_pages, tiempo_ms, engine }`.
    Para imagen devuelve `{ success, campos, tipo_documento, tiempo_ms, ... }`.
    """
    allowed_images = {"image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp"}
    is_pdf = file.content_type == "application/pdf"

    if not is_pdf and file.content_type not in allowed_images:
        raise HTTPException(400, f"Tipo no soportado: {file.content_type}. Usa JPG/PNG/PDF.")

    contents = await file.read()
    do_preprocess = preprocess.lower() in ("true", "1", "yes")

    if is_pdf:
        t_total = time.time()
        images = pdf_to_images(contents)
        pages = []
        for img in images:
            result = process_image(img, do_preprocess, tipo_documento)
            pages.append(result)
        return {
            "success": True,
            "pages": pages,
            "total_pages": len(pages),
            "tiempo_ms": round((time.time() - t_total) * 1000),
            "preprocessed": do_preprocess,
            "engine": "onnx_hybrid" if use_onnx else "pytorch",
        }

    image = Image.open(io.BytesIO(contents)).convert("RGB")
    return process_image(image, do_preprocess, tipo_documento)


@app.post("/extract/batch")
async def extract_batch(
    files: list[UploadFile] = File(...),
    tipo_documento: str = Form(default="auto"),
    preprocess: str = Form(default="true"),
):
    """
    Procesa múltiples imágenes en un solo request.
    Devuelve `{ success, results[], total, tiempo_ms }`.
    """
    allowed = {"image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp", "application/pdf"}
    do_preprocess = preprocess.lower() in ("true", "1", "yes")
    t_total = time.time()
    results = []

    for upload in files:
        if upload.content_type not in allowed:
            results.append({"success": False, "error": f"Tipo no soportado: {upload.content_type}", "filename": upload.filename})
            continue

        contents = await upload.read()

        if upload.content_type == "application/pdf":
            try:
                images = pdf_to_images(contents)
                for img in images:
                    results.append(process_image(img, do_preprocess, tipo_documento))
            except HTTPException as e:
                results.append({"success": False, "error": e.detail, "filename": upload.filename})
        else:
            image = Image.open(io.BytesIO(contents)).convert("RGB")
            results.append(process_image(image, do_preprocess, tipo_documento))

    return {
        "success": True,
        "results": results,
        "total": len(results),
        "tiempo_ms": round((time.time() - t_total) * 1000),
    }


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

def load_model(model_path: str, onnx_path: Optional[str] = None):
    global model, processor, device, use_onnx, onnx_session
    import torch

    device = torch.device("cpu")

    print(f"Cargando processor desde: {model_path}")
    from transformers import DonutProcessor, VisionEncoderDecoderModel
    processor = DonutProcessor.from_pretrained(model_path)

    print(f"Cargando modelo PyTorch desde: {model_path}")
    t0 = time.time()
    model = VisionEncoderDecoderModel.from_pretrained(model_path)
    model.to(device)
    model.eval()
    print(f"Modelo PyTorch cargado en {time.time()-t0:.1f}s")

    # Intentar cargar encoder ONNX
    if onnx_path:
        onnx_file = Path(onnx_path)
    else:
        onnx_dir = Path(model_path).parent / "donut_orion_onnx"
        candidates = [
            onnx_dir / "encoder_2560x1920_int8.onnx",
            onnx_dir / "encoder_1920x1440_int8.onnx",
            onnx_dir / "encoder_2560x1920.onnx",
        ]
        onnx_file = None
        for c in candidates:
            if c.exists():
                onnx_file = c
                break

    if onnx_file and onnx_file.exists():
        try:
            import onnxruntime as ort
            print(f"Cargando encoder ONNX: {onnx_file}")
            t0 = time.time()
            onnx_session = ort.InferenceSession(
                str(onnx_file),
                providers=["CPUExecutionProvider"],
            )
            use_onnx = True
            print(f"Encoder ONNX cargado en {time.time()-t0:.1f}s — modo híbrido activo")
        except ImportError:
            print("onnxruntime no instalado — usando PyTorch completo")
        except Exception as e:
            print(f"Error cargando ONNX: {e} — usando PyTorch completo")
    else:
        print("No se encontró encoder ONNX — usando PyTorch completo")

    print(f"Soporte PDF (PyMuPDF): {'SI' if HAS_FITZ else 'NO — instala pymupdf'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Orion OCR Server")
    parser.add_argument("--model", type=str, default="../models/donut_orion", help="Ruta al modelo PyTorch")
    parser.add_argument("--onnx", type=str, default=None, help="Ruta al encoder ONNX (opcional)")
    parser.add_argument("--port", type=int, default=5050, help="Puerto")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host")
    args = parser.parse_args()

    model_path = str(Path(args.model).resolve())
    load_model(model_path, args.onnx)

    uvicorn.run(app, host=args.host, port=args.port)
