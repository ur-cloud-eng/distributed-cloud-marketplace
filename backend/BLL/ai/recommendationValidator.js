
const dependencyRules = {
    "Resource Group": null,
    "Virtual Network": "Resource Group",
    "Subnet": "Virtual Network",
    "Virtual Machine": "Subnet",
    "Blob Storage": "Resource Group",
    "File Storage": "Resource Group",
    "Load Balancer": "Virtual Network",
    "Managed SQL Server": "Resource Group",
    "Managed PostgreSQL": "Resource Group",
    "Managed MySQL": "Resource Group",
    "Web App": "Resource Group"
};

const databaseTypes = [
    "Managed SQL Server",
    "Managed PostgreSQL",
    "Managed MySQL"
];

function validateRecommendation(proposal) {
    if (!proposal ||
        typeof proposal.summary !== "string" ||
        !Array.isArray(proposal.resources) ||
        !Array.isArray(proposal.warnings) ||
        !proposal.warnings.every(w => typeof w === "string")) {
        throw new Error("Invalid architecture proposal.");
    }

    const resources = new Map();

    for (const resource of proposal.resources) {
        if (!resource ||
            typeof resource.id !== "string" ||
            !resource.id.trim() ||
            typeof resource.name !== "string" ||
            !resource.name.trim() ||
            resource.name.length > 100 ||
            !Array.isArray(resource.dependsOn)) {
            throw new Error("Invalid resource.");
        }

        if (!Object.hasOwn(dependencyRules, resource.type)) {
            throw new Error("Unsupported resource type.");
        }

        if (resources.has(resource.id)) {
            throw new Error("Duplicate resource ID.");
        }

        resources.set(resource.id, resource);
    }

    for (const resource of proposal.resources) {
        const requiredParent = dependencyRules[resource.type];

        const dependencies = resource.dependsOn.map(id => {
            if (!resources.has(id) || id === resource.id) {
                throw new Error("Invalid dependency.");
            }

            return resources.get(id);
        });

        if (new Set(resource.dependsOn).size !==
            resource.dependsOn.length) {
            throw new Error("Duplicate dependency.");
        }

        const parents = dependencies.filter(
            d => d.type === requiredParent
        );

        if (requiredParent && parents.length !== 1) {
            throw new Error(
                `${resource.name} requires one ${requiredParent}.`
            );
        }

        const optional = dependencies.filter(
            d => d.type !== requiredParent
        );

        for (const dependency of optional) {
            const valid =
                (resource.type === "Load Balancer" &&
                    dependency.type === "Virtual Machine") ||
                (resource.type === "Web App" &&
                    databaseTypes.includes(dependency.type));

            if (!valid) {
                throw new Error("Unsupported dependency.");
            }
        }

        if (resource.type === "Web App") {
            if (optional.length > 1 ||
                optional.some(d =>
                    !d.dependsOn.includes(parents[0].id))) {
                throw new Error("Invalid Web App database.");
            }
        }

        if (resource.type === "Load Balancer") {
            for (const vm of optional) {
                const subnet = resources.get(vm.dependsOn[0]);

                if (!subnet ||
                    !subnet.dependsOn.includes(parents[0].id)) {
                    throw new Error("VM must be in the same VNet.");
                }
            }
        }
    }

    return true;
}

module.exports = { validateRecommendation };