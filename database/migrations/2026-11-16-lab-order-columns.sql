-- Columns the models expect since commit d553ec4 ("reschedule the lab order", 2026-10-06), which added them to
-- models/labOrder.js and models/cart.js without a migration. Without them every query that selects them fails, e.g.
-- GET /api/careNavigator/order-labs/:orderId -> 500 "Unknown column 'lo.sub_city_id'".
-- All columns are nullable INTs, so this does not change or lock existing data beyond the ALTER itself.
-- Check first which ones already exist (run on each environment):
--   SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME IN ('sub_city_id', 'rescheduled_by', 'approved_by');

ALTER TABLE `labOrders`
    ADD COLUMN `sub_city_id` INT NULL,     -- models/labOrder.js subCityId
    ADD COLUMN `rescheduled_by` INT NULL,  -- patient id that last rescheduled the order from the patient portal
    ADD COLUMN `approved_by` INT NULL;     -- care navigator id that approved (confirmed) the order

ALTER TABLE `cart`
    ADD COLUMN `sub_city_id` INT NULL;     -- models/cart.js subCityId
