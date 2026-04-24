export interface PlateEstimation {
    date: string;
    year: number;
    month: number | null;
    confidence: number;
    method: string;
    out_of_range?: boolean;
    bounds?: {
        from?: { date: string; series: string };
        to?: { date: string; series: string };
    };
    error?: string;
}

export interface ClassificationResult {
    cl_code: string | null;
    vehicle_category: string;
    source: string;
    confidence: number;
}

export interface RiskResult {
    risk_class: string;
    score: number;
    factors: string[];
}

export interface LogEntry {
    level: string;
    code: string;
    msg: string;
    ts: string;
}

export interface HistoryResultSummary {
    risk_class: string;
    category: string;
    year?: number;
    confidence?: number;
}

export interface HistoryEntry {
    id: string;
    timestamp: string;
    plate: string;
    result_summary: HistoryResultSummary;
}

export interface AnalysisResult {
    plate: string;
    normalized_plate: string;
    is_valid_plate: boolean;
    estimated: PlateEstimation;
    classification: ClassificationResult;
    risk: RiskResult;
    history: {
        stored: boolean;
        id: string;
    };
    logs: LogEntry[];
}
