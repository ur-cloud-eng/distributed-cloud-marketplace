// Shared helpers. Lives next to utils/util.js (which it builds on).
const crypto = require("crypto");
const { HttpError, positiveInteger } = require("./util");

const bad = (message, extra = {}) => new HttpError(400, { error: message, ...extra });
const notFound = (message) => new HttpError(404, { error: message });

const makeRef = (prefix) =>
    `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

function requiredId(value) {
    const result = positiveInteger(value);
    if (!result) throw bad("Invalid ID.");
    return result;
}

// Optional positive-integer query filter: undefined -> null, invalid -> 400
const optionalId = (value, name) => {
    if (value === undefined) return null;
    const id = positiveInteger(value);
    if (!id) throw bad(`${name} must be a positive integer.`);
    return id;
};

const withCurrency = (row) => ({ ...row, currency: "USD" });

module.exports = {
    bad,
    notFound,
    makeRef,
    requiredId,
    optionalId,
    withCurrency
};
