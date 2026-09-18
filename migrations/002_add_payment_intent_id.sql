-- Adds orders.payment_intent_id, introduced in 114e0a9 when orders became
-- tied to the Stripe payment that paid for them. UNIQUE so one payment can
-- never produce two orders; nullable because MySQL permits multiple NULLs in
-- a unique index, which keeps pre-existing order rows valid.
--
-- Without the column the INSERT in routes/orders.js fails with
-- ER_BAD_FIELD_ERROR -- after the customer's card has already been charged.

ALTER TABLE orders
  ADD COLUMN payment_intent_id VARCHAR(255) UNIQUE AFTER billing_address_id;
