#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Orion OCR Server — Setup VPS (Ubuntu 22.04 / Hostinger KVM4)
# Ejecutar como root o con sudo.
#
# Uso:
#   chmod +x setup_vps.sh
#   sudo ./setup_vps.sh
# ──────────────────────────────────────────────────────────────────────────────
set -e

# ── Config ────────────────────────────────────────────────────────────────────
ORION_DIR="/opt/orion"
MODELS_DIR="$ORION_DIR/models"
SERVER_DIR="$ORION_DIR/ocr_server"
MODEL_NAME="donut_orion"
OCR_PORT=5050
PYTHON_VERSION="3.11"

# ── Sistema ───────────────────────────────────────────────────────────────────
echo "==> Actualizando sistema..."
apt-get update -y && apt-get upgrade -y
apt-get install -y git python3 python3-pip python3-venv curl wget unzip \
  libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev \
  libgomp1 poppler-utils

# ── Directorios ───────────────────────────────────────────────────────────────
echo "==> Creando directorios..."
mkdir -p "$SERVER_DIR" "$MODELS_DIR"

# ── Python venv ───────────────────────────────────────────────────────────────
echo "==> Creando entorno virtual Python..."
python3 -m venv "$ORION_DIR/venv"
source "$ORION_DIR/venv/bin/activate"

echo "==> Instalando dependencias Python..."
pip install --upgrade pip
pip install -r "$SERVER_DIR/requirements.txt"

# ── Systemd service ───────────────────────────────────────────────────────────
echo "==> Configurando servicio systemd..."
cat > /etc/systemd/system/orion-ocr.service << EOF
[Unit]
Description=Orion OCR Server (Donut)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$SERVER_DIR
Environment="MODEL_PATH=$MODELS_DIR/$MODEL_NAME"
ExecStart=$ORION_DIR/venv/bin/python $SERVER_DIR/server.py \
  --host 127.0.0.1 \
  --port $OCR_PORT \
  --model $MODELS_DIR/$MODEL_NAME
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable orion-ocr

# ── Nginx proxy ───────────────────────────────────────────────────────────────
echo "==> Configurando Nginx (proxy /ocr → localhost:$OCR_PORT)..."
apt-get install -y nginx

cat > /etc/nginx/sites-available/orion-ocr << EOF
server {
    listen 8000;
    server_name _;

    client_max_body_size 60M;

    location / {
        proxy_pass http://127.0.0.1:$OCR_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/orion-ocr /etc/nginx/sites-enabled/orion-ocr
nginx -t && systemctl reload nginx

# ── Firewall ──────────────────────────────────────────────────────────────────
echo "==> Abriendo puerto 8000 en firewall..."
ufw allow 8000/tcp 2>/dev/null || true

# ── Instrucciones finales ─────────────────────────────────────────────────────
echo ""
echo "✓ Setup completado."
echo ""
echo "PRÓXIMOS PASOS:"
echo "  1. Copia el modelo al servidor:"
echo "     scp -r ./models/$MODEL_NAME root@<VPS_IP>:$MODELS_DIR/"
echo ""
echo "  2. Inicia el servicio:"
echo "     sudo systemctl start orion-ocr"
echo "     sudo systemctl status orion-ocr"
echo ""
echo "  3. Verifica el health check:"
echo "     curl http://<VPS_IP>:8000/health"
echo ""
echo "  4. En .env.local de Next.js (Vercel o local):"
echo "     OCR_SERVER_URL=http://<VPS_IP>:8000"
echo ""
echo "  5. Logs:"
echo "     journalctl -u orion-ocr -f"
