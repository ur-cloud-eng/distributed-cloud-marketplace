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
