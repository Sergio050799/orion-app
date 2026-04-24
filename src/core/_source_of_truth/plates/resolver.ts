import seedData from './plates_monthly_anchors_seed.json';
import semiData from './Semiremolques.json';

// Type definition for the seed data structure
type SeedData = {
    months: Record<string, { last_series: string | null; status: string }>;
};

type SemiData = {
    schema: string;
    description: string;
    plate_format: string;
    anchors: Array<{ series: string, year: number }>;
}

const data = seedData as SeedData;
const semiremolques = semiData as SemiData;

export interface ResolvedPlate {
    year: number;
    month: number | null; // null for semi since it only has years
    confidence: number; // 1.0 (exact match) or 0.8 / 0.0
    last_series: string;
    type: "Standard" | "Semirremolque";
}

/**
 * Resolves the estimated registration date (year/month) based strictly on the JSON seeds.
 */
export function resolvePlateFromSeed(plateLetters: string, isSemi: boolean = false): ResolvedPlate | null {
    const letters = plateLetters.toUpperCase().trim();

    if (isSemi) {
        // Semiremolques resolution (Exact match or nearest fallback)
        // The JSON provides exact series mappings to years.
        const anchors = semiremolques.anchors;
        const exactMatch = anchors.find(a => a.series === letters);

        if (exactMatch) {
            return {
                year: exactMatch.year,
                month: null, // Semiremolques JSON only has Year
                confidence: 1.0,
                last_series: exactMatch.series,
                type: "Semirremolque"
            };
        }

        // If not an exact match, find the first anchor where the series is >= letters
        const firstGreater = anchors.find(a => letters <= a.series);
        if (firstGreater) {
            return {
                year: firstGreater.year,
                month: null,
                confidence: 0.8, // Estimated
                last_series: firstGreater.series,
                type: "Semirremolque"
            };
        }

        // If it's greater than the highest known anchor, return the highest
        if (anchors.length > 0) {
            const highest = anchors[anchors.length - 1];
            return {
                year: highest.year,
                month: null,
                confidence: 0.5,
                last_series: highest.series,
                type: "Semirremolque"
            }
        }

        return null;
    }

    // Standard Resolution
    // Sort months chronologically
    const sortedMonths = Object.keys(data.months).sort();

    for (const monthKey of sortedMonths) {
        const entry = data.months[monthKey];

        // Skip months with no data
        if (!entry.last_series) continue;

        if (letters <= entry.last_series) {
            const [yearStr, monthStr] = monthKey.split('-');
            return {
                year: parseInt(yearStr, 10),
                month: parseInt(monthStr, 10),
                confidence: entry.status === 'final' ? 1.0 : 0.8, // Provisional data has slightly lower confidence
                last_series: entry.last_series,
                type: "Standard"
            };
        }
    }

    return null; // Out of range or pre-2000
}
