import { resolvePlateFromSeed } from "./resolver";
import { PlateEstimation } from "@/core/types";

// Regex for strict validation (Modern Spanish Plates: 1234 BBB)
// Excludes vowels (A,E,I,O,U), Q, Ñ in the letters part. 
// Allows optional space or hyphen separator.
const PLATE_REGEX = /^(\d{4})[\s-]?([B-DF-HJ-NPR-TV-Z]{3})$/;

export function isValidPlateFormat(plate: string): boolean {
  return PLATE_REGEX.test(plate.toUpperCase().trim());
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
 * Returns null if out of range or invalid format.
 */
export function resolvePlate(plate: string): PlateEstimation | null {
  try {
    const { letters } = parsePlate(plate);
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
  } catch (e) {
    // If parse fails or any other error
    return null;
  }
}

// Deprecated: Kept temporarily if needed by old consumers, but re-routed to new logic where possible
export function estimateDate(plate: string): PlateEstimation | null {
  return resolvePlate(plate);
}
