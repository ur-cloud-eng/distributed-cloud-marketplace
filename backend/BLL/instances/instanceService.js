const dal = require("../../DAL/instances/instance");
const { cancelResource } = require("../../DAL/instances/resourceAllocation");
const pricing = require("../finance/pricingService");

const { fail, validId, assertId, actorData } = require("./instanceUtils");

const { startInstance, stopInstance } = require("./lifecycleService");

async function getCustomerInstances(customerId) {
    assertId(customerId, "customer ID");

    return dal.getCustomerInstances(customerId);
}

async function createInstance(customerId, data) {
    assertId(customerId, "customer ID");

    if (!data || typeof data !== "object" || Array.isArray(data))
        fail(400, "Invalid instance data.");

    if (typeof data.name !== "string") fail(400, "Invalid instance name.");

    const name = data.name.trim();

    if (!name || name.length > 100 || /[\x00-\x1F\x7F]/.test(name))
        fail(400, "Invalid instance name.");

    assertId(data.subnetId, "subnet ID");

    if (!["Economy", "Business", "Critical"].includes(data.hostingClass))
        fail(400, "Invalid hosting class.");

    if (
        ![data.vcpu, data.ramGb, data.diskGb].every(
            (value) => validId(value) && value <= 2147483647
        )
    )
        fail(400, "CPU, RAM and disk must be positive integers.");

    const subnet = await dal.findSubnet(customerId, data.subnetId);
    if (!subnet) fail(404, "Subnet not found.");
    const estimate = await pricing.calculatePrice({
        cloud_class: data.hostingClass,
        cpu_cores: data.vcpu,
        ram_gb: data.ramGb,
        storage_gb: data.diskGb,
        gpu_units: 0
    });
    const hourlyPrice = estimate.estimated_hourly_price;
    if (!Number.isFinite(hourlyPrice) || hourlyPrice > 99999999.99999999)
        fail(400, "Hourly estimate exceeds supported price range.");

    const hosts = await dal.findCompatibleHosts(subnet.region, data);
    for (const host of hosts) {
        try {
            return await dal.createInstance({
                customerId,
                subnetId: data.subnetId,
                hostId: host.host_id,
                name,
                hostingClass: data.hostingClass,
                vcpu: data.vcpu,
                ramGb: data.ramGb,
                diskGb: data.diskGb,
                hourlyPrice
            });
        } catch (error) {
            if (
                [
                    "Insufficient provider capacity",
                    "Host unavailable, unverified or class mismatch",
                    "Provider host not found"
                ].includes(error.message)
            )
                continue;
            if (
                [
                    "Invalid VM specification",
                    "Subnet or resource group not found",
                    "Region mismatch or customer unverified"
                ].includes(error.message)
            )
                fail(400, error.message);
            throw error;
        }
    }
    fail(409, "No compatible host with sufficient capacity.");
}

async function getInstanceById(vmId, actor) {
    assertId(vmId);

    const { customerId, isAdmin } = actorData(actor);

    const instance = await dal.getInstanceById(vmId, customerId, isAdmin);

    if (!instance) fail(404, "Instance not found.");

    return instance;
}

async function deleteInstance(vmId, actor) {
    const instance = await getInstanceById(vmId, actor);

    try {
        await cancelResource(instance.resource_id, actor.id);
    } catch (error) {
        if (error.message === "Resource already cancelled")
            fail(409, error.message);

        if (error.message === "Resource not found or actor unauthorized")
            fail(404, "Instance not found.");

        throw error;
    }

    return {
        vmId,
        cancelled: true,
        capacity_released: true
    };
}

module.exports = {
    getCustomerInstances,
    createInstance,
    getInstanceById,
    deleteInstance,
    startInstance,
    stopInstance
};
