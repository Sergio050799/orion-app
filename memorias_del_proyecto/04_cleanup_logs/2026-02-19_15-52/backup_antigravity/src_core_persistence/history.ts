import fs from "fs";
import path from "path";
import { HistoryEntry } from "@/core/types";

const HISTORY_FILE = path.join(process.cwd(), "data/history.json");
const MAX_ENTRIES = 200;

export class HistoryManager {
    public static async store(entry: HistoryEntry): Promise<boolean> {
        try {
            const history = this.load();

            // FIFO Logic
            history.unshift(entry);
            if (history.length > MAX_ENTRIES) {
                history.pop();
            }

            // Atomic-ish write (temp + rename)
            const tempPath = `${HISTORY_FILE}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(history, null, 2));
            fs.renameSync(tempPath, HISTORY_FILE);

            return true;
        } catch (error) {
            console.error("❌ History persistence error:", error);
            return false;
        }
    }

    public static load(): HistoryEntry[] {
        try {
            if (!fs.existsSync(HISTORY_FILE)) {
                return [];
            }
            const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
            return JSON.parse(raw);
        } catch (error) {
            console.error("❌ History load error:", error);
            return [];
        }
    }
}
