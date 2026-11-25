
function checkProposalCapacity(proposal, capacity) {
    const hosts = capacity.map(host => ({ ...host }));

    const resources = new Map(
        proposal.resources.map(r => [r.id, r])
    );

    const unavailable = [];

    for (const resource of proposal.resources) {
        if (resource.type === "Resource Group") {
            if (typeof resource.region !== "string" ||
                !resource.region.trim() ||
                resource.region.length > 50) {
                throw new Error("Invalid resource group region.");
            }
        }
    }

    const virtualMachines = proposal.resources.filter(
        r => r.type === "Virtual Machine"
    );

    for (const vm of virtualMachines) {
        const specs = [vm.vcpu, vm.ramGb, vm.diskGb];

        if (!specs.every(value =>
            Number.isSafeInteger(value) &&
            value > 0 &&
            value <= 2147483647)) {
            throw new Error("Invalid VM specifications.");
        }

        if (!["Economy", "Business", "Critical"]
            .includes(vm.hostingClass)) {
            throw new Error("Invalid hosting class.");
        }

        const subnet = resources.get(vm.dependsOn[0]);
        const vnet = resources.get(subnet.dependsOn[0]);
        const group = resources.get(vnet.dependsOn[0]);

        const host = hosts.find(h =>
            h.region === group.region &&
            h.hosting_class === vm.hostingClass &&
            h.free_cpu >= vm.vcpu &&
            h.free_ram_gb >= vm.ramGb &&
            h.free_disk_gb >= vm.diskGb
        );

        if (!host) {
            unavailable.push(vm.name);
            continue;
        }

        host.free_cpu -= vm.vcpu;
        host.free_ram_gb -= vm.ramGb;
        host.free_disk_gb -= vm.diskGb;
    }

    return {
        feasible: unavailable.length === 0,
        unavailable
    };
}

module.exports = { checkProposalCapacity };