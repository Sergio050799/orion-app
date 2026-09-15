-- ═══════════════════════════════════════════════════════════════
-- ORION — Inicialización BD compartida
-- Ejecutar como: psql -U orion_user -d orion_db -f init_db.sql
-- ═══════════════════════════════════════════════════════════════

-- ─── Limpiar tablas anteriores (si existían) ─────────────────────────────────
DROP TABLE IF EXISTS sesiones_activas CASCADE;
DROP TABLE IF EXISTS carpetas CASCADE;
DROP TABLE IF EXISTS corredores CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- ─── Usuarios ─────────────────────────────────────────────────────────────────
CREATE TABLE usuarios (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    -- SHA-256 de la contraseña (MMT2026 → hash fijo)
    password_hash TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Password hash de MMT2026 (SHA-256)
-- echo -n "MMT2026" | sha256sum → 8c9a9b...
-- Precalculado: sha256('MMT2026') = '30f2bc83fcd6b4d3834e8950c1cd6addb82cc807fc0eca261fe718da79cbbea5'
-- Nota: el login route lo calcula dinámicamente, esto es solo referencia
INSERT INTO usuarios (id, username, password_hash) VALUES
    ('usr_mmt',    'MMT',    '30f2bc83fcd6b4d3834e8950c1cd6addb82cc807fc0eca261fe718da79cbbea5'),
    ('usr_titan',  'TITAN',  '30f2bc83fcd6b4d3834e8950c1cd6addb82cc807fc0eca261fe718da79cbbea5'),
    ('usr_carlos', 'CARLOS', '30f2bc83fcd6b4d3834e8950c1cd6addb82cc807fc0eca261fe718da79cbbea5'),
    ('usr_raquel', 'RAQUEL', '30f2bc83fcd6b4d3834e8950c1cd6addb82cc807fc0eca261fe718da79cbbea5'),
    ('usr_sergio', 'SERGIO', '30f2bc83fcd6b4d3834e8950c1cd6addb82cc807fc0eca261fe718da79cbbea5');

-- ─── Corredores ───────────────────────────────────────────────────────────────
CREATE TABLE corredores (
    id          TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL DEFAULT '',
    creado_por  TEXT,                        -- username de quien lo creó
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    data        JSONB NOT NULL
);

CREATE INDEX idx_corredores_updated ON corredores(updated_at DESC);

-- ─── Carpetas ─────────────────────────────────────────────────────────────────
CREATE TABLE carpetas (
    id          TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL DEFAULT '',
    creado_por  TEXT,                        -- username de quien la creó
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    data        JSONB NOT NULL
);

CREATE INDEX idx_carpetas_updated ON carpetas(updated_at DESC);
CREATE INDEX idx_carpetas_data_gin ON carpetas USING GIN(data jsonb_path_ops);

-- ─── Sesiones activas (quién está estudiando qué) ─────────────────────────────
CREATE TABLE sesiones_activas (
    carpeta_id  TEXT NOT NULL REFERENCES carpetas(id) ON DELETE CASCADE,
    username    TEXT NOT NULL,
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    last_seen   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (carpeta_id, username)
);

-- ─── Función para limpiar sesiones caducadas (> 3 min sin heartbeat) ──────────
CREATE OR REPLACE FUNCTION limpiar_sesiones_caducadas() RETURNS void AS $$
BEGIN
    DELETE FROM sesiones_activas WHERE last_seen < NOW() - INTERVAL '3 minutes';
END;
$$ LANGUAGE plpgsql;

-- ─── Vista carpetas con sesiones ──────────────────────────────────────────────
CREATE OR REPLACE VIEW v_carpetas AS
SELECT
    c.id,
    c.nombre,
    c.creado_por,
    c.created_at,
    c.updated_at,
    c.data,
    COALESCE(
        array_agg(sa.username) FILTER (WHERE sa.username IS NOT NULL),
        ARRAY[]::TEXT[]
    ) AS estudiando_por
FROM carpetas c
LEFT JOIN sesiones_activas sa ON sa.carpeta_id = c.id
    AND sa.last_seen > NOW() - INTERVAL '3 minutes'
GROUP BY c.id, c.nombre, c.creado_por, c.created_at, c.updated_at, c.data;

SELECT 'Base de datos ORION inicializada correctamente.' AS resultado;
SELECT 'Usuarios creados: ' || COUNT(*) FROM usuarios;
SELECT 'Tablas: usuarios, corredores, carpetas, sesiones_activas' AS tablas;
