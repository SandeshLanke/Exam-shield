import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';

const API_URL = 'http://localhost:8000';
const USE_MOCK = false; // SET TO FALSE TO USE REAL BACKEND

const QUESTIONS = [
  {
    id: 1,
    question: "What is the time complexity of binary search?",
    options: ["O(n)", "O(log n)", "O(n²)", "O(1)"],
    correct: 1
  },
  {
    id: 2,
    question: "Which data structure uses LIFO principle?",
    options: ["Queue", "Stack", "Array", "Tree"],
    correct: 1
  },
  {
    id: 3,
    question: "What does HTML stand for?",
    options: ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks and Text Markup Language"],
    correct: 0
  },
  {
    id: 4,
    question: "Which is NOT a JavaScript framework?",
    options: ["React", "Vue", "Django", "Angular"],
    correct: 2
  },
  {
    id: 5,
    question: "What is the default port for HTTP?",
    options: ["443", "8080", "80", "3000"],
    correct: 2
  }
];

function ExamInterface({ userData, onExamComplete }) {
  const [sessionId, setSessionId] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes
  const [violations, setViolations] = useState([]);
  const [currentAlertViolation, setCurrentAlertViolation] = useState(null); // Current displayed alert
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [examStarted, setExamStarted] = useState(false);
  const [debugInfo, setDebugInfo] = useState(''); // DEBUG
  const [lastAnalysis, setLastAnalysis] = useState(null); // DEBUG
  const [lastViolationTime, setLastViolationTime] = useState(0);

  const webcamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const alertTimeoutRef = useRef(null); // Timeout for clearing alert

  // Violation type descriptions
  const getViolationDescription = (violation) => {
    const descriptions = {
      "no_face": { emoji: "😶", title: "No Face Detected", message: "Please keep your face visible in the camera" },
      "multiple_persons": { emoji: "👥", title: "Multiple Faces Detected", message: `${violation.details || 'Multiple people detected'} - Only you should be in the exam` },
      "looking_away_horizontal": { emoji: "👀", title: "Face Off-Center (Left/Right)", message: "Please look forward at the screen" },
      "looking_away_vertical": { emoji: "⬆️⬇️", title: "Face Off-Center (Up/Down)", message: "Please keep your head straight and look at the screen" },
      "too_far_from_camera": { emoji: "📏", title: "Too Far From Camera", message: "Please move closer to the camera" },
      "eyes_not_visible": { emoji: "👁️", title: "Eyes Not Visible", message: "Please ensure both eyes are visible to the camera" },
      "unusual_head_angle": { emoji: "🔄", title: "Unusual Head Angle", message: "Please keep your head at a normal angle" },
      "phone_usage": { emoji: "📱", title: "Mobile Phone Detected", message: "Mobile device detected - Not allowed during exam" }
    };
    return descriptions[violation.type] || { 
      emoji: "⚠️", 
      title: violation.type.replace(/_/g, ' ').toUpperCase(), 
      message: violation.details || 'Unknown violation' 
    };
  };

  useEffect(() => {
    if (violations.length > 5) {
      alert("⚠️ Multiple violations detected! Please maintain exam integrity.");
    }
  }, [violations]);
  useEffect(() => {
    if (examStarted && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0) {
      handleSubmitExam();
    }
  }, [examStarted, timeLeft]);

    // Start webcam analysis only when sessionId is ready
  useEffect(() => {
    if (sessionId && examStarted) {
      console.log("✅ Session ID available, starting frame capture:", sessionId);
      frameIntervalRef.current = setInterval(captureAndAnalyze, 3000);
    }

    // Cleanup when exam ends or component unmounts
    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
        alertTimeoutRef.current = null;
      }
    };
  }, [sessionId, examStarted]);
  const startExam = async () => {
    try {
      const token = localStorage.getItem('token');
      setDebugInfo('Starting exam...');
      
      const response = await axios.post(
        `${API_URL}/start-exam`,
        { user_id: userData.userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      console.log('Exam started:', response.data);
      setDebugInfo(`Exam started. Session ID: ${response.data.session_id}`);
      
      setSessionId(response.data.session_id);
      setExamStarted(true);
      
      // Start frame analysis every 3 seconds
      frameIntervalRef.current = setInterval(captureAndAnalyze, 3000);
    } catch (error) {
      console.error('Failed to start exam:', error);
      setDebugInfo(`ERROR: ${error.message}`);
      alert('Failed to start exam: ' + error.message);
    }
  };
  function addViolation(newViolation) {
    const now = Date.now();

    // Allow adding only if 5 seconds have passed since last violation
    if (now - lastViolationTime > 5000) {
      setViolations(prev => [...prev, newViolation]);
      
      // Display the new violation alert
      setCurrentAlertViolation(newViolation);
      
      // Clear any existing timeout
      if (alertTimeoutRef.current) {
        clearTimeout(alertTimeoutRef.current);
      }
      
      // Auto-clear the alert after 4 seconds
      alertTimeoutRef.current = setTimeout(() => {
        setCurrentAlertViolation(null);
      }, 4000);
      
      setLastViolationTime(now);
    }
  }
  const captureAndAnalyze = async () => {
    if (!webcamRef.current || isAnalyzing) {
      console.log('Skipping analysis - webcam not ready or already analyzing');
      return;
    }
    
    setIsAnalyzing(true);
    console.log('Capturing frame...');
    
    const imageSrc = webcamRef.current.getScreenshot();
    
    if (!imageSrc) {
      console.log('Failed to capture screenshot');
      setIsAnalyzing(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      console.log('Sending frame to backend...');
      setDebugInfo('Analyzing frame...');
      
      const response = await axios.post(
        `${API_URL}/analyze-frame`,
        {
          session_id: sessionId,
          frame_data: imageSrc
        },
        { 
          headers: { Authorization: `Bearer ${token}`,
          "Content-Type": "application/json" },
          timeout: 5000 // 5 second timeout
        }
      );

      console.log('Analysis response:', response.data);
      setLastAnalysis(response.data); // DEBUG
setDebugInfo(`Analysis complete. Violations: ${response.data.violations?.length || 0}${response.data.phone_detected ? ' | 📱 phone seen' : ''}`);

      if (response.data.violations && response.data.violations.length > 0) {
        console.log('VIOLATIONS DETECTED:', response.data.violations);
        setViolations(prev => {
          const newViolations = [...prev, ...response.data.violations.map(v => ({
            ...v,
            timestamp: new Date().toISOString()
          }))];
          console.log('Total violations now:', newViolations.length);
          return newViolations;
        });
      }
    } catch (error) {
      console.error('Frame analysis error:', error);
      setDebugInfo(`Analysis error: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnswerSelect = (questionId, optionIndex) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: optionIndex
    }));
  };

  const handleSubmitExam = async () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/end-exam/${sessionId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      onExamComplete(sessionId);
    } catch (error) {
      console.error('Error ending exam:', error);
      onExamComplete(sessionId);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!examStarted) {
    return (
      <div className="exam-start-container">
        <div className="exam-start-box">
          <h2>Welcome, {userData.name}!</h2>
          
          {/* DEBUG INFO */}
          <div style={{background: '#f0f0f0', padding: '10px', marginBottom: '20px', borderRadius: '5px'}}>
            <strong>Debug Info:</strong>
            <p>API URL: {API_URL}</p>
            <p>Use Mock: {USE_MOCK ? 'YES' : 'NO'}</p>
            <p>User ID: {userData.userId}</p>
          </div>
          
          <div className="exam-instructions">
            <h3>Exam Instructions:</h3>
            <ul>
              <li>✓ Ensure your webcam is working</li>
              <li>✓ Stay in front of the camera during the exam</li>
              <li>✓ Do not look away frequently</li>
              <li>✓ Only one person should be visible</li>
              <li>✓ You have 30 minutes to complete the exam</li>
              <li>✓ The exam has 5 multiple choice questions</li>
            </ul>
          </div>
          
          <div className="webcam-preview">
            <h4>Camera Preview:</h4>
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              width={400}
              height={300}
            />
          </div>
          
          <button onClick={startExam} className="btn-primary btn-large">
            Start Exam
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-interface">
      <div className="exam-header">
        <div className="header-left">
          <h2>Online Examination</h2>
          <p>Student: {userData.name}</p>
        </div>
        <div className="header-right">
          <div className="timer">
            ⏱️ Time Left: {formatTime(timeLeft)}
          </div>
          <div className="violations-count" style={{color: violations.length > 0 ? '#e74c3c' : '#28a745'}}>
            ⚠️ Violations: {violations.length}
          </div>
        </div>
      </div>

      {/* POPUP VIOLATIONS ALERT AT TOP */}
      {currentAlertViolation && (
        <div style={{
          position: 'sticky',
          top: '0',
          zIndex: 1000,
          background: currentAlertViolation?.type === 'phone_usage' ? '#ffe0e0' : '#fff3cd',
          borderBottom: currentAlertViolation?.type === 'phone_usage' ? '4px solid #e74c3c' : '4px solid #ff9800',
          padding: '16px 20px',
          margin: '0',
          borderRadius: '0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          animation: 'slideDown 0.3s ease-in-out'
        }}>
          {(() => {
            const desc = getViolationDescription(currentAlertViolation);
            return (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                  {desc.emoji} {desc.title}
                </div>
                <div style={{ fontSize: '14px', color: '#555', marginBottom: '3px' }}>
                  {desc.message}
                </div>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  Confidence: {(currentAlertViolation.confidence * 100).toFixed(0)}% | Total Alerts: {violations.length}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* DEBUG PANEL */}
      <div style={{background: '#fff3cd', padding: '10px', borderBottom: '1px solid #ffc107'}}>
        <strong>Debug:</strong> {debugInfo}
        {lastAnalysis && (
          <div style={{fontSize: '12px', marginTop: '5px'}}>
            Face Detected: {lastAnalysis.face_detected ? 'YES' : 'NO'} | 
            Num Faces: {lastAnalysis.num_faces} | 
            Looking Away: {lastAnalysis.looking_away ? 'YES' : 'NO'}
          </div>
        )}
      </div>

      <div className="exam-content">
        <div className="question-panel">
          <div className="question-header">
            <span>Question {currentQuestion + 1} of {QUESTIONS.length}</span>
          </div>
          
          <div className="question">
            <h3>{QUESTIONS[currentQuestion].question}</h3>
            <div className="options">
              {QUESTIONS[currentQuestion].options.map((option, index) => (
                <div
                  key={index}
                  className={`option ${answers[QUESTIONS[currentQuestion].id] === index ? 'selected' : ''}`}
                  onClick={() => handleAnswerSelect(QUESTIONS[currentQuestion].id, index)}
                >
                  <input
                    type="radio"
                    name={`question-${QUESTIONS[currentQuestion].id}`}
                    checked={answers[QUESTIONS[currentQuestion].id] === index}
                    onChange={() => {}}
                  />
                  <label>{option}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="question-navigation">
            <button
              onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
              disabled={currentQuestion === 0}
              className="btn-secondary"
            >
              Previous
            </button>
            
            {currentQuestion === QUESTIONS.length - 1 ? (
              <button onClick={handleSubmitExam} className="btn-primary">
                Submit Exam
              </button>
            ) : (
              <button
                onClick={() => setCurrentQuestion(prev => Math.min(QUESTIONS.length - 1, prev + 1))}
                className="btn-primary"
              >
                Next
              </button>
            )}
          </div>

          <div className="question-grid">
            {QUESTIONS.map((q, index) => (
              <div
                key={q.id}
                className={`question-number ${answers[q.id] !== undefined ? 'answered' : ''} ${currentQuestion === index ? 'active' : ''}`}
                onClick={() => setCurrentQuestion(index)}
              >
                {index + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="monitoring-panel">
          <h3>Live Monitoring</h3>
          <div className="webcam-container">
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              width="100%"
            />
            {isAnalyzing && <div className="analyzing-badge">Analyzing...</div>}
          </div>
          
          <div className="status-indicators">
            <div className="status-item">
              <span className="status-icon">👤</span>
              <span>Face Detection: {lastAnalysis?.face_detected ? 'Active ✓' : 'Inactive ✗'}</span>
            </div>
            <div className="status-item">
              <span className="status-icon">�</span>
              <span>Phone: {lastAnalysis?.phone_detected ? 'Seen ⚠️' : 'None'}</span>
            </div>
            <div className="status-item">
              <span className="status-icon">�📹</span>
              <span>Recording: Active</span>
            </div>
            <div className="status-item">
              <span className="status-icon">🔍</span>
              <span>Analysis: {isAnalyzing ? 'Running...' : 'Idle'}</span>
            </div>
          </div>

          {violations.length > 0 && (
            <>
            <div style={{background: '#fff3cd', padding: '12px', borderRadius: '6px', marginTop: '15px', borderLeft: '4px solid #ff9800'}}>
              <h4 style={{margin: '0 0 10px 0', color: '#333', fontSize: '14px'}}>📊 Violation Summary</h4>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px'}}>
                {Object.entries(violations.reduce((acc, v) => {
                  const desc = getViolationDescription(v);
                  const key = desc.title;
                  acc[key] = (acc[key] || 0) + 1;
                  return acc;
                }, {})).map(([type, count], idx) => (
                  <div key={idx} style={{padding: '6px', background: 'white', borderRadius: '4px', textAlign: 'center'}}>
                    <strong>{count}</strong> {type}
                  </div>
                ))}
              </div>
            </div>
            <div className="recent-violations">
              <h4>🚨 Alerts Detected ({violations.length} total):</h4>
              <div className="violations-list">
                {violations.slice(-8).reverse().map((v, index) => {
                  const desc = getViolationDescription(v);
                  return (
                    <div key={index} className="violation-item" style={{
                      background: v.type === 'phone_usage' ? '#ffe0e0' : '#fff3cd',
                      borderLeft: v.type === 'phone_usage' ? '4px solid #e74c3c' : '4px solid #ff9800',
                      padding: '12px',
                      marginBottom: '8px',
                      borderRadius: '4px'
                    }}>
                      <div style={{fontWeight: 'bold', fontSize: '13px'}}>
                        {desc.emoji} {desc.title} ({(v.confidence * 100).toFixed(0)}%)
                      </div>
                      <div style={{fontSize: '12px', color: '#333', marginTop: '4px'}}>
                        {desc.message}
                      </div>
                      <div style={{fontSize: '11px', color: '#666', marginTop: '2px'}}>
                        {new Date(v.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </>
          )}
          
          {violations.length === 0 && (
            <div style={{background: '#d4edda', padding: '15px', borderRadius: '8px', marginTop: '20px', textAlign: 'center'}}>
              ✅ No violations detected - Good!
            </div>
          )}
          
          {violations.length > 0 && (
            <div style={{background: '#f8d7da', padding: '15px', borderRadius: '8px', marginTop: '20px', textAlign: 'center', color: '#721c24'}}>
              ⚠️ {violations.length} violation{violations.length !== 1 ? 's' : ''} detected - Please maintain exam integrity!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExamInterface;