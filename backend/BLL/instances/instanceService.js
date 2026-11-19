
const instanceDAL = require("../../DAL/instances/instanceDAL");
const dbTransaction = require("../../DAL/transaction");

const DEMO_HOURLY_PRICE = 0;

function validationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

async function getCustomerInstances(customerId) {
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
        throw validationError("Invalid customer ID");
    }

    return await instanceDAL.getCustomerInstances(customerId);
}

async function createInstance(customerId, data) {
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
        throw validationError("Invalid customer ID");
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw validationError("Invalid instance data");
    }

    if (typeof data.name !== "string") {
        throw validationError("Invalid instance name");
    }

    const name = data.name.trim();

    if (!name || name.length > 100 || /[\x00-\x1F\x7F]/.test(name)) {
        throw validationError("Invalid instance name");
    }

    if (!Number.isSafeInteger(data.subnetId) || data.subnetId <= 0) {
        throw validationError("Invalid subnet ID");
    }

    if (!Number.isSafeInteger(data.hostId) || data.hostId <= 0) {
        throw validationError("Invalid host ID");
    }

    const allowedClasses = ["Economy", "Business", "Critical"];

    if (!allowedClasses.includes(data.hostingClass)) {
        throw validationError("Invalid hosting class");
    }

    const resources = [data.vcpu, data.ramGb, data.diskGb];

    if (!resources.every(value =>
        Number.isSafeInteger(value) && value > 0
    )) {
        throw validationError("CPU, RAM and disk must be positive integers");
    }

    return await instanceDAL.createInstance({
        customerId,
        subnetId: data.subnetId,
        hostId: data.hostId,
        name,
        hostingClass: data.hostingClass,
        vcpu: data.vcpu,
        ramGb: data.ramGb,
        diskGb: data.diskGb,
        hourlyPrice: DEMO_HOURLY_PRICE
    });
}

async function getInstanceById(vmId, customerId) {
    if (!Number.isSafeInteger(vmId) || vmId <= 0) {
        throw validationError("Invalid instance ID");
    }

    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
        throw validationError("Invalid customer ID");
    }

    return await instanceDAL.getInstanceById(vmId, customerId);
}

async function startInstance(vmId, customerId) {
    if (!Number.isSafeInteger(vmId) || vmId <= 0) {
        throw validationError("Invalid instance ID");
    }

    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
        throw validationError("Invalid customer ID");
    }

    const connection = await dbTransaction.getConnection();

    try {
        await dbTransaction.beginTransaction(connection);

        const instance = await instanceDAL.getInstanceForUpdate(
            connection, vmId, customerId
        );

        if (!instance) {
            const error = new Error("Instance not found");
            error.statusCode = 404;
            throw error;
        }

        if (instance.vm_status !== "stopped" ||
            instance.resource_status !== "stopped") {
            const error = new Error("Instance cannot be started");
            error.statusCode = 409;
            throw error;
        }

        await instanceDAL.setInstanceRunning(
            connection, vmId, instance.resource_id
        );

        await instanceDAL.recordInstanceStart(
            connection, instance.resource_id
        );

        await instanceDAL.recordInstanceActivity(
            connection, vmId, instance.resource_id, customerId
        );

        await dbTransaction.commit(connection);

        return {
            vmId,
            status: "running"
        };

    } catch (error) {
        await dbTransaction.rollback(connection);
        throw error;

    } finally {
        await dbTransaction.release(connection);
    }
}

module.exports = {
    getCustomerInstances,
    createInstance,
    getInstanceById,
    startInstance
};
