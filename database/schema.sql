-- =====================================================================
-- SmartBeach - Σχήμα βάσης δεδομένων (MySQL 8 / MariaDB 10.6+)
-- ΠΡΟΣΟΧΗ: Το αρχείο σβήνει και ξαναφτιάχνει τη βάση `smartbeach`.
-- =====================================================================
SET NAMES utf8mb4;  -- για σωστά ελληνικά όταν φορτώνεται από τη γραμμή εντολών
DROP DATABASE IF EXISTS smartbeach;
CREATE DATABASE smartbeach CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smartbeach;

-- ---------------------------------------------------------------------
-- Χρήστες. Ρόλοι: user (πελάτης), staff (προσωπικό εισόδου),
-- owner (καταστηματάρχης: διαχειρίζεται ΜΟΝΟ το δικό του beach bar), admin.
-- Η εγγραφή από την εφαρμογή δίνει ΠΑΝΤΑ ρόλο 'user'.
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('user', 'staff', 'owner', 'admin') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Παραλίες / Beach bars. Κάθε κατάστημα έχει το δικό του ωράριο
-- (open_time - close_time) και προαιρετικά έναν καταστηματάρχη (owner_id).
-- ---------------------------------------------------------------------
CREATE TABLE beaches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    ltd DECIMAL(18, 15) NOT NULL,
    lgd DECIMAL(18, 15) NOT NULL,
    open_time TIME NOT NULL DEFAULT '08:00:00',
    close_time TIME NOT NULL DEFAULT '20:00:00',
    owner_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_hours CHECK (close_time > open_time)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Ξαπλώστρες. grid_x = σειρά (1 = πιο κοντά στη θάλασσα), grid_y = θέση.
-- price = τιμή ολόκληρης ημέρας. status: active / out_of_order (χαλασμένη).
-- ---------------------------------------------------------------------
CREATE TABLE sunbeds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    beach_id INT NOT NULL,
    grid_x INT NOT NULL,
    grid_y INT NOT NULL,
    price DECIMAL(6, 2) NOT NULL,
    type ENUM('normal', 'premium') NOT NULL DEFAULT 'normal',
    status ENUM('active', 'out_of_order') NOT NULL DEFAULT 'active',
    FOREIGN KEY (beach_id) REFERENCES beaches(id) ON DELETE CASCADE,
    UNIQUE KEY unique_position (beach_id, grid_x, grid_y)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Κρατήσεις. Μία ξαπλώστρα μπορεί να έχει πολλές κρατήσεις την ίδια μέρα
-- αρκεί τα διαστήματα [res_time, leave_time) να ΜΗΝ επικαλύπτονται.
-- Ο έλεγχος επικάλυψης γίνεται στο backend μέσα σε transaction με
-- κλείδωμα γραμμής (SELECT ... FOR UPDATE) στην ξαπλώστρα.
--   price         : η τιμή τη στιγμή της κράτησης (δεν αλλάζει αναδρομικά)
--   status        : confirmed / cancelled (οι ακυρώσεις ΔΕΝ διαγράφονται)
--   checkin_code  : μοναδικός κωδικός που γίνεται QR για την είσοδο
-- ---------------------------------------------------------------------
CREATE TABLE reserves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sunbed_id INT NOT NULL,
    res_date DATE NOT NULL,
    res_time TIME NOT NULL,
    leave_time TIME NOT NULL,
    price DECIMAL(6, 2) NOT NULL,
    status ENUM('confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed',
    checkin_code CHAR(12) NOT NULL UNIQUE,
    checked_in_at TIMESTAMP NULL DEFAULT NULL,
    cancelled_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sunbed_id) REFERENCES sunbeds(id) ON DELETE CASCADE,
    KEY idx_sunbed_date (sunbed_id, res_date),
    KEY idx_date_status (res_date, status),
    CONSTRAINT chk_times CHECK (leave_time > res_time)
) ENGINE=InnoDB;

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

-- ---------------------------------------------------------------------
-- Αρχικά δεδομένα: παραλίες
-- (Για admin λογαριασμό: python -m scripts.create_admin  μέσα στο backend/)
-- ---------------------------------------------------------------------
INSERT INTO beaches (name, description, ltd, lgd, open_time, close_time) VALUES
('Oia Beach Bar', 'Πανέμορφη αμμώδης παραλία με ρηχά νερά.', 40.25805700578036, 23.200562496453955, '08:00', '22:00'),
('Fratelli Beach Bar', 'Διάσημη παραλία με το κουφάρι ενός πλοίου.', 40.25838711202865, 23.203786260930215, '08:00', '21:00'),
('Accordo Pizzeria Beach Bar', 'Γραφικός κολπίσκος στο Πήλιο.', 40.258394088982655, 23.202378864182002, '09:00', '21:00');
