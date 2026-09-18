-- Adds users.is_admin, introduced in 0ad7b74 when product writes and
-- order-status changes became admin-only. Databases created from
-- un533n_v2.sql after that commit already have it -- this file is only for
-- upgrading one provisioned earlier. Without the column, auth.admin throws
-- on every admin route.

ALTER TABLE users
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE AFTER last_name;
