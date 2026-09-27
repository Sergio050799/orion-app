import sqlite3
import json
import os
import hashlib
import binascii

DB_PATH = os.environ.get('ORION_DB_PATH', '/opt/orion/data/orion.db')


# ─── Password hashing (PBKDF2-SHA256) ─────────────────────────────────────────

def hash_password(password: str) -> tuple:
    """Devuelve (hash_hex, salt_hex) usando PBKDF2-SHA256."""
    salt = binascii.hexlify(os.urandom(16)).decode()
    h = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 260_000).hex()
    return h, salt


def verify_password(password: str, stored_hash: str, salt) -> bool:
    """Verifica contraseña. Si salt es None usa SHA-256 antiguo (migración automática)."""
    if salt is None:
        return hashlib.sha256(password.encode('utf-8')).hexdigest() == stored_hash
    h = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), str(salt).encode('utf-8'), 260_000).hex()
    return h == stored_hash

_HASH_DEFAULT = '30f2bc83fcd6b4d3834e8950c1cd6addb82cc807fc0eca261fe718da79cbbea5'

# Schema para instalaciones nuevas — columnas reales, sin JSON blobs en corredores
SCHEMA = f"""
CREATE TABLE IF NOT EXISTS usuarios (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt          TEXT DEFAULT NULL,
    rol           TEXT NOT NULL DEFAULT 'usuario',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS corredores (
    id            TEXT PRIMARY KEY,
    codigo        TEXT NOT NULL DEFAULT '',
    nombre        TEXT NOT NULL DEFAULT '',
    cif           TEXT NOT NULL DEFAULT '',
    domicilio     TEXT NOT NULL DEFAULT '',
    comision      REAL NOT NULL DEFAULT 0,
    periodicidad  TEXT NOT NULL DEFAULT 'mensual',
    forma_pago    TEXT NOT NULL DEFAULT '',
    contacto      TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    telefono      TEXT NOT NULL DEFAULT '',
    observaciones TEXT NOT NULL DEFAULT '',
    sucursal      TEXT NOT NULL DEFAULT '',
    comercial     TEXT NOT NULL DEFAULT '',
    creado_por    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carpetas (
    id            TEXT PRIMARY KEY,
    nombre        TEXT NOT NULL DEFAULT '',
    estado        TEXT NOT NULL DEFAULT 'EN ESTUDIO',
    cif           TEXT NOT NULL DEFAULT '',
    tomador       TEXT NOT NULL DEFAULT '',
    actividad     TEXT NOT NULL DEFAULT '',
    corredor_id   TEXT,
    creado_por    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    data          TEXT NOT NULL DEFAULT '{{}}'
);

CREATE INDEX IF NOT EXISTS idx_carpetas_corredor ON carpetas(corredor_id);
CREATE INDEX IF NOT EXISTS idx_carpetas_estado   ON carpetas(estado);
CREATE INDEX IF NOT EXISTS idx_carpetas_updated  ON carpetas(updated_at DESC);

CREATE TABLE IF NOT EXISTS vehiculos_silverdat (
    matricula      TEXT PRIMARY KEY,
    datos          TEXT NOT NULL,
    fecha_consulta TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS historial_silverdat (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula      TEXT NOT NULL,
    fecha_consulta TEXT NOT NULL DEFAULT (datetime('now')),
    consultado_por TEXT NOT NULL DEFAULT '',
    carpeta_id     TEXT NOT NULL DEFAULT '',
    carpeta_nombre TEXT NOT NULL DEFAULT '',
    corredor_id    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_historial_sd_mat   ON historial_silverdat(matricula);
CREATE INDEX IF NOT EXISTS idx_historial_sd_fecha ON historial_silverdat(fecha_consulta DESC);

CREATE TABLE IF NOT EXISTS sesiones_activas (
    carpeta_id TEXT NOT NULL,
    username   TEXT NOT NULL,
    last_seen  TEXT NOT NULL,
    PRIMARY KEY (carpeta_id, username)
);

INSERT OR IGNORE INTO usuarios (id, username, password_hash, rol) VALUES
  ('usr_titan',  'TITAN',  '{_HASH_DEFAULT}', 'usuario'),
  ('usr_carlos', 'CARLOS', '{_HASH_DEFAULT}', 'usuario'),
  ('usr_raquel', 'RAQUEL', '{_HASH_DEFAULT}', 'usuario'),
  ('usr_sergio', 'SERGIO', '{_HASH_DEFAULT}', 'admin');
"""


def get_conn():
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _column_exists(conn, table: str, column: str) -> bool:
    cols = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(c['name'] == column for c in cols)


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]
    ).fetchone()
    return row is not None


def migrate_db():
    """Upgrades an existing DB to the current schema without losing data."""
    conn = get_conn()
    try:
        # ── usuarios: add rol ──────────────────────────────────────────────────
        if _table_exists(conn, 'usuarios') and not _column_exists(conn, 'usuarios', 'rol'):
            conn.execute("ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'usuario'")

        # ── usuarios: SERGIO es el único admin, eliminar MMT ──────────────────
        if _table_exists(conn, 'usuarios'):
            conn.execute("DELETE FROM usuarios WHERE UPPER(username) = 'MMT'")
            conn.execute("UPDATE usuarios SET rol='admin' WHERE UPPER(username) = 'SERGIO'")
            conn.execute("UPDATE usuarios SET rol='usuario' WHERE UPPER(username) != 'SERGIO'")

        # ── usuarios: add salt (PBKDF2 migration) ─────────────────────────────
        if _table_exists(conn, 'usuarios') and not _column_exists(conn, 'usuarios', 'salt'):
            conn.execute("ALTER TABLE usuarios ADD COLUMN salt TEXT DEFAULT NULL")

        # ── corredores: add real columns, migrate from JSON blob ───────────────
        if _table_exists(conn, 'corredores'):
            new_cols = [
                ('codigo',       "TEXT NOT NULL DEFAULT ''"),
                ('cif',          "TEXT NOT NULL DEFAULT ''"),
                ('domicilio',    "TEXT NOT NULL DEFAULT ''"),
                ('comision',     "REAL NOT NULL DEFAULT 0"),
                ('periodicidad', "TEXT NOT NULL DEFAULT 'mensual'"),
                ('forma_pago',   "TEXT NOT NULL DEFAULT ''"),
                ('contacto',     "TEXT NOT NULL DEFAULT ''"),
                ('email',        "TEXT NOT NULL DEFAULT ''"),
                ('telefono',     "TEXT NOT NULL DEFAULT ''"),
                ('observaciones',"TEXT NOT NULL DEFAULT ''"),
                ('sucursal',     "TEXT NOT NULL DEFAULT ''"),
                ('comercial',    "TEXT NOT NULL DEFAULT ''"),
                ('created_at',   "TEXT NOT NULL DEFAULT (datetime('now'))"),
            ]
            for col, typedef in new_cols:
                if not _column_exists(conn, 'corredores', col):
                    conn.execute(f"ALTER TABLE corredores ADD COLUMN {col} {typedef}")

            # Migrate JSON blob → real columns for rows that still have a data blob
            if _column_exists(conn, 'corredores', 'data'):
                rows = conn.execute("SELECT id, data FROM corredores WHERE data IS NOT NULL AND data != '{}'").fetchall()
                for row in rows:
                    try:
                        d = json.loads(row['data'] or '{}')
                        comision = float(d.get('porcentajeComision') or d.get('comision') or 0)
                        conn.execute("""
                            UPDATE corredores SET
                                codigo=?, cif=?, domicilio=?, comision=?, periodicidad=?,
                                forma_pago=?, contacto=?, email=?, telefono=?,
                                observaciones=?, sucursal=?, comercial=?
                            WHERE id=?
                        """, [
                            d.get('codigo', ''), d.get('cif', ''), d.get('domicilio', ''),
                            comision, d.get('periodicidad', 'mensual'),
                            d.get('formaPago', ''), d.get('contacto', ''),
                            d.get('email', ''), d.get('telefono', ''),
                            d.get('observaciones', ''), d.get('sucursal', '') or '',
                            d.get('comercial', '') or '', row['id'],
                        ])
                    except Exception:
                        pass

        # ── carpetas: add real metadata columns, migrate from JSON blob ────────
        if _table_exists(conn, 'carpetas'):
            new_cols = [
                ('estado',      "TEXT NOT NULL DEFAULT 'EN ESTUDIO'"),
                ('cif',         "TEXT NOT NULL DEFAULT ''"),
                ('tomador',     "TEXT NOT NULL DEFAULT ''"),
                ('actividad',   "TEXT NOT NULL DEFAULT ''"),
                ('corredor_id', "TEXT"),
                ('created_at',  "TEXT NOT NULL DEFAULT (datetime('now'))"),
            ]
            for col, typedef in new_cols:
                if not _column_exists(conn, 'carpetas', col):
                    conn.execute(f"ALTER TABLE carpetas ADD COLUMN {col} {typedef}")

            # Migrate metadata from JSON blob → real columns
            rows = conn.execute("SELECT id, data FROM carpetas WHERE data IS NOT NULL AND data != '{}'").fetchall()
            for row in rows:
                try:
                    d = json.loads(row['data'] or '{}')
                    h = d.get('header') or {}
                    conn.execute("""
                        UPDATE carpetas SET
                            estado=?, cif=?, tomador=?, actividad=?, corredor_id=?
                        WHERE id=?
                    """, [
                        d.get('estado', 'EN ESTUDIO'),
                        h.get('cif') or d.get('cif', ''),
                        h.get('tomador') or d.get('tomador', ''),
                        h.get('actividad') or d.get('actividad', ''),
                        d.get('corredor_id') or None,
                        row['id'],
                    ])
                except Exception:
                    pass

        # ── vehiculos_silverdat ────────────────────────────────────────────────
        if not _table_exists(conn, 'vehiculos_silverdat'):
            conn.execute("""
                CREATE TABLE IF NOT EXISTS vehiculos_silverdat (
                    matricula      TEXT PRIMARY KEY,
                    datos          TEXT NOT NULL,
                    fecha_consulta TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)

        # ── historial_silverdat ────────────────────────────────────────────────
        if not _table_exists(conn, 'historial_silverdat'):
            conn.execute("""
                CREATE TABLE IF NOT EXISTS historial_silverdat (
                    id             INTEGER PRIMARY KEY AUTOINCREMENT,
                    matricula      TEXT NOT NULL,
                    fecha_consulta TEXT NOT NULL DEFAULT (datetime('now')),
                    consultado_por TEXT NOT NULL DEFAULT '',
                    carpeta_id     TEXT NOT NULL DEFAULT '',
                    carpeta_nombre TEXT NOT NULL DEFAULT '',
                    corredor_id    TEXT NOT NULL DEFAULT ''
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_historial_sd_mat ON historial_silverdat(matricula)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_historial_sd_fecha ON historial_silverdat(fecha_consulta DESC)")

        conn.commit()
        print("[db] Migración completada")
    finally:
        conn.close()


def init_db():
    conn = get_conn()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    migrate_db()
    print(f"[db] SQLite listo en {os.path.abspath(DB_PATH)}")
