const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

// Use a dedicated, initialized MySQL test database, never the normal app DB.
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const testDatabase = process.env.CORTEXOPS_TEST_DB;
if (!testDatabase || !/^[a-zA-Z0-9_]+_test$/.test(testDatabase) ||
    testDatabase.toLowerCase() === (process.env.DB_NAME || 'cloud_marketplace').toLowerCase()) {
    throw new Error('Set CORTEXOPS_TEST_DB to a separate initialized database ending in _test.');
}
process.env.DB_NAME = testDatabase;

const db = require('../backend/DAL/dbconn');
const vm = require('../backend/BLL/instances/instanceService');
const hosts = require('../backend/BLL/instances/hostService');
const groups = require('../backend/BLL/instances/resourceGroupService');
const networks = require('../backend/BLL/instances/virtualNetworkService');
const subnets = require('../backend/BLL/instances/subnetService');

async function row(sql, params = []) {
    const [[result]] = await db.execute(sql, params);
    return result;
}

const hasStatus = status => error => error.status === status;

test('VM lifecycle with real MySQL', { timeout: 60000 }, async t => {
    const tag = `it-${randomUUID()}`;
    const ids = {};
    const users = [];
    async function user(role, label) {
        const [result] = await db.execute(
            `INSERT INTO Users (first_name,last_name,email,password_hash,role,email_verified_at)
             VALUES ('Integration','Test',?, 'not-a-login-password',?,UTC_TIMESTAMP())`,
            [`${tag}-${label}@example.invalid`, role]
        );
        users.push(result.insertId);
        return result.insertId;
    }
    async function capacity(expected) {
        const host = await hosts.get(ids.provider, ids.host);
        assert.deepEqual([host.free_cpu, host.free_ram_gb, host.free_disk_gb].map(Number), expected);
    }
    async function state(vmStatus, registryStatus, openUsage, storageOpen, usageTotal) {
        const result = await row(
            `SELECT v.status AS vm_status, r.status AS resource_status, r.cancelled_at,
                (SELECT COUNT(*) FROM VmUsage u WHERE u.vm_id=v.vm_id AND u.stopped_at IS NULL) AS open_usage,
                (SELECT COUNT(*) FROM VmUsage u WHERE u.vm_id=v.vm_id) AS usage_total,
                (SELECT COUNT(*) FROM InstanceStorageUsage s WHERE s.vm_id=v.vm_id AND s.ended_at IS NULL) AS storage_open
             FROM VirtualMachines v JOIN ResourceRegistry r ON r.vm_id=v.vm_id WHERE v.vm_id=?`, [ids.vm]);
        assert.ok(result, 'VM and registry row must exist');
        assert.equal(result.vm_status, vmStatus);
        assert.equal(result.resource_status, registryStatus);
        assert.equal(Number(result.open_usage), openUsage);
        assert.equal(Number(result.storage_open), storageOpen);
        assert.equal(Number(result.usage_total), usageTotal);
        if (registryStatus === 'cancelled') assert.ok(result.cancelled_at);
    }

    try {
        // Unique region and accounts prevent allocation from unrelated hosts.
        ids.provider = await user('provider', 'provider');
        ids.customer = await user('customer', 'customer');
        ids.other = await user('customer', 'other');
        const actor = { id: ids.customer, role: 'Customer' };
        const outsider = { id: ids.other, role: 'Customer' };
        ids.host = await hosts.create(ids.provider, {
            name: tag, region: tag, hostingClass: 'Economy', totalCpu: 4, totalRamGb: 8, totalDiskGb: 40
        });
        ids.group = await groups.create(ids.customer, { name: tag, region: tag });
        ids.network = await networks.create(ids.customer, ids.group, { name: tag, cidrBlock: '10.20.0.0/16' });
        ids.subnet = await subnets.create(ids.customer, ids.group, ids.network, { name: tag, cidrBlock: '10.20.1.0/24' });
        const spec = { name: tag, subnetId: ids.subnet, hostingClass: 'Economy', vcpu: 2, ramGb: 4, diskGb: 20 };

        // A failed subtest must stop later dependent steps.
        async function step(name, fn) {
            let completed = false;
            await t.test(name, async () => { await fn(); completed = true; });
            assert.ok(completed, `Cannot continue after failed step: ${name}`);
        }
        await step('create stopped VM and reserve host capacity', async () => {
            await capacity([4, 8, 40]);
            ids.vm = await vm.createInstance(ids.customer, spec);
            assert.ok(Number.isSafeInteger(ids.vm) && ids.vm > 0);
            const instance = await vm.getInstanceById(ids.vm, actor);
            assert.equal(instance.host_id, ids.host);
            await state('stopped', 'stopped', 0, 1, 0);
            await capacity([2, 4, 20]);
        });
        await step('reject over-allocation and unauthorized access', async () => {
            await assert.rejects(vm.createInstance(ids.customer, { ...spec, name: `${tag}-large`, vcpu: 3 }), hasStatus(409));
            await assert.rejects(vm.getInstanceById(ids.vm, outsider), hasStatus(404));
            await assert.rejects(vm.startInstance(ids.vm, outsider), hasStatus(404));
            await assert.rejects(vm.deleteInstance(ids.vm, outsider), hasStatus(404));
            await capacity([2, 4, 20]);
        });
        await step('start VM and open exactly one compute usage interval', async () => {
            await vm.startInstance(ids.vm, actor);
            await state('running', 'active', 1, 1, 1);
            await assert.rejects(vm.startInstance(ids.vm, actor), hasStatus(409));
            await state('running', 'active', 1, 1, 1);
        });
        await step('restart without duplicating the usage interval', async () => {
            const result = await vm.restartInstance(ids.vm, actor);
            assert.equal(result.status, 'running');
            await state('running', 'active', 1, 1, 1);
        });
        await step('stop compute usage but retain disk usage and capacity', async () => {
            await vm.stopInstance(ids.vm, actor);
            await state('stopped', 'stopped', 0, 1, 1);
            await assert.rejects(vm.stopInstance(ids.vm, actor), hasStatus(409));
            await assert.rejects(vm.restartInstance(ids.vm, actor), hasStatus(409));
            await capacity([2, 4, 20]);
        });
        await step('start again and verify activity history', async () => {
            await vm.startInstance(ids.vm, actor);
            await state('running', 'active', 1, 1, 2);
            const history = await vm.getActivityHistory(ids.vm, actor);
            assert.deepEqual(history.map(item => item.action), ['started', 'stopped', 'restarted', 'started', 'created']);
        });
        await step('cancel running VM, close usage and release capacity', async () => {
            const result = await vm.deleteInstance(ids.vm, actor);
            assert.equal(result.cancelled, true);
            await state('stopped', 'cancelled', 0, 0, 2);
            await capacity([4, 8, 40]);
            const allocation = await row('SELECT released_at FROM HostCapacityAllocations WHERE vm_id=?', [ids.vm]);
            assert.ok(allocation?.released_at);
            const storage = await row('SELECT ended_at FROM InstanceStorageUsage WHERE vm_id=?', [ids.vm]);
            assert.ok(storage?.ended_at);
            const log = await row("SELECT action FROM ResourceActivityLogs WHERE entity_type='VIRTUAL_MACHINE' AND entity_pk=? ORDER BY log_id DESC LIMIT 1", [ids.vm]);
            assert.equal(log.action, 'cancelled');
            assert.ok(!(await vm.getCustomerInstances(ids.customer)).some(item => item.vm_id === ids.vm));
            await assert.rejects(vm.startInstance(ids.vm, actor), hasStatus(404));
            await assert.rejects(vm.deleteInstance(ids.vm, actor), hasStatus(404));
        });
    } finally {
        // Delete only this run's fixtures, including any unexpectedly created VM.
        // The dedicated test DB must not be used by a running app or billing job.
        try {
            await db.withTransaction(async conn => {
                if (ids.subnet) {
                    const [vms] = await conn.execute('SELECT vm_id FROM VirtualMachines WHERE subnet_id=?', [ids.subnet]);
                    for (const { vm_id } of vms) {
                        const [[registry]] = await conn.execute('SELECT resource_id FROM ResourceRegistry WHERE vm_id=?', [vm_id]);
                        if (registry) {
                            await conn.execute('DELETE FROM ResourceActivityLogs WHERE resource_id=?', [registry.resource_id]);
                            await conn.execute('DELETE FROM ResourceUsagePeriods WHERE resource_id=?', [registry.resource_id]);
                            await conn.execute('DELETE FROM ResourceRegistry WHERE resource_id=?', [registry.resource_id]);
                        }
                        await conn.execute('UPDATE InstanceIPPool SET vm_id=NULL, allocated_at=NULL WHERE vm_id=?', [vm_id]);
                        await conn.execute('DELETE FROM VmUsage WHERE vm_id=?', [vm_id]);
                        await conn.execute('DELETE FROM InstanceStorageUsage WHERE vm_id=?', [vm_id]);
                        await conn.execute('DELETE FROM HostCapacityAllocations WHERE vm_id=?', [vm_id]);
                        await conn.execute('DELETE FROM VirtualMachines WHERE vm_id=?', [vm_id]);
                    }
                    await conn.execute('DELETE FROM Subnets WHERE subnet_id=?', [ids.subnet]);
                }
                if (ids.network) await conn.execute('DELETE FROM VirtualNetworks WHERE vnet_id=?', [ids.network]);
                if (ids.group) await conn.execute('DELETE FROM ResourceGroups WHERE group_id=?', [ids.group]);
                if (ids.host) await conn.execute('DELETE FROM ProviderHosts WHERE host_id=?', [ids.host]);
                for (const id of users) await conn.execute('DELETE FROM Users WHERE user_id=?', [id]);
            });
        } finally {
            await db.end();
        }
    }
});
