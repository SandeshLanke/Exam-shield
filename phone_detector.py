#############################################
# Person Using Cell Phone Detection (YOLOv3 + OpenCV)
#
# This module exposes an importable API and can still be executed
# as a standalone script for quick testing.  Call ``initialize``
# before invoking ``detect_phone_usage`` from another file.
#############################################

import cv2
import numpy as np
import os

# module-level globals that hold the loaded network and class names
_net = None
_classes = []
_COLORS = None

# ---------- helper routines ----------

def get_output_layers(net):
    layer_names = net.getLayerNames()
    try:
        # OpenCV 4.2+ returns a list of ints
        return [layer_names[i - 1] for i in net.getUnconnectedOutLayers()]
    except Exception:
        # legacy behaviour returns nested arrays
        return [layer_names[i[0] - 1] for i in net.getUnconnectedOutLayers()]


def _load_yolo(cfg_path: str, weights_path: str, classes_path: str):
    """Load weights and class names; used internally by ``initialize``."""
    global _net, _classes, _COLORS

    with open(classes_path, "r") as f:
        _classes = [line.strip() for line in f.readlines()]

    _COLORS = np.random.uniform(0, 255, size=(len(_classes), 3))
    _net = cv2.dnn.readNet(weights_path, cfg_path)


# ---------- public API ----------

def initialize(config_path: str, weights_path: str, classes_path: str):
    """Initialize the YOLO network.

    Must be called before ``detect_phone_usage`` when importing the
    module from another script (e.g. the FastAPI server).

    Parameters
    ----------
    config_path : str
        Path to the YOLO configuration file (.cfg).
    weights_path : str
        Path to the YOLO weights file (.weights).
    classes_path : str
        Text file containing class names, one per line (e.g. coco.names).
    """
    _load_yolo(config_path, weights_path, classes_path)


def detect_phone_usage(frame: np.ndarray) -> dict:
    """Analyze a single BGR frame for phone usage.

    Returns a dictionary containing at least the keys:
    ``person_detected``, ``phone_detected`` and ``violations``.  The
    ``violations`` list will contain a single entry with ``type``
    ``"phone_usage"`` and a confidence score when a phone is seen
    in the same frame as a person.

    The frame is also annotated in place (rectangles + labels) so the
    caller can display or save it if desired.
    """
    if _net is None:
        raise RuntimeError("phone_detector.initialize() has not been called")

    height, width = frame.shape[:2]
    blob = cv2.dnn.blobFromImage(
        frame, 0.00392, (416, 416), (0, 0, 0), True, crop=False
    )

    _net.setInput(blob)
    outs = _net.forward(get_output_layers(_net))

    class_ids = []
    confidences = []
    boxes = []

    for out in outs:
        for det in out:
            scores = det[5:]
            class_id = np.argmax(scores)
            confidence = scores[class_id]

            if confidence > 0.5:
                cx = int(det[0] * width)
                cy = int(det[1] * height)
                w = int(det[2] * width)
                h = int(det[3] * height)

                x = int(cx - w / 2)
                y = int(cy - h / 2)

                boxes.append([x, y, w, h])
                confidences.append(float(confidence))
                class_ids.append(class_id)

    indices = cv2.dnn.NMSBoxes(boxes, confidences, 0.5, 0.4)

    person_detected = False
    phone_detected = False
    phone_confidence = 0.0

    for i in indices:
        i = i[0] if isinstance(i, (list, tuple, np.ndarray)) else i
        x, y, w, h = boxes[i]
        label = _classes[class_ids[i]]

        if label == "person":
            person_detected = True
            color = (0, 255, 0)
        elif label == "cell phone":
            phone_detected = True
            phone_confidence = confidences[i]
            color = (0, 0, 255)
        else:
            color = _COLORS[class_ids[i]]

        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
        cv2.putText(
            frame,
            label,
            (x, y - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
        )

    results = {
        "person_detected": person_detected,
        "phone_detected": phone_detected,
        "violations": []
    }

    if person_detected and phone_detected:
        results["violations"].append({
            "type": "phone_usage",
            "confidence": phone_confidence,
            "details": "Detected person holding a cell phone"
        })

    return results


# ---------- command‑line convenience ----------
if __name__ == "__main__":
    # allow the original behaviour when run directly; arguments are
    # only required for standalone testing and do not affect the API.
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("-i", "--image", help="path to input image")
    parser.add_argument("-v", "--video", action="store_true", help="use webcam")
    parser.add_argument("-c", "--config", required=True, help="yolo config file")
    parser.add_argument("-w", "--weights", required=True, help="yolo weights file")
    parser.add_argument("-cl", "--classes", required=True, help="class names file")
    args = parser.parse_args()

    initialize(args.config, args.weights, args.classes)

    if args.video:
        cap = cv2.VideoCapture(0)
        print("Press Q to quit")
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.resize(frame, (640, 480))
            phone_result = detect_phone_usage(frame)
            cv2.imshow("Live Detection", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
        cap.release()
        cv2.destroyAllWindows()
    elif args.image:
        image = cv2.imread(args.image)
        detect_phone_usage(image)
        cv2.imshow("Image Detection", image)
        cv2.imwrite("object-detection.jpg", image)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    else:
        print("ERROR: Use --video or --image <path>")
