-- ------------------------- FINANCIAL PRICING -------------------------------
-- Prices and provider accounting are strictly SIMULATED.
CREATE TABLE pricing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_type ENUM('CPU','RAM','Storage','GPU') NOT NULL,
    cloud_class ENUM('Economy','Business','Critical') NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_resource_class UNIQUE (resource_type,cloud_class),
    CONSTRAINT ck_price_positive CHECK (unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE pricing_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pricing_rule_id INT NOT NULL,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pricing_history_rule FOREIGN KEY (pricing_rule_id)
        REFERENCES pricing_rules(id) ON DELETE RESTRICT,
    CONSTRAINT ck_price_history_positive CHECK (old_price >= 0 AND new_price >= 0),
    KEY idx_price_history_time (pricing_rule_id,changed_at)
) ENGINE=InnoDB;

CREATE TABLE discount_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    discount_type ENUM('Percentage','Fixed') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    max_uses INT NULL,
    used_count INT NOT NULL DEFAULT 0,
    expires_at DATETIME NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_discounts_code UNIQUE (code),
    CONSTRAINT ck_discounts_value CHECK (discount_value > 0),
    CONSTRAINT chk_discount_percentage CHECK
        (discount_type <> 'Percentage' OR discount_value <= 100),
    CONSTRAINT ck_discounts_uses CHECK
        (used_count >= 0 AND (max_uses IS NULL OR (max_uses > 0 AND used_count <= max_uses)))
) ENGINE=InnoDB;

-- ------------------------- INVOICES AND PAYMENTS ----------------------------
CREATE TABLE billing_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_billing_customer FOREIGN KEY (customer_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT unique_customer_billing_period UNIQUE (customer_id,period_start,period_end),
    CONSTRAINT ck_billing_range CHECK (period_end > period_start),
    KEY idx_billing_customer_end (customer_id,period_end)
) ENGINE=InnoDB;

CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(60) NOT NULL,
    billing_period_id INT NOT NULL,
    status ENUM('Unpaid','Paid','Cancelled') NOT NULL DEFAULT 'Unpaid',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_code_id INT NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_invoice_number UNIQUE (invoice_number),
    CONSTRAINT uq_invoice_period UNIQUE (billing_period_id),
    CONSTRAINT fk_invoice_billing_period FOREIGN KEY (billing_period_id)
        REFERENCES billing_periods(id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoice_discount_code FOREIGN KEY (discount_code_id)
        REFERENCES discount_codes(id) ON DELETE SET NULL,
    CONSTRAINT ck_invoice_nonnegative CHECK
        (subtotal >= 0 AND total >= 0 AND discount_amount >= 0 AND discount_amount <= subtotal),
    CONSTRAINT ck_invoice_total CHECK (total = subtotal - discount_amount)
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    provider_id INT NULL,
    resource_type ENUM('CPU','RAM','Storage','GPU') NOT NULL,
    cloud_class ENUM('Economy','Business','Critical') NOT NULL,
    quantity DECIMAL(14,4) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_item_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices(id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoice_item_provider FOREIGN KEY (provider_id)
        REFERENCES Users(user_id) ON DELETE RESTRICT,
    CONSTRAINT ck_invoice_item_values CHECK
        (quantity > 0 AND unit_price >= 0 AND line_total >= 0),
    KEY idx_invoice_items_provider (provider_id,invoice_id)
) ENGINE=InnoDB;

CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_reference VARCHAR(80) NOT NULL,
    invoice_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('Succeeded','Refunded') NOT NULL DEFAULT 'Succeeded',
    simulated BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payment_reference UNIQUE (payment_reference),
    CONSTRAINT uq_payment_invoice UNIQUE (invoice_id),
    CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_payment_positive CHECK (amount > 0),
    CONSTRAINT ck_payment_simulated CHECK (simulated = TRUE)
) ENGINE=InnoDB;

CREATE TABLE refunds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    refund_reference VARCHAR(80) NOT NULL,
    payment_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(255) NULL,
    status ENUM('Succeeded') NOT NULL DEFAULT 'Succeeded',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_refund_reference UNIQUE (refund_reference),
    CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_refund_amount CHECK (amount > 0),
    KEY idx_refunds_payment (payment_id)
) ENGINE=InnoDB;

CREATE TABLE provider_earnings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    provider_id INT NOT NULL,
    gross_amount DECIMAL(12,2) NOT NULL,
    commission_rate DECIMAL(5,2) NOT NULL,
    commission_amount DECIMAL(12,2) NOT NULL,
    net_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_earning_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_earning_provider FOREIGN KEY (provider_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT unique_payment_provider UNIQUE (payment_id,provider_id),
    CONSTRAINT ck_earning_nonnegative CHECK
        (gross_amount >= 0 AND commission_rate BETWEEN 0 AND 100 AND
         commission_amount >= 0 AND net_amount >= 0),
    CONSTRAINT ck_earning_balance CHECK (net_amount = gross_amount - commission_amount),
    KEY idx_earnings_provider (provider_id)
) ENGINE=InnoDB;

CREATE TABLE withdrawal_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('Requested','Approved','Rejected','Paid') NOT NULL DEFAULT 'Requested',
    note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_withdrawal_provider FOREIGN KEY (provider_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_withdrawal_amount CHECK (amount > 0),
    KEY idx_withdrawals_provider_status (provider_id,status)
) ENGINE=InnoDB;

CREATE TABLE refund_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    customer_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    admin_note VARCHAR(255) NULL,
    decided_by INT NULL,
    decided_at DATETIME NULL,
    refund_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_refund_request_payment FOREIGN KEY (payment_id)
        REFERENCES payments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_refund_request_customer FOREIGN KEY (customer_id)
        REFERENCES Users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_refund_request_decider FOREIGN KEY (decided_by)
        REFERENCES Users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_refund_request_refund FOREIGN KEY (refund_id)
        REFERENCES refunds(id) ON DELETE SET NULL,
    CONSTRAINT uq_refund_request_result UNIQUE (refund_id),
    CONSTRAINT ck_refund_request_amount CHECK (amount > 0),
    KEY idx_refund_requests_customer (customer_id,status),
    KEY idx_refund_requests_status (status,created_at)
) ENGINE=InnoDB;

CREATE TABLE financial_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    actor_role VARCHAR(20) NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id INT NULL,
    details TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES Users(user_id)
        ON DELETE SET NULL,
    KEY idx_audit_entity (entity_type,entity_id),
    KEY idx_audit_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE finance_locks (
    kind VARCHAR(16) NOT NULL,
    owner_id INT NOT NULL,
    PRIMARY KEY (kind,owner_id),
    CONSTRAINT fk_finance_locks_user FOREIGN KEY (owner_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_finance_lock_kind CHECK (kind IN ('Customer','Provider'))
) ENGINE=InnoDB;

CREATE TABLE api_idempotency (
    actor_role VARCHAR(20) NOT NULL,
    actor_id INT NOT NULL,
    request_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_role,actor_id,request_key),
    CONSTRAINT fk_idempotency_user FOREIGN KEY (actor_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    KEY idx_idempotency_created (created_at)
) ENGINE=InnoDB;

-- Shared inbox. Payment and refund references are optional.
CREATE TABLE Notifications (
    notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category ENUM('security','billing','resource','payout','system') NOT NULL,
    channel ENUM('in_app','email') NOT NULL DEFAULT 'in_app',
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    delivery_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    read_at DATETIME NULL,
    payment_id INT NULL,
    refund_id INT NULL,
    notification_type VARCHAR(40) NULL,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_notifications_payment FOREIGN KEY (payment_id)
        REFERENCES payments(id) ON DELETE SET NULL,
    CONSTRAINT fk_notifications_refund FOREIGN KEY (refund_id)
        REFERENCES refunds(id) ON DELETE SET NULL,
    KEY idx_notification_inbox (user_id,read_at,created_at)
) ENGINE=InnoDB;
