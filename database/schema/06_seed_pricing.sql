-- -------------------- INITIAL APP CONFIGURATION ----------------------------
-- 12 configurable starter prices for the simulated marketplace.
-- These are EXAMPLE tariff values; review/replace before real deployment.
-- Avoid overwriting prices when adding existing database records.

INSERT INTO pricing_rules (resource_type,cloud_class,unit_price)
VALUES
    ('CPU','Economy',2.00),('CPU','Business',3.00),('CPU','Critical',5.00),
    ('RAM','Economy',1.00),('RAM','Business',1.50),('RAM','Critical',2.50),
    ('Storage','Economy',0.03),('Storage','Business',0.06),('Storage','Critical',0.10),
    ('GPU','Economy',4.00),('GPU','Business',6.00),('GPU','Critical',10.00)
ON DUPLICATE KEY UPDATE id=id;

-- Record the starting price for rules with no history yet.
INSERT INTO pricing_history (pricing_rule_id,old_price,new_price,changed_at)
SELECT p.id,p.unit_price,p.unit_price,UTC_TIMESTAMP()
FROM pricing_rules p
WHERE NOT EXISTS (SELECT 1 FROM pricing_history h WHERE h.pricing_rule_id=p.id);
