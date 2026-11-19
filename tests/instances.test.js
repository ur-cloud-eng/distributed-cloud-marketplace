
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("BLL retrieves customer instances", async () => {

    // Fake instances returned by the DAL
    const fakeInstances = [
        { vm_id: 1, name: "Web Server", status: "running" },
        { vm_id: 2, name: "Database Server", status: "stopped" }
    ];

    // Mock DAL: no real MySQL connection
    const fakeDAL = {
        getCustomerInstances: async (customerId) => {
            assert.equal(customerId, 5);
            return fakeInstances;
        }
    };

    const filename = path.join(
        __dirname,
        "../backend/BLL/instances/instanceService.js"
    );

    const mockedModule = { exports: {} };

    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module: mockedModule,
        require: () => fakeDAL
    });

    const result =
        await mockedModule.exports.getCustomerInstances(5);

    assert.equal(result.length, 2);
    assert.equal(result[0].name, "Web Server");
    assert.equal(result[1].status, "stopped");
});


test("BLL validates instance creation", async () => {

    let dalCalled = false;

    // Fake DAL
    const fakeDAL = {
        createInstance: async (data) => {
            dalCalled = true;

            assert.equal(data.customerId, 5);
            assert.equal(data.name, "WebServer");
            assert.equal(data.vcpu, 4);
            assert.equal(data.hourlyPrice, 0);

            return 14;
        }
    };

    // Load the BLL with our fake DAL
    const filename = path.join(
        __dirname,
        "../backend/BLL/instances/instanceService.js"
    );

    const mockedModule = { exports: {} };

    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module: mockedModule,
        require: () => fakeDAL
    });

    const createInstance = mockedModule.exports.createInstance;

    const instance = {
        name: "WebServer",
        subnetId: 3,
        hostId: 2,
        hostingClass: "Business",
        vcpu: 4,
        ramGb: 8,
        diskGb: 100
    };

    // Test 1: Valid instance
    const vmId = await createInstance(5, instance);

    assert.equal(vmId, 14);
    assert.equal(dalCalled, true);

    // Test 2: Invalid CPU
    dalCalled = false;

    await assert.rejects(
        createInstance(5, { ...instance, vcpu: -4 }),
        /CPU, RAM and disk must be positive integers/
    );

    assert.equal(dalCalled, false);
});


test("DAL retrieves instance details for a customer", async () => {

    const fakeDB = {
        execute: async (sql, params) => {
            assert.match(sql, /r\.customer_user_id\s*=\s*\?/);
            assert.deepEqual(Array.from(params), [10, 5]);

            return [[
                {
                    vm_id: 10,
                    name: "WebServer",
                    status: "running",
                    vcpu: 4,
                    ram_gb: 8
                }
            ]];
        }
    };

    const filename = path.join(
        __dirname,
        "../backend/DAL/instances/instanceDAL.js"
    );

    const mockedModule = { exports: {} };

    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module: mockedModule,
        require: () => fakeDB
    });

    const result =
        await mockedModule.exports.getInstanceById(10, 5);

    assert.equal(result.vm_id, 10);
    assert.equal(result.name, "WebServer");
    assert.equal(result.status, "running");
});

