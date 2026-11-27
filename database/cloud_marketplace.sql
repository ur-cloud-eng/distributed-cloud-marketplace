-- Fresh-install entry point for the MySQL client.
-- Run from the project root with an empty database selected.

SOURCE database/schema/01_accounts.sql;
SOURCE database/schema/02_resources.sql;
SOURCE database/schema/03_capacity_and_usage.sql;
SOURCE database/schema/04_finance_and_notifications.sql;
SOURCE database/schema/05_database_logic.sql;
SOURCE database/schema/06_seed_pricing.sql;
