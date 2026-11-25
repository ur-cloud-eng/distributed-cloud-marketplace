
const { checkProposalCapacity } = require("./capacityService");
const { validateRecommendation } = require("./recommendationValidator");
const { askGemini } = require("./geminiClient");

async function generateAIArchitectureProposal(requirements) {
    if (typeof requirements !== "string" ||
        requirements.trim().length < 10 ||
        requirements.length > 4000) {
        throw new Error("Invalid cloud requirements.");
    }

    const {
        getAvailableProviderCapacity
    } = require("../../DAL/ai/aiDAL");

    const capacity = await getAvailableProviderCapacity();

    const aiCapacity = capacity.map(({ host_id, ...host }) => host);

    const proposal = await askGemini(requirements, aiCapacity);

    validateRecommendation(proposal);

    const capacityCheck = checkProposalCapacity(
        proposal,
        capacity
    );

    const warnings = [...proposal.warnings];

    if (!capacityCheck.feasible) {
        warnings.push(
            "Capacity could not be confirmed for: " +
            capacityCheck.unavailable.join(", ")
        );
    }

    warnings.push("Capacity is not reserved.");
    warnings.push("No resources have been created.");

    return {
        mode: "ai",
        requirements: requirements.trim(),
        summary: proposal.summary,
        resources: proposal.resources,
        capacityCheck,
        warnings
    };
}

module.exports = { generateAIArchitectureProposal };