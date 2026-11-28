const { HttpError } = require("../../utils/util");
const { dependencyRules } = require("./recommendationValidator");

const instructions = `Help a first-time CortexOps customer choose a small cloud rental.
Explain the plan in everyday language. Give each resource a short reason tied to the customer's needs.
Call out assumptions, especially missing traffic or storage estimates. Avoid invented prices or promises of availability.
Describe a recommendation only. Never claim the resources have been deployed. Use unique IDs and reference those IDs in dependsOn.
Each resource needs exactly one parent of the required type, except Resource Groups, which have none.
Required parents: ${JSON.stringify(dependencyRules)}. A Web App may optionally depend on one managed database in the same group.
A Load Balancer is a simulated rental whose only dependency is its parent Virtual Network.
Do not recommend assigning or releasing IP addresses, restarting VMs, attaching VM targets, requesting refunds or withdrawals, or using discount codes.
Give each group a region. Use the supplied host regions and classes when available.
Every hosted resource requires hostingClass. Blob and File Storage require sizeGb only.
Managed databases require vcpu, ramGb and sizeGb. VMs, load balancers and web apps need vcpu, ramGb and diskGb.
Use positive whole numbers for all sizes. Give the smallest reasonable plan even if capacity is unavailable.
Every resource MUST include a region.
The Resource Group MUST have a valid non-empty region.
Child resources must use the region of their Resource Group.
All hosted resources, including storage, must have a hostingClass.
Do not recommend more than 50 resources.
Do not promise unsupported features such as automated backups.
Prefer the smallest reasonable architecture.
CortexOps is a simulation. Do not imply that real infrastructure is deployed.`;

const text = { type: "string" };
const size = { type: "integer" };
const schema = {
    type: "object",
    required: ["summary", "resources", "warnings"],
    properties: {
        summary: text,
        warnings: { type: "array", items: text },
        resources: { type: "array", items: {
            type: "object", required: ["id", "name", "type", "dependsOn", "reason", "region"],
            properties: {
                id: text, name: text, reason: text, region: text,
                type: { type: "string", enum: Object.keys(dependencyRules) },
                dependsOn: { type: "array", items: text },
                hostingClass: { type: "string", enum: ["Economy", "Business", "Critical"] },
                vcpu: size, ramGb: size, diskGb: size, sizeGb: size
            }
        } }
    }
};

async function askGemini(requirements, capacity) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new HttpError(503, "The AI advisor has not been configured.");
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            signal: AbortSignal.timeout(30000),
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: instructions }] },
                contents: [{ role: "user", parts: [{ text: JSON.stringify({ requirements, availableCapacity: capacity }) }] }],
                generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema }
            })
        });
        if (response.status === 429) throw new HttpError(429, "AI request limit reached. Please try again later.");
        if (!response.ok) throw new HttpError(502, "The AI provider could not complete the request.");
        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (candidate?.finishReason !== "STOP") throw new HttpError(502, "The AI could not complete a recommendation.");
        return JSON.parse(candidate.content.parts.filter(part => !part.thought).map(part => part.text).join(""));
    } catch (error) {
        if (error instanceof HttpError) throw error;
        if (error.name === "TimeoutError") throw new HttpError(504, "The AI advisor timed out. Please try again.");
        throw new HttpError(502, "The AI recommendation could not be read. Please try again.");
    }
}

module.exports = { askGemini };
