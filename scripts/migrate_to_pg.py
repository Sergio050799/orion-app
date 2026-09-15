"""
Migra carpetas.json y corredores.json del VPS a PostgreSQL.
Ejecutar desde Orion_APP/: python scripts/migrate_to_pg.py
"""
import json
import os
import paramiko

HOST = '217.65.146.156'
USER = 'root'
PASS = '0507@Londres@360'

DATA_DIR = '/opt/orion/data'
SQL_SCRIPT = os.path.join(os.path.dirname(__file__), 'init_db.sql')

DB_USER = 'orion_user'
DB_NAME = 'orion_db'

def run(ssh, cmd):
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out: print(out)
    if err and 'NOTICE' not in err: print('[ERR]', err)
    return out

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    sftp = ssh.open_sftp()

    print('[1/4] Subiendo script SQL...')
    sftp.put(SQL_SCRIPT, '/tmp/init_db.sql')

    print('[2/4] Ejecutando init_db.sql...')
    run(ssh, f'PGPASSWORD=orion_db_2026 psql -h localhost -U {DB_USER} -d {DB_NAME} -f /tmp/init_db.sql')

    print('[3/4] Migrando carpetas...')
    try:
        with sftp.open(f'{DATA_DIR}/carpetas.json') as f:
            carpetas = json.load(f)
        for c in carpetas:
            cid    = c.get('id', '')
            nombre = c.get('nombre', '')
            cBy    = c.get('creado_por', '')
            data   = json.dumps(c).replace("'", "''")
            run(ssh, f"""PGPASSWORD=orion_db_2026 psql -h localhost -U {DB_USER} -d {DB_NAME} -c "INSERT INTO carpetas (id, nombre, creado_por, data) VALUES ('{cid}', '{nombre.replace(chr(39), chr(39)*2)}', '{cBy}', '{data}') ON CONFLICT (id) DO UPDATE SET nombre=EXCLUDED.nombre, data=EXCLUDED.data, updated_at=NOW();" """)
        print(f'  → {len(carpetas)} carpetas migradas')
    except FileNotFoundError:
        print('  carpetas.json no encontrado — saltando')

    print('[4/4] Migrando corredores...')
    try:
        with sftp.open(f'{DATA_DIR}/corredores.json') as f:
            corredores = json.load(f)
        for c in corredores:
            cid    = c.get('id', '')
            nombre = c.get('nombre', '')
            cBy    = c.get('creado_por', '')
            data   = json.dumps(c).replace("'", "''")
            run(ssh, f"""PGPASSWORD=orion_db_2026 psql -h localhost -U {DB_USER} -d {DB_NAME} -c "INSERT INTO corredores (id, nombre, creado_por, data) VALUES ('{cid}', '{nombre.replace(chr(39), chr(39)*2)}', '{cBy}', '{data}') ON CONFLICT (id) DO UPDATE SET nombre=EXCLUDED.nombre, data=EXCLUDED.data, updated_at=NOW();" """)
        print(f'  → {len(corredores)} corredores migrados')
    except FileNotFoundError:
        print('  corredores.json no encontrado — saltando')

    sftp.close()
    ssh.close()
    print('\nDONE Migración completada')

if __name__ == '__main__':
    main()
