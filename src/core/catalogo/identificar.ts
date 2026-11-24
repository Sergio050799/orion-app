// IDENTIFICACIÓN DE UN VEHÍCULO EN EL CATÁLOGO (PRE-EMISIÓN)
//
// Regla de negocio: MARCA + MODELO + AÑO + PLAZAS + ACABADO deben llevar siempre a un ID.
// Este módulo lo resuelve por filtros sucesivos, no por parecido difuso de textos:
//
//   1. MARCA    → se localiza la marca del catálogo (alias, erratas, marca metida en el modelo).
//                 Si la marca no existe (carroceros: HERCOV…) se busca el modelo en todas las marcas.
//   2. MODELO   → el modelo del catálogo debe aparecer en el texto del estudio («I 30» = «I30»,
//                 «TGM 15.240» = modelo TGM). Si el estudio solo trae un código («70C18», «1524L»)
//                 se localiza en la versión.
//   3. AÑO      → filtro duro: solo versiones cuyo rango de años cubre el del vehículo. Manda el rango
//                 que haya indicado el sistema de emisión; si no se conoce, el del catálogo.
//   4. PLAZAS   → si se escribieron a mano, filtro duro; si vienen del estudio, preferencia.
//   5. ACABADO  → lo que queda se ordena por potencia, códigos y palabras de la versión, combustible,
//                 tara y tipología. Si queda una sola (o una claramente mejor) se propone sola;
//                 si quedan varias, se devuelven para elegir el acabado.
//
// Módulo puro (sin React, red ni ficheros): recibe las filas del catálogo ya cargadas.

import type { CatalogoVehiculo } from './catalogoDataSource';
import { TIPO_INFO, esTipoKey } from './tipologia';
import { tipoDesdeTexto, VIDA_MAX_VERSION } from './verificacion';
import { anioAceptado, type MapaVentanas } from './ventanasSistema';

export interface VehiculoAIdentificar {
    marca?: string;
    modelo?: string;
    /** tipología del estudio («Furgoneta», «Camión rígido»…) */
    tipo?: string;
    /** año de fabricación del vehículo */
    anyo?: number | null;
    plazas?: number | null;
    /** true si las plazas se escribieron a mano en PRE-EMISIÓN (filtro duro) */
    plazasFirmes?: boolean;
    kw?: number | null;
    combustible?: string;
    /** kg */
    tara?: number | null;
}

export type NivelIdentificacion =
    | 'unico'          // una sola versión cumple todo
    | 'varios'         // varias versiones cumplen: hay que elegir acabado
    | 'fuera_de_anio'  // el modelo existe pero ninguna versión cubre el año del vehículo
    | 'sin_modelo'     // la marca existe, el modelo no se reconoce
    | 'sin_datos';     // no hay marca ni modelo con los que buscar

export interface CandidatoIdentificado extends CatalogoVehiculo {
    /** 0–100: cuánta de la información disponible del vehículo encaja con la versión */
    score: number;
    /** true = el rango de años cubre el del vehículo; false = no; null = no se puede saber */
    cubreAnio: boolean | null;
    /**
     * true si ese año está confirmado: lo dice el sistema de emisión, el catálogo trae fecha de fin, o el
     * vehículo no es posterior a la última actualización de la versión. false = cubre «en teoría» (versión sin
     * fecha de fin y vehículo posterior a su última actualización): el sistema puede rechazarla.
     */
    anioConfirmado: boolean;
}

export interface ResultadoIdentificacion {
    candidatos: CandidatoIdentificado[];
    nivel: NivelIdentificacion;
    /** id de la versión que se puede asignar sin preguntar (única o claramente la mejor); null si hay que elegir */
    auto: string | null;
    /** marca del catálogo que se ha usado ('' si se buscó en todas) */
    marcaCatalogo: string;
}

// ─── Normalización ───────────────────────────────────────────────────────────

const limpia = (s: string | undefined): string =>
    (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const trocea = (s: string): string[] => (s ? s.split(' ') : []);
const conDigito = (t: string) => /\d/.test(t);
const soloDigitos = (t: string) => /^\d+$/.test(t);

/** Palabras del estudio que describen carrocería, uso o color: no son ni modelo ni acabado. */
const RUIDO = new Set([
    'FURGON', 'FURGONETA', 'CAMION', 'TURISMO', 'VAN', 'GRUA', 'CAJA', 'CERRADA', 'ABIERTA', 'BASCULANTE', 'VOLQUETE',
    'ISOTERMO', 'FRIGORIFICO', 'CHASIS', 'CABINA', 'PLATAFORMA', 'CARGA', 'MIXTO', 'COMBI', 'DE', 'CON', 'Y',
    'BLANCO', 'BLANCA', 'ROJO', 'ROJA', 'NEGRO', 'NEGRA', 'AZUL', 'GRIS', 'VERDE', 'NO', 'SERIE',
]);

/** Variantes de marca → marca tal cual está en el catálogo. */
const MARCA_ALIAS: Record<string, string> = {
    'VW': 'VOLKSWAGEN', 'MERCEDES BENZ': 'MERCEDES', 'MB': 'MERCEDES', 'MERC': 'MERCEDES', 'KIA MOTORS': 'KIA',
    'HYUNDAI MOTOR': 'HYUNDAI', 'LANDROVER': 'LAND ROVER', 'RANGE ROVER': 'LAND ROVER', 'ALFA': 'ALFA ROMEO',
    'RENAULT TRUCKS': 'RENAULT', 'RENAULT V I': 'RENAULT', 'RVI': 'RENAULT', 'VOLVO TRUCKS': 'VOLVO',
    'MAN TRUCK': 'MAN', 'DAF TRUCKS': 'DAF', 'CITROEN DS': 'CITROEN',
};
/** «MARCA|dos primeras palabras del modelo» → modelo tal cual está en el catálogo. */
const MODELO_ALIAS: Record<string, string> = {
    'FORD|TRANSIT CUSTOM': 'CUSTOM',
    'FORD|TOURNEO CUSTOM': 'CUSTOM TOURNEO',
};
const SUFIJO_MARCA = / (COMMERCIAL VEHICLES?|TRUCKS? ?BUSES?|TRUCKS?|MOTORS?|MOTOR CO|ESPANA|IBERICA|IBERIA|DE ESPANA|S ?A ?U?)$/;

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array<number>(n + 1), cur = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
            cur[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? prev[j - 1] : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
        }
        [prev, cur] = [cur, prev];
    }
    return prev[n];
}
const parecido = (a: string, b: string) => { const l = Math.max(a.length, b.length); return l === 0 ? 0 : 1 - levenshtein(a, b) / l; };

// ─── Índice del catálogo ─────────────────────────────────────────────────────

interface Fila {
    v: CatalogoVehiculo;
    /** tokens del modelo sin generación («DAILY 2014» → DAILY; «C (204)» → C; «SERIE R» → R) */
    modTok: string[];
    /** modelo compacto (tokens unidos) */
    mod: string;
    /** tokens de la versión */
    verTok: string[];
    /** versión compacta (sin espacios) */
    ver: string;
    /** versión con espacios, para buscar cifras con frontera */
    verTxt: string;
    ini: number;   // 0 = desconocido
    fin: number;   // 0 = sin fin o desconocido
    act: number;   // año de la última actualización en el catálogo (0 = desconocido)
    cat: number;   // categoría (1, 2, 3; 0 = sin clasificar)
}

export interface IndiceCatalogo {
    porMarca: Map<string, Fila[]>;
    todas: Fila[];
    marcas: string[];
}

const anioDeFecha = (s: string | undefined): number => {
    const y = parseInt((s ?? '').substring(0, 4), 10);
    return Number.isFinite(y) && y > 1900 && y < 2090 ? y : 0;
};

function tokensModelo(modelo: string): string[] {
    // fuera paréntesis de generación «(204)», «(212-207)» y asteriscos
    const base = limpia(modelo.replace(/\([^)]*\)/g, ' ').replace(/\*/g, ' '));
    let t = trocea(base);
    // «DAILY 2014», «DAILY 2011»: el año de generación no es parte del nombre (M 2000 / F 2000 sí lo son)
    if (t.length > 1) { const u = parseInt(t[t.length - 1], 10); if (/^\d{4}$/.test(t[t.length - 1]) && u >= 2005 && u <= 2035) t = t.slice(0, -1); }
    if (t.length > 1 && t[0] === 'SERIE') t = t.slice(1);
    return t;
}

export function construirIndice(vehiculos: CatalogoVehiculo[]): IndiceCatalogo {
    const porMarca = new Map<string, Fila[]>();
    const todas: Fila[] = [];
    for (const v of vehiculos) {
        const modTok = tokensModelo(v.modelo);
        const verTxt = limpia(v.version);
        const tipo = esTipoKey(v.tipo) ? v.tipo : 'sin_clasificar';
        const f: Fila = {
            v, modTok, mod: modTok.join(''), verTok: trocea(verTxt), ver: verTxt.replace(/ /g, ''), verTxt: ` ${verTxt} `,
            ini: anioDeFecha(v.fec_ini_comerc), fin: anioDeFecha(v.fec_fin_comerc), act: v.actualizado ?? 0, cat: TIPO_INFO[tipo].categoria,
        };
        todas.push(f);
        const k = limpia(v.marca);
        const b = porMarca.get(k);
        if (b) b.push(f); else porMarca.set(k, [f]);
    }
    return { porMarca, todas, marcas: [...porMarca.keys()] };
}

// ─── 1 · Marca ───────────────────────────────────────────────────────────────

function resolverMarca(idx: IndiceCatalogo, marcaDecl: string, modeloDecl: string): { clave: string; restoMarca: string } {
    let m = limpia(marcaDecl).replace(SUFIJO_MARCA, '').trim();
    if (!m) {
        // sin marca: puede venir delante del modelo («IVECO DAILY 35C13»)
        const t = trocea(limpia(modeloDecl));
        for (let n = Math.min(3, t.length); n >= 1; n--) {
            const c = t.slice(0, n).join(' ');
            const k = MARCA_ALIAS[c] ?? c;
            if (idx.porMarca.has(k)) return { clave: k, restoMarca: '' };
        }
        return { clave: '', restoMarca: '' };
    }
    m = MARCA_ALIAS[m] ?? m;
    if (idx.porMarca.has(m)) return { clave: m, restoMarca: '' };
    // «SCANIA R450», «MERCEDES BENZ ACTROS»: la marca son las primeras palabras; el resto es modelo
    const t = trocea(m);
    for (let n = Math.min(3, t.length - 1); n >= 1; n--) {
        const c = t.slice(0, n).join(' ');
        const k = MARCA_ALIAS[c] ?? c;
        if (idx.porMarca.has(k)) return { clave: k, restoMarca: t.slice(n).join(' ') };
    }
    // errata («PEUGOT», «REANULT»): la marca del catálogo más parecida, si lo es mucho
    if (m.length >= 4) {
        let mejor = '', sim = 0;
        for (const k of idx.marcas) {
            if (Math.abs(k.length - m.length) > 2) continue;
            const s = parecido(m, k);
            if (s > sim) { sim = s; mejor = k; }
        }
        // una transposición («REANULT») cuenta como 2 cambios: se admite hasta 2 en marcas de 6+ letras
        if (mejor && (sim >= 0.8 || (m.length >= 6 && levenshtein(m, mejor) <= 2 && m[0] === mejor[0]))) return { clave: mejor, restoMarca: '' };
    }
    return { clave: '', restoMarca: '' };
}

// ─── 2 · Modelo ──────────────────────────────────────────────────────────────

interface Declarado {
    tok: string[];       // tokens del modelo del estudio, sin marca ni ruido
    codigos: string[];   // códigos con cifras («70C18», «15240», «1524L», «316»)
    palabras: string[];  // resto de palabras (acabado: «CRDI», «SOL», «CUSTOM»)
}

function prepararDeclarado(modeloDecl: string, restoMarca: string, claveMarca: string): Declarado {
    const marcaTok = new Set(trocea(claveMarca));
    const bruto = trocea(limpia(`${restoMarca} ${modeloDecl}`));
    // «NISSAN NISSAN QASHQAI», «MERCEDES BENZ ACTROS»: fuera la marca repetida
    let tok = bruto.filter(t => !marcaTok.has(t) && t !== 'BENZ' && !RUIDO.has(t));
    // Nombres comerciales que el catálogo guarda de otra forma («TRANSIT CUSTOM» es el modelo CUSTOM)
    const alias = MODELO_ALIAS[`${claveMarca}|${tok.slice(0, 2).join(' ')}`];
    if (alias) tok = [...alias.split(' '), ...tok.slice(2)];
    const codigos = new Set<string>();
    for (let i = 0; i < tok.length; i++) {
        const t = tok[i];
        if (conDigito(t) && t.length >= 3) codigos.add(t);
        // «R450», «XF460»: la cifra de potencia también es código por sí sola
        const lt = t.match(/^[A-Z]{1,3}(\d{3,4})$/);
        if (lt) codigos.add(lt[1]);
        // «ML180E28»: el catálogo lo guarda como «180 E 28 ML» → se prueba también sin las letras iniciales
        const sinPrefijo = t.match(/^[A-Z]{1,3}(\d[A-Z0-9]{3,})$/);
        if (sinPrefijo && /[A-Z]/.test(sinPrefijo[1])) codigos.add(sinPrefijo[1]);
        // «15.240» llega como «15» «240»; «70 C 18» como «70» «C» «18»: se prueban también unidos
        if (i + 1 < tok.length && soloDigitos(t) && soloDigitos(tok[i + 1]) && (t + tok[i + 1]).length >= 4) codigos.add(t + tok[i + 1]);
        if (i + 2 < tok.length && soloDigitos(t) && /^[A-Z]{1,2}$/.test(tok[i + 1]) && soloDigitos(tok[i + 2])) codigos.add(t + tok[i + 1] + tok[i + 2]);
    }
    const palabras = tok.filter(t => !conDigito(t) && t.length >= 2);
    return { tok, codigos: [...codigos], palabras };
}

/** 0 = el modelo del catálogo no aparece en el estudio; 100 = coincide al principio; 85 = aparece dentro. */
function nivelModelo(f: Fila, d: Declarado, compacto: string): number {
    const mt = f.modTok;
    if (mt.length === 0 || d.tok.length === 0) return 0;
    // a) los tokens del modelo son los primeros del estudio («TRANSIT CUSTOM 280» ↔ TRANSIT CUSTOM)
    let igual = mt.length <= d.tok.length;
    for (let i = 0; igual && i < mt.length; i++) if (mt[i] !== d.tok[i]) igual = false;
    if (igual) return 100;
    // b) lo mismo sin espacios («I 30» ↔ I30, «NV400» ↔ NV 400), con frontera al final del modelo
    if (f.mod.length >= 3 && compacto.startsWith(f.mod)) {
        let acc = 0;
        for (const t of d.tok) { acc += t.length; if (acc === f.mod.length) return 98; if (acc > f.mod.length) break; }
        // «SPRINTER316» pegado: se admite si lo que sigue es una cifra
        if (/\d/.test(compacto[f.mod.length] ?? '') && !/\d$/.test(f.mod)) return 90;
        // modelos que son un código («AS440» en «AS440ST/P»)
        if (f.mod.length >= 5 && /\d/.test(f.mod) && /[A-Z]/.test(f.mod)) return 88;
    }
    // c) el modelo aparece más adelante en el texto («GRUA TGM 18.280», «CABINA DAILY»)
    if (f.mod.length >= 3) {
        for (let i = 1; i < d.tok.length; i++) {
            let acc = '';
            for (let j = i; j < d.tok.length && acc.length < f.mod.length; j++) acc += d.tok[j];
            if (acc === f.mod) return 85;
        }
    }
    // d) modelos de una o dos letras (Renault D, Mercedes C/E/S, Scania R): «D7», «C220», «R450»
    if (f.mod.length <= 2 && /^[A-Z]+$/.test(f.mod)) {
        const t0 = d.tok[0];
        if (t0.startsWith(f.mod) && /^\d/.test(t0.slice(f.mod.length))) {
            // «N320» no es el modelo N si ninguna versión lleva «320»: la letra sola no basta
            const cifra = t0.slice(f.mod.length).match(/^\d+/)![0];
            if (f.verTxt.includes(` ${cifra}`) || f.ver.startsWith(cifra)) return 80;
        }
    }
    return 0;
}

/** Nº de códigos del estudio que aparecen en la versión. Las cifras sueltas exigen frontera («316» no vale en «3160»). */
function aciertosCodigo(f: Fila, codigos: string[]): number {
    let n = 0;
    for (const c of codigos) {
        if (soloDigitos(c)) {
            const i = f.verTxt.indexOf(c);
            if (i >= 0) {
                // frontera: antes y después no puede haber otra cifra
                let ok = false;
                for (let p = i; p >= 0 && !ok; p = f.verTxt.indexOf(c, p + 1)) {
                    const a = f.verTxt[p - 1] ?? ' ', b = f.verTxt[p + c.length] ?? ' ';
                    if (!/\d/.test(a) && !/\d/.test(b)) ok = true;
                    if (p + 1 >= f.verTxt.length) break;
                }
                if (ok) { n++; continue; }
            }
            // «15240» ↔ versión «15 240»
            if (c.length >= 4 && f.ver.startsWith(c)) n++;
        } else if (f.ver.includes(c) || f.verTok.includes(c)) n++;
    }
    return n;
}

// ─── 3 · Año ─────────────────────────────────────────────────────────────────

function cubre(f: Fila, anyo: number | null | undefined, ventanas?: MapaVentanas): { cubre: boolean | null; exacta: boolean } {
    if (!anyo) return { cubre: null, exacta: false };
    const w = ventanas?.[f.v.id_veh];
    if (w && w.fabMin) return { cubre: anyo >= w.fabMin && anyo <= w.fabMax, exacta: true };
    if (anioAceptado(w, anyo)) return { cubre: true, exacta: true };   // año ya aceptado por el sistema para esta ID
    if (!f.ini && !f.fin) return { cubre: null, exacta: false };
    if (f.ini && anyo < f.ini) return { cubre: false, exacta: false };
    if (f.fin && anyo > f.fin) return { cubre: false, exacta: false };
    return { cubre: true, exacta: false };
}

function distanciaAnio(f: Fila, anyo: number, ventanas?: MapaVentanas): number {
    const w = ventanas?.[f.v.id_veh];
    const ini = w?.fabMin || f.ini, fin = w?.fabMin ? w.fabMax : f.fin;
    if (ini && anyo < ini) return ini - anyo;
    if (fin && anyo > fin) return anyo - fin;
    return 0;
}

// ─── Combustible ─────────────────────────────────────────────────────────────

function grupoCombustible(c: string | undefined): string {
    const u = limpia(c);
    if (!u) return '';
    if (u.length === 1) return ['D', 'Y', 'R'].includes(u) ? 'D' : ['G', 'X', 'P'].includes(u) ? 'G' : ['E', 'Z'].includes(u) ? 'E' : u;
    if (/DIES|GASOL(EO|ÉO)|GASOIL/.test(u)) return 'D';
    if (/GASOLINA|BENZIN|PETROL/.test(u)) return 'G';
    if (/ELECTR/.test(u)) return 'E';
    return u[0];
}

// ─── Identificación ──────────────────────────────────────────────────────────

const MAX_CANDIDATOS = 12;

export function identificar(idx: IndiceCatalogo, d: VehiculoAIdentificar, ventanas?: MapaVentanas): ResultadoIdentificacion {
    const vacio = (nivel: NivelIdentificacion, marcaCatalogo = ''): ResultadoIdentificacion => ({ candidatos: [], nivel, auto: null, marcaCatalogo });
    const marcaTxt = (d.marca ?? '').trim(), modeloTxt = (d.modelo ?? '').trim();
    if (!marcaTxt && !modeloTxt) return vacio('sin_datos');

    // 1 · Marca
    const { clave, restoMarca } = resolverMarca(idx, marcaTxt, modeloTxt);
    const dec = prepararDeclarado(modeloTxt, restoMarca, clave);
    if (dec.tok.length === 0) return vacio(clave ? 'sin_modelo' : 'sin_datos', clave);
    const compacto = dec.tok.join('');
    const pool = clave ? (idx.porMarca.get(clave) ?? []) : idx.todas;

    // 2 · Modelo (y, si no hay modelo reconocible, código en la versión)
    interface Parcial { f: Fila; nivel: number; cod: number }
    let parciales: Parcial[] = [];
    let mejorNivel = 0;
    for (const f of pool) {
        const nivel = nivelModelo(f, dec, compacto);
        if (nivel === 0) continue;
        if (nivel > mejorNivel) mejorNivel = nivel;
        parciales.push({ f, nivel, cod: 0 });
    }
    const anyoSel = d.anyo && d.anyo > 1900 ? d.anyo : null;
    if (parciales.length > 0) {
        // Varios modelos del catálogo pueden encajar («C 220 (202)» de 1993 y «C (204)» de 2007 para un «C220»;
        // «TRANSIT» y «TRANSIT CUSTOM»). Se elige el que mejor coincide y es más específico, pero entre los
        // que tienen alguna versión que cubre el año del vehículo: el año manda sobre el nombre.
        const clavesGrupo = (p: Parcial) => p.f.modTok.join(' ');
        const grupos = new Map<string, { nivel: number; largo: number; cubre: boolean; filas: Parcial[] }>();
        for (const p of parciales) {
            const k = clavesGrupo(p);
            let g = grupos.get(k);
            if (!g) { g = { nivel: p.nivel, largo: p.f.mod.length, cubre: false, filas: [] }; grupos.set(k, g); }
            if (p.nivel > g.nivel) g.nivel = p.nivel;
            if (!g.cubre && cubre(p.f, anyoSel, ventanas).cubre !== false) g.cubre = true;
            g.filas.push(p);
        }
        let lista = [...grupos.values()];
        const conAnioOk = lista.filter(g => g.cubre);
        if (anyoSel && conAnioOk.length > 0) lista = conAnioOk;
        const nivelTop = Math.max(...lista.map(g => g.nivel));
        // se consideran equivalentes los niveles «coincide al principio» (98–100)
        const mejores = lista.filter(g => g.nivel >= Math.min(nivelTop, 98) - (nivelTop >= 98 ? 0 : 0) && g.nivel >= nivelTop - 2);
        const largo = Math.max(...mejores.map(g => g.largo));
        parciales = mejores.filter(g => g.largo === largo).flatMap(g => g.filas);
        mejorNivel = nivelTop;
        for (const p of parciales) p.cod = aciertosCodigo(p.f, dec.codigos);
    } else if (dec.codigos.length > 0 && (clave || dec.codigos.some(c => c.length >= 5 && /[A-Z]/.test(c) && /\d/.test(c)))) {
        // Sin modelo reconocible pero con código: «IVECO 70C18» → DAILY 70C18; «MERCEDES 1524L» → ATEGO 1524 L
        // (sin marca conocida solo valen códigos largos con letras y cifras: «70C18»)
        const codigos = clave ? dec.codigos : dec.codigos.filter(c => c.length >= 5 && /[A-Z]/.test(c) && /\d/.test(c));
        let maxCod = 0;
        for (const f of pool) {
            const cod = aciertosCodigo(f, codigos);
            if (cod === 0) continue;
            if (cod > maxCod) maxCod = cod;
            parciales.push({ f, nivel: 60, cod });
        }
        parciales = parciales.filter(p => p.cod === maxCod);
    } else if (clave) {
        // Errata en el modelo («MIDLUN»): el modelo del catálogo más parecido al primer token del estudio
        const t0 = dec.tok[0];
        if (t0.length >= 4 && !conDigito(t0)) {
            const vistos = new Map<string, number>();
            for (const f of pool) {
                const m0 = f.modTok[0] ?? '';
                if (!m0 || Math.abs(m0.length - t0.length) > 2) continue;
                let s = vistos.get(m0);
                if (s === undefined) { s = parecido(t0, m0); vistos.set(m0, s); }
                if (s >= 0.8) parciales.push({ f, nivel: 55, cod: aciertosCodigo(f, dec.codigos) });
            }
        }
    }
    // Último recurso: el estudio trae un código de homologación en vez del modelo («N323», «BAEC/CA11»,
    // «L 2007 46 001»). Si se conocen marca, potencia y año, se proponen las versiones de esa marca con
    // esa potencia (±3 %), de la misma categoría y que cubren el año. Nunca se asigna sola.
    let porPotencia = false;
    if (parciales.length === 0 && clave && d.kw && d.kw > 0) {
        const tipoD = tipoDesdeTexto(d.tipo);
        const catD = tipoD ? TIPO_INFO[tipoD].categoria : 0;
        for (const f of pool) {
            if (!(f.v.kw > 0) || Math.abs(d.kw - f.v.kw) / f.v.kw > 0.03) continue;
            if (catD && f.cat && f.cat !== catD) continue;
            if (f.v.tipo === 'minibus_autocar' && tipoD !== 'minibus_autocar') continue;
            if (anyoSel && cubre(f, anyoSel, ventanas).cubre === false) continue;
            parciales.push({ f, nivel: 40, cod: 0 });
        }
        porPotencia = parciales.length > 0;
    }
    if (parciales.length === 0) return vacio('sin_modelo', clave);

    // 3 · Año (filtro duro)
    const anyo = anyoSel;
    const conAnio = parciales.map(p => ({ ...p, a: cubre(p.f, anyo, ventanas) }));
    let fuera = false;
    let vivos = conAnio;
    if (anyo) {
        const dentro = conAnio.filter(p => p.a.cubre !== false);
        if (dentro.length > 0) vivos = dentro;
        else fuera = true;
    }

    // 4 · Plazas escritas a mano (filtro duro, si deja algo)
    const plazas = d.plazas != null && d.plazas >= 0 ? d.plazas : null;
    const enPlazas = (f: Fila) => {
        if (plazas === null) return true;
        const min = f.v.num_plazas_min || f.v.num_plazas_max, max = f.v.num_plazas_max || f.v.num_plazas_min;
        return plazas >= Math.min(min, max) && plazas <= Math.max(min, max);
    };
    if (plazas !== null && d.plazasFirmes) {
        const ok = vivos.filter(p => enPlazas(p.f));
        if (ok.length > 0) vivos = ok;
    }

    // 5 · Acabado: ordenar por lo que se sabe del vehículo
    const tipoDecl = tipoDesdeTexto(d.tipo);
    const catDecl = tipoDecl ? TIPO_INFO[tipoDecl].categoria : 0;
    const kw = d.kw && d.kw > 0 ? d.kw : null;
    const comb = grupoCombustible(d.combustible);
    const tara = d.tara && d.tara > 0 ? d.tara : null;
    const maxCod = dec.codigos.length, maxPal = dec.palabras.length;

    type ConAnio = (typeof conAnio)[number];
    const puntuar = (p: ConAnio) => {
        const f = p.f;
        let s = p.nivel * 10, max = 1000;
        // códigos y palabras de la versión
        s += p.cod * 120; max += maxCod * 120;
        let pal = 0;
        for (const w of dec.palabras) if (!f.modTok.includes(w) && (f.verTok.includes(w) || (w.length >= 4 && f.ver.includes(w)))) pal++;
        const palPosibles = dec.palabras.filter(w => !f.modTok.includes(w)).length;
        s += pal * 25; max += Math.min(maxPal, palPosibles) * 25;
        // potencia
        let kwFuerte = false, sinConfirmar = false;
        if (kw && f.v.kw > 0) {
            max += 60;
            const dif = Math.abs(kw - f.v.kw) / f.v.kw;
            if (dif <= 0.012) { s += 60; kwFuerte = true; } else if (dif <= 0.03) { s += 48; kwFuerte = true; } else if (dif <= 0.08) s += 30; else if (dif <= 0.15) s += 10; else s -= 30;
        }
        // tipología y categoría del estudio
        if (tipoDecl && f.cat > 0) {
            max += 80;
            if (f.cat === catDecl) s += 60;
            if (f.v.tipo === tipoDecl) s += 20;
            if (f.v.tipo === 'minibus_autocar' && tipoDecl !== 'minibus_autocar') s -= 60;
        }
        // plazas del estudio (preferencia)
        if (plazas !== null && !d.plazasFirmes) { max += 30; s += enPlazas(f) ? 30 : -15; }
        // combustible y tara
        if (comb && f.v.combustible) { max += 15; if (grupoCombustible(f.v.combustible) === comb) s += 15; }
        if (tara && f.v.tara > 0) { max += 15; if (Math.abs(tara - f.v.tara) / f.v.tara <= 0.05) s += 15; }
        // año: rango exacto del sistema > rango cerrado del catálogo > rango abierto (cuanto más reciente la generación, mejor)
        if (anyo) {
            max += 30;
            const remolque = f.v.tipo === 'remolque';   // entradas genéricas: el sistema las admite para cualquier año
            if (p.a.cubre === true) {
                if (p.a.exacta) s += 30;                                    // rango exacto del sistema de emisión
                else if (f.fin) s += 24;                                    // rango cerrado en el catálogo
                else if (remolque) s += 20;
                else if (f.act > 0 && anyo <= f.act) s += Math.max(-40, 20 - 4 * Math.max(0, anyo - f.ini));   // vigente a esa fecha según el catálogo; cuanto más antigua la versión, peor
                else if (f.act > 0) { s -= 30 + 25 * Math.min(6, anyo - f.act) + 4 * Math.min(15, Math.max(0, anyo - f.ini)); sinConfirmar = true; }   // posterior a la última actualización: puede estar cerrada (y cuanto más antigua, peor)
                else if (anyo - f.ini > VIDA_MAX_VERSION) { s -= 40; sinConfirmar = true; }
                else s += Math.max(4, 16 - Math.max(0, anyo - f.ini));
            } else if (p.a.cubre === false) s -= 20 * Math.min(5, distanciaAnio(f, anyo, ventanas));
        }
        return { p, s, max, kwFuerte, sinConfirmar };
    };
    let puntuados = vivos.map(puntuar);

    // «El año manda»: si ninguna versión del modelo reconocido tiene el año confirmado y el estudio trae un
    // código («FT 480», «N320»…), se buscan en la marca las versiones con ese código cuyo año SÍ está confirmado
    // (p. ej. la DAF XG 480 FT de 2021 para un «DAF FT 480» de 2022) y se proponen primero.
    let alternativas = false;
    if (anyo && clave && dec.codigos.length > 0 && !puntuados.some(x => x.p.a.cubre === true && !x.sinConfirmar)) {
        const yaEsta = new Set(puntuados.map(x => x.p.f.v.id_veh));
        const extra: ConAnio[] = [];
        let maxC = 0;
        for (const f of pool) {
            if (yaEsta.has(f.v.id_veh)) continue;
            const a = cubre(f, anyo, ventanas);
            if (a.cubre !== true) continue;
            if (!a.exacta && !f.fin && !(f.act > 0 && anyo <= f.act)) continue;      // solo año confirmado
            if (catDecl && f.cat && f.cat !== catDecl) continue;
            if (f.v.tipo === 'minibus_autocar' && tipoDecl !== 'minibus_autocar') continue;
            const cod = aciertosCodigo(f, dec.codigos);
            if (cod === 0) continue;
            if (cod > maxC) maxC = cod;
            extra.push({ f, nivel: 60, cod, a });
        }
        const buenos = extra.filter(e => e.cod === maxC).map(puntuar).filter(x => !x.sinConfirmar);
        if (buenos.length > 0) { puntuados = [...buenos, ...puntuados]; alternativas = true; }
    }

    const confirmada = (x: (typeof puntuados)[number]) => (x.p.a.cubre === true && !x.sinConfirmar ? 1 : 0);
    puntuados.sort((a, b) => (alternativas ? confirmada(b) - confirmada(a) : 0) || b.s - a.s
        || (anyo ? distanciaAnio(a.p.f, anyo, ventanas) - distanciaAnio(b.p.f, anyo, ventanas) : 0)
        || b.p.f.ini - a.p.f.ini
        || (a.p.f.v.id_veh < b.p.f.v.id_veh ? -1 : 1));

    const top = puntuados.slice(0, MAX_CANDIDATOS);
    const candidatos: CandidatoIdentificado[] = top.map(x => ({
        ...x.p.f.v,
        score: Math.max(1, Math.min(100, Math.round((x.s / x.max) * 100))),
        cubreAnio: x.p.a.cubre,
        anioConfirmado: x.p.a.cubre === true && !x.sinConfirmar,
    }));

    // ¿Se puede asignar sin preguntar? Solo dentro de año y sin ambigüedad.
    let auto: string | null = null;
    // Sin año no se puede comprobar la regla «ID = AÑO»: nunca se asigna sola.
    if (!fuera && anyo && puntuados.length > 0) {
        const a = puntuados[0], b = puntuados[1];
        const plazasOk = plazas === null || enPlazas(a.p.f);
        if (a.sinConfirmar || a.p.nivel < 80 || porPotencia || alternativas) auto = null;
        else if (!b) auto = a.p.f.v.id_veh;
        else if (plazasOk && a.s - b.s >= 55 && (a.kwFuerte || a.p.cod > 0)) auto = a.p.f.v.id_veh;
    }

    return {
        candidatos,
        nivel: fuera ? 'fuera_de_anio' : puntuados.length === 1 ? 'unico' : 'varios',
        auto,
        marcaCatalogo: clave ? (idx.porMarca.get(clave)?.[0]?.v.marca ?? '') : '',
    };
}
