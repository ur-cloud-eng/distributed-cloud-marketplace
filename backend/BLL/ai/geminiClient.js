
const { GoogleGenAI } = require("@google/genai");

const resourceTypes = [
    "Resource Group",
    "Virtual Network",
    "Subnet",
    "Virtual Machine",
    "Blob Storage",
    "File Storage",
    "Load Balancer",
    "Managed SQL Server",
    "Managed PostgreSQL",
    "Managed MySQL",
    "Web App"
];

async function askGemini(requirements, capacity = []) {
    if (typeof requirements !== "string" ||
        requirements.trim().length < 10 ||
        requirements.length > 4000) {
        throw new Error("Invalid cloud requirements.");
    }

    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Gemini API key is missing.");
    }

    const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY
    });

    const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",

        contents: JSON.stringify({
            requirements,
            availableCapacity: capacity
        }),

        config: {
            systemInstruction: `
You are the CortexOps AI Cloud Architect.

CortexOps is a simulated cloud marketplace.

Only recommend supported resource types.
Assign each resource a unique ID.
Include the necessary resource dependencies.
Use resource IDs in dependsOn.
Every Resource Group must include a region.

Every Virtual Machine must include:
- vcpu: positive integer
- ramGb: positive integer
- diskGb: positive integer
- hostingClass: Economy, Business or Critical

The VM host region must match its Resource Group region.
Consider the available capacity of individual hosts.
Consider the combined capacity required by all VMs.
Never invent available capacity.
If capacity is insufficient, include a warning.
Recommend only what the customer needs.
Do not invent provider capacity or pricing.
Never claim that resources have been created.
            `,

            responseMimeType: "application/json",

            responseJsonSchema: {
                type: "object",
                properties: {
                    summary: {
                        type: "string"
                    },
                    resources: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                type: {
                                    type: "string",
                                    enum: resourceTypes
                                },
                                name: { type: "string" },
                                dependsOn: {
                                    type: "array",
                                    items: { type: "string" }
                                },
                                region: {
                                    type: "string"
                                },
                                vcpu: {
                                    type: "integer"
                                },
                                ramGb: {
                                    type: "integer"
                                },
                                diskGb: {
                                    type: "integer"
                                },
                                hostingClass: {
                                    type: "string",
                                    enum: ["Economy", "Business", "Critical"]
                                }
                            },
                            required: [
                                "id",
                                "type",
                                "name",
                                "dependsOn"
                            ]
                        }
                    },
                    warnings: {
                        type: "array",
                        items: { type: "string" }
                    }
                },
                required: [
                    "summary",
                    "resources",
                    "warnings"
                ]
            }
        }
    });

    if (!response.text) {
        throw new Error("Gemini returned an empty response.");
    }

    return JSON.parse(response.text);
}

module.exports = { askGemini };