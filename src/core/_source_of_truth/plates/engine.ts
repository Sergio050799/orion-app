import { resolvePlateFromSeed } from "./resolver";
import { PlateEstimation } from "@/core/types";

// Formato estándar: 1234-BBB (sin vocales, sin Q ni Ñ)
const PLATE_REGEX = /^(\d{4})[\s-]?([B-DF-HJ-NPR-TV-Z]{3})$/;

// Formato semirremolque: R-1234-BBB
const SEMI_PLATE_REGEX = /^R[\s-]?(\d{4})[\s-]?([B-DF-HJ-NPR-TV-Z]{3})$/;

export function isValidPlateFormat(plate: string): boolean {
  const u = plate.toUpperCase().trim();
  return PLATE_REGEX.test(u) || SEMI_PLATE_REGEX.test(u);
}

export function parsePlate(plate: string): { numbers: string; letters: string } {
  const normalized = plate.toUpperCase().trim();
  const match = normalized.match(PLATE_REGEX);

  if (!match) {
    throw new Error("Invalid plate format. Expected 4 digits + 3 consonants (e.g., 1234 BBB).");
  }

  return {
    numbers: match[1],
    letters: match[2]
  };
}

/**
 * Resolves plate data strictly from the seed JSON (Year/Month).
 * Supports standard plates (1234-BBB) and semirremolque plates (R-1234-BBB).
 * Returns null if out of range or invalid format.
 */
export function resolvePlate(plate: string): PlateEstimation | null {
  try {
    const normalized = plate.trim().toUpperCase();

    // Semirremolque: R-XXXX-BBB → usar anclas de Semiremolques.json
    const semiMatch = normalized.match(SEMI_PLATE_REGEX);
    if (semiMatch) {
      const letters = semiMatch[2];
      const resolved = resolvePlateFromSeed(letters, true);
      if (!resolved) return null;
      return {
        date: `${resolved.year}`,
        year: resolved.year,
        month: null,
        confidence: resolved.confidence,
        method: "strict_json_seed_semi",
        out_of_range: false,
        bounds: { to: { date: `${resolved.year}`, series: resolved.last_series } }
      };
    }

    // Estándar: XXXX-BBB
    const { letters } = parsePlate(normalized);
    const resolved = resolvePlateFromSeed(letters);
    if (!resolved) return null;
    return {
      date: resolved.month ? `${resolved.year}-${String(resolved.month).padStart(2, '0')}` : `${resolved.year}`,
      year: resolved.year,
      month: resolved.month,
      confidence: resolved.confidence,
      method: "strict_json_seed",
      out_of_range: false,
      bounds: {
        to: { date: resolved.month ? `${resolved.year}-${resolved.month}` : `${resolved.year}`, series: resolved.last_series }
      }
    };
  } catch {
    return null;
  }
}

// Deprecated: Kept temporarily if needed by old consumers, but re-routed to new logic where possible
export function estimateDate(plate: string): PlateEstimation | null {
  return resolvePlate(plate);
}
