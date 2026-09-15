"""
Benchmark de velocidad y precisión del modelo OCR Donut.

Mide 4 configuraciones:
  1. PyTorch original (2560x1920)
  2. ONNX sin cuantizar (2560x1920)
  3. ONNX INT8 (2560x1920)
  4. ONNX INT8 (1920x1440)

Uso:
    python benchmark.py --model ../models/donut_orion --test-dir ../../ENTRENAMIENTO_OCR/dataset
    python benchmark.py --model ../models/donut_orion --onnx-dir ../models/donut_orion_onnx --test-dir ../../ENTRENAMIENTO_OCR/dataset
"""

import argparse
import json
import re
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel

TASK_TOKEN = "<s_orion>"
MAX_LENGTH = 768


# ---------------------------------------------------------------------------
# Token -> JSON parser (idéntico al servidor)
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


def token2json(token_str: str, processor) -> dict:
    for tok in [processor.tokenizer.eos_token, processor.tokenizer.pad_token]:
        token_str = token_str.replace(tok, "")
    if hasattr(processor.tokenizer, "bos_token") and processor.tokenizer.bos_token:
        token_str = token_str.replace(processor.tokenizer.bos_token, "")
    return _parse_tags(token_str.strip())


# ---------------------------------------------------------------------------
# Inferencia PyTorch
# ---------------------------------------------------------------------------

def infer_pytorch(image: Image.Image, model, processor, device) -> tuple[dict, float]:
    pixel_values = processor(image, return_tensors="pt").pixel_values.to(device)
    decoder_input_ids = processor.tokenizer(
        TASK_TOKEN, add_special_tokens=False, return_tensors="pt"
    ).input_ids.to(device)

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
    return token2json(raw, processor), elapsed


# ---------------------------------------------------------------------------
# Inferencia ONNX encoder + PyTorch decoder (híbrida)
# ---------------------------------------------------------------------------

def infer_onnx_hybrid(image: Image.Image, onnx_session, model, processor, device) -> tuple[dict, float]:
    pixel_values_np = processor(image, return_tensors="np").pixel_values

    t0 = time.time()
    # Encoder ONNX
    encoder_output = onnx_session.run(None, {"pixel_values": pixel_values_np})[0]
    encoder_hidden = torch.tensor(encoder_output, device=device)

    # Decoder PyTorch
    decoder_input_ids = processor.tokenizer(
        TASK_TOKEN, add_special_tokens=False, return_tensors="pt"
    ).input_ids.to(device)

    # Crear BaseModelOutput para el decoder
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
    elapsed = time.time() - t0

    raw = processor.tokenizer.decode(outputs[0], skip_special_tokens=False)
    return token2json(raw, processor), elapsed


# ---------------------------------------------------------------------------
# Cargar test set
# ---------------------------------------------------------------------------

def load_test_set(test_dir: Path, max_per_type: int = 30) -> list[dict]:
    """Carga imagenes de test con sus labels.

    Soporta dos estructuras:
      - {tipo}/test/metadata.jsonl  (ENTRENAMIENTO_OCR)
      - {tipo}/metadata.jsonl       (flat)
    """
    samples = []
    for subdir in sorted(test_dir.iterdir()):
        if not subdir.is_dir():
            continue

        # Buscar metadata.jsonl en test/ o en la raiz del subdir
        test_subdir = subdir / "test"
        if test_subdir.exists() and (test_subdir / "metadata.jsonl").exists():
            meta_file = test_subdir / "metadata.jsonl"
            img_base = test_subdir
        elif (subdir / "metadata.jsonl").exists():
            meta_file = subdir / "metadata.jsonl"
            img_base = subdir
        else:
            continue

        count = 0
        with open(meta_file, encoding="utf-8") as f:
            for line in f:
                if count >= max_per_type:
                    break
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                img_path = img_base / entry["file_name"]
                if img_path.exists():
                    gt_raw = entry.get("ground_truth", "{}")
                    # ground_truth puede ser string JSON o dict
                    if isinstance(gt_raw, str):
                        gt = json.loads(gt_raw)
                    else:
                        gt = gt_raw
                    samples.append({
                        "path": str(img_path),
                        "labels": gt,
                        "type": subdir.name,
                    })
                    count += 1

    return samples


def compare_fields(predicted: dict, expected: dict) -> tuple[int, int, list[str]]:
    """Compara campos predichos vs esperados. Devuelve (correctos, total, errores)."""
    # Si expected tiene estructura anidada tipo {"gt_parse": {...}}, extraer
    if "gt_parse" in expected:
        expected = expected["gt_parse"]

    total = 0
    correct = 0
    errors = []

    for key, exp_val in expected.items():
        if isinstance(exp_val, dict):
            pred_sub = predicted.get(key, {})
            if isinstance(pred_sub, dict):
                for subkey, subval in exp_val.items():
                    total += 1
                    pred_v = pred_sub.get(subkey, "")
                    if str(pred_v).strip().lower() == str(subval).strip().lower():
                        correct += 1
                    else:
                        errors.append(f"{key}.{subkey}: '{pred_v}' != '{subval}'")
            else:
                total += len(exp_val)
                errors.append(f"{key}: expected dict, got '{pred_sub}'")
        else:
            total += 1
            pred_v = predicted.get(key, "")
            if str(pred_v).strip().lower() == str(exp_val).strip().lower():
                correct += 1
            else:
                errors.append(f"{key}: '{pred_v}' != '{exp_val}'")

    return correct, total, errors


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Benchmark OCR Donut")
    parser.add_argument("--model", type=str, default="../models/donut_orion")
    parser.add_argument("--onnx-dir", type=str, default="../models/donut_orion_onnx")
    parser.add_argument("--test-dir", type=str, default="../../ENTRENAMIENTO_OCR/dataset")
    parser.add_argument("--max-per-type", type=int, default=10)
    args = parser.parse_args()

    model_path = Path(args.model).resolve()
    onnx_dir = Path(args.onnx_dir).resolve()
    test_dir = Path(args.test_dir).resolve()
    device = torch.device("cpu")

    # Cargar modelo PyTorch
    print("Cargando modelo PyTorch...")
    processor = DonutProcessor.from_pretrained(str(model_path))
    model = VisionEncoderDecoderModel.from_pretrained(str(model_path))
    model.to(device)
    model.eval()

    # Cargar test set
    print(f"\nCargando test set desde: {test_dir}")
    samples = load_test_set(test_dir, args.max_per_type)
    print(f"  {len(samples)} imágenes de test")

    if not samples:
        print("ERROR: No se encontraron imágenes de test.")
        return

    # Configuraciones a medir
    configs = []

    # 1. PyTorch original
    configs.append(("PyTorch (2560x1920)", "pytorch", None))

    # 2-4. ONNX si están disponibles
    onnx_files = {
        "ONNX fp32 (2560x1920)": onnx_dir / "encoder_2560x1920.onnx",
        "ONNX INT8 (2560x1920)": onnx_dir / "encoder_2560x1920_int8.onnx",
        "ONNX INT8 (1920x1440)": onnx_dir / "encoder_1920x1440_int8.onnx",
    }

    onnx_sessions = {}
    for name, path in onnx_files.items():
        if path.exists():
            try:
                import onnxruntime as ort
                sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
                onnx_sessions[name] = sess
                configs.append((name, "onnx", sess))
                print(f"  Cargado: {path.name}")
            except Exception as e:
                print(f"  Error cargando {path.name}: {e}")
        else:
            print(f"  No encontrado: {path.name} (se omite)")

    # Ejecutar benchmarks
    print(f"\n{'='*70}")
    print("BENCHMARK DE VELOCIDAD")
    print(f"{'='*70}")

    speed_results = {}

    for config_name, mode, session in configs:
        print(f"\n--- {config_name} ---")
        times = []
        for i, sample in enumerate(samples[:10]):  # Máx 10 para velocidad
            image = Image.open(sample["path"]).convert("RGB")
            try:
                if mode == "pytorch":
                    _, elapsed = infer_pytorch(image, model, processor, device)
                else:
                    _, elapsed = infer_onnx_hybrid(image, session, model, processor, device)
                times.append(elapsed)
                print(f"  [{i+1}/{min(10, len(samples))}] {elapsed:.2f}s — {Path(sample['path']).name}")
            except Exception as e:
                print(f"  [{i+1}] ERROR: {e}")

        if times:
            avg = np.mean(times)
            std = np.std(times)
            speed_results[config_name] = {"avg": avg, "std": std, "n": len(times)}
            print(f"  MEDIA: {avg:.2f}s ± {std:.2f}s ({len(times)} docs)")

    # Benchmark de precisión (solo PyTorch y mejor ONNX)
    print(f"\n{'='*70}")
    print("BENCHMARK DE PRECISIÓN (PyTorch baseline)")
    print(f"{'='*70}")

    precision_by_type = {}
    all_errors = []

    for sample in samples:
        image = Image.open(sample["path"]).convert("RGB")
        try:
            predicted, _ = infer_pytorch(image, model, processor, device)
            correct, total, errors = compare_fields(predicted, sample["labels"])

            doc_type = sample["type"]
            if doc_type not in precision_by_type:
                precision_by_type[doc_type] = {"correct": 0, "total": 0, "docs": 0}
            precision_by_type[doc_type]["correct"] += correct
            precision_by_type[doc_type]["total"] += total
            precision_by_type[doc_type]["docs"] += 1

            if errors:
                all_errors.extend([f"[{doc_type}] {e}" for e in errors[:3]])

        except Exception as e:
            print(f"  ERROR en {sample['path']}: {e}")

    # Resumen
    print(f"\n{'='*70}")
    print("RESUMEN")
    print(f"{'='*70}")

    print("\nVELOCIDAD (seg/doc):")
    print(f"  {'Configuración':<30} {'Media':>8} {'± Std':>8} {'Docs':>5}")
    print(f"  {'-'*55}")
    for name, data in speed_results.items():
        print(f"  {name:<30} {data['avg']:>7.2f}s {data['std']:>7.2f}s {data['n']:>5}")

    print(f"\nPRECISION por tipo de documento:")
    print(f"  {'Tipo':<30} {'Correct':>8} {'Total':>8} {'%':>8} {'Docs':>5}")
    print(f"  {'-'*65}")
    total_c, total_t = 0, 0
    for doc_type, data in sorted(precision_by_type.items()):
        pct = (data["correct"]/data["total"]*100) if data["total"] > 0 else 0
        total_c += data["correct"]
        total_t += data["total"]
        print(f"  {doc_type:<30} {data['correct']:>8} {data['total']:>8} {pct:>7.1f}% {data['docs']:>5}")
    if total_t > 0:
        print(f"  {'TOTAL':<30} {total_c:>8} {total_t:>8} {total_c/total_t*100:>7.1f}%")

    if all_errors:
        print(f"\nCampos problematicos (primeros 20):")
        for e in all_errors[:20]:
            print(f"  {e}")


if __name__ == "__main__":
    main()
