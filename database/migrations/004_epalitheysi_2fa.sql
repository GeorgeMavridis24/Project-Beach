-- =====================================================================
-- Αναβάθμιση ΥΠΑΡΧΟΥΣΑΣ βάσης: επαλήθευση email και έλεγχος σε 2 βήματα.
-- Τρέχει ΜΙΑ φορά, μετά το 003. Οι λογαριασμοί που υπάρχουν ήδη
-- θεωρούνται επαληθευμένοι (για να μην κλειδωθεί κανείς έξω).
-- Αν φτιάχνεις τη βάση από την αρχή (1-EGKATASTASI.bat), ΔΕΝ χρειάζεται.
-- =====================================================================
SET NAMES utf8mb4;
USE smartbeach;

ALTER TABLE users
    ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0;

UPDATE users SET email_verified = 1;

CREATE TABLE auth_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    purpose ENUM('verify_email', 'login') NOT NULL,
    code_hash CHAR(64) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    KEY idx_user_purpose (user_id, purpose)
) ENGINE=InnoDB;
