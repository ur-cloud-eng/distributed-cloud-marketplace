
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    checkProposalCapacity
} = require("../backend/BLL/ai/capacityService");

function createCapacity() {
    return [
        {
            host_id: 1,
            region: "Europe",
            hosting_class: "Economy",
            free_cpu: 8,
            free_ram_gb: 16,
            free_disk_gb: 200
        }
    ];
}

function createProposal() {
    return {
        resources: [
            {
                id: "rg1",
                type: "Resource Group",
                region: "Europe",
                dependsOn: []
            },
            {
                id: "vnet1",
                type: "Virtual Network",
                dependsOn: ["rg1"]
            },
            {
                id: "subnet1",
                type: "Subnet",
                dependsOn: ["vnet1"]
            },
            {
                id: "vm1",
                type: "Virtual Machine",
                name: "website-vm",
                dependsOn: ["subnet1"],
                vcpu: 4,
                ramGb: 8,
                diskGb: 100,
                hostingClass: "Economy"
            }
        ]
    };
}

test("Accept sufficient capacity", () => {
    const result = checkProposalCapacity(
        createProposal(),
        createCapacity()
    );

    assert.equal(result.feasible, true);
});

test("Reject insufficient CPU", () => {
    const proposal = createProposal();

    proposal.resources[3].vcpu = 16;

    const result = checkProposalCapacity(
        proposal,
        createCapacity()
    );

    assert.equal(result.feasible, false);
});

test("Reject incompatible region", () => {
    const proposal = createProposal();

    proposal.resources[0].region = "Asia";

    const result = checkProposalCapacity(
        proposal,
        createCapacity()
    );

    assert.equal(result.feasible, false);
});

test("Reject incompatible hosting class", () => {
    const proposal = createProposal();

    proposal.resources[3].hostingClass = "Critical";

    const result = checkProposalCapacity(
        proposal,
        createCapacity()
    );

    assert.equal(result.feasible, false);
});

test("Check combined capacity of multiple VMs", () => {
    const proposal = createProposal();

    proposal.resources.push({
        ...proposal.resources[3],
        id: "vm2",
        name: "second-vm",
        vcpu: 6
    });

    const result = checkProposalCapacity(
        proposal,
        createCapacity()
    );

    assert.equal(result.feasible, false);
    assert.deepEqual(result.unavailable, ["second-vm"]);
});

test("Do not modify original capacity", () => {
    const capacity = createCapacity();

    checkProposalCapacity(createProposal(), capacity);

    assert.deepEqual(capacity, createCapacity());
});