const { getAvailableProviderCapacity } = require("../../DAL/ai/aiDAL");
const { validateRecommendation } = require("./recommendationValidator");
const { checkProposalCapacity } = require("./capacityService");
const { askGemini } = require("./geminiClient");
const { HttpError } = require("../../utils/util");

async function recommend(requirements) {
    if (typeof requirements !== "string" || requirements.trim().length < 10 || requirements.length > 4000) {
        throw new HttpError(400, "Describe your project using 10 to 4,000 characters.");
    }
    const capacity = await getAvailableProviderCapacity();
    const proposal = await askGemini(requirements.trim(), capacity);
    try {
        validateRecommendation(proposal);
        return {
            summary: proposal.summary, resources: proposal.resources, warnings: proposal.warnings,
            capacityCheck: checkProposalCapacity(proposal, capacity)
        };
    } catch {
        throw new HttpError(502, "The AI returned an invalid resource plan. Please try again.");
    }
}

module.exports = { recommend };
