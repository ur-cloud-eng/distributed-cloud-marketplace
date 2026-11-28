const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendation } = require('../backend/BLL/ai/recommendationValidator');
const { checkProposalCapacity } = require('../backend/BLL/ai/capacityService');

const resource = (id, type, dependsOn, options = {}) => ({
    id, name: id, type, dependsOn, reason: 'Required for the project', ...options
});
const compute = { hostingClass: 'Economy', vcpu: 2, ramGb: 4, diskGb: 10 };
const database = { hostingClass: 'Economy', vcpu: 2, ramGb: 4, sizeGb: 10 };
const storage = { hostingClass: 'Economy', sizeGb: 10 };
const group = resource('group', 'Resource Group', [], { region: 'east' });
const network = resource('network', 'Virtual Network', ['group']);
const subnet = resource('subnet', 'Subnet', ['network']);
const vm = resource('vm', 'Virtual Machine', ['subnet'], compute);
const balancer = resource('balancer', 'Load Balancer', ['network'], compute);
const mysql = resource('mysql', 'Managed MySQL', ['group'], database);
const web = resource('web', 'Web App', ['group', 'mysql'], compute);
const blob = resource('blob', 'Blob Storage', ['group'], storage);
const file = resource('file', 'File Storage', ['group'], storage);
const proposal = (...resources) => ({ summary: 'Small cloud rental', resources, warnings: [] });
const host = { region: 'east', hosting_class: 'Economy', free_cpu: 2, free_ram_gb: 4, free_disk_gb: 20 };

test('valid VM, storage, Load Balancer, and Web App plans cover all eleven types', () => {
    const architectures = [
        proposal(group, network, subnet, vm),
        proposal(group, blob, file),
        proposal(group, network, balancer),
        proposal(group, mysql, web,
            resource('sql', 'Managed SQL Server', ['group'], database),
            resource('postgres', 'Managed PostgreSQL', ['group'], database))
    ];
    for (const plan of architectures) assert.equal(validateRecommendation(plan), true);
    assert.equal(new Set(architectures.flatMap(plan => plan.resources.map(item => item.type))).size, 11);
});

test('rejects unsupported and malformed dependencies and duplicate resources', () => {
    assert.throws(() => validateRecommendation(proposal(group, network, subnet, vm,
        { ...balancer, dependsOn: ['network', 'vm'] })), /Unsupported dependency/);
    assert.throws(() => validateRecommendation(proposal(group, { ...network, dependsOn: ['missing'] })), /Invalid dependency/);
    assert.throws(() => validateRecommendation(proposal(group, { ...network, dependsOn: ['group', 'group'] })), /Duplicate dependency/);
    assert.throws(() => validateRecommendation(proposal(group, network, vm)), /Invalid dependency/);
    assert.throws(() => validateRecommendation(proposal(group, { ...vm, dependsOn: ['group'] })), /requires one Subnet/);
    assert.throws(() => validateRecommendation(proposal(group, group)), /Duplicate resource ID/);
    assert.throws(() => validateRecommendation(proposal(group, blob, { ...blob, id: 'another' })), /Duplicate resource name/);
    const other = resource('other', 'Resource Group', [], { region: 'east' });
    assert.throws(() => validateRecommendation(proposal(group, other, web,
        { ...mysql, dependsOn: ['other'] })), /Invalid Web App database/);
});

test('capacity checking uses combined CPU, RAM, and storage within a compatible host', () => {
    const plan = proposal(group, network, subnet, vm, balancer, blob, file);
    assert.deepEqual(checkProposalCapacity(plan, [host]), {
        feasible: false, unavailable: ['balancer', 'file']
    });
    assert.equal(checkProposalCapacity(plan, [{ ...host, free_cpu: 4, free_ram_gb: 8, free_disk_gb: 40 }]).feasible, true);
    for (const mismatch of [
        { free_cpu: 1 }, { free_ram_gb: 3 }, { free_disk_gb: 9 },
        { region: 'west' }, { hosting_class: 'Critical' }
    ]) {
        assert.deepEqual(checkProposalCapacity(proposal(group, network, balancer), [{ ...host, ...mismatch }]), {
            feasible: false, unavailable: ['balancer']
        });
    }
    assert.equal(host.free_disk_gb, 20);
});

test('advisor sends simplified Gemini instructions and rejects invalid generated sizes', async t => {
    const dbPath = require.resolve('../backend/DAL/dbconn');
    require.cache[dbPath] = { exports: { execute: async sql => {
        assert.match(sql, /vw_ProviderCapacity/);
        return [[host]];
    } } };
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'fixture-only-key';
    t.after(() => {
        delete require.cache[dbPath];
        if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previousKey;
    });

    let fixture = proposal(group, network, balancer);
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        const payload = JSON.parse(options.body);
        const instructions = payload.systemInstruction.parts[0].text;
        assert.match(instructions, /only dependency is its parent Virtual Network/);
        assert.match(instructions, /Web App may optionally depend on one managed database/);
        assert.match(instructions, /Do not recommend assigning or releasing IP addresses/);
        assert.match(instructions, /Never claim the resources have been deployed/);
        assert.equal(payload.generationConfig.responseJsonSchema.properties.resources.items.properties.type.enum.length, 11);
        assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text).availableCapacity, [host]);
        return {
            ok: true,
            json: async () => ({
                candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(fixture) }] } }]
            })
        };
    });
    const { recommend } = require('../backend/BLL/ai/architectureService');
    assert.equal((await recommend('Recommend a small load balancer')).capacityCheck.feasible, true);
    for (const size of [0, -1, 1.5, 2147483648, '2']) {
        fixture = proposal(group, network, { ...balancer, vcpu: size });
        await assert.rejects(recommend('Recommend a small load balancer'), { status: 502 });
    }
    await assert.rejects(recommend('small'), { status: 400 });
});
