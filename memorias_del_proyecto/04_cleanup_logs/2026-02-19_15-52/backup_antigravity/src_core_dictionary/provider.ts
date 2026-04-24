import { z } from "zod";
import fs from "fs";
import path from "path";

// Zod Schema for ITV Master Dictionary
export const ITVDictionarySchema = z.object({
    version: z.string(),
    description: z.string(),
    schema: z.record(z.string(), z.any()),
    dictionaries: z.object({
        clasificacion_construccion: z.record(z.string(), z.string()),
        clasificacion_uso: z.record(z.string(), z.string()),
        categorias_homologacion_ue: z.record(z.string(), z.string()),
        carrocerias: z.record(z.string(), z.string()),
        carrocerias_especiales: z.record(z.string(), z.string()).optional(),
        tipo_combustible: z.record(z.string(), z.string()),
        etiqueta_ambiental_dgt: z.record(z.string(), z.any())
    })
});

export type ITVDictionary = z.infer<typeof ITVDictionarySchema>;

class DictionaryProvider {
    private static instance: DictionaryProvider;
    private dictionary: ITVDictionary | null = null;
    private isDisabled = false;

    private constructor() {
        this.load();
    }

    public static getInstance(): DictionaryProvider {
        if (!DictionaryProvider.instance) {
            DictionaryProvider.instance = new DictionaryProvider();
        }
        return DictionaryProvider.instance;
    }

    private load() {
        try {
            const filePath = path.join(process.cwd(), "src/core/dictionaries/itv_master_dictionary.json");
            const rawData = fs.readFileSync(filePath, "utf-8");
            const parsedData = JSON.parse(rawData);

            const validation = ITVDictionarySchema.safeParse(parsedData);
            if (!validation.success) {
                console.error("❌ ITVDictionary validation failed:", validation.error.format());
                this.isDisabled = true;
                return;
            }

            this.dictionary = validation.data;
            console.log(`✅ ITVDictionary loaded: v${this.dictionary.version}`);
        } catch (error) {
            console.error("❌ Failed to load ITVDictionary:", error);
            this.isDisabled = true;
        }
    }

    public getCategory(cl_code: string | undefined): string {
        if (this.isDisabled || !this.dictionary || !cl_code || cl_code.length < 2) {
            return "unknown";
        }

        const constCode = cl_code.substring(0, 2);
        const labels = this.dictionary.dictionaries.clasificacion_construccion as Record<string, string | undefined>;
        return labels[constCode] ?? "unknown";
    }

    public getDictionaryStatus() {
        return {
            loaded: !!this.dictionary,
            disabled: this.isDisabled,
            version: this.dictionary?.version
        };
    }
}

export const dictionaryProvider = DictionaryProvider.getInstance();
