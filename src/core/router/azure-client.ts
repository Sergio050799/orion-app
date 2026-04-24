import type { AzureAnalyzeResult, AzureOperationResult } from "@/types/azure";

export async function runAzureModel(modelName: string, fileBuffer: Buffer, mimeType: string): Promise<AzureAnalyzeResult | undefined> {
    const endpoint = process.env.AZURE_DOCINT_ENDPOINT!;
    const key = process.env.AZURE_DOCINT_KEY!;
    const apiVersion = process.env.AZURE_DOCINT_API_VERSION || '2024-02-29-preview';
    const cleanEndpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    const analyzeUrl = `${cleanEndpoint}/documentintelligence/documentModels/${modelName}:analyze?api-version=${apiVersion}`;

    const postRes = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': key,
            'Content-Type': mimeType,
        },
        // @ts-expect-error Node.js Buffer is compatible with BodyInit at runtime
        body: fileBuffer
    });

    if (!postRes.ok) {
        let errorText = await postRes.text().catch(() => "");
        throw new Error(`Azure Analyze POST failed (${postRes.status}): ${errorText || postRes.statusText}`);
    }

    const operationLocation = postRes.headers.get('Operation-Location');
    if (!operationLocation) throw new Error("No Operation-Location header received from Azure.");

    let result: AzureOperationResult | null = null;
    const maxRetries = Math.ceil(45000 / 1200);

    for (let i = 0; i < maxRetries; i++) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const getRes = await fetch(operationLocation, { headers: { 'Ocp-Apim-Subscription-Key': key } });
        if (!getRes.ok) {
            const errorText = await getRes.text().catch(() => "");
            throw new Error(`Azure Analyze GET failed (${getRes.status}): ${errorText || getRes.statusText}`);
        }
        result = await getRes.json() as AzureOperationResult;
        if (result.status === "succeeded" || result.status === "failed") break;
    }

    if (!result || result.status !== "succeeded") {
        throw new Error(`Azure Analyze did not succeed using ${modelName}. Final status: ${result?.status}. Error: ${JSON.stringify(result?.error)}`);
    }

    return result.analyzeResult;
}
