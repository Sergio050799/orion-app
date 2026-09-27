"""
Orion API — Python + Flask + SQLite
Puerto: 3001 (localhost solamente)
Auth:   header X-Api-Key
"""

import os
import json
import hashlib
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, request, jsonify
from db import get_conn, init_db, hash_password, verify_password

# ─── Configuración ────────────────────────────────────────────────────────────

API_KEY = os.environ.get('ORION_API_KEY', 'dev_secret_local')

app = Flask(__name__)
init_db()

# ─── Helpers ──────────────────────────────────────────────────────────────────

def require_key(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.headers.get('X-Api-Key') != API_KEY:
            return jsonify({'error': 'No autorizado'}), 401
        return f(*args, **kwargs)
    return decorated


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()




def now_iso() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


# ─── AUTH ─────────────────────────────────────────────────────────────────────

@app.route('/auth/verify', methods=['POST'])
@require_key
def auth_verify():
    body = request.get_json(silent=True) or {}
    username = str(body.get('username', '')).strip().upper()
    password = str(body.get('password', ''))

    if not username or not password:
        return jsonify({'ok': False, 'error': 'Faltan credenciales'}), 400

    conn = get_conn()
    row = conn.execute(
        'SELECT id, username, password_hash, salt, rol FROM usuarios WHERE UPPER(username)=?',
        [username]
    ).fetchone()

    if not row or not verify_password(password, row['password_hash'], row['salt']):
        conn.close()
        return jsonify({'ok': False, 'error': 'Usuario o contraseña incorrectos'}), 401

    # Migrar SHA-256 antiguo a PBKDF2 en primer login exitoso
    if row['salt'] is None:
        new_hash, new_salt = hash_password(password)
        conn.execute(
            'UPDATE usuarios SET password_hash=?, salt=? WHERE id=?',
            [new_hash, new_salt, row['id']]
        )
        conn.commit()

    conn.close()
    return jsonify({'ok': True, 'username': row['username'], 'rol': row['rol']})


# ─── CARPETAS ─────────────────────────────────────────────────────────────────

@app.route('/carpetas', methods=['GET'])
@require_key
def get_carpetas():
    conn = get_conn()
    rows = conn.execute("""
        SELECT c.id, c.nombre, c.estado, c.cif, c.tomador, c.actividad,
               c.corredor_id, c.creado_por, c.updated_at, c.data,
               GROUP_CONCAT(sa.username) AS ep
        FROM carpetas c
        LEFT JOIN sesiones_activas sa
            ON sa.carpeta_id = c.id
           AND sa.last_seen > datetime('now', '-3 minutes')
        GROUP BY c.id
        ORDER BY c.updated_at DESC
    """).fetchall()
    conn.close()

    result = []
    for row in rows:
        data = json.loads(row['data']) if row['data'] else {}
        # Real columns win over stale JSON (real columns are always up to date)
        data['nombre']         = row['nombre'] or data.get('nombre', '')
        data['estado']         = row['estado'] or data.get('estado', 'EN ESTUDIO')
        data['corredor_id']    = row['corredor_id'] or data.get('corredor_id')
        data['creado_por']     = row['creado_por'] or data.get('creado_por', '')
        data['estudiando_por'] = row['ep'].split(',') if row['ep'] else []
        if 'header' not in data:
            data['header'] = {}
        data['header']['cif']       = row['cif'] or data['header'].get('cif', '')
        data['header']['tomador']   = row['tomador'] or data['header'].get('tomador', '')
        data['header']['actividad'] = row['actividad'] or data['header'].get('actividad', '')
        result.append(data)
    return jsonify(result)


def _extract_carpeta_meta(c: dict) -> tuple:
    """Extracts real-column values from a carpeta dict."""
    h = c.get('header') or {}
    nombre      = c.get('nombre', '')
    estado      = c.get('estado', 'EN ESTUDIO')
    cif         = h.get('cif') or c.get('cif', '')
    tomador     = h.get('tomador') or c.get('tomador', '')
    actividad   = h.get('actividad') or c.get('actividad', '')
    corredor_id = c.get('corredor_id') or None
    creado_por  = c.get('creado_por', '')
    return nombre, estado, cif, tomador, actividad, corredor_id, creado_por


@app.route('/carpetas', methods=['POST'])
@require_key
def post_carpetas():
    body   = request.get_json(silent=True) or {}
    action = body.get('action')
    conn   = get_conn()

    try:
        if action == 'upsert':
            c = body.get('carpeta', {})
            nombre, estado, cif, tomador, actividad, corredor_id, creado_por = _extract_carpeta_meta(c)
            conn.execute("""
                INSERT INTO carpetas
                    (id, nombre, estado, cif, tomador, actividad, corredor_id,
                     creado_por, updated_at, data)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    nombre=excluded.nombre, estado=excluded.estado,
                    cif=excluded.cif, tomador=excluded.tomador,
                    actividad=excluded.actividad, corredor_id=excluded.corredor_id,
                    updated_at=excluded.updated_at, data=excluded.data
            """, [c['id'], nombre, estado, cif, tomador, actividad, corredor_id,
                  creado_por, now_iso(), json.dumps(c)])
            conn.commit()

        elif action == 'delete':
            cid = body.get('id')
            conn.execute("DELETE FROM sesiones_activas WHERE carpeta_id=?", [cid])
            conn.execute("DELETE FROM carpetas WHERE id=?", [cid])
            conn.commit()

        elif action == 'replaceAll':
            carpetas = body.get('carpetas', [])
            try:
                conn.execute("DELETE FROM carpetas")
                for c in carpetas:
                    nombre, estado, cif, tomador, actividad, corredor_id, creado_por = _extract_carpeta_meta(c)
                    conn.execute("""
                        INSERT INTO carpetas
                            (id, nombre, estado, cif, tomador, actividad, corredor_id,
                             creado_por, updated_at, data)
                        VALUES (?,?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(id) DO UPDATE SET
                            nombre=excluded.nombre, estado=excluded.estado,
                            cif=excluded.cif, tomador=excluded.tomador,
                            actividad=excluded.actividad, corredor_id=excluded.corredor_id,
                            updated_at=excluded.updated_at, data=excluded.data
                    """, [c['id'], nombre, estado, cif, tomador, actividad, corredor_id,
                          creado_por, now_iso(), json.dumps(c)])
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        else:
            return jsonify({'error': 'Acción desconocida'}), 400

    finally:
        conn.close()

    return jsonify({'ok': True})


# ─── CORREDORES ───────────────────────────────────────────────────────────────

@app.route('/corredores', methods=['GET'])
@require_key
def get_corredores():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM corredores ORDER BY nombre ASC").fetchall()
    conn.close()

    result = []
    for row in rows:
        r = dict(row)
        # Map DB column names → frontend field names
        result.append({
            'id':                  r['id'],
            'codigo':              r.get('codigo', ''),
            'nombre':              r.get('nombre', ''),
            'cif':                 r.get('cif', ''),
            'domicilio':           r.get('domicilio', ''),
            'porcentajeComision':  r.get('comision', 0),
            'periodicidad':        r.get('periodicidad', 'mensual'),
            'formaPago':           r.get('forma_pago', ''),
            'contacto':            r.get('contacto', ''),
            'email':               r.get('email', ''),
            'telefono':            r.get('telefono', ''),
            'observaciones':       r.get('observaciones', ''),
            'sucursal':            r.get('sucursal') or None,
            'comercial':           r.get('comercial') or None,
            'creado_por':          r.get('creado_por', ''),
            'creadoEn':            r.get('created_at', ''),
            'actualizadoEn':       r.get('updated_at', ''),
        })
    return jsonify(result)


@app.route('/corredores', methods=['POST'])
@require_key
def post_corredores():
    body   = request.get_json(silent=True) or {}
    action = body.get('action')
    conn   = get_conn()

    try:
        if action == 'upsert':
            c = body.get('corredor', {})
            comision = float(c.get('porcentajeComision') or c.get('comision') or 0)
            conn.execute("""
                INSERT INTO corredores
                    (id, codigo, nombre, cif, domicilio, comision, periodicidad,
                     forma_pago, contacto, email, telefono, observaciones,
                     sucursal, comercial, creado_por, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    codigo=excluded.codigo, nombre=excluded.nombre,
                    cif=excluded.cif, domicilio=excluded.domicilio,
                    comision=excluded.comision, periodicidad=excluded.periodicidad,
                    forma_pago=excluded.forma_pago, contacto=excluded.contacto,
                    email=excluded.email, telefono=excluded.telefono,
                    observaciones=excluded.observaciones, sucursal=excluded.sucursal,
                    comercial=excluded.comercial, updated_at=excluded.updated_at
            """, [
                c['id'], c.get('codigo', ''), c.get('nombre', ''), c.get('cif', ''),
                c.get('domicilio', ''), comision, c.get('periodicidad', 'mensual'),
                c.get('formaPago', ''), c.get('contacto', ''), c.get('email', ''),
                c.get('telefono', ''), c.get('observaciones', ''),
                c.get('sucursal') or '', c.get('comercial') or '',
                c.get('creado_por', ''), now_iso(),
            ])
            conn.commit()

        elif action == 'delete':
            conn.execute("DELETE FROM corredores WHERE id=?", [body.get('id')])
            conn.commit()

        elif action == 'upsertBatch':
            lista = body.get('corredores', [])
            if not lista:
                return jsonify({'error': 'Sin corredores'}), 400
            try:
                for c in lista:
                    comision = float(c.get('porcentajeComision') or c.get('comision') or 0)
                    conn.execute("""
                        INSERT INTO corredores
                            (id, codigo, nombre, cif, domicilio, comision, periodicidad,
                             forma_pago, contacto, email, telefono, observaciones,
                             sucursal, comercial, creado_por, updated_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        ON CONFLICT(id) DO UPDATE SET
                            codigo=excluded.codigo, nombre=excluded.nombre,
                            cif=excluded.cif, domicilio=excluded.domicilio,
                            comision=excluded.comision, periodicidad=excluded.periodicidad,
                            forma_pago=excluded.forma_pago, contacto=excluded.contacto,
                            email=excluded.email, telefono=excluded.telefono,
                            observaciones=excluded.observaciones, sucursal=excluded.sucursal,
                            comercial=excluded.comercial, updated_at=excluded.updated_at
                    """, [
                        c['id'], c.get('codigo', ''), c.get('nombre', ''), c.get('cif', ''),
                        c.get('domicilio', ''), comision, c.get('periodicidad', 'mensual'),
                        c.get('formaPago', ''), c.get('contacto', ''), c.get('email', ''),
                        c.get('telefono', ''), c.get('observaciones', ''),
                        c.get('sucursal') or '', c.get('comercial') or '',
                        c.get('creado_por', ''), now_iso(),
                    ])
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        elif action == 'deleteAll':
            conn.execute("DELETE FROM corredores")
            conn.commit()

        else:
            return jsonify({'error': 'Acción desconocida'}), 400

    finally:
        conn.close()

    return jsonify({'ok': True})


# ─── SESIONES ─────────────────────────────────────────────────────────────────

@app.route('/sesion', methods=['POST'])
@require_key
def post_sesion():
    body       = request.get_json(silent=True) or {}
    action     = body.get('action')
    carpeta_id = body.get('carpeta_id')
    username   = body.get('username')

    if not carpeta_id or not username:
        return jsonify({'error': 'carpeta_id y username requeridos'}), 400

    conn = get_conn()
    try:
        if action in ('join', 'heartbeat'):
            conn.execute("""
                INSERT INTO sesiones_activas (carpeta_id, username, last_seen)
                VALUES (?, ?, ?)
                ON CONFLICT(carpeta_id, username) DO UPDATE SET last_seen=excluded.last_seen
            """, [carpeta_id, username, now_iso()])
            conn.commit()

        elif action == 'leave':
            conn.execute(
                "DELETE FROM sesiones_activas WHERE carpeta_id=? AND username=?",
                [carpeta_id, username]
            )
            conn.commit()

        else:
            return jsonify({'error': 'Acción desconocida'}), 400

    finally:
        conn.close()

    return jsonify({'ok': True})


# ─── USUARIOS (consulta interna) ──────────────────────────────────────────────

@app.route('/usuarios', methods=['GET'])
@require_key
def get_usuarios():
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, username, rol, created_at FROM usuarios ORDER BY username"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


# ─── SILVERDAT CACHE ─────────────────────────────────────────────────────────

@app.route('/silverdat-cache/<matricula>', methods=['GET'])
@require_key
def get_silverdat_cache(matricula):
    conn = get_conn()
    row = conn.execute(
        'SELECT datos, fecha_consulta FROM vehiculos_silverdat WHERE matricula=?',
        [matricula.strip().upper()]
    ).fetchone()
    conn.close()
    if not row:
        return jsonify({'ok': False}), 404
    return jsonify({'ok': True, 'datos': row['datos'], 'fecha_consulta': row['fecha_consulta']})


@app.route('/silverdat-cache', methods=['POST'])
@require_key
def post_silverdat_cache():
    body = request.get_json(silent=True) or {}
    matricula      = str(body.get('matricula', '')).strip().upper()
    datos          = body.get('datos', '')
    consultado_por = str(body.get('consultado_por', '')).strip()
    carpeta_id     = str(body.get('carpeta_id', '')).strip()
    carpeta_nombre = str(body.get('carpeta_nombre', '')).strip()
    corredor_id    = str(body.get('corredor_id', '')).strip()

    if not matricula or not datos:
        return jsonify({'ok': False, 'error': 'Faltan datos'}), 400

    ts = now_iso()
    conn = get_conn()
    try:
        conn.execute("""
            INSERT INTO vehiculos_silverdat (matricula, datos, fecha_consulta)
            VALUES (?, ?, ?)
            ON CONFLICT(matricula) DO UPDATE SET datos=excluded.datos, fecha_consulta=excluded.fecha_consulta
        """, [matricula, datos, ts])
        conn.execute("""
            INSERT INTO historial_silverdat
                (matricula, fecha_consulta, consultado_por, carpeta_id, carpeta_nombre, corredor_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, [matricula, ts, consultado_por, carpeta_id, carpeta_nombre, corredor_id])
        conn.commit()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/silverdat-historial', methods=['GET'])
@require_key
def get_silverdat_historial():
    conn = get_conn()
    rows = conn.execute("""
        SELECT h.id, h.matricula, h.fecha_consulta, h.consultado_por,
               h.carpeta_id, h.carpeta_nombre, h.corredor_id,
               COALESCE(c.nombre, '') AS corredor_nombre
        FROM historial_silverdat h
        LEFT JOIN corredores c ON c.id = h.corredor_id
        ORDER BY h.fecha_consulta DESC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/silverdat-historial/check', methods=['POST'])
@require_key
def check_silverdat_historial():
    body = request.get_json(silent=True) or {}
    matriculas = [str(m).strip().upper() for m in body.get('matriculas', []) if str(m).strip()]
    if not matriculas:
        return jsonify({'ok': True, 'conocidas': []})

    placeholders = ','.join('?' * len(matriculas))
    conn = get_conn()
    rows = conn.execute(f"""
        SELECT h.matricula, MAX(h.fecha_consulta) AS fecha_consulta,
               h.consultado_por, h.carpeta_nombre, h.corredor_id,
               COALESCE(c.nombre, '') AS corredor_nombre
        FROM historial_silverdat h
        LEFT JOIN corredores c ON c.id = h.corredor_id
        WHERE h.matricula IN ({placeholders})
        GROUP BY h.matricula
    """, matriculas).fetchall()
    conn.close()
    return jsonify({'ok': True, 'conocidas': [dict(r) for r in rows]})


# ─── Ping ─────────────────────────────────────────────────────────────────────

@app.route('/ping', methods=['GET'])
def ping():
    return jsonify({'status': 'ok', 'service': 'orion-api'})


# ─── Arranque ─────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    try:
        from waitress import serve
        port = int(os.environ.get('PORT', 3001))
        print(f"[orion-api] Iniciando en http://127.0.0.1:{port}")
        serve(app, host='127.0.0.1', port=port, threads=12)
    except ImportError:
        app.run(host='127.0.0.1', port=int(os.environ.get('PORT', 3001)), debug=False, threaded=True)
