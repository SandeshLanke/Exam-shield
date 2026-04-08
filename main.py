from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, ConfigDict
from datetime import datetime, timedelta
from typing import Optional, List
from jose import jwt
from phone_detector import detect_phone_usage, initialize as init_phone_detector

import bcrypt
import sqlite3
import base64
import cv2
import numpy as np

# Initialize FastAPI
app = FastAPI(title="AI Proctoring API")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"

# Track currently active violations per session
active_logged_violations = {}

# Database Setup
def init_db():
    conn = sqlite3.connect('proctoring.db')
    c = conn.cursor()
    
    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  email TEXT UNIQUE NOT NULL,
                  password TEXT NOT NULL,
                  name TEXT NOT NULL)''')
    
    # Exam sessions table
    c.execute('''CREATE TABLE IF NOT EXISTS exam_sessions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  start_time TEXT,
                  end_time TEXT,
                  status TEXT,
                  FOREIGN KEY (user_id) REFERENCES users (id))''')
    
    # Violations table
    c.execute('''CREATE TABLE IF NOT EXISTS violations
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id INTEGER,
                  timestamp TEXT,
                  violation_type TEXT,
                  confidence REAL,
                  FOREIGN KEY (session_id) REFERENCES exam_sessions (id))''')
    
    # Create a default user for testing
    try:
        hashed = bcrypt.hashpw("password123".encode('utf-8'), bcrypt.gensalt())
        c.execute("INSERT INTO users (email, password, name) VALUES (?, ?, ?)",
                 ("student@test.com", hashed.decode('utf-8'), "Test Student"))
        conn.commit()
    except sqlite3.IntegrityError:
        pass  # User already exists
    
    conn.close()

init_db()

# --- phone detector setup --------------------------------------------------
# the YOLO configuration/weights/class files must be downloaded beforehand.
# you can also supply paths via environment variables if you prefer.
PHONE_YOLO_CONFIG = "yolov3.cfg"          # adjust to your location
PHONE_YOLO_WEIGHTS = "yolov3.weights"
PHONE_YOLO_CLASSES = "coco.names"

try:
    init_phone_detector(PHONE_YOLO_CONFIG, PHONE_YOLO_WEIGHTS, PHONE_YOLO_CLASSES)
    print("📱 phone detector initialized")
except Exception as e:
    print("⚠️  could not initialize phone detector:", e)


# Pydantic Models
class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    email: str
    password: str
    name: str

class ExamStart(BaseModel):
    user_id: int

class FrameAnalysis(BaseModel):
    session_id: int
    frame_data: str  # Base64 encoded image
    
    class Config:
        # Allow extra fields and be more flexible
        extra = 'ignore'

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    name: str

# Helper Functions
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=2)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_db():
    conn = sqlite3.connect('proctoring.db')
    conn.row_factory = sqlite3.Row
    return conn

# Routes
@app.get("/")
def read_root():
    return {"message": "AI Proctoring API is running", "status": "healthy"}

@app.post("/register", response_model=Token)
def register(user: UserRegister):
    conn = get_db()
    c = conn.cursor()
    
    # Hash password
    hashed = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt())
    
    try:
        c.execute("INSERT INTO users (email, password, name) VALUES (?, ?, ?)",
                 (user.email, hashed.decode('utf-8'), user.name))
        conn.commit()
        user_id = c.lastrowid
        
        # Create token
        token = create_access_token({"sub": user.email, "user_id": user_id})
        conn.close()
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "user_id": user_id,
            "name": user.name
        }
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")

@app.post("/login", response_model=Token)
def login(user: UserLogin):
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT * FROM users WHERE email = ?", (user.email,))
    db_user = c.fetchone()
    conn.close()
    
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Verify password
    if not bcrypt.checkpw(user.password.encode('utf-8'), db_user['password'].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create token
    token = create_access_token({"sub": db_user['email'], "user_id": db_user['id']})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": db_user['id'],
        "name": db_user['name']
    }

@app.post("/start-exam")
def start_exam(exam: ExamStart, payload: dict = Depends(verify_token)):
    conn = get_db()
    c = conn.cursor()
    
    start_time = datetime.utcnow().isoformat()
    c.execute("INSERT INTO exam_sessions (user_id, start_time, status) VALUES (?, ?, ?)",
             (exam.user_id, start_time, "active"))
    conn.commit()
    session_id = c.lastrowid
    conn.close()
    
    return {
        "session_id": session_id,
        "start_time": start_time,
        "status": "active"
    }

@app.post("/end-exam/{session_id}")
def end_exam(session_id: int, payload: dict = Depends(verify_token)):
    conn = get_db()
    c = conn.cursor()
    
    end_time = datetime.utcnow().isoformat()
    c.execute("UPDATE exam_sessions SET end_time = ?, status = ? WHERE id = ?",
             (end_time, "completed", session_id))
    conn.commit()
    conn.close()
    
    return {"message": "Exam ended successfully", "end_time": end_time}

@app.post("/analyze-frame")
async def analyze_frame(request: Request):
    """Analyze frame endpoint with better error handling and detailed debugging"""
    try:
        print("\n=== /analyze-frame Request Received ===")

        # --- AUTH HEADER ---
        auth_header = request.headers.get("Authorization")
        print("Authorization header:", auth_header)

        if not auth_header:
            raise HTTPException(status_code=401, detail="Missing authorization header")

        # --- VERIFY TOKEN ---
        token = auth_header.replace("Bearer ", "")
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            print("✅ Token verified successfully for user:", payload.get("sub"))
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")

        # --- READ RAW BODY ---
        raw_body = await request.body()
        print("Raw body length:", len(raw_body))

        if len(raw_body) == 0:
            raise HTTPException(status_code=422, detail="Empty request body received")

        # --- PARSE JSON BODY ---
        try:
            body = await request.json()
            print("Parsed JSON keys:", list(body.keys()))
        except Exception as e:
            print("❌ JSON parse failed:", e)
            raise HTTPException(status_code=422, detail="Invalid JSON format")

        session_id = body.get("session_id")
        frame_data = body.get("frame_data")

        print(f"session_id={repr(session_id)[:100]}")
        print(f"frame_data type={type(frame_data)}, length={len(frame_data) if frame_data else 0}")

        if not session_id:
            print("❌ session_id missing or empty")
        if not frame_data:
            print("❌ frame_data missing or empty")

        if session_id not in active_logged_violations:
            active_logged_violations[session_id] = set()

        print(f"Analyzing frame for session: {session_id}")

        # --- DECODE BASE64 IMAGE ---
        try:
            if "," in frame_data:
                frame_data = frame_data.split(",", 1)[1]

            img_data = base64.b64decode(frame_data)
            nparr = np.frombuffer(img_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                raise ValueError("Failed to decode image")

            print(f"✅ Frame decoded successfully. Shape: {frame.shape}")

        except Exception as e:
            print("❌ Image decoding failed:", str(e))
            raise HTTPException(status_code=422, detail=f"Invalid frame_data: {str(e)}")
        

        # --- ANALYZE FRAME ---
        from face_detector import analyze_face
        # Run phone detection first
        phone_result = detect_phone_usage(frame)
        phone_active = phone_result.get("phone_detected", False)

        from face_detector import analyze_face
        face_result = analyze_face(
            frame,
            session_id=session_id,
            phone_active=phone_active
        )
        print(f"face result: face_detected={face_result['face_detected']}, violations={len(face_result['violations'])}")
        # Log detailed violation info
        for violation in face_result["violations"]:
            print(f"  👁️  {violation['type']}: {violation.get('details', 'N/A')} (confidence: {violation['confidence']:.2f})")

        # run phone detector and merge results
        try:
            phone_result = detect_phone_usage(frame)
            print(f"phone result: phone_detected={phone_result['phone_detected']}, violations={len(phone_result['violations'])}")
            if phone_result.get("phone_detected"):
                print("� Detected mobile phone in frame")
            # Log phone violations
            for violation in phone_result.get("violations", []):
                print(f"  📱 {violation['type']}: {violation.get('details', 'N/A')} (confidence: {violation['confidence']:.2f})")
            # merge into single result structure used by frontend
            result = face_result
            # carry over phone flags so client can easily access them
            result["phone_detected"] = phone_result.get("phone_detected", False)
            result["person_detected"] = phone_result.get("person_detected", False)
            
            # append phone violations if any
            if phone_result.get("violations"):
                result["violations"].extend(phone_result["violations"])

            # ===============================
            # PRIORITY SUPPRESSION LOGIC
            # ===============================

            # ===============================
            # PROFESSIONAL PRIORITY SYSTEM
            # ===============================

            HIGH_PRIORITY = {"phone_usage", "multiple_persons", "no_face"}
            MEDIUM_PRIORITY = {"looking_away_horizontal", "looking_away_vertical", "eyes_not_visible"}
            LOW_PRIORITY = {"too_far_from_camera"}

            violation_types = {v["type"] for v in result["violations"]}

            # If any high prior            cd "d:\Final Year Project\Project\ai-proctoring"ity exists → remove medium & low
            if violation_types & HIGH_PRIORITY:
                result["violations"] = [
                    v for v in result["violations"]
                    if v["type"] in HIGH_PRIORITY
                ]

            # If no high but medium exists → remove low
            elif violation_types & MEDIUM_PRIORITY:
                result["violations"] = [
                    v for v in result["violations"]
                    if v["type"] in MEDIUM_PRIORITY
                ]
        except Exception as e:
            # fail gracefully if phone detector is not configured
            print("⚠️ phone detection failed:", e)
            result = face_result

        # --- SMART LOG VIOLATIONS (NO SPAM) ---

        current_frame_violations = set(v["type"] for v in result["violations"])
        previous_active = active_logged_violations.get(session_id, set())

        # 1️⃣ Log only newly activated violations
        new_violations = current_frame_violations - previous_active

        if new_violations:
            conn = get_db()
            c = conn.cursor()
            timestamp = datetime.utcnow().isoformat()

            for violation in result["violations"]:
                if violation["type"] in new_violations:
                    c.execute(
                        "INSERT INTO violations (session_id, timestamp, violation_type, confidence) VALUES (?, ?, ?, ?)",
                        (session_id, timestamp, violation["type"], violation["confidence"]),
                    )

            conn.commit()
            conn.close()
            print(f"🟡 Logged {len(new_violations)} NEW violations to database")

        # 2️⃣ Update active violations for this session
        active_logged_violations[session_id] = current_frame_violations

        # Optional: Summary print
        if result["violations"]:
            violation_types = {}
            for v in result["violations"]:
                vtype = v["type"]
                violation_types[vtype] = violation_types.get(vtype, 0) + 1
            for vtype, count in violation_types.items():
                print(f"    → {vtype}: {count}")

        print("✅ Analysis complete.")
        return result

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Analysis error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.get("/violations/{session_id}")
def get_violations(session_id: int, payload: dict = Depends(verify_token)):
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT * FROM violations WHERE session_id = ? ORDER BY timestamp", (session_id,))
    violations = [dict(row) for row in c.fetchall()]
    conn.close()
    
    return {"violations": violations}

@app.get("/exam-summary/{session_id}")
def get_exam_summary(session_id: int, payload: dict = Depends(verify_token)):
    conn = get_db()
    c = conn.cursor()
    
    # Get session info
    c.execute("SELECT * FROM exam_sessions WHERE id = ?", (session_id,))
    session = dict(c.fetchone())
    
    # Get violations
    c.execute("SELECT * FROM violations WHERE session_id = ?", (session_id,))
    violations = [dict(row) for row in c.fetchall()]
    
    # Get user info
    c.execute("SELECT name, email FROM users WHERE id = ?", (session['user_id'],))
    user = dict(c.fetchone())
    
    conn.close()
    
    # Count violation types
    violation_counts = {}
    for v in violations:
        vtype = v['violation_type']
        violation_counts[vtype] = violation_counts.get(vtype, 0) + 1
    
    return {
        "session": session,
        "user": user,
        "total_violations": len(violations),
        "violation_counts": violation_counts,
        "violations": violations
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)