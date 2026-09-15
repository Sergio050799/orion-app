"""
Convierte el modelo Donut PyTorch a ONNX + cuantización INT8.

Exporta SOLO el encoder (Swin Transformer). El decoder autoregresivo
se mantiene en PyTorch dentro del servidor.

Uso:
    python convert_onnx.py
    python convert_onnx.py --model ../models/donut_orion --output ../models/donut_orion_onnx

Resoluciones a exportar:
    - 2560x1920 (baseline — actual del entrenamiento)
    - 1920x1440 (25% reducción — más rápido, probar si pierde precisión)
"""

import argparse
import shutil
import time
from pathlib import Path

import torch
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel

TASK_TOKEN = "<s_orion>"

# Resoluciones a exportar (height x width — Donut usa HxW)
RESOLUTIONS = {
    "2560x1920": (2560, 1920),
    "1920x1440": (1920, 1440),
}


def export_encoder(model, processor, output_dir: Path, res_name: str, height: int, width: int):
    """Exporta el encoder a ONNX para una resolución específica."""
    print(f"\n{'='*60}")
    print(f"Exportando encoder — {res_name} (H={height}, W={width})")
    print(f"{'='*60}")

    dummy_image = Image.new("RGB", (width, height), color=(255, 255, 255))
    pixel_values = processor(dummy_image, return_tensors="pt").pixel_values
    print(f"  Input shape: {pixel_values.shape}")

    encoder = model.encoder
    onnx_path = output_dir / f"encoder_{res_name}.onnx"

    t0 = time.time()
    torch.onnx.export(
        encoder,
        (pixel_values,),
        str(onnx_path),
        input_names=["pixel_values"],
        output_names=["last_hidden_state"],
        dynamic_axes={
            "pixel_values": {0: "batch"},
            "last_hidden_state": {0: "batch"},
        },
        opset_version=14,
        dynamo=False,  # Usar exportador legacy (compatible con Windows cp1252)
    )
    elapsed = time.time() - t0

    size_mb = onnx_path.stat().st_size / 1e6
    print(f"  -> {onnx_path.name}: {size_mb:.1f} MB (exportado en {elapsed:.1f}s)")
    return onnx_path


def quantize_model(onnx_path: Path, output_dir: Path):
    """Aplica cuantización INT8 al encoder ONNX."""
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType

        quantized_path = output_dir / onnx_path.name.replace(".onnx", "_int8.onnx")

        print(f"  Cuantizando a INT8: {quantized_path.name}")
        t0 = time.time()

        # Excluir nodos Conv (ConvInteger no implementado en onnxruntime CPU)
        import onnx
        onnx_model = onnx.load(str(onnx_path))
        conv_nodes = [n.name for n in onnx_model.graph.node if n.op_type == "Conv"]
        del onnx_model

        quantize_dynamic(
            str(onnx_path),
            str(quantized_path),
            weight_type=QuantType.QInt8,
            nodes_to_exclude=conv_nodes,
        )
        elapsed = time.time() - t0

        original_size = onnx_path.stat().st_size / 1e6
        quantized_size = quantized_path.stat().st_size / 1e6
        print(f"  -> Original:   {original_size:.1f} MB")
        print(f"  -> INT8:       {quantized_size:.1f} MB")
        print(f"  -> Reducción:  {(1 - quantized_size/original_size)*100:.0f}%")
        print(f"  -> Tiempo:     {elapsed:.1f}s")
        return quantized_path

    except ImportError:
        print("  ERROR: onnxruntime no instalado. pip install onnxruntime")
        return None
    except Exception as e:
        print(f"  ERROR en cuantización: {e}")
        return None


def verify_onnx(onnx_path: Path, processor, height: int, width: int):
    """Verifica que el ONNX exportado produce output válido."""
    try:
        import onnxruntime as ort

        print(f"  Verificando {onnx_path.name}...")
        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])

        dummy_image = Image.new("RGB", (width, height), color=(200, 200, 200))
        pixel_values = processor(dummy_image, return_tensors="np").pixel_values

        t0 = time.time()
        outputs = sess.run(None, {"pixel_values": pixel_values})
        elapsed = time.time() - t0

        hidden = outputs[0]
        print(f"  -> Output shape: {hidden.shape}")
        print(f"  -> Inferencia encoder: {elapsed*1000:.0f}ms")
        print(f"  -> Valores: min={hidden.min():.4f}, max={hidden.max():.4f}, mean={hidden.mean():.4f}")
        return True
    except Exception as e:
        print(f"  ERROR verificando: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Convertir Donut a ONNX + INT8")
    parser.add_argument("--model", type=str, default="../models/donut_orion")
    parser.add_argument("--output", type=str, default="../models/donut_orion_onnx")
    args = parser.parse_args()

    model_path = Path(args.model).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Modelo:  {model_path}")
    print(f"Output:  {output_dir}")

    # Cargar modelo PyTorch
    print("\nCargando modelo PyTorch...")
    t0 = time.time()
    processor = DonutProcessor.from_pretrained(str(model_path))
    model = VisionEncoderDecoderModel.from_pretrained(str(model_path))
    model.eval()
    print(f"Modelo cargado en {time.time()-t0:.1f}s")

    # Copiar archivos necesarios para inferencia
    for fname in [
        "tokenizer.json", "tokenizer_config.json",
        "processor_config.json", "config.json",
        "generation_config.json",
    ]:
        src = model_path / fname
        if src.exists():
            shutil.copy2(src, output_dir / fname)
            print(f"  Copiado: {fname}")

    # Copiar decoder weights (necesario para inferencia híbrida ONNX encoder + PyTorch decoder)
    for fname in ["model.safetensors", "pytorch_model.bin"]:
        src = model_path / fname
        if src.exists():
            shutil.copy2(src, output_dir / fname)
            print(f"  Copiado: {fname} ({src.stat().st_size/1e6:.0f} MB)")
            break

    # Exportar para cada resolución
    results = {}
    for res_name, (h, w) in RESOLUTIONS.items():
        try:
            onnx_path = export_encoder(model, processor, output_dir, res_name, h, w)
            verify_onnx(onnx_path, processor, h, w)

            q_path = quantize_model(onnx_path, output_dir)
            if q_path:
                verify_onnx(q_path, processor, h, w)
                results[res_name] = {
                    "onnx": onnx_path.stat().st_size / 1e6,
                    "int8": q_path.stat().st_size / 1e6,
                }
        except Exception as e:
            print(f"\n  ERROR exportando {res_name}: {e}")

    # Resumen
    print(f"\n{'='*60}")
    print("RESUMEN DE CONVERSIÓN")
    print(f"{'='*60}")
    for res, sizes in results.items():
        print(f"  {res}: ONNX={sizes['onnx']:.1f}MB -> INT8={sizes['int8']:.1f}MB")
    print(f"\nArchivos en: {output_dir}")


if __name__ == "__main__":
    main()
