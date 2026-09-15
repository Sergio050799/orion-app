"""
Test rapido del modelo Donut — verifica que carga y extrae campos.

Uso:
    python test_modelo.py
    python test_modelo.py --image /ruta/a/imagen.jpg
"""

import argparse
import json
import sys
import time
from pathlib import Path

import torch
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel
import re

MODEL_PATH = Path(__file__).parent.parent / "models" / "donut_orion"
TASK_TOKEN = "<s_orion>"
MAX_LENGTH = 768


def _parse_tags(s: str) -> dict:
    result = {}
    pattern = re.compile(r"<s_([^>]+)>(.*?)</s_\1>", re.DOTALL)
    for match in pattern.finditer(s):
        key = match.group(1)
        value = match.group(2).strip()
        inner = list(pattern.finditer(value))
        result[key] = _parse_tags(value) if inner else value
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=str, default=None)
    parser.add_argument("--model", type=str, default=str(MODEL_PATH))
    args = parser.parse_args()

    print(f"Modelo: {args.model}")
    print("Cargando...")
    t0 = time.time()

    processor = DonutProcessor.from_pretrained(args.model)
    model = VisionEncoderDecoderModel.from_pretrained(args.model)
    model.eval()

    print(f"Modelo cargado en {time.time() - t0:.1f}s")
    print(f"Vocab size: {len(processor.tokenizer)}")
    print(f"Decoder max positions: {model.config.decoder.max_position_embeddings}")

    # Verificar tokens especiales
    task_id = processor.tokenizer.convert_tokens_to_ids(TASK_TOKEN)
    print(f"Task token '{TASK_TOKEN}' -> id {task_id}")
    if task_id == processor.tokenizer.unk_token_id:
        print("ERROR: task token no reconocido. El modelo puede no estar bien entrenado.")
        sys.exit(1)

    print("OK: Modelo cargado correctamente.")

    if args.image:
        print(f"\nProcesando: {args.image}")
        image = Image.open(args.image).convert("RGB")
        pixel_values = processor(image, return_tensors="pt").pixel_values

        decoder_input_ids = processor.tokenizer(
            TASK_TOKEN, add_special_tokens=False, return_tensors="pt"
        ).input_ids

        t0 = time.time()
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
        elapsed = time.time() - t0

        raw = processor.tokenizer.decode(outputs[0], skip_special_tokens=False)
        # Limpiar tokens de control
        for tok in [processor.tokenizer.eos_token, processor.tokenizer.pad_token]:
            raw = raw.replace(tok, "")
        if hasattr(processor.tokenizer, "bos_token") and processor.tokenizer.bos_token:
            raw = raw.replace(processor.tokenizer.bos_token, "")

        parsed = _parse_tags(raw.strip())

        print(f"Tiempo: {elapsed:.1f}s")
        print(f"Tipo: {parsed.get('tipo_documento', '?')}")
        print(f"Campos: {len(parsed)}")
        print(json.dumps(parsed, indent=2, ensure_ascii=False))
    else:
        print("\nUsa --image para probar con un documento real.")


if __name__ == "__main__":
    main()
