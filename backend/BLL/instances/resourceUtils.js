const { fail, assertId } = require("./instanceUtils");
const { isIPv4 } = require("net");
function text(value, label, max = 100) {
    if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > max ||
        /[\x00-\x1F\x7F]/.test(value)
    )
        fail(400, `Invalid ${label}.`);
    return value.trim();
}
function capacity(value, label) {
    assertId(value, label);
    if (value > 2147483647) fail(400, `Invalid ${label}.`);
    return value;
}
function cidr(value) {
    if (typeof value !== "string") fail(400, "Invalid IPv4 CIDR.");
    const parts = value.split("/");
    if (parts.length !== 2 || !isIPv4(parts[0]) || !/^(0|[1-9]|[12][0-9]|3[0-2])$/.test(parts[1]))
        fail(400, "Invalid IPv4 CIDR.");
    const start = parts[0].split(".").reduce((n, x) => n * 256 + Number(x), 0);
    const size = 2 ** (32 - Number(parts[1]));
    if (start % size !== 0) fail(400, "CIDR must use the network address.");
    return { start, end: start + size - 1 };
}
module.exports = { text, capacity, cidr };
