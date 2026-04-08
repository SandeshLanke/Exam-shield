# Exam-Shield: AI Proctoring System

Exam-Shield is a comprehensive AI-powered exam proctoring platform designed to ensure academic integrity during remote online assessments. Utilizing advanced computer vision, real-time object detection, and facial analysis, the system actively monitors the candidate's environment to detect and prevent malpractice.

## 🚀 Key Features

- **Real-Time Video Monitoring**: Evaluates live webcam frames asynchronously from the client side using React web-cams.
- **Smart Mobile Phone Detection**: Implements the powerful YOLOv3 architecture to detect if the candidate raises a mobile phone to the screen.
- **Face & Gaze Analysis**: Analyzes facial presence and tracks gaze to detect instances like looking away (horizontally or vertically), having multiple persons in the frame, or a missing face entirely.
- **Priority-Based Violation Logging**: Smart logging system handles high-level violations immediately and prevents notification spam from minor overlapping issues.
- **Admin Dashboard & Analytics**: Visualizes exam sessions and time-stamped violations cleanly using beautiful Recharts diagrams.
- **Secure Architecture**: Fast and secure backend processing powered by FastAPI, JWT Authentication, and rigorously hashed (bcrypt) credentials.

## 🛠 Tech Stack

- **Backend Platform**: Fast, asynchronous Python architecture directly using **FastAPI**.
- **Computer Vision Model**: **OpenCV** with embedded **YOLOv3** object-detection weighting.
- **Database Architecture**: **SQLite** local storage mapping user, sessions, and violations schemas.
- **Frontend Client**: SPA structured **React.js** interfaced with **Axios**, **Recharts**, and **react-webcam**.

## ⚙️ Installation & Setup Guide

### System Prerequisites
- [Python 3.8+](https://www.python.org/downloads/)
- [Node.js v14+ & npm](https://nodejs.org/en/download/)
- **YOLO Weights**: The system uses predefined neural networks (`yolov3.weights`) which are ~248MB. *See YOLO Setup below.*

---

### Backend System Setup

1. Open up a terminal in the main project root directory.
2. Initialize the Python virtual environment and activate it:
   ```bash
   python -m venv venv

   # On Windows:
   venv\Scripts\activate

   # On Mac/Linux:
   source venv/bin/activate
   ```
3. Install backend dependencies from the requirements file:
   ```bash
   pip install -r requirements.txt
   ```
4. **YOLO Algorithm Setup:**
   Ensure you have the following neural network files downloaded and placed in the main project root:
   - `yolov3.cfg`
   - `yolov3.weights` *(Requires a separate manual download as it exceeds standard Git storage limits)*
   - `coco.names`
5. Start the backend ASGI server:
   ```bash
   python main.py
   ```
   *The core server will boot up via Uvicorn natively at `http://127.0.0.1:8000`.*

---

### Frontend React Setup

1. In a separate terminal session, navigate directly into the frontend user interface directory:
   ```bash
   cd proctoring-ui
   ```
2. Install standard frontend Node packages:
   ```bash
   npm install
   ```
3. Start the React development environment:
   ```bash
   npm start
   ```

## 🧠 Violation AI Logic Core

The system is specially designed with an intelligent priority violation suppression logic module:
- **High-Priority Triggers**: (`phone_usage`, `multiple_persons`, `no_face`)
- **Medium-Priority Triggers**: (`looking_away_horizontal`, `looking_away_vertical`, `eyes_not_visible`)
- **Low-Priority Triggers**: (`too_far_from_camera`)

If a high priority violation occurs (e.g. pulling out a phone), the system safely omits logging overlapping lower-priority ones. This cleanly isolates main violation occurrences to report effectively to assessment administrators.

---

> 📌 **Important Note:** The phone detector mechanism is entirely *optional* but recommended. If the YOLO weights and configuration files are missing, the AI backend instance will safely bypass mobile phone warnings and gracefully continue enforcing all standard facial compliance validations.
