"""
Deploy Orion_APP .next build to VPS via SFTP + SSH (paramiko).
Uploads: .next/server/ + .next/static/
Restarts: pm2 restart orion-app
"""
import paramiko
import os
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

VPS_HOST = "217.65.146.156"
VPS_USER = "root"
VPS_PASS = "0507@Londres@360"
APP_DIR  = "/opt/orion/app"
LOCAL_NEXT = r"C:\Users\garci\Documents\GitHub\Orion_APP\.next"

def upload_dir(sftp, local_path, remote_path):
    """Recursively upload a local directory to remote."""
    try:
        sftp.stat(remote_path)
    except FileNotFoundError:
        sftp.mkdir(remote_path)

    for item in os.listdir(local_path):
        local_item = os.path.join(local_path, item)
        remote_item = f"{remote_path}/{item}"
        if os.path.isdir(local_item):
            upload_dir(sftp, local_item, remote_item)
        else:
            sftp.put(local_item, remote_item)
            print(f"  up {remote_item}")

def main():
    print("=== ORION DEPLOY ===")
    print(f"Target: {VPS_USER}@{VPS_HOST}:{APP_DIR}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    print("\n[1/4] Conectando SSH...")
    client.connect(VPS_HOST, username=VPS_USER, password=VPS_PASS, timeout=30)
    print("  OK Conectado")

    sftp = client.open_sftp()

    # Upload .next/server/
    print("\n[2/4] Subiendo .next/server/ ...")
    local_server = os.path.join(LOCAL_NEXT, "server")
    remote_server = f"{APP_DIR}/.next/server"
    upload_dir(sftp, local_server, remote_server)
    print("  OK server/ subido")

    # Upload .next/static/
    print("\n[3/4] Subiendo .next/static/ ...")
    local_static = os.path.join(LOCAL_NEXT, "static")
    remote_static = f"{APP_DIR}/.next/static"
    upload_dir(sftp, local_static, remote_static)
    print("  OK static/ subido")

    # Also upload BUILD_ID and build-manifest files from .next root
    print("\n  Subiendo manifiestos...")
    for fname in ["BUILD_ID", "build-manifest.json", "package.json",
                  "routes-manifest.json", "app-build-manifest.json",
                  "react-loadable-manifest.json", "required-server-files.json"]:
        local_f = os.path.join(LOCAL_NEXT, fname)
        if os.path.isfile(local_f):
            sftp.put(local_f, f"{APP_DIR}/.next/{fname}")
            print(f"    up .next/{fname}")

    # Upload root package.json so npm install can pick up all prod deps
    root_pkg = r"C:\Users\garci\Documents\GitHub\Orion_APP\package.json"
    if os.path.isfile(root_pkg):
        sftp.put(root_pkg, f"{APP_DIR}/package.json")
        print(f"  up package.json (root)")

    sftp.close()

    # npm install (ensures pg and other native deps are present after every deploy)
    print("\n[4/5] npm install --omit=dev en VPS...")
    stdin, stdout, stderr = client.exec_command(
        f"cd {APP_DIR} && npm install --omit=dev 2>&1"
    )
    out = stdout.read().decode()
    print(out[:2000])  # cap output

    # PM2 restart
    print("\n[5/5] Reiniciando PM2...")
    stdin, stdout, stderr = client.exec_command("pm2 restart orion-app && pm2 status orion-app")
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print("STDERR:", err)

    client.close()
    print("\nDONE Deploy completado")

if __name__ == "__main__":
    main()
