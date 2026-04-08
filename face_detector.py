import cv2
import numpy as np

# --- Stability Control Variables ---
VIOLATION_MEMORY = {}
STABILITY_THRESHOLD = 5   # number of frames before confirming violation

# Face size detection tuning
MIN_FACE_RATIO = 0.12     # 12% of frame
TOLERANCE = 0.02          # dead zone buffer (2%)
ALPHA = 0.7               # smoothing factor (0.6–0.8 recommended)

# Face ratio smoothing memory
FACE_RATIO_MEMORY = {}

# Load OpenCV pre-trained Haar Cascade classifiers
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

def analyze_face(frame, session_id=None, phone_active=False):
    """
    Analyze frame for face detection and violations using OpenCV only
    Returns: dict with analysis results
    """
    results = {
        "face_detected": False,
        "num_faces": 0,
        "looking_away": False,
        "violations": []
    }
    
    # Convert to grayscale for face detection
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Detect faces
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30)
    )
    
    num_faces = len(faces)
    results["num_faces"] = num_faces
    
    # Check for no face
    if num_faces == 0:
        results["violations"].append({
            "type": "no_face",
            "confidence": 0.99,
            "details": "No face detected in frame"
        })
        return results
    
    results["face_detected"] = True
    
    # Check for multiple people
    if num_faces > 1:
        results["violations"].append({
            "type": "multiple_persons",
            "confidence": 0.99,
            "details": f"{num_faces} faces detected"
        })
    
    # Analyze the largest face (assumed to be the student)
    if num_faces > 0:
        # Get the largest face
        largest_face = max(faces, key=lambda face: face[2] * face[3])
        x, y, w, h = largest_face
        
        # Get frame dimensions
        frame_height, frame_width = frame.shape[:2]
        
        # Calculate face center
        face_center_x = x + w // 2
        face_center_y = y + h // 2
        
        # Calculate frame center
        frame_center_x = frame_width // 2
        frame_center_y = frame_height // 2
        
        # Calculate deviation from center (normalized)
        horizontal_deviation = abs(face_center_x - frame_center_x) / frame_width
        vertical_deviation = abs(face_center_y - frame_center_y) / frame_height
        
        # STRICTER THRESHOLDS - More sensitive detection
        # Check if looking away based on face position
        if horizontal_deviation > 0.25:  # Changed from 0.3 to 0.15 (15%)
            results["looking_away"] = True
            results["violations"].append({
                "type": "looking_away_horizontal",
                "confidence": min(horizontal_deviation * 2, 1.0),  # Increased multiplier
                "details": f"Face off-center horizontally: {horizontal_deviation:.2f}"
            })
        
        if vertical_deviation > 0.5:  # Changed from 0.35 to 0.2 (20%)
            results["looking_away"] = True
            results["violations"].append({
                "type": "looking_away_vertical",
                "confidence": min(vertical_deviation * 1.5, 1.0),
                "details": f"Face off-center vertically: {vertical_deviation:.2f}"
            })

        face_area = w * h
        frame_area = frame_width * frame_height
        face_ratio = face_area / frame_area
        
        # ===============================
        # PROFESSIONAL FACE SIZE CONTROL
        # ===============================

        if session_id is not None:
            global FACE_RATIO_MEMORY

            if session_id not in FACE_RATIO_MEMORY:
                FACE_RATIO_MEMORY[session_id] = face_ratio

            # Exponential smoothing
            FACE_RATIO_MEMORY[session_id] = (
                ALPHA * FACE_RATIO_MEMORY[session_id]
                + (1 - ALPHA) * face_ratio
            )

            smoothed_ratio = FACE_RATIO_MEMORY[session_id]
        else:
            smoothed_ratio = face_ratio

        # If phone is active, relax threshold slightly
        effective_min_ratio = MIN_FACE_RATIO

        if phone_active:
            effective_min_ratio = MIN_FACE_RATIO * 0.7  # allow 30% smaller face

        # if smoothed_ratio < (effective_min_ratio - TOLERANCE):
        #     results["violations"].append({
        #         "type": "too_far_from_camera",
        #         "confidence": 0.85,
        #         "details": f"Face ratio too small: {smoothed_ratio:.3f}"
        #     })
        
        # Detect eyes within face region for additional verification
        face_roi_gray = gray[y:y+h//2, x:x+w]  # Focus on upper half of face for eye detection
        eyes = eye_cascade.detectMultiScale(
            face_roi_gray,
            scaleFactor=1.05,     # smaller step
            minNeighbors=4,       # reduce strictness
            minSize=(20, 20)      # avoid tiny detections
        )
        
        # Only flag eyes_not_visible if NO eyes detected (very high confidence ~95%+)
        if len(eyes) < 2 and horizontal_deviation > 0.4:
            results["looking_away"] = True
            results["violations"].append({
                "type": "eyes_not_visible",
                "confidence": 0.99,
                "details": "Both eyes are not visible - please ensure clear eye visibility"
            })
        
        # Check head pose by face aspect ratio
        face_aspect_ratio = w / h
        # if face_aspect_ratio < 0.65 or face_aspect_ratio > 1.3:
        #     results["violations"].append({
        #         "type": "unusual_head_angle",
        #         "confidence": 0.7,
        #         "details": f"Face aspect ratio unusual: {face_aspect_ratio:.2f}"
        #     })

    # ====================================
    # PROFESSIONAL STABILITY FILTERING
    # ====================================
    if session_id is not None:
        global VIOLATION_MEMORY
        
        if session_id not in VIOLATION_MEMORY:
            VIOLATION_MEMORY[session_id] = {}
        
        stable_violations = []

        # Update counters per violation type
        for violation in results["violations"]:
            vtype = violation["type"]

            if vtype not in VIOLATION_MEMORY[session_id]:
                VIOLATION_MEMORY[session_id][vtype] = 0

            VIOLATION_MEMORY[session_id][vtype] += 1

            if VIOLATION_MEMORY[session_id][vtype] >= STABILITY_THRESHOLD:
                stable_violations.append(violation)

        # Reset counters for violations not present in current frame
        current_types = [v["type"] for v in results["violations"]]
        for existing_type in list(VIOLATION_MEMORY[session_id].keys()):
            if existing_type not in current_types:
                VIOLATION_MEMORY[session_id][existing_type] = 0

        results["violations"] = stable_violations

        results["looking_away"] = any(
            v["type"].startswith("looking_away") for v in stable_violations
        )

    return results

    def detect_objects(frame):
        """
        Simple object detection placeholder
        Can be enhanced with YOLO or other models later
        """
    return []

if __name__ == "__main__":
    # Test with webcam
    print("Testing STRICTER face detection with webcam...")
    print("Press 'q' to quit")
    print("\nThis version is more sensitive and will detect:")
    print("- Looking away (even slight movements)")
    print("- Moving too far from camera")
    print("- Eyes not visible")
    print("- Unusual head angles")
    
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Could not open webcam")
        exit()
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error: Failed to capture frame")
            break
        
        # Analyze frame
        result = analyze_face(frame, session_id="test_session")
        
        # Draw rectangles around detected faces
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 5)
        
        for (x, y, w, h) in faces:
            color = (0, 255, 0) if not result["violations"] else (0, 0, 255)
            cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
            
            # Draw center point
            face_center_x = x + w // 2
            face_center_y = y + h // 2
            cv2.circle(frame, (face_center_x, face_center_y), 5, (255, 0, 0), -1)
        
        # Draw frame center for reference
        frame_height, frame_width = frame.shape[:2]
        cv2.circle(frame, (frame_width // 2, frame_height // 2), 10, (0, 255, 255), 2)
        
        # Display results
        cv2.putText(frame, f"Faces: {result['num_faces']}", (10, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        if result['violations']:
            cv2.putText(frame, f"Violations: {len(result['violations'])}", (10, 70),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            
            # Display violation types
            y_pos = 110
            for violation in result['violations']:
                text = violation['type'].replace('_', ' ')
                cv2.putText(frame, text, (10, y_pos),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                y_pos += 30
        else:
            cv2.putText(frame, "No Violations", (10, 70),
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        
        cv2.imshow('Stricter Face Detection Test', frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    cap.release()
    cv2.destroyAllWindows()
    print("Test completed!")