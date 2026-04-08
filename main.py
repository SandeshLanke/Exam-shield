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
import random
import difflib
import json
import os
import csv
from fastapi.responses import FileResponse

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
                  
    # Questions table
    c.execute('''CREATE TABLE IF NOT EXISTS questions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  type TEXT,
                  question TEXT,
                  options TEXT,
                  correct_answer TEXT)''')
                  
    # Answers table
    c.execute('''CREATE TABLE IF NOT EXISTS answers
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id INTEGER,
                  question_id INTEGER,
                  answer_text TEXT,
                  is_correct BOOLEAN,
                  plagiarism_flag BOOLEAN,
                  plagiarism_score REAL,
                  FOREIGN KEY (session_id) REFERENCES exam_sessions (id),
                  FOREIGN KEY (question_id) REFERENCES questions (id))''')

    # Seed Questions if empty
    c.execute('SELECT COUNT(*) FROM questions')
    if c.fetchone()[0] == 0:
        sample_questions = [
            ("mcq", "What is the time complexity of binary search?", json.dumps(["O(n)", "O(log n)", "O(n)", "O(1)"]), "1"),
            ("mcq", "Which data structure uses LIFO principle?", json.dumps(["Queue", "Stack", "Array", "Tree"]), "1"),
            ("mcq", "What does HTML stand for?", json.dumps(["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool", "Hyperlinks and Text"]), "0"),
            ("mcq", "Which is NOT a JavaScript framework?", json.dumps(["React", "Vue", "Django", "Angular"]), "2"),
            ("subjective", "Explain how a REST API works and its core principles in your own words.", "[]", "")
        ]
        c.executemany("INSERT INTO questions (type, question, options, correct_answer) VALUES (?, ?, ?, ?)", sample_questions)
        conn.commit()
    
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
    print(" phone detector initialized")
except Exception as e:
    print("  could not initialize phone detector:", e)


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

class ExamAnswer(BaseModel):
    question_id: int
    answer: str

class SubmitExamRequest(BaseModel):
    session_id: int
    answers: List[ExamAnswer]

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

@app.get("/questions")
def get_questions(payload: dict = Depends(verify_token)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, type, question, options FROM questions")
    questions = []
    for row in c.fetchall():
        q = dict(row)
        q['options'] = json.loads(q['options']) if q['options'] else []
        questions.append(q)
    conn.close()
    
    # Shuffle the questions array for randomness
    random.shuffle(questions)
    return {"questions": questions}

@app.post("/submit-exam")
def submit_exam(data: SubmitExamRequest, payload: dict = Depends(verify_token)):
    conn = get_db()
    c = conn.cursor()
    
    # Plagiarism logic
    # Fetch all previous subjective answers for plagiarism check
    c.execute("""SELECT a.answer_text FROM answers a 
                 JOIN questions q ON a.question_id = q.id 
                 WHERE q.type = 'subjective' AND a.session_id != ?""", (data.session_id,))
    previous_answers = [row['answer_text'] for row in c.fetchall() if row['answer_text']]
    
    for ans in data.answers:
        # Check correct logic for MCQ
        c.execute("SELECT type, correct_answer FROM questions WHERE id = ?", (ans.question_id,))
        q_info = c.fetchone()
        if not q_info:
            continue
            
        is_correct = False
        plagiarism_flag = False
        plagiarism_score = 0.0
        
        if q_info['type'] == 'mcq':
            is_correct = (str(ans.answer) == q_info['correct_answer'])
        elif q_info['type'] == 'subjective':
            # Plagiarism text similarity check using sequence matcher
            if len(ans.answer) > 20: 
                for prev_ans in previous_answers:
                    similarity = difflib.SequenceMatcher(None, ans.answer.lower(), prev_ans.lower()).ratio()
                    if similarity > plagiarism_score:
                        plagiarism_score = similarity
            
            if plagiarism_score > 0.8: # 80% similarity threshold
                plagiarism_flag = True

        c.execute("""INSERT INTO answers (session_id, question_id, answer_text, is_correct, plagiarism_flag, plagiarism_score)
                     VALUES (?, ?, ?, ?, ?, ?)""",
                 (data.session_id, ans.question_id, ans.answer, is_correct, plagiarism_flag, plagiarism_score))
                 
    # End the session implicitly
    end_time = datetime.utcnow().isoformat()
    c.execute("UPDATE exam_sessions SET end_time = ?, status = ? WHERE id = ?",
             (end_time, "completed", data.session_id))
             
    conn.commit()
    conn.close()
    return {"message": "Exam submitted successfully"}

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
            print(" Token verified successfully for user:", payload.get("sub"))
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
            print(" JSON parse failed:", e)
            raise HTTPException(status_code=422, detail="Invalid JSON format")

        session_id = body.get("session_id")
        frame_data = body.get("frame_data")

        print(f"session_id={repr(session_id)[:100]}")
        print(f"frame_data type={type(frame_data)}, length={len(frame_data) if frame_data else 0}")

        if not session_id:
            print(" session_id missing or empty")
        if not frame_data:
            print(" frame_data missing or empty")

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

            print(f" Frame decoded successfully. Shape: {frame.shape}")

        except Exception as e:
            print(" Image decoding failed:", str(e))
            raise HTTPException(status_code=422, detail=f"Invalid frame_data: {str(e)}")
        

        # --- ANALYZE FRAME with face detector ---
        from face_detector import analyze_face
        # Run phone detection first so face_detector knows
        phone_result = detect_phone_usage(frame)
        phone_active = phone_result.get("phone_detected", False)

        face_result = analyze_face(
            frame,
            session_id=session_id,
            phone_active=phone_active
        )
        # Log detailed violation info
        for violation in face_result["violations"]:
            print(f"    {violation['type']}: {violation.get('details', 'N/A')} (confidence: {violation['confidence']:.2f})")

        # merge phone result into face_result
        result = face_result
        result["phone_detected"] = phone_active
        result["person_detected"] = phone_result.get("person_detected", False)

        if phone_result.get("violations"):
            result["violations"].extend(phone_result["violations"])

        # ── Priority suppression: only send the highest-priority violations ──
        HIGH_PRIORITY   = {"phone_usage", "multiple_persons", "no_face"}
        MEDIUM_PRIORITY = {"looking_away_horizontal", "looking_away_vertical", "eyes_not_visible"}

        violation_types_set = {v["type"] for v in result["violations"]}

        if violation_types_set & HIGH_PRIORITY:
            result["violations"] = [v for v in result["violations"] if v["type"] in HIGH_PRIORITY]
        elif violation_types_set & MEDIUM_PRIORITY:
            result["violations"] = [v for v in result["violations"] if v["type"] in MEDIUM_PRIORITY]

        # --- SMART LOG VIOLATIONS (NO SPAM) ---

        current_frame_violations = set(v["type"] for v in result["violations"])
        previous_active = active_logged_violations.get(session_id, set())

        # 1 Log only newly activated violations
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
            print(f" Logged {len(new_violations)} NEW violations to database")

        # 2 Update active violations tracker
        active_logged_violations[session_id] = current_frame_violations

        # Always return consistent schema so frontend gets all fields
        return {
            "face_detected":  result.get("face_detected", False),
            "num_faces":      result.get("num_faces", 0),
            "looking_away":   result.get("looking_away", False),
            "phone_detected": result.get("phone_detected", False),
            "violations":     result.get("violations", []),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f" Analysis error: {str(e)}")
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
    total_risk_score = 0
    
    # Weighted Scoring System for AI Suspicious Behavior
    weights = {
        "phone_usage": 50,
        "multiple_persons": 30,
        "browser_lockdown": 25,
        "tab_change": 20,
        "no_face": 20,
        "exited_fullscreen": 15,
        "eyes_not_visible": 10,
        "looking_away_horizontal": 5,
        "looking_away_vertical": 5,
        "network_issue": 5,
        "unusual_head_angle": 5,
        "too_far_from_camera": 2
    }
    
    for v in violations:
        vtype = v['violation_type']
        violation_counts[vtype] = violation_counts.get(vtype, 0) + 1
        total_risk_score += weights.get(vtype, 0)
    
    # Cap Risk score at 100%
    risk_score_percentage = min(total_risk_score, 100)
    
    return {
        "session": session,
        "user": user,
        "total_violations": len(violations),
        "violation_counts": violation_counts,
        "risk_score_percentage": risk_score_percentage,
        "violations": violations
    }
@app.get("/exam-report/{session_id}")
def get_exam_report(session_id: int, payload: dict = Depends(verify_token)):
    """Return comprehensive exam report: score, violations, integrity verdict."""
    conn = get_db()
    c = conn.cursor()
    c.execute("""SELECT es.*, u.name, u.email FROM exam_sessions es
                 JOIN users u ON es.user_id = u.id WHERE es.id = ?""", (session_id,))
    session = c.fetchone()
    if not session:
        conn.close()
        raise HTTPException(status_code=404, detail="Session not found")
    c.execute("""SELECT a.*, q.question, q.type, q.options, q.correct_answer
                 FROM answers a JOIN questions q ON a.question_id = q.id
                 WHERE a.session_id = ? ORDER BY a.question_id""", (session_id,))
    answers = [dict(r) for r in c.fetchall()]
    c.execute("SELECT id, type, question, options, correct_answer FROM questions")
    all_questions = [dict(r) for r in c.fetchall()]
    c.execute("SELECT violation_type, confidence, timestamp FROM violations WHERE session_id = ? ORDER BY timestamp", (session_id,))
    violations = [dict(r) for r in c.fetchall()]
    conn.close()

    mcq_answers = [a for a in answers if a["type"] == "mcq"]
    correct_count = sum(1 for a in mcq_answers if a.get("is_correct"))
    total_mcq = sum(1 for q in all_questions if q["type"] == "mcq")
    score_pct = round((correct_count / total_mcq * 100) if total_mcq > 0 else 0, 1)

    weights = {"phone_usage":15,"multiple_persons":12,"tab_change":10,"exited_fullscreen":8,
               "no_face":6,"ai_assistant_detected":20,"noise_detected":5,"browser_lockdown":4,
               "looking_away_horizontal":3,"looking_away_vertical":3,"eyes_not_visible":3,
               "unusual_head_angle":2,"too_far_from_camera":1,"network_issue":2}
    violation_counts = {}
    risk_score = 0
    for v in violations:
        vt = v["violation_type"]
        violation_counts[vt] = violation_counts.get(vt, 0) + 1
        risk_score += weights.get(vt, 1)
    risk_score = min(risk_score, 100)

    if risk_score < 20 and len(violations) < 5:
        verdict, verdict_msg = "CLEAN", "No significant integrity concerns detected."
    elif risk_score < 50:
        verdict, verdict_msg = "LOW_RISK", "Minor suspicious activities detected. Review recommended."
    elif risk_score < 80:
        verdict, verdict_msg = "MEDIUM_RISK", "Multiple violations detected. Manual review strongly recommended."
    else:
        verdict, verdict_msg = "HIGH_RISK", "Serious integrity violations detected. Exam flagged for review."

    duration_min = None
    if session["start_time"] and session["end_time"]:
        try:
            duration_min = round((datetime.fromisoformat(session["end_time"]) - datetime.fromisoformat(session["start_time"])).total_seconds() / 60, 1)
        except Exception:
            pass

    question_results = []
    answers_by_qid = {a["question_id"]: a for a in answers}
    for q in all_questions:
        ans = answers_by_qid.get(q["id"])
        opts = json.loads(q["options"]) if q["options"] and q["options"] != "[]" else []
        question_results.append({
            "id": q["id"], "type": q["type"], "question": q["question"], "options": opts,
            "correct_answer": q["correct_answer"],
            "correct_label": opts[int(q["correct_answer"])] if (q["type"]=="mcq" and opts and q["correct_answer"].isdigit()) else None,
            "student_answer_index": ans["answer_text"] if ans else None,
            "student_answer_label": opts[int(ans["answer_text"])] if (ans and q["type"]=="mcq" and opts and ans["answer_text"].isdigit() and int(ans["answer_text"])<len(opts)) else (ans["answer_text"] if ans else None),
            "is_correct": ans.get("is_correct") if ans else None,
            "attempted": ans is not None,
            "plagiarism_flag": ans.get("plagiarism_flag", False) if ans else False,
            "plagiarism_score": round(ans.get("plagiarism_score", 0) * 100, 1) if ans else 0,
        })

    return {
        "session_id": session_id, "student_name": session["name"], "student_email": session["email"],
        "start_time": session["start_time"], "end_time": session["end_time"],
        "duration_minutes": duration_min, "status": session["status"],
        "score": {"correct": correct_count, "total_mcq": total_mcq, "total_questions": len(all_questions),
                  "attempted": len(answers), "percentage": score_pct,
                  "grade": "A" if score_pct>=80 else "B" if score_pct>=60 else "C" if score_pct>=40 else "F"},
        "question_results": question_results, "violations": violations,
        "violation_counts": violation_counts, "risk_score": risk_score,
        "verdict": verdict, "verdict_message": verdict_msg,
        "plagiarism_flags": sum(1 for a in answers if a.get("plagiarism_flag")),
    }

@app.get("/export-report/{session_id}")
def export_report(session_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("""SELECT es.*, u.name, u.email FROM exam_sessions es JOIN users u ON es.user_id=u.id WHERE es.id=?""", (session_id,))
    session = c.fetchone()
    if not session:
        conn.close(); raise HTTPException(status_code=404, detail="Session not found")
    c.execute("""SELECT a.*, q.question, q.type, q.correct_answer FROM answers a JOIN questions q ON a.question_id=q.id WHERE a.session_id=?""", (session_id,))
    answers = [dict(r) for r in c.fetchall()]
    c.execute("SELECT * FROM violations WHERE session_id=? ORDER BY timestamp", (session_id,))
    violations = c.fetchall()
    conn.close()
    correct_count = sum(1 for a in answers if a.get("is_correct"))
    total_mcq = sum(1 for a in answers if a["type"]=="mcq")
    report_path = f"report_session_{session_id}.csv"
    with open(report_path, mode='w', newline='', encoding='utf-8') as file:
        w = csv.writer(file)
        w.writerow(["EXAM SHIELD - ASSESSMENT REPORT"])
        w.writerow(["Session ID", session_id])
        w.writerow(["Student", session["name"], session["email"]])
        w.writerow(["Start", session["start_time"]]); w.writerow(["End", session["end_time"]])
        w.writerow(["Score", f"{correct_count}/{total_mcq}", f"{round(correct_count/total_mcq*100,1) if total_mcq else 0}%"])
        w.writerow([]); w.writerow(["ANSWERS"]); w.writerow(["Question","Type","Answer","Correct","Plagiarism"])
        for a in answers:
            w.writerow([a["question"],a["type"],a["answer_text"],"YES" if a.get("is_correct") else "NO","FLAG" if a.get("plagiarism_flag") else "OK"])
        w.writerow([]); w.writerow(["VIOLATIONS"]); w.writerow(["Timestamp","Type","Confidence"])
        for v in violations:
            w.writerow([v['timestamp'],v['violation_type'],f"{v['confidence']*100:.0f}%"])
    return FileResponse(path=report_path, filename=f"ExamReport_Session{session_id}.csv", media_type='text/csv')

@app.get("/all-sessions")
def get_all_sessions(payload: dict = Depends(verify_token)):
    """List all exam sessions for administrative review."""
    conn = get_db()
    c = conn.cursor()
    c.execute("""SELECT es.*, u.name as user_name, u.email as user_email 
                 FROM exam_sessions es 
                 JOIN users u ON es.user_id = u.id 
                 ORDER BY es.start_time DESC""")
    sessions = [dict(row) for row in c.fetchall()]
    conn.close()
    return sessions

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

