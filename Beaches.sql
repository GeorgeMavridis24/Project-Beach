-- 1. Καθαρίζουμε τη βάση για να ξεκινήσουμε από το μηδέν
DROP DATABASE IF EXISTS smartbeach;
CREATE DATABASE smartbeach;
USE smartbeach;



-- 2. Πίνακας Χρηστών (users)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user'
   
) ENGINE=InnoDB;

-- 3. Πίνακας Παραλιών (beaches)
CREATE TABLE beaches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    ltd DECIMAL(18, 15) NOT NULL,
    lgd DECIMAL(18, 15) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 4. Πίνακας Ξαπλωστρών (sunbeds)
CREATE TABLE sunbeds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    beach_id INT NOT NULL,
    grid_x INT NOT NULL,
    grid_y INT NOT NULL,
    price DECIMAL(5, 2),
	 type ENUM('normal', 'premium') DEFAULT 'normal', 
    status ENUM('available', 'occupied', 'out_of_order') DEFAULT 'available',
    FOREIGN KEY (beach_id) REFERENCES beaches(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. Πίνακας Κρατήσεων (reserves)
CREATE TABLE reserves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    sunbed_id INT NOT NULL,
    res_date DATE NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sunbed_id) REFERENCES sunbeds(id) ON DELETE CASCADE,
    UNIQUE KEY unique_booking (sunbed_id, res_date)
) ENGINE=InnoDB;

ALTER TABLE reserves ADD COLUMN res_time VARCHAR(10)
   


-- Προσθήκη Παραλιών
INSERT INTO beaches (name, description, ltd, lgd) VALUES 
('Oia Beach Bar', 'Πανέμορφη αμμώδης παραλία με ρηχά νερά.',  40.25805700578036, 23.200562496453955),
('Fratelli Beach Bar', 'Διάσημη παραλία με το κουφάρι ενός πλοίου.',40.25838711202865, 23.203786260930215),
('Accordo Pizzeria Beach Bar', 'Γραφικός κολπίσκος στο Πήλιο.', 40.258394088982655, 23.202378864182002);


