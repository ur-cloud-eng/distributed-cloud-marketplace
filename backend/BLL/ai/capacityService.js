const { dependencyRules } = require("./recommendationValidator");

function positiveSize(value) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) {
        throw new Error("Invalid resource size.");
    }
    return value;
}

// Dependencies are validated before placement. Each required parent leads back to a group.
function checkProposalCapacity(proposal, capacity) {
    const hosts = capacity.map(host => ({ ...host }));
    const byId = new Map(proposal.resources.map(resource => [resource.id, resource]));
    const unavailable = [];
    for (const resource of proposal.resources) {
        if (resource.type === "Resource Group") {
            if (typeof resource.region !== "string" || !resource.region.trim() || resource.region.length > 50) {
                throw new Error("Invalid resource group region.");
            }
            continue;
        }
        if (resource.type === "Virtual Network" || resource.type === "Subnet") continue;

        let parent = resource;
        while (parent.type !== "Resource Group") {
            const requiredType = dependencyRules[parent.type];
            parent = parent.dependsOn.map(id => byId.get(id)).find(item => item?.type === requiredType);
            if (!parent) throw new Error("Missing parent resource.");
        }

        const storage = resource.type === "Blob Storage" || resource.type === "File Storage";
        const cpu = storage ? 0 : positiveSize(resource.vcpu);
        const ram = storage ? 0 : positiveSize(resource.ramGb);
        const disk = positiveSize(storage || resource.type.startsWith("Managed ") ? resource.sizeGb : resource.diskGb);
        if (!["Economy", "Business", "Critical"].includes(resource.hostingClass)) {
            throw new Error("Invalid hosting class.");
        }
        const host = hosts.find(h => h.region === parent.region && h.hosting_class === resource.hostingClass &&
            h.free_cpu >= cpu && h.free_ram_gb >= ram && h.free_disk_gb >= disk);
        if (host) {
            host.free_cpu -= cpu;
            host.free_ram_gb -= ram;
            host.free_disk_gb -= disk;
        } else {
            unavailable.push(resource.name);
        }
    }
    return { feasible: unavailable.length === 0, unavailable };
}

module.exports = { checkProposalCapacity };
