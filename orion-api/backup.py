"""
Backup diario de la BD de Orion.
Uso:  python backup.py
Cron: 0 3 * * * cd /opt/orion-api && ORION_DB_PATH=/opt/orion/data/orion.db python backup.py >> /opt/orion/logs/backup.log 2>&1
"""
import os
import shutil
import glob
from datetime import datetime

DB_PATH    = os.environ.get('ORION_DB_PATH', '/opt/orion/data/orion.db')
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(DB_PATH)), 'backups')
KEEP_DAYS  = 7


def backup():
    if not os.path.exists(DB_PATH):
        print(f'[backup] ERROR: BD no encontrada en {DB_PATH}')
        return

    os.makedirs(BACKUP_DIR, exist_ok=True)
    date_str = datetime.now().strftime('%Y-%m-%d_%H%M')
    dest = os.path.join(BACKUP_DIR, f'orion_{date_str}.db')

    shutil.copy2(DB_PATH, dest)
    size_kb = os.path.getsize(dest) // 1024
    print(f'[backup] Guardado: {dest} ({size_kb} KB)')

    # Mantener solo los últimos KEEP_DAYS backups
    backups = sorted(glob.glob(os.path.join(BACKUP_DIR, 'orion_*.db')))
    to_delete = backups[:-KEEP_DAYS] if len(backups) > KEEP_DAYS else []
    for f in to_delete:
        os.remove(f)
        print(f'[backup] Eliminado antiguo: {os.path.basename(f)}')

    print(f'[backup] OK — {len(backups) - len(to_delete)}/{KEEP_DAYS} copias guardadas')


if __name__ == '__main__':
    backup()
