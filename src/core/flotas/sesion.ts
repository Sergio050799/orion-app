// ─── J-5: GUARDADO DE SESIÓN EN LOCALSTORAGE ─────────────────────────────────

export type Row = Record<string, string | number | null>;

export interface CoberturaAsignacion {
    matricula:   string;
    producto:    string;
    categoria:   1 | 2;
    prima?:      number;
    [key: string]: unknown;
}

export interface FlotaSession {
    id:               string;
    nombre:           string;
    creadaEn:         string;
    original:         Row[];
    trabajo:          Row[];
    sincoPrep:        Row[];
    sincoResultados:  Row[];
    coberturas:       CoberturaAsignacion[];
}

const KEY_PREFIX = 'orion_flota_';
const INDEX_KEY  = 'orion_flota_index';

function getIndex(): string[] {
    try {
        return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]');
    } catch {
        return [];
    }
}

function setIndex(ids: string[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
}

export function guardarSesion(session: FlotaSession): void {
    localStorage.setItem(KEY_PREFIX + session.id, JSON.stringify(session));
    const index = getIndex();
    if (!index.includes(session.id)) {
        index.push(session.id);
        setIndex(index);
    }
}

export function cargarSesion(id: string): FlotaSession | null {
    try {
        const raw = localStorage.getItem(KEY_PREFIX + id);
        return raw ? (JSON.parse(raw) as FlotaSession) : null;
    } catch {
        return null;
    }
}

export function listarSesiones(): FlotaSession[] {
    return getIndex()
        .map(id => cargarSesion(id))
        .filter((s): s is FlotaSession => s !== null);
}

export function eliminarSesion(id: string): void {
    localStorage.removeItem(KEY_PREFIX + id);
    setIndex(getIndex().filter(i => i !== id));
}
