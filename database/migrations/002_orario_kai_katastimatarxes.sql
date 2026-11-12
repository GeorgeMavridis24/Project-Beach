-- =====================================================================
-- Αναβάθμιση ΥΠΑΡΧΟΥΣΑΣ βάσης (χωρίς να χαθούν δεδομένα):
--   * ωράριο λειτουργίας ανά κατάστημα (open_time, close_time)
--   * ρόλος 'owner' (καταστηματάρχης) και σύνδεση καταστήματος -> owner
-- Τρέχει ΜΙΑ φορά (MySQL Workbench: File -> Open SQL Script -> ⚡).
-- Αν φτιάχνεις τη βάση από την αρχή, αρκεί το database/schema.sql.
-- =====================================================================
USE smartbeach;

ALTER TABLE users
    MODIFY role ENUM('user', 'staff', 'owner', 'admin') NOT NULL DEFAULT 'user';

ALTER TABLE beaches
    ADD COLUMN open_time TIME NOT NULL DEFAULT '08:00:00',
    ADD COLUMN close_time TIME NOT NULL DEFAULT '20:00:00',
    ADD COLUMN owner_id INT NULL,
    ADD CONSTRAINT fk_beach_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- Παράδειγμα ωραρίων για τα 3 αρχικά καταστήματα
UPDATE beaches SET open_time = '08:00', close_time = '22:00' WHERE name = 'Oia Beach Bar';
UPDATE beaches SET open_time = '08:00', close_time = '21:00' WHERE name = 'Fratelli Beach Bar';
UPDATE beaches SET open_time = '09:00', close_time = '21:00' WHERE name = 'Accordo Pizzeria Beach Bar';
