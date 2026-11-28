const { handle } = require("../../middleware/access");
const express = require("express");
const { positiveInteger } = require("../../../utils/util");
const { bad, notFound } = require("../../../utils/helpers");
const billing = require("../../../BLL/finance/invoiceService");
const payment = require("../../../BLL/finance/paymentService");

const router = express.Router();

// Customer invoices
router.get(
    "/invoices",
    handle(async (req, res) => {
        res.json(await billing.listInvoices(req.user.id));
    }, "Could not load your invoices.")
);

router.get(
    "/invoices/:id",
    handle(async (req, res) => {
        const id = positiveInteger(req.params.id);
        if (!id) throw bad("Invalid invoice ID.");

        const invoice = await billing.getInvoice(id, req.user.id);
        if (!invoice) throw notFound("Invoice not found.");

        invoice.items = invoice.items.map(({ provider_id, ...item }) => item);
        res.json(invoice);
    }, "Could not load your invoice.")
);

// Customer payments
router.get(
    "/payments",
    handle(async (req, res) => {
        res.json(await payment.listPayments({ customerId: req.user.id }));
    }, "Could not load your payments.")
);

// Customers initiate payments for their own unpaid invoices.
router.post(
    "/payments",
    handle(async (req, res) => {
        const invoiceId =
            typeof req.body.invoice_id === "number" ? positiveInteger(req.body.invoice_id) : null;
        if (!invoiceId) throw bad("Select a valid invoice.");
        res.status(201).json(await payment.createPayment({ invoiceId, customerId: req.user.id }));
    }, "Could not pay invoice.")
);

module.exports = router;
