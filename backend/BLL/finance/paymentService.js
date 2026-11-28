const repository = require("../../DAL/finance/payment");
const { lockInvoice } = require("../../DAL/finance/invoice");
const { HttpError, money, sumMoney, prorateMoney } = require("../../utils/util");
const { withTransaction } = require("../../DAL/dbconn");
const { bad, makeRef } = require("../../utils/helpers");
const { notify } = require("./notificationService");
const { lockProviders } = require("../../DAL/finance/locks");

const COMMISSION = Number(process.env.PLATFORM_COMMISSION_RATE ?? 15);

const listPayments = repository.listPayments;

async function createPayment({ invoiceId, customerId }) {
    if (!(
        Number.isFinite(COMMISSION) &&
        COMMISSION >= 0 &&
        COMMISSION <= 100 &&
        Math.abs(COMMISSION * 100 - Math.round(COMMISSION * 100)) < 0.000001
    ))
        throw new HttpError(500, { error: "Invalid commission rate." });

    return withTransaction(async (connection) => {
        const [[invoice]] = await lockInvoice(connection, invoiceId);

        if (!invoice || Number(invoice.customer_id) !== Number(customerId))
            throw new HttpError(404, { error: "Invoice not found for your account." });

        if (invoice.status !== "Unpaid")
            throw new HttpError(409, {
                error: "Only unpaid invoices can be paid.",
                invoice_status: invoice.status
            });

        const [items] = await repository.providerInvoiceTotals(connection, [invoiceId]);
        if (!items.length || items.some((item) => item.provider_id == null))
            throw bad(
                "This invoice has no provider allocation. Please contact support; payment cannot be completed until its invoice items identify a provider."
            );

        const providers = items.filter((item) => item.gross_amount > 0);
        const total = sumMoney(providers.map((item) => item.gross_amount));
        if (total <= 0) throw bad("Invoice total must be positive to create a payment.");

        if (total !== money(invoice.total))
            throw bad("Provider line totals must equal invoice total.", {
                invoice_total: money(invoice.total),
                allocation_total: total
            });

        const reference = makeRef("PAY");
        await lockProviders(
            connection,
            providers.map((p) => p.provider_id)
        );

        const [{ insertId }] = await repository.insertPayment(connection, [
            reference,
            invoiceId,
            total
        ]);

        const lines = [];

        for (const p of providers) {
            const commission = prorateMoney(p.gross_amount, COMMISSION, 100);
            const net = money(p.gross_amount - commission);

            await repository.insertEarnings(connection, [
                insertId,
                p.provider_id,
                p.gross_amount,
                COMMISSION,
                commission,
                net
            ]);

            lines.push({
                ...p,
                commission_rate: COMMISSION,
                commission_amount: commission,
                net_amount: net
            });
        }

        await repository.markInvoicePaid(connection, [invoiceId]);

        const tell = (to, id, title, message) =>
            notify(connection, {
                to,
                id,
                title,
                message,
                paymentId: insertId
            });

        await tell(
            "Customer",
            invoice.customer_id,
            "Payment successful",
            `Payment ${reference} succeeded for $${total.toFixed(2)}.`
        );

        for (const line of lines)
            await tell(
                "Provider",
                line.provider_id,
                "Earnings recorded",
                `Payment ${reference} recorded. Your net earnings are $${line.net_amount.toFixed(2)}.`
            );

        return {
            message: "Simulated payment successful; no real money was charged.",
            payment_id: insertId,
            payment_reference: reference,
            invoice_id: invoiceId,
            amount: total,
            currency: "USD",
            status: "Succeeded",
            platform_commission_rate: COMMISSION,
            provider_earnings: lines
        };
    });
}

module.exports = { listPayments, createPayment };
