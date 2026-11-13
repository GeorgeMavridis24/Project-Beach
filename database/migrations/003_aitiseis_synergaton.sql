-- =====================================================================
-- Αναβάθμιση ΥΠΑΡΧΟΥΣΑΣ βάσης: αιτήσεις συνεργατών και μηνύματα.
-- Τρέχει ΜΙΑ φορά, μετά το 002. Αν φτιάχνεις τη βάση από την αρχή
-- (ή με το 1-EGKATASTASI.bat), ΔΕΝ χρειάζεται.
-- =====================================================================
SET NAMES utf8mb4;
USE smartbeach;

-- ---------------------------------------------------------------------
-- Αιτήσεις συνεργατών: ένας χρήστης ζητά να γίνει καταστηματάρχης και
-- περιγράφει τον χώρο του (θέση, ωράριο, διάταξη ξαπλωστρών). Με την
-- έγκριση από τον admin δημιουργείται αυτόματα το κατάστημα (beach_id).
-- unread_user / unread_admin: αδιάβαστα μηνύματα για κάθε πλευρά.
-- ---------------------------------------------------------------------
CREATE TABLE partner_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    business_name VARCHAR(100) NOT NULL,
    description TEXT,
    phone VARCHAR(30) NOT NULL,
    ltd DECIMAL(18, 15) NOT NULL,
    lgd DECIMAL(18, 15) NOT NULL,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    grid_rows INT NOT NULL,
    grid_cols INT NOT NULL,
    premium_rows INT NOT NULL DEFAULT 0,
    premium_price DECIMAL(6, 2) NOT NULL,
    price DECIMAL(6, 2) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    admin_note TEXT NULL,
    beach_id INT NULL,
    unread_user INT NOT NULL DEFAULT 0,
    unread_admin INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (beach_id) REFERENCES beaches(id) ON DELETE SET NULL,
    KEY idx_status (status)
) ENGINE=InnoDB;

-- Μηνύματα (επικοινωνία) ανάμεσα στον αιτούντα και τον διαχειριστή.
-- sender_id NULL = αυτόματο μήνυμα του συστήματος.
CREATE TABLE partner_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    sender_id INT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES partner_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

