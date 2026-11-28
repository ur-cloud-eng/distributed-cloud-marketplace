const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const swagger = require('../backend/swagger');

test('Swagger methods and paths match all registered Express API operations', t => {
    const mounts = new WeakMap();
    const rememberMount = (method, getStack) => function (first, ...rest) {
        const count = getStack(this).length;
        const result = method.call(this, first, ...rest);
        for (const layer of getStack(this).slice(count)) {
            if (layer.handle.stack) mounts.set(layer, typeof first === 'string' ? first : '');
        }
        return result;
    };
    t.mock.method(express.application, 'use', rememberMount(express.application.use, app => app._router?.stack ?? []));
    t.mock.method(express.Router, 'use', rememberMount(express.Router.use, router => router.stack));

    const previousSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'test-only-swagger-session-secret-000000';
    t.after(() => {
        if (previousSecret === undefined) delete process.env.SESSION_SECRET;
        else process.env.SESSION_SECRET = previousSecret;
    });

    const database = require.resolve('../backend/DAL/dbconn');
    const previousDatabase = require.cache[database];
    require.cache[database] = { loaded: true, exports: {} };
    t.after(() => {
        if (previousDatabase) require.cache[database] = previousDatabase;
        else delete require.cache[database];
    });

    function endpoints(stack, prefix = '') {
        const operations = [];
        for (const layer of stack) {
            if (mounts.has(layer)) operations.push(...endpoints(layer.handle.stack, prefix + mounts.get(layer)));
            if (!layer.route) continue;
            for (const route of [].concat(layer.route.path)) {
                const path = (prefix + route).replace(/\/$/, '').replace(/:(\w+)/g, '{$1}');
                if (!path.startsWith('/api/') && path !== '/api-docs.json') continue;
                for (const method of Object.keys(layer.route.methods)) operations.push(method + ' ' + path);
            }
        }
        return operations;
    }

    const app = require('../server');
    const documented = Object.entries(swagger.paths).flatMap(([path, operations]) =>
        Object.keys(operations).map(method => method + ' ' + path));
    assert.deepEqual(documented.sort(), endpoints(app._router.stack).sort());
    assert.deepEqual(swagger.security, [{ sessionCookie: [] }]);
});
