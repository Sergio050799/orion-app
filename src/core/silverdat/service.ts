/**
 * Silverdat (fastVALUATE MMT) — Server-side service
 *
 * Manages login session and vehicle queries against Silverdat's PHP endpoints.
 * Cookie is stored in memory only — never persisted to disk.
 *
 * Flow per matrícula (discovered from Network capture):
 *   1. duplicado.php        — kickstart, checks duplicates
 *   2. consultaMatricula.php — basic vehicle data + ITV fields
 *   3. consultaVin.php      — data by VIN (from step 2)
 *   4. cargarLibroVin.php   — detailed tech sheet
 *   5. consultar.php        — full result with XML + pricing
 */

import { normalizeTipoVehiculo } from "@/core/flotas/normalizador";

const BASE = "https://www.silverdat.es/fastValuate_facelift";

// ─── In-memory session ──────────────────────────────────────────────────────

interface SilverdatSession {
  cookie: string;
  loggedInAt: number;
  datId: string;
}

// Store session on globalThis so it survives Next.js dev recompilations
const g = globalThis as unknown as { __silverdatSession?: SilverdatSession | null };
if (g.__silverdatSession === undefined) g.__silverdatSession = null;

function getSession(): SilverdatSession | null { return g.__silverdatSession ?? null; }
function setSession(s: SilverdatSession | null) { g.__silverdatSession = s; }

const SESSION_TTL = 30 * 60 * 1000; // 30 min

export function hasSession(): boolean {
  const session = getSession();
  if (!session) return false;
  if (Date.now() - session.loggedInAt > SESSION_TTL) {
    setSession(null);
    return false;
  }
  return true;
}

export function clearSession() {
  setSession(null);
}

// ─── Shared fetch helper ────────────────────────────────────────────────────

function sdHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Cookie": getSession()!.cookie,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": `${BASE}/`,
    "X-Requested-With": "XMLHttpRequest",
    ...extra,
  };
}

async function sdFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { ...sdHeaders(), ...(init?.headers as Record<string, string> ?? {}) },
    });
    // Merge any new cookies back into session
    const newCookies = extractCookies(res);
    const sess = getSession();
    if (newCookies && sess) {
      sess.cookie = mergeCookies(sess.cookie, newCookies);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Login ──────────────────────────────────────────────────────────────────

export async function login(datId: string, user: string, pass: string): Promise<{ ok: boolean; error?: string; debug?: string }> {
  const ROOT = "https://www.silverdat.es";

  try {
    // Step 1: GET login page → initial PHPSESSID
    const initRes = await fetch(`${ROOT}/`, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });

    let cookies = extractCookies(initRes);

    // Step 2: AJAX POST to login.php
    // Discovered from Network capture:
    //   POST login.php  (xhr, 200, 0.3kB)
    //   Form Data: customerNumber=3300671 & userName=tecniarea & password=xxx
    const loginBody = new URLSearchParams({
      customerNumber: datId,
      userName: user,
      password: pass,
    });

    const loginRes = await fetch(`${ROOT}/login.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `${ROOT}/`,
        "Origin": ROOT,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: loginBody.toString(),
    });

    const loginCookies = extractCookies(loginRes);
    if (loginCookies) cookies = mergeCookies(cookies, loginCookies);

    const loginText = await loginRes.text();
    const loginStatus = loginRes.status;

    // DEBUG: return what login.php actually said
    const debugInfo = `login.php status=${loginStatus} body="${loginText.substring(0, 300)}" cookies="${loginCookies?.substring(0, 200) || 'none'}"`;

    // login.php might return "0" for failure or "1"/redirect URL for success
    const trimmed = loginText.trim();
    if (trimmed === "0" || trimmed.toLowerCase() === "false") {
      return { ok: false, error: "Credenciales incorrectas", debug: debugInfo };
    }

    // Step 3: Navigate to fastValuate dashboard to establish session there
    const dashRes = await fetch(`${BASE}/`, {
      method: "GET",
      redirect: "manual",
      headers: {
        "Cookie": cookies,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `${ROOT}/`,
      },
    });

    const dashCookies = extractCookies(dashRes);
    if (dashCookies) cookies = mergeCookies(cookies, dashCookies);

    // If we got redirected back to login → session didn't stick
    const dashLocation = dashRes.headers.get("location") || "";
    const dashStatus = dashRes.status;
    if (dashStatus === 302 && (dashLocation.includes("index.php") || dashLocation === "../" || !dashLocation.includes("fastValuate"))) {
      return { ok: false, error: "Sesión no establecida tras login", debug: debugInfo + ` | dash status=${dashStatus} location="${dashLocation}"` };
    }

    setSession({ cookie: cookies, loggedInAt: Date.now(), datId });
    return { ok: true, debug: debugInfo };
  } catch (err: any) {
    return { ok: false, error: err.message || "Error de conexión con Silverdat" };
  }
}

// ─── Query by matrícula ─────────────────────────────────────────────────────

export interface SilverdatVehicle {
  matricula: string;
  // Identificación
  vin?: string;
  marca?: string;
  modelo?: string;         // "3008 STYLE BLUEHDI 130"
  version?: string;        // "Style"
  variante?: string;       // "3008 1.5 BlueHDi 130 FAP Style (EURO 6d-TEMP)"
  // Técnicos
  combustible?: string;    // "Diesel"
  kw?: number;             // 96
  cv?: number;             // 131
  cilindrada?: number;     // 1499
  plazas?: number;         // 5
  puertas?: number;        // 5
  tara?: number;           // kg
  // Fechas
  anyo_fabricacion?: string;  // "09/2020"
  fecha_matriculacion?: string;
  // Valoración
  kilometraje?: number;
  precio_nuevo?: number;
  precio_nuevo_total?: number;
  valor_venta?: number;
  valor_compra?: number;
  // DGT
  tipo_vehiculo?: string;  // "TURISMO"
  etiqueta_dgt?: string;   // "C"
  co2?: number;
  euro?: string;           // "EURO 6AM"
  renting?: string;        // "N"/"S"
  num_titulares?: number;
  servicio?: string;       // "Particular"
  tipo_alimentacion?: string; // "Monocombustible"
  distancia_ejes?: number;
  // Visual
  color?: string;
  tipo_cambio?: string;    // "manual / 6 velocidades"
  // Internal
  datecode?: string;
  imagen_url?: string;
  raw_xml?: string;
  raw_mat?: any;           // full consultaMatricula response for debugging
}

export async function queryByMatricula(matricula: string): Promise<{ ok: boolean; vehicle?: SilverdatVehicle; error?: string; debug?: string }> {
  if (!hasSession()) {
    return { ok: false, error: "No hay sesión Silverdat activa" };
  }

  const plate = matricula.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  try {
    // ── Step 1: duplicado.php (required kickstart) ──────────────────────
    const dupRes = await sdFetch(
      `${BASE}/duplicado.php?vin=&matricula=${encodeURIComponent(plate)}&boton=consultar`
    );
    const dupStatus = dupRes.status;
    const dupText = await dupRes.text();
    console.log(`[Silverdat][${plate}] duplicado.php status=${dupStatus} body="${dupText.substring(0, 300)}"`);

    // ── Step 2: consultaMatricula.php ───────────────────────────────────
    const matRes = await sdFetch(
      `${BASE}/consultaMatricula.php?matricula=${encodeURIComponent(plate)}&searchByMat=true`
    );
    const matText = await matRes.text();
    console.log(`[Silverdat][${plate}] consultaMatricula.php status=${matRes.status} body="${matText.substring(0, 500)}"`);

    let matData: any = null;
    try { matData = JSON.parse(matText); } catch { /* not JSON */ }

    if (!matData) {
      return { ok: false, error: "Respuesta no válida de consultaMatricula", debug: `status=${matRes.status} body="${matText.substring(0, 300)}"` };
    }

    // error field: 0 = OK, anything else = error
    // BUT: if there's an error code yet still has vehicle data (secondary report), continue with what we have
    if (matData.error && matData.error !== 0 && matData.error !== "0") {
      const hasUsefulData = matData.marca || matData.MARCA_ITV || matData.vin || matData.BASTIDOR_ITV || matData.modelo || matData.MODELO_ITV;
      if (!hasUsefulData) {
        return { ok: false, error: `Silverdat error: ${matData.error}`, debug: `matData.error=${matData.error} keys=${Object.keys(matData).join(',')}` };
      }
      // Secondary report: has error but also has data — extract what we can
    }

    // ── Step 3: consultaVin.php (if VIN available) ──────────────────────
    // Commercial vehicles may only provide VIN in BASTIDOR_ITV, not matData.vin
    let vinData: any = null;
    const vinForLookup = matData.vin || matData.BASTIDOR_ITV;
    if (vinForLookup) {
      const vinRes = await sdFetch(
        `${BASE}/consultaVin.php?vin=${encodeURIComponent(vinForLookup)}&searchByVin=true`
      );
      vinData = await vinRes.json().catch(() => null);
    }

    // ── Step 4: cargarLibroVin.php ──────────────────────────────────────
    let libroData: any = null;
    try {
      const libroRes = await sdFetch(`${BASE}/cargarLibroVin.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      libroData = await libroRes.json().catch(() => null);
    } catch { /* optional step */ }

    // ── Step 5: consultar.php — full result ─────────────────────────────
    // This endpoint requires a large POST body with data from previous steps
    let fullData: any = null;
    try {
      const consultarBody = new URLSearchParams();
      consultarBody.set("error_seleccion_manual", "0");
      consultarBody.set("matricula", plate);
      consultarBody.set("vin", matData?.vin || matData?.BASTIDOR_ITV || "");
      consultarBody.set("datecode", vinData?.datecode || matData?.datecode || "");
      consultarBody.set("container", vinData?.container || matData?.container || "");
      consultarBody.set("constructionTime", vinData?.constructionTime || matData?.constructionTime || "");
      consultarBody.set("fechamatriculacion", matData?.fechamatriculacion || matData?.FECHA_MATRICULACION_ITV || "");
      consultarBody.set("kilometraje", "");
      consultarBody.set("equipamiento", vinData?.equipamiento || "");
      consultarBody.set("pid", "");
      consultarBody.set("combustible", matData?.combustible || "");
      consultarBody.set("emisiones", matData?.tarjetaEmisiones || "");
      consultarBody.set("incidencia", "");
      consultarBody.set("color", vinData?.color || "");
      consultarBody.set("previsionEntradaMeses", "0");
      consultarBody.set("consultaManual", "0");
      consultarBody.set("marca_dgt", matData?.marca || "");
      consultarBody.set("modelo_dgt", matData?.modelo || "");
      consultarBody.set("combustible_dgt", matData?.combustible || "");
      consultarBody.set("vin_dgt", matData?.vin || matData?.BASTIDOR_ITV || "");
      consultarBody.set("fechamatriculacion_dgt", matData?.fechamatriculacion_dat || matData?.FECHA_MATRICULACION_ITV || "");
      consultarBody.set("datosTaller", "");
      consultarBody.set("tarjetaEmisiones", matData?.tarjetaEmisiones || "");
      consultarBody.set("canalTasacion", "");
      consultarBody.set("equipamiento_manual", "");
      consultarBody.set("esPrimeraMatriculacion", "0");
      consultarBody.set("consultaVinLight", "0");
      consultarBody.set("precioEquipamiento", "");
      consultarBody.set("segunda_llave", "");
      consultarBody.set("fechavaloracion", "");
      consultarBody.set("resultado_VIN", "");
      consultarBody.set("consultaDGT", "1");
      consultarBody.set("vinActive", "1");

      const consultarRes = await sdFetch(`${BASE}/consultar.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: consultarBody.toString(),
      });
      fullData = await consultarRes.json().catch(() => null);
    } catch { /* optional step */ }

    // ── Parse combined data ─────────────────────────────────────────────
    const vehicle = parseVehicleData(plate, matData, vinData, libroData, fullData);

    // Debug: log what each endpoint returned
    const debugParts = [
      `matData: ${matData ? Object.keys(matData).length + ' keys' : 'null'}`,
      `vinData: ${vinData ? Object.keys(vinData).length + ' keys' : 'null'}`,
      `libroData: ${libroData ? (typeof libroData === 'object' ? Object.keys(libroData).length + ' keys' : typeof libroData) : 'null'}`,
      `fullData: ${fullData ? Object.keys(fullData).length + ' keys' : 'null'}`,
      `fullData.XML: ${fullData?.XML ? fullData.XML.length + ' chars' : 'none'}`,
    ];

    return { ok: true, vehicle, debug: debugParts.join(' | ') };

  } catch (err: any) {
    return { ok: false, error: err.message || "Error consultando Silverdat" };
  }
}

// ─── Parse helpers ──────────────────────────────────────────────────────────

function parseVehicleData(
  matricula: string,
  matData: any,
  vinData: any,
  libroData: any,
  fullData: any,
): SilverdatVehicle {
  const v: SilverdatVehicle = { matricula };

  // Save raw for debugging
  v.raw_mat = matData;

  // ── From consultaMatricula.php (DGT data + basic vehicle) ─────────────
  if (matData) {
    v.vin = matData.vin || matData.BASTIDOR_ITV || undefined;
    v.marca = matData.marca || matData.MARCA_ITV || undefined;
    v.modelo = matData.modelo || matData.MODELO_ITV || undefined;
    v.combustible = matData.combustible || matData.COD_PROPULSION_ITV || undefined;
    v.etiqueta_dgt = matData.tarjetaEmisiones || undefined;
    v.tipo_vehiculo = matData.COD_TIPO || undefined;
    v.fecha_matriculacion = matData.fechamatriculacion_dat || matData.fechamatriculacion || matData.FECHA_MATRICULACION_ITV || undefined;

    // DGT fields — exact field names from consultaMatricula.php response
    if (matData.CILINDRADA_ITV) v.cilindrada = parseInt(matData.CILINDRADA_ITV) || undefined;
    if (matData.NUM_TITULARES) v.num_titulares = parseInt(matData.NUM_TITULARES) || undefined;
    if (matData.KW_ITV) v.kw = parseFloat(matData.KW_ITV) || undefined;
    if (matData.NUM_PLAZAS_MAX) v.plazas = parseInt(matData.NUM_PLAZAS_MAX) || undefined;
    if (matData.CO2_ITV) v.co2 = parseFloat(matData.CO2_ITV) || undefined;
    if (matData.NIVEL_EMISIONES_EURO_ITV) v.euro = matData.NIVEL_EMISIONES_EURO_ITV;
    if (matData.RENTING) v.renting = matData.RENTING;
    if (matData.SERVICIO) v.servicio = matData.SERVICIO;
    if (matData.TIPO_ALIMENTACION_ITV) v.tipo_alimentacion = matData.TIPO_ALIMENTACION_ITV;
    if (matData.DISTANCIA_EJES_12_ITV) v.distancia_ejes = parseInt(matData.DISTANCIA_EJES_12_ITV) || undefined;

    // Some responses have potencia as "96.00" string (fallback)
    if (!v.kw && matData.potencia) v.kw = parseFloat(matData.potencia) || undefined;
  }

  // ── From consultaVin.php (vehicle details from VIN decode) ────────────
  // This step mainly provides: datecode, container, constructionTime, equipamiento, color
  // which are forwarded to consultar.php. We grab what we can here too.
  if (vinData && (!vinData.error || vinData.error === 0)) {
    if (vinData.color) v.color = vinData.color;
  }

  // ── From cargarLibroVin.php (intermediate step, data flows to consultar.php) ──
  // Most useful data comes from consultar.php XML, this step just primes the session.

  // ── From consultar.php (full result with XML + pricing) ───────────────
  if (fullData && (!fullData.error || fullData.error === 0)) {
    if (fullData.mileage) v.kilometraje = parseInt(fullData.mileage) || undefined;
    v.combustible = v.combustible || fullData.combustible || undefined;

    if (fullData.XML) {
      v.raw_xml = fullData.XML;
      const xml = fullData.XML;

      // Identification
      v.vin = v.vin || xmlVal(xml, "vin");
      v.marca = v.marca || xmlVal(xml, "manufacturer");
      v.modelo = v.modelo || xmlVal(xml, "basemodel");
      v.version = xmlVal(xml, "submodel") || v.version;               // "Style"
      v.variante = xmlVal(xml, "containertext") || v.variante;         // "3008 1.5 BlueHDi 130 FAP Style (EURO 6d-TEMP)"
      v.datecode = xmlVal(xml, "datecode") || fullData.datecode;

      // Technical — XML has <kw>, <cv>, <cc>, <doors>
      const kwXml = xmlVal(xml, "kw");
      if (kwXml) v.kw = parseFloat(kwXml) || v.kw;

      const cvXml = xmlVal(xml, "cv");
      if (cvXml) v.cv = parseFloat(cvXml) || v.cv;

      const ccXml = xmlVal(xml, "cc");
      if (ccXml) v.cilindrada = parseFloat(ccXml) || v.cilindrada;

      const doorsXml = xmlVal(xml, "doors");
      if (doorsXml) v.puertas = parseInt(doorsXml) || v.puertas;

      // Gearbox — <gearboxType>manual</gearboxType> + <nrofgears>6</nrofgears>
      const gearType = xmlVal(xml, "gearboxType");   // "manual"
      const gearCount = xmlVal(xml, "nrofgears");      // "6"
      if (gearType) {
        v.tipo_cambio = gearType + (gearCount ? ` / ${gearCount} velocidades` : "");
      }

      // Dates — <aniofabricacion>09/2020</aniofabricacion>
      const anioFab = xmlVal(xml, "aniofabricacion");
      if (anioFab) v.anyo_fabricacion = anioFab;
      const firstPerm = xmlVal(xml, "firstpermission");
      if (firstPerm && !v.fecha_matriculacion) v.fecha_matriculacion = firstPerm;

      // Vehicle type
      const vType = xmlVal(xml, "vehicletype");
      if (vType && !v.tipo_vehiculo) v.tipo_vehiculo = vType;

      // Emissions
      const emXml = xmlVal(xml, "emisiones");
      if (emXml && !v.etiqueta_dgt) v.etiqueta_dgt = emXml;

      // Fuel from XML
      const fuelXml = xmlVal(xml, "fuel");
      if (fuelXml) v.combustible = fuelXml;

      // Color
      const colorXml = xmlVal(xml, "color");
      if (colorXml) v.color = colorXml;

      // Pricing — European format: "29.550 €" (dots = thousands)
      const priceNew = xmlVal(xml, "originalPrice");
      if (priceNew) v.precio_nuevo = parseEuPrice(priceNew);

      const priceNewEq = xmlVal(xml, "originalPriceEq");
      if (priceNewEq) v.precio_nuevo_total = parseEuPrice(priceNewEq);

      const saleVal = xmlVal(xml, "salesPrice");
      if (saleVal) v.valor_venta = parseEuPrice(saleVal);

      const buyVal = xmlVal(xml, "purchasePrice");
      if (buyVal) v.valor_compra = parseEuPrice(buyVal);

      // Mileage from report
      const mileRef = xmlVal(xml, "mileageReference");
      if (mileRef) v.kilometraje = parseInt(mileRef) || v.kilometraje;
    }

    if (v.datecode) {
      v.imagen_url = `${BASE}/imagen.php?datecode=${encodeURIComponent(v.datecode)}`;
    }
  }

  // Normalizar tipo de vehículo
  if (v.tipo_vehiculo) v.tipo_vehiculo = normalizeTipoVehiculo(v.tipo_vehiculo);

  // Derive CV from kW if missing
  if (v.kw && !v.cv) v.cv = Math.round(v.kw * 1.35962);
  // Derive kW from CV if we have CV but not kW
  if (v.cv && !v.kw) v.kw = Math.round(v.cv / 1.35962);

  // Fix year: derive from fecha_matriculacion if anyo_fabricacion looks wrong
  if (v.anyo_fabricacion) {
    // Valid year format: "09/2020", "2020", "202009"
    const yStr = String(v.anyo_fabricacion);
    const match4 = yStr.match(/(\d{4})/);
    if (match4) {
      const y = parseInt(match4[1]);
      if (y >= 1970 && y <= 2099) {
        // Keep MM/YYYY if present, otherwise just year
        const mmMatch = yStr.match(/^(\d{2})\/(\d{4})$/);
        v.anyo_fabricacion = mmMatch ? yStr : String(y);
      } else {
        v.anyo_fabricacion = undefined; // garbage value
      }
    } else {
      v.anyo_fabricacion = undefined;
    }
  }
  // Fallback: derive year from fecha_matriculacion
  if (!v.anyo_fabricacion && v.fecha_matriculacion) {
    const yMatch = v.fecha_matriculacion.match(/(\d{4})/);
    if (yMatch) v.anyo_fabricacion = yMatch[1];
  }

  return v;
}

function xmlVal(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  return re.exec(xml)?.[1]?.trim() || undefined;
}

/** Parse European price format: "29.550 €" → 29550, "13.154 €" → 13154 */
function parseEuPrice(s: string): number | undefined {
  // Remove currency symbol, spaces, then dots (thousands separator)
  const cleaned = s.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

// ─── Cookie helpers ─────────────────────────────────────────────────────────

function extractCookies(res: Response): string {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    const raw = res.headers.get("set-cookie") ?? "";
    if (!raw) return "";
    return raw.split(",").map(c => c.split(";")[0].trim()).join("; ");
  }
  return setCookies.map(c => c.split(";")[0].trim()).join("; ");
}

function mergeCookies(existing: string, incoming: string): string {
  const map = new Map<string, string>();
  for (const part of existing.split(";")) {
    const [k, ...rest] = part.split("=");
    if (k?.trim()) map.set(k.trim(), rest.join("="));
  }
  for (const part of incoming.split(";")) {
    const [k, ...rest] = part.split("=");
    if (k?.trim()) map.set(k.trim(), rest.join("="));
  }
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}
