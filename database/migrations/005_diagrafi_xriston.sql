-- =====================================================================
-- Αναβάθμιση ΥΠΑΡΧΟΥΣΑΣ βάσης: διαγραφή χρηστών χωρίς να χάνονται τα
-- στατιστικά. Οι κρατήσεις ενός χρήστη που διαγράφεται μένουν ανώνυμα
-- (user_id = NULL) αντί να σβήνονται. Τρέχει ΜΙΑ φορά, μετά το 004.
-- Αν φτιάχνεις τη βάση από την αρχή (1-EGKATASTASI.bat), ΔΕΝ χρειάζεται.
-- =====================================================================
SET NAMES utf8mb4;
USE smartbeach;

ALTER TABLE reserves DROP FOREIGN KEY reserves_ibfk_1;
ALTER TABLE reserves MODIFY user_id INT NULL;
ALTER TABLE reserves
    ADD CONSTRAINT fk_reserves_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
