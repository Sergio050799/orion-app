export interface RiskResult {
    risk_class: string;
    score: number;
    factors: string[];
}

export class RiskEngine {
    public static calculate(ageYears: number, category: string): RiskResult {
        let score = 50; // Base score
        const factors = [];

        // Factor 1: Age
        if (ageYears > 15) {
            score += 30;
            factors.push("age_high");
        } else if (ageYears > 10) {
            score += 15;
            factors.push("age_medium");
        } else {
            score -= 10;
            factors.push("age_low");
        }

        // Factor 2: Category
        if (category.toLowerCase().includes("camión") || category.toLowerCase().includes("furgón")) {
            score += 20;
            factors.push("heavy_usage_category");
        } else {
            score -= 5;
            factors.push("standard_category");
        }

        // Normalize risk class
        let risk_class = "B1";
        if (score > 80) risk_class = "B3";
        else if (score > 60) risk_class = "B2";
        else if (score < 30) risk_class = "A1";

        return {
            risk_class,
            score: Math.max(0, Math.min(100, score)),
            factors
        };
    }
}
