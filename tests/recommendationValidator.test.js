
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    validateRecommendation
} = require("../backend/BLL/ai/recommendationValidator");

function createProposal() {
    return {
        summary: "Website infrastructure",
        resources: [
            {
                id: "rg1",
                type: "Resource Group",
                name: "website-rg",
                dependsOn: []
            },
            {
                id: "vnet1",
                type: "Virtual Network",
                name: "website-vnet",
                dependsOn: ["rg1"]
            },
            {
                id: "subnet1",
                type: "Subnet",
                name: "website-subnet",
                dependsOn: ["vnet1"]
            },
            {
                id: "vm1",
                type: "Virtual Machine",
                name: "website-vm",
                dependsOn: ["subnet1"]
            }
        ],
        warnings: []
    };
}

test("Accept valid architecture", () => {
    const proposal = createProposal();

    assert.equal(
        validateRecommendation(proposal),
        true
    );
});

test("Reject unsupported resource type", () => {
    const proposal = createProposal();

    proposal.resources[3].type = "Kubernetes";

    assert.throws(() => {
        validateRecommendation(proposal);
    });
});

test("Reject VM without subnet", () => {
    const proposal = createProposal();

    proposal.resources[3].dependsOn = [];

    assert.throws(() => {
        validateRecommendation(proposal);
    });
});

test("Reject duplicate resource IDs", () => {
    const proposal = createProposal();

    proposal.resources[3].id = "rg1";

    assert.throws(() => {
        validateRecommendation(proposal);
    });
});

test("Reject nonexistent dependency", () => {
    const proposal = createProposal();

    proposal.resources[3].dependsOn = ["subnet99"];

    assert.throws(() => {
        validateRecommendation(proposal);
    });
});