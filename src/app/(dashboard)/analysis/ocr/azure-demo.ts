/**
 * Frontend Fetch Example / helper
 * 
 * Integración con ORION Document Intelligence.
 * El objetivo de esta llamada es delegar el documento al server (para no exponer AZURE_DOCINT_KEY)
 * recuperando un payload inmediato una vez termina de simularse el pipeline de guardado.
 */

export async function analyzeDocumentFrontend(file: File) {
    // 1. Prepare FormData (supports standard blob streams naturally)
    const formData = new FormData();
    formData.append("file", file);

    try {
        // 2. Fetch the secure internal Next.js API
        const response = await fetch("/api/orion/document-intelligence/analyze", {
            method: "POST",
            body: formData,
            // (fetch with body: FormData automatically sets the correct Content-Type including boundary string)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
        /*
        Returns Format:
        {
          ok: true,
          docId: "fbbb123f-...",
          paths: { 
            jsonPath: "C:/.../azure_read.result.json", 
            mdPath: "C:/.../report.md" 
          },
          extractedPreview: { 
            pageCount: 1, 
            firstLines: ["REGISTRO OFICIAL", "220-449", ...] 
          }
        }
        */
    } catch (err) {
        console.error("Frontend upload to internal proxy failed:", err);
        throw err; // Handled by caller to display toast/notification
    }
}
