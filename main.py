from pydantic import BaseModel
import jwt
import bcrypt
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import mysql.connector
from datetime import datetime, timedelta

SECRET_KEY = ""
ALGORITHM = ""
ACCESS_TOKEN_EXPIRE_MINUTES = 60

def get_password_hash(password: str):
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_password.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

app = FastAPI(title="SmartBeach API")

# ==========================================
# 1. MODELS (ΤΑ ΚΑΛΟΥΠΙΑ JSON)
# ==========================================
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: str = "user"

class UserLogin(BaseModel):
    email: str
    password: str

class UserUpdate(BaseModel):
    username: str
    email: str
    role: str

class BeachCreate(BaseModel):
    name: str
    description: str
    ltd: float
    lgd: float

class TimeUpdate(BaseModel):
    new_time: str
    new_leave_time: str

class SunbedUpdate(BaseModel):
    price: float
    type: str

# ==========================================
# 2. ΑΣΦΑΛΕΙΑ & ΒΑΣΗ ΔΕΔΟΜΕΝΩΝ
# ==========================================
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload 
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Το token έληξε! Κάνε login ξανά.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Άκυρο token! Πρόσβαση απαγορευμένη.")

def get_db_connection():
    return mysql.connector.connect(
        host="127.0.0.1", 
        user="root",
        password="", 
        database="smartbeach",
        port=3306
    )

@app.get("/")
def home():
    return {"message": "API is running"}

# ==========================================
# 3. ΧΡΗΣΤΕΣ & AUTH
# ==========================================
@app.post("/register")
def register_user(user: UserCreate):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        hashed_password = get_password_hash(user.password)
        query = "INSERT INTO users (username, email, password, role) VALUES (%s, %s, %s, %s)"
        cursor.execute(query, (user.username, user.email, hashed_password, user.role))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": f"Ο χρήστης {user.username} δημιουργήθηκε!"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/login")
def login_user(user: UserLogin):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM users WHERE email = %s", (user.email,))
        db_user = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not db_user or not verify_password(user.password, db_user['password']):
            return {"status": "error", "message": "Λάθος email ή κωδικός!"} 
            
        expire=datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode = {"user_id": db_user['id'], "role": db_user['role'], "exp": expire}
        token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        
        return {
            "status": "success", 
            "message": f"Καλώς ήρθες, {db_user['username']}!",
            "access_token": token,
            "token_type": "bearer",
            "role": db_user['role']
        }
    except Exception as e:  
        return {"error": str(e)}

@app.get("/admin/users")
def get_all_users(current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, username, email, role FROM users")
        users = cursor.fetchall()
        cursor.close()
        conn.close()
        return {"status": "success", "data": users}
    except Exception as e:
        return {"error": str(e)}

@app.put("/admin/users/{target_user_id}")
def update_user(target_user_id: int, user_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "UPDATE users SET username=%s, email=%s, role=%s WHERE id=%s"
        cursor.execute(query, (user_data.username, user_data.email, user_data.role, target_user_id))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": f"Ο ρόλος άλλαξε σε {user_data.role}!"}
    except Exception as e:
        return {"error": str(e)}

# ==========================================
# 4. ΠΑΡΑΛΙΕΣ (BEACHES)
# ==========================================
@app.get("/beaches")
def get_all_beaches():
    try: 
        conn = get_db_connection()
        cursor= conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM beaches")
        beaches = cursor.fetchall()
        cursor.close()
        conn.close()
        return beaches
    except Exception as e:
        return {"error": str(e)}

@app.post("/admin/beaches")
def create_beach(beach: BeachCreate, current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "INSERT INTO beaches (name, description, ltd, lgd) VALUES (%s, %s, %s, %s)"
        cursor.execute(query, (beach.name, beach.description, beach.ltd, beach.lgd))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Η παραλία προστέθηκε επιτυχώς!"}
    except Exception as e:
        return {"error": str(e)}

@app.put("/admin/beaches/{beach_id}")
def update_beach(beach_id: int, beach: BeachCreate, current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "UPDATE beaches SET name=%s, description=%s, ltd=%s, lgd=%s WHERE id=%s"
        cursor.execute(query, (beach.name, beach.description, beach.ltd, beach.lgd, beach_id))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Η παραλία ενημερώθηκε επιτυχώς!"}
    except Exception as e:
        return {"error": str(e)}

# ==========================================
# 5. ΞΑΠΛΩΣΤΡΕΣ (SUNBEDS)
# ==========================================
@app.get("/beaches/{beach_id}/sunbeds/availability")
def get_sunbed_availability(beach_id: int, res_date: str):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """SELECT 
                s.id, s.grid_x, s.grid_y, s.price, s.type,
                IF(r.id IS NULL, 'available', 'occupied') AS status
            FROM sunbeds s
            LEFT JOIN reserves r ON s.id = r.sunbed_id AND r.res_date = %s
            WHERE s.beach_id = %s"""
        cursor.execute(query, (res_date, beach_id))
        res = cursor.fetchall()
        cursor.close()
        conn.close()
        return res
    except Exception as e:
        return {"error": str(e)}

@app.get("/beaches/{beach_id}/sunbeds/count")
def count_sunbeds(beach_id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN type = 'premium' THEN 1 ELSE 0 END) as premium_count,
                SUM(CASE WHEN type = 'normal' THEN 1 ELSE 0 END) as normal_count
            FROM sunbeds 
            WHERE beach_id = %s
        """
        cursor.execute(query, (beach_id,))
        result = cursor.fetchone()
        cursor.close()
        conn.close()
        
        total = result['total'] or 0
        premium = int(result['premium_count'] or 0)
        normal = int(result['normal_count'] or 0)
        
        return {
            "status": "success", 
            "total_sunbeds": total,
            "premium_sunbeds": premium,
            "normal_sunbeds": normal
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/admin/beaches/{beach_id}/sunbeds/grid")
def create_sunbed_grid(beach_id: int, rows: int, cols: int, premium_rows: int, prem_price: float, price: float, current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor()
        count = 0
        for x in range(1, rows + 1):
            if x <= premium_rows:    
                current_price = prem_price 
                sunbed_type = "premium"
            else:
                current_price = price
                sunbed_type = "normal"
            for y in range(1, cols + 1):
                query = "INSERT INTO sunbeds(beach_id, grid_x, grid_y, price, type) VALUES(%s, %s, %s, %s, %s)"
                cursor.execute(query, (beach_id, x, y, current_price, sunbed_type))
                count += 1
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": f"Προστέθηκαν συνολικά {count} ξαπλώστρες."}  
    except Exception as e:
        return {"error": str(e)}

@app.delete("/admin/beaches/{beach_id}/sunbeds")
def delete_all_sunbeds(beach_id: int, current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sunbeds WHERE beach_id = %s", (beach_id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Όλες οι ξαπλώστρες διαγράφηκαν!"}
    except Exception as e:
        return {"error": str(e)}

@app.put("/admin/sunbeds/{sunbed_id}")
def update_single_sunbed(sunbed_id: int, sunbed_data: SunbedUpdate, current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "UPDATE sunbeds SET price=%s, type=%s WHERE id=%s"
        cursor.execute(query, (sunbed_data.price, sunbed_data.type, sunbed_id))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Ενημερώθηκε επιτυχώς!"}
    except Exception as e:
        return {"error": str(e)}


# ==========================================
# 6. ΚΡΑΤΗΣΕΙΣ (BOOKINGS)
# ==========================================
@app.post("/book")
def book_sunbed(sunbed_id: int, res_date: str, res_time: str = "10:00", leave_time: str = "18:00", current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user['user_id']
        month = int(res_date.split("-")[1])
        if month < 5 or month > 10:
            return {"status": "error", "message": "Οι κρατήσεις επιτρέπονται μόνο για τη σεζόν Μάιος - Οκτώβριος!"}
        
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT type FROM sunbeds WHERE id = %s", (sunbed_id,))
        sunbed_info = cursor.fetchone()
        if not sunbed_info:
            return {"status": "error", "message": "Η ξαπλώστρα δεν υπάρχει!"}

        cursor.execute("SELECT * FROM reserves WHERE sunbed_id = %s AND res_date = %s", (sunbed_id, res_date))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return {"status": "error", "message": f"Η ξαπλώστρα είναι ήδη κλεισμένη για τις {res_date}!"}
        
        # ΠΡΟΣΘΗΚΗ: Περνάμε res_time ΚΑΙ leave_time!
        query = "INSERT INTO reserves (user_id, sunbed_id, res_date, res_time, leave_time) VALUES (%s, %s, %s, %s, %s)"
        cursor.execute(query, (user_id, sunbed_id, res_date, res_time, leave_time))
        conn.commit()
        cursor.close()
        conn.close()
        
        return {"status": "success", "message": f"Επιτυχία! Κλείστηκε για τις {res_date} ({res_time} έως {leave_time})!"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/my_bookings")
def get_my_bookings(current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user['user_id']
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        query = """
            SELECT r.id as booking_id, DATE_FORMAT(r.res_date, '%Y-%m-%d') as res_date, 
                   IFNULL(r.res_time, '10:00') as res_time, IFNULL(r.leave_time, '18:00') as leave_time,
                   s.id as sunbed_id, b.name as beach_name, s.price, s.type
            FROM reserves r
            JOIN sunbeds s ON r.sunbed_id = s.id
            JOIN beaches b ON s.beach_id = b.id
            WHERE r.user_id = %s
            ORDER BY r.res_date DESC
        """
        cursor.execute(query, (user_id,))
        bookings = cursor.fetchall()
        cursor.close()
        conn.close()
        return {"status": "success", "data": bookings}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/my_bookings/{booking_id}")
def delete_my_booking(booking_id: int, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user['user_id']
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "DELETE FROM reserves WHERE id = %s AND user_id = %s"
        cursor.execute(query, (booking_id, user_id))
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return {"status": "error", "message": "Δεν βρέθηκε η κράτηση ή δεν έχεις δικαίωμα."}
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Η κράτηση σου ακυρώθηκε επιτυχώς!"}
    except Exception as e:
        return {"error": str(e)}

@app.put("/my_bookings/{booking_id}/time")
def update_my_time(booking_id: int, time_data: TimeUpdate, current_user: dict = Depends(get_current_user)):
    try:
        user_id = current_user['user_id']
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "UPDATE reserves SET res_time = %s, leave_time = %s WHERE id = %s AND user_id = %s"
        cursor.execute(query, (time_data.new_time, time_data.new_leave_time, booking_id, user_id))
        if cursor.rowcount == 0:
            return {"status": "error", "message": "Η κράτηση δεν βρέθηκε."}
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Οι ώρες άλλαξαν επιτυχώς!"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/admin/bookings")
def get_all_bookings(current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        query = """
            SELECT r.id as booking_id, DATE_FORMAT(r.res_date, '%Y-%m-%d') as res_date, 
                   IFNULL(r.res_time, '10:00') as res_time, IFNULL(r.leave_time, '18:00') as leave_time,
                   u.username, s.id as sunbed_id, b.name as beach_name
            FROM reserves r
            JOIN users u ON r.user_id = u.id
            JOIN sunbeds s ON r.sunbed_id = s.id
            JOIN beaches b ON s.beach_id = b.id
            ORDER BY r.res_date DESC
        """
        cursor.execute(query)
        bookings = cursor.fetchall()
        cursor.close()
        conn.close()
        return {"status": "success", "data": bookings}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/admin/bookings/{booking_id}")
def admin_delete_booking(booking_id: int, current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "DELETE FROM reserves WHERE id = %s"
        cursor.execute(query, (booking_id,))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Η κράτηση ακυρώθηκε επιτυχώς!"}
    except Exception as e:
        return {"error": str(e)}

@app.put("/admin/bookings/{booking_id}/time")
def update_admin_time(booking_id: int, time_data: TimeUpdate, current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Απαγορεύεται η πρόσβαση!"}
        conn = get_db_connection()
        cursor = conn.cursor()
        query = "UPDATE reserves SET res_time = %s, leave_time = %s WHERE id = %s"
        cursor.execute(query, (time_data.new_time, time_data.new_leave_time, booking_id))
        conn.commit()
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Οι ώρες της κράτησης ενημερώθηκαν!"}
    except Exception as e:
        return {"error": str(e)}

# ==========================================
# 7. ΕΣΟΔΑ (REVENUE)
# ==========================================
@app.get("/admin/revenue")
def get_total_revenue(current_user: dict = Depends(get_current_user)):
    try:
        if current_user['role'] != 'admin':
            return {"status": "error", "message": "Πρόσβαση απαγορευμένη!"}
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                b.name AS beach_name,
                SUM(s.price) AS total_revenue
            FROM reserves r
            JOIN sunbeds s ON r.sunbed_id = s.id
            JOIN beaches b ON s.beach_id = b.id
            GROUP BY b.id
        """
        cursor.execute(query)
        revenue_data = cursor.fetchall()
        cursor.close()
        conn.close()
        return {
            "status": "success",
            "message": "Συνολικά έσοδα ανά παραλία.",
            "data": revenue_data
        }
    except Exception as e:
        return {"error": str(e)}