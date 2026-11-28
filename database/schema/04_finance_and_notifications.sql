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

-- ------------------------- INVOICES AND PAYMENTS ----------------------------
CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(60) NOT NULL,
    customer_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status ENUM('Unpaid','Paid','Cancelled') NOT NULL DEFAULT 'Unpaid',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_invoice_number UNIQUE (invoice_number),
    CONSTRAINT uq_invoice_period UNIQUE (customer_id,period_start,period_end),
    CONSTRAINT fk_invoice_customer FOREIGN KEY (customer_id) REFERENCES Users(user_id) ON DELETE RESTRICT,
    CONSTRAINT ck_invoice_period CHECK (period_end > period_start),
    CONSTRAINT ck_invoice_nonnegative CHECK (subtotal >= 0),
    CONSTRAINT ck_invoice_total CHECK (total = subtotal)
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
    status ENUM('Succeeded') NOT NULL DEFAULT 'Succeeded',
    simulated BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payment_reference UNIQUE (payment_reference),
    CONSTRAINT uq_payment_invoice UNIQUE (invoice_id),
    CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_payment_positive CHECK (amount > 0),
    CONSTRAINT ck_payment_simulated CHECK (simulated = TRUE)
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

CREATE TABLE finance_locks (
    kind VARCHAR(16) NOT NULL,
    owner_id INT NOT NULL,
    PRIMARY KEY (kind,owner_id),
    CONSTRAINT fk_finance_locks_user FOREIGN KEY (owner_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_finance_lock_kind CHECK (kind IN ('Customer','Provider'))
) ENGINE=InnoDB;

-- In-app notifications with an optional payment reference.
CREATE TABLE Notifications (
    notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category ENUM('security','billing','resource','system') NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL,
    payment_id INT NULL,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_notifications_payment FOREIGN KEY (payment_id)
        REFERENCES payments(id) ON DELETE SET NULL,
    KEY idx_notification_inbox (user_id,read_at,created_at)
) ENGINE=InnoDB;
