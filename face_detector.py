"""
face_detector.py — Professional AI Proctoring Vision Engine
============================================================
Design principles:
  1. Low-light resilience — CLAHE preprocessing before every detection
  2. No false positives — all soft violations require N consecutive frames
  3. Multiple-face detection — instant, no grace period needed
  4. Confidence gating — no_face only fires at >= 0.70 confidence and after grace period
  5. Eyes/gaze — requires sustained deviation (4 frames at ~3.5s = ~14s) before flagging
"""

import cv2
import numpy as np

# ─── Cascade Classifiers ───────────────────────────────────────────────────────
face_cascade  = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade   = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
profile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_profileface.xml')

# CLAHE for low-light enhancement (re-used across calls)
_clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))

# ─── Per-session state ─────────────────────────────────────────────────────────
_state = {}   # session_id → { type: consecutive_frame_count }

# ─── Thresholds ───────────────────────────────────────────────────────────────
# Consecutive frames required before a soft violation is reported.
# Frame interval ≈ 3.5s, so:
#   FRAMES_TO_CONFIRM = 2  →  ~7s  (medium)
#   FRAMES_TO_CONFIRM = 4  →  ~14s (slow / gaze)
FRAMES = {
    "no_face":                 3,   # ~10s — must be missing for 3 frames
    "looking_away_horizontal": 4,   # ~14s — sustained gaze deviation
    "looking_away_vertical":   4,   # ~14s
    "eyes_not_visible":        4,   # ~14s — eyes consistently hidden
    "too_far_from_camera":     3,   # ~10s
}
DEFAULT_FRAMES = 2

# Instant violations (no grace period needed — obvious cheating events)
INSTANT = {"multiple_persons", "phone_usage"}

# Minimum confidence to even consider a violation worth reporting
MIN_CONFIDENCE = 0.70

# Face position tolerances (normalised 0–1)
H_THRESHOLD = 0.30   # horizontal: > 30% off-center = looking away
V_THRESHOLD = 0.35   # vertical:   > 35% off-center = looking up/down

# Smoothing
_face_ratio_ema = {}   # session_id → float (exponential moving average)
EMA_ALPHA       = 0.65


def _preprocess(frame: np.ndarray) -> np.ndarray:
    """Apply CLAHE to enhance low-light frames before detection."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return _clahe.apply(gray)


def _estimate_brightness(gray: np.ndarray) -> float:
    """Return mean pixel brightness 0–255."""
    return float(np.mean(gray))


def _detect_faces(gray: np.ndarray):
    """
    Simultaneously catch frontal and profile faces for multi-person detection.
    Returns combined list of (x, y, w, h) tuples deduplicated by IoU.
    """
    # 1. Frontal detection
    frontal = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=3, # More sensitive
        minSize=(45, 45),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    all_boxes = list(frontal) if len(frontal) > 0 else []

    # 2. Profile detection (essential for catching people looking over shoulders)
    profile = profile_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=3,
        minSize=(45, 45),
    )
    if len(profile) > 0:
        all_boxes.extend(list(profile))

    # 3. Flipped profile (catch other side)
    flipped = cv2.flip(gray, 1)
    profile_f = profile_cascade.detectMultiScale(
        flipped,
        scaleFactor=1.1,
        minNeighbors=3,
        minSize=(45, 45),
    )
    if len(profile_f) > 0:
        W = gray.shape[1]
        for (x, y, w, h) in profile_f:
            all_boxes.append((W - x - w, y, w, h))

    return all_boxes


def _iou(a, b) -> float:
    """Intersection over Union of two (x,y,w,h) boxes."""
    ax1, ay1, ax2, ay2 = a[0], a[1], a[0]+a[2], a[1]+a[3]
    bx1, by1, bx2, by2 = b[0], b[1], b[0]+b[2], b[1]+b[3]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2-ix1) * max(0, iy2-iy1)
    union = (ax2-ax1)*(ay2-ay1) + (bx2-bx1)*(by2-by1) - inter
    return inter / union if union else 0.0


def _dedup(boxes, iou_thresh=0.4):
    """Remove duplicate bounding boxes using IoU."""
    keep = []
    for b in boxes:
        if not any(_iou(b, k) > iou_thresh for k in keep):
            keep.append(b)
    return keep


def _count_frames(session_id, vtype: str, seen: bool) -> int:
    """
    Increment counter if violation seen this frame, decrement (floor 0) otherwise.
    Returns current count.
    """
    s = _state.setdefault(session_id, {})
    if seen:
        s[vtype] = s.get(vtype, 0) + 1
    else:
        s[vtype] = max(0, s.get(vtype, 0) - 1)
    return s[vtype]


def analyze_face(frame: np.ndarray, session_id=None, phone_active=False) -> dict:
    """
    Analyze a BGR video frame for proctoring violations.

    Returns:
        {
            face_detected: bool,
            num_faces:     int,
            looking_away:  bool,
            violations:    list[{type, confidence, details}]
        }
    """
    result = {
        "face_detected": False,
        "num_faces":     0,
        "looking_away":  False,
        "violations":    [],
    }

    # ── Preprocessing ──────────────────────────────────────────────────────────
    enhanced = _preprocess(frame)
    brightness = _estimate_brightness(enhanced)
    frame_h, frame_w = frame.shape[:2]

    # ── Face Detection ─────────────────────────────────────────────────────────
    raw_boxes = _detect_faces(enhanced)
    boxes     = _dedup(raw_boxes)
    num_faces = len(boxes)
    result["num_faces"] = num_faces

    # ── No Face Handling ───────────────────────────────────────────────────────
    if num_faces == 0:
        # Confidence degrades in very dark frames — don't spam in dim rooms
        conf = 0.95 if brightness > 60 else 0.55   # dark room → low conf
        if session_id:
            count = _count_frames(session_id, "no_face", seen=True)
            # Also reset all other counters (face is gone)
            for k in list(_state[session_id].keys()):
                if k != "no_face":
                    _state[session_id][k] = max(0, _state[session_id].get(k, 0) - 1)
        else:
            count = 1

        required = FRAMES["no_face"]
        if count >= required and conf >= MIN_CONFIDENCE:
            result["violations"].append({
                "type":       "no_face",
                "confidence": round(conf, 2),
                "details":    f"No face detected (brightness={brightness:.0f})"
            })
        return result

    # Face found → reset no_face counter
    if session_id:
        _count_frames(session_id, "no_face", seen=False)

    result["face_detected"] = True

    # ── Multiple Faces ─────────────────────────────────────────────────────────
    if num_faces > 1:
        # INSTANT — always report without frame-count gate
        conf = min(0.92 + (num_faces - 2) * 0.04, 1.0)
        result["violations"].append({
            "type":       "multiple_persons",
            "confidence": round(conf, 2),
            "details":    f"{num_faces} faces detected simultaneously"
        })
        # Reset counter so it doesn't confusingly fire again after they leave
        if session_id:
            _state.setdefault(session_id, {})["multiple_persons"] = 0

    # ── Analyze Primary (Largest) Face ────────────────────────────────────────
    largest = max(boxes, key=lambda b: b[2] * b[3])
    fx, fy, fw, fh = largest

    cx_face   = fx + fw / 2
    cy_face   = fy + fh / 2
    cx_frame  = frame_w / 2
    cy_frame  = frame_h / 2

    h_dev = abs(cx_face - cx_frame) / frame_w   # 0 = center, 1 = edge
    v_dev = abs(cy_face - cy_frame) / frame_h

    # ── Gaze / Looking Away ────────────────────────────────────────────────────
    looking_h = h_dev > H_THRESHOLD
    looking_v = v_dev > V_THRESHOLD

    if session_id:
        h_count = _count_frames(session_id, "looking_away_horizontal", seen=looking_h)
        v_count = _count_frames(session_id, "looking_away_vertical",   seen=looking_v)
    else:
        h_count = FRAMES["looking_away_horizontal"] if looking_h else 0
        v_count = FRAMES["looking_away_vertical"]   if looking_v else 0

    if h_count >= FRAMES["looking_away_horizontal"] and looking_h:
        conf = round(min(h_dev * 2.5, 1.0), 2)
        if conf >= MIN_CONFIDENCE:
            result["looking_away"] = True
            result["violations"].append({
                "type":       "looking_away_horizontal",
                "confidence": conf,
                "details":    f"Face {h_dev*100:.0f}% off-center horizontally (sustained)"
            })

    if v_count >= FRAMES["looking_away_vertical"] and looking_v:
        conf = round(min(v_dev * 2.0, 1.0), 2)
        if conf >= MIN_CONFIDENCE:
            result["looking_away"] = True
            result["violations"].append({
                "type":       "looking_away_vertical",
                "confidence": conf,
                "details":    f"Face {v_dev*100:.0f}% off-center vertically (sustained)"
            })

    # ── Eye Detection (only when face is centred) ─────────────────────────────
    # Only check eyes when face is roughly centred — avoids false positives
    # on profile/turned faces where eyes are naturally hidden.
    if h_dev < 0.20 and v_dev < 0.20:
        roi_gray = enhanced[fy: fy + fh // 2, fx: fx + fw]   # upper half of face
        eyes = eye_cascade.detectMultiScale(
            roi_gray,
            scaleFactor=1.05,
            minNeighbors=3,
            minSize=(18, 18),
        )
        eyes_hidden = len(eyes) == 0

        if session_id:
            e_count = _count_frames(session_id, "eyes_not_visible", seen=eyes_hidden)
        else:
            e_count = FRAMES["eyes_not_visible"] if eyes_hidden else 0

        if e_count >= FRAMES["eyes_not_visible"] and eyes_hidden:
            result["violations"].append({
                "type":       "eyes_not_visible",
                "confidence": 0.75,  # moderate confidence — dark rooms can fool cascade
                "details":    "Eyes not visible — please look directly at the camera"
            })
    else:
        # Face is turned — reset eye counter so it doesn't carry over
        if session_id:
            _count_frames(session_id, "eyes_not_visible", seen=False)

    # ── Face Size / Distance ───────────────────────────────────────────────────
    face_area  = fw * fh
    frame_area = frame_w * frame_h
    ratio      = face_area / frame_area

    if session_id:
        ema = _face_ratio_ema.get(session_id, ratio)
        ema = EMA_ALPHA * ema + (1 - EMA_ALPHA) * ratio
        _face_ratio_ema[session_id] = ema
    else:
        ema = ratio

    min_ratio = 0.04 if phone_active else 0.05   # 5% of frame minimum
    if ema < min_ratio:
        if session_id:
            d_count = _count_frames(session_id, "too_far_from_camera", seen=True)
        else:
            d_count = FRAMES["too_far_from_camera"]

        if d_count >= FRAMES["too_far_from_camera"]:
            result["violations"].append({
                "type":       "too_far_from_camera",
                "confidence": 0.80,
                "details":    f"Face occupies only {ema*100:.1f}% of frame — please move closer"
            })
    else:
        if session_id:
            _count_frames(session_id, "too_far_from_camera", seen=False)

    return result


def detect_objects(frame: np.ndarray) -> list:
    """Placeholder — YOLO integration point."""
    return []


if __name__ == "__main__":
    """Quick webcam test — press q to quit."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Cannot open webcam"); exit()

    print("Face Detector Test — press Q to quit")
    sid = "test"
    while True:
        ok, frm = cap.read()
        if not ok: break

        res = analyze_face(frm, session_id=sid)

        clr = (0, 255, 0) if not res["violations"] else (0, 60, 255)
        cv2.putText(frm, f"Faces:{res['num_faces']}  Violations:{len(res['violations'])}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, clr, 2)
        for i, v in enumerate(res["violations"]):
            cv2.putText(frm, f"  {v['type']} ({v['confidence']:.2f})", (10, 65 + i*28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 60, 255), 2)

        cv2.imshow("Proctoring Test", frm)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()