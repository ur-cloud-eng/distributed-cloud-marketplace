// Shared money calculations, validation, and error types.
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function toCents(value) {
    const cents = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(cents)) throw new RangeError("Money exceeds safe cent precision.");
    return cents;
}

// Rates are stored in cents and quantities have at most four decimal places.
function priceQuantity(quantity, unitPrice) {
    const scaledQuantity = BigInt(Math.round(quantity * 10000));
    const lineCents = (scaledQuantity * BigInt(toCents(unitPrice)) + 5000n) / 10000n;
    return Number(lineCents) / 100;
}

const sumMoney = (values) =>
    values.reduce((sum, value) => {
        const next = sum + toCents(value);
        if (!Number.isSafeInteger(next))
            throw new RangeError("Money total exceeds safe cent precision.");
        return next;
    }, 0) / 100;

// Round positive proportional money exactly, with half cents rounded upward.
function prorateMoney(amount, numerator, denominator) {
    const a = BigInt(toCents(amount));
    const n = BigInt(toCents(numerator));
    const d = BigInt(toCents(denominator));
    if (a < 0n || n < 0n || d <= 0n) throw new RangeError("Invalid money proportion.");
    const result = (a * n * 2n + d) / (2n * d);
    if (result > BigInt(Number.MAX_SAFE_INTEGER))
        throw new RangeError("Money proportion exceeds safe precision.");
    return Number(result) / 100;
}

function positiveInteger(value) {
    if (
        value === null ||
        value === undefined ||
        value === "" ||
        !["number", "string"].includes(typeof value)
    )
        return null;
    if (typeof value === "string" && !/^\d+$/.test(value)) return null;
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && number <= 2147483647 ? number : null;
}

function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    if (value.slice(0, 4) < "1000") return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

class HttpError extends Error {
    constructor(status, body) {
        const payload = typeof body === "string" ? { error: body } : body;
        super(payload.error || "Request failed");
        this.status = status;
        this.body = payload;
    }
}

module.exports = {
    money,
    priceQuantity,
    sumMoney,
    prorateMoney,
    positiveInteger,
    isDate,
    HttpError
};
