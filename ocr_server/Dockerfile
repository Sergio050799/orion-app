FROM python:3.11-slim

WORKDIR /app

# Dependencias del sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Dependencias Python
# Incluye torch (CPU only) + onnxruntime para modo híbrido
COPY requirements.txt ./
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Copiar servidor
COPY server.py ./

# Copiar modelo PyTorch + ONNX encoder (si existe)
# Estructura esperada:
#   model/donut_orion/       — modelo PyTorch completo
#   model/donut_orion_onnx/  — encoder ONNX INT8 (opcional)
COPY model/ ./model/

EXPOSE 5050

# El servidor auto-detecta ONNX y usa modo híbrido si está disponible
CMD ["python", "server.py", "--model", "./model/donut_orion", "--host", "0.0.0.0", "--port", "5050"]
