
const form = document.getElementById("aiForm");
const button = document.getElementById("generateButton");
const status = document.getElementById("aiStatus");
const result = document.getElementById("aiResult");
const resources = document.getElementById("aiResources");
const warnings = document.getElementById("aiWarnings");

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const requirements =
        document.getElementById("requirements").value.trim();

    if (requirements.length < 10) {
        status.textContent = "Please describe your requirements.";
        return;
    }

    button.disabled = true;
    result.hidden = true;
    status.textContent = "Generating your architecture...";

    try {
        const response = await fetch(
            "/api/ai/architecture/recommend",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "same-origin",
                body: JSON.stringify({ requirements })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                data.message ||
                "Unable to generate architecture."
            );
        }

        displayArchitecture(data);

        result.hidden = false;
        status.textContent = "Architecture generated successfully.";

    } catch (error) {
        status.textContent = error.message;

    } finally {
        button.disabled = false;
    }
});

function displayArchitecture(data) {
    document.getElementById("aiSummary").textContent =
        data.summary;

    document.getElementById("capacityStatus").textContent =
        data.capacityCheck?.feasible
            ? "VM capacity check passed."
            : "VM capacity could not be confirmed.";

    resources.replaceChildren();
    warnings.replaceChildren();

    for (const resource of data.resources) {
        const card = document.createElement("article");
        card.className = "catalog-card";

        const title = document.createElement("h3");
        title.textContent = resource.name;

        const type = document.createElement("p");
        type.textContent = resource.type;

        card.append(title, type);

        if (resource.type === "Resource Group") {
            const region = document.createElement("p");
            region.textContent = `Region: ${resource.region}`;

            card.appendChild(region);
        }

        if (resource.type === "Virtual Machine") {
            const specs = document.createElement("p");

            specs.textContent =
                `${resource.vcpu} vCPU | ` +
                `${resource.ramGb} GB RAM | ` +
                `${resource.diskGb} GB Disk | ` +
                resource.hostingClass;

            card.appendChild(specs);
        }

        const dependencies = document.createElement("p");

        dependencies.textContent = "Dependencies: " +
            (resource.dependsOn.map(id =>
                data.resources.find(r => r.id === id)?.name || id
            ).join(", ") || "None");

        card.appendChild(dependencies);
        resources.appendChild(card);
    }

    for (const warning of data.warnings) {
        const item = document.createElement("li");

        item.textContent = warning;
        warnings.appendChild(item);
    }
}