import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

// Violations that trigger a toast banner (disruptive-ish — HIGH severity only)
const TOAST_VIOLATIONS = new Set([
  'phone_usage', 'multiple_persons', 'ai_assistant_detected', 'tab_change', 'exited_fullscreen',
]);

// ─── Violation Weights for Auto-Submit scoring ────────────────────────────────
const VIOLATION_WEIGHTS = {
  phone_usage: 15,
  multiple_persons: 12,
  tab_change: 10,
  exited_fullscreen: 8,
  no_face: 6,
  ai_assistant_detected: 20,
  noise_detected: 5,
  browser_lockdown: 4,
  looking_away_horizontal: 3,
  looking_away_vertical: 3,
  eyes_not_visible: 3,
  unusual_head_angle: 2,
  too_far_from_camera: 1,
  network_issue: 2,
};
const AUTO_SUBMIT_SCORE_THRESHOLD = 80; // auto-submit when cumulative weight >= 80

// ─── Per-violation cooldown (ms) to prevent spam ─────────────────────────────
const VIOLATION_COOLDOWNS = {
  noise_detected:            15000,  // 15s — only flag truly sustained noise
  looking_away_horizontal:   12000,  // 12s — backend already gates, extra frontend cooldown
  looking_away_vertical:     12000,
  eyes_not_visible:          15000,
  too_far_from_camera:       20000,
  unusual_head_angle:        15000,
  no_face:                   10000,
  multiple_persons:           5000,  // 5s — important, but still throttled
  phone_usage:                5000,
  exited_fullscreen:         20000,
  tab_change:                12000,
  browser_lockdown:          10000,
  network_issue:             20000,
  ai_assistant_detected:      8000,
};
const DEFAULT_COOLDOWN = 8000;

// ─── Violation descriptions ───────────────────────────────────────────────────
const VIOLATION_INFO = {
  no_face:                   { emoji: '😶', title: 'No Face Detected',        color: '#f59e0b' },
  multiple_persons:          { emoji: '👥', title: 'Multiple People Detected', color: '#ef4444' },
  looking_away_horizontal:   { emoji: '👀', title: 'Looking Away',             color: '#f59e0b' },
  looking_away_vertical:     { emoji: '⬆️', title: 'Looking Up/Down',          color: '#f59e0b' },
  too_far_from_camera:       { emoji: '📏', title: 'Too Far From Camera',       color: '#f59e0b' },
  eyes_not_visible:          { emoji: '👁️', title: 'Eyes Not Visible',         color: '#f59e0b' },
  unusual_head_angle:        { emoji: '🔄', title: 'Unusual Head Angle',        color: '#f59e0b' },
  phone_usage:               { emoji: '📱', title: 'Phone Detected!',           color: '#ef4444' },
  tab_change:                { emoji: '🪟', title: 'Tab Switch Detected',       color: '#ef4444' },
  browser_lockdown:          { emoji: '🚫', title: 'Copy/Paste Blocked',        color: '#8b5cf6' },
  exited_fullscreen:         { emoji: '🖥️', title: 'Fullscreen Exited',        color: '#ef4444' },
  network_issue:             { emoji: '📶', title: 'Network Offline',           color: '#6b7280' },
  noise_detected:            { emoji: '🔊', title: 'Loud Noise Detected',       color: '#f59e0b' },
  ai_assistant_detected:     { emoji: '🤖', title: 'AI Assistant Detected!',   color: '#ef4444' },
  face_not_verified:         { emoji: '🪪', title: 'Identity Mismatch',         color: '#ef4444' },
};

function ExamInterface({ userData, onExamComplete }) {
  // ── Core exam state ────────────────────────────────────────────────────────
  const [sessionId, setSessionId]           = useState(null);
  const [questions, setQuestions]           = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers]               = useState({});
  const [timeLeft, setTimeLeft]             = useState(1800);
  const [examStarted, setExamStarted]       = useState(false);
  const [examSubmitting, setExamSubmitting] = useState(false);

  // ── Monitoring state ────────────────────────────────────────────────────────
  const [violations, setViolations]           = useState([]);
  const [violationScore, setViolationScore]   = useState(0);
  const [toastViolation, setToastViolation]   = useState(null);
  const [isAnalyzing, setIsAnalyzing]         = useState(false);
  const [isFullscreen, setIsFullscreen]       = useState(false);
  const [isOnline, setIsOnline]               = useState(window.navigator.onLine);
  const [aiStatus, setAiStatus]               = useState({ face: false, faces: 0, phone: false, looking_away: false });
  const [volumeLevel, setVolumeLevel]         = useState(0);
  const [showSubmitModal, setShowSubmitModal] = useState(false);  // confirmation modal

  // ── Refs ────────────────────────────────────────────────────────────────────
  const webcamRef           = useRef(null);
  const frameIntervalRef    = useRef(null);
  const toastTimeoutRef     = useRef(null);
  const inactivityRef       = useRef(null);
  const audioContextRef     = useRef(null);
  const analyserRef         = useRef(null);
  const audioCheckRef       = useRef(null);
  const speechRecoRef       = useRef(null);
  const mediaRecorderRef    = useRef(null);
  const violationTimesRef   = useRef({});  // { type: lastTimestamp }
  const violationScoreRef   = useRef(0);  // sync ref for auto-submit checks
  const examStartedRef      = useRef(false);
  const sessionIdRef        = useRef(null);
  const answersRef          = useRef({});

  // Keep refs in sync
  useEffect(() => { examStartedRef.current = examStarted; }, [examStarted]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // ── addViolation — central, throttled, scored ──────────────────────────────
  const addViolation = useCallback((type, confidence = 1.0, details = '') => {
    const now = Date.now();
    const cooldown = VIOLATION_COOLDOWNS[type] ?? DEFAULT_COOLDOWN;
    const lastTime = violationTimesRef.current[type] || 0;

    if (now - lastTime < cooldown) return; // still in cooldown, ignore
    violationTimesRef.current[type] = now;

    const violation = { type, confidence, details, timestamp: new Date().toISOString() };

    setViolations(prev => [...prev, violation]);

    // Update cumulative risk score
    const weight = VIOLATION_WEIGHTS[type] || 2;
    const newScore = violationScoreRef.current + weight;
    violationScoreRef.current = newScore;
    setViolationScore(newScore);

    // Only show toast for high-priority violations — others go silently to sidebar
    if (TOAST_VIOLATIONS.has(type)) {
      setToastViolation(violation);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToastViolation(null), 5000);
    }

    // Auto-submit if score exceeds threshold
    if (newScore >= AUTO_SUBMIT_SCORE_THRESHOLD && examStartedRef.current && !examSubmitting) {
      handleAutoSubmit('Major violations threshold exceeded');
    }
  }, [examSubmitting]); // eslint-disable-line

  // ── Timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!examStarted) return;
    if (timeLeft <= 0) { handleAutoSubmit('Time expired'); return; }
    const t = setTimeout(() => setTimeLeft(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [examStarted, timeLeft]); // eslint-disable-line

  // ── Browser Lockdown & Monitoring — runs once exam starts ─────────────────
  useEffect(() => {
    if (!examStarted) return;

    // -- Right-click
    const onContextMenu = (e) => { e.preventDefault(); addViolation('browser_lockdown', 1.0, 'Right-click'); };

    // -- Copy / Paste / Cut
    const onClipboard = (e) => { e.preventDefault(); addViolation('browser_lockdown', 1.0, `${e.type} blocked`); };

    // -- Tab visibility change
    const onVisibility = () => {
      if (document.hidden) addViolation('tab_change', 1.0, 'Tab hidden or minimized');
    };

    // -- Fullscreen change (NO alert/confirm here — they exit fullscreen!)
    const onFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) addViolation('exited_fullscreen', 1.0, 'Exited fullscreen');
    };

    // -- Network
    const onOffline = () => { setIsOnline(false); addViolation('network_issue', 1.0, 'Offline'); };
    const onOnline  = () => setIsOnline(true);

    // -- Inactivity reset
    const resetInactivity = () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      inactivityRef.current = setTimeout(() => {
        if (examStartedRef.current) handleAutoSubmit('Inactivity timeout (5 min)');
      }, 5 * 60 * 1000);
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('copy',        onClipboard);
    document.addEventListener('paste',       onClipboard);
    document.addEventListener('cut',         onClipboard);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online',  onOnline);
    window.addEventListener('mousemove', resetInactivity);
    window.addEventListener('keydown',   resetInactivity);
    resetInactivity();

    // -- Enter fullscreen
    document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});

    // ── Audio Noise Detection ────────────────────────────────────────────────
    let noiseAnimId = null;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const ctx      = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current     = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const checkNoise = () => {
        analyser.getByteFrequencyData(buf);
        // Only look at speech-frequency bands (roughly index 4–40 in 512fft at 44100Hz ≈ 344–3440 Hz)
        const speechBuf = buf.slice(4, 40);
        const avg = speechBuf.reduce((a, b) => a + b, 0) / speechBuf.length;
        setVolumeLevel(Math.round(avg));
        if (avg > 80) { // 80/255 ≈ loud speaking threshold
          addViolation('noise_detected', parseFloat((avg / 255).toFixed(2)), `Volume: ${Math.round(avg)}`);
        }
        noiseAnimId = requestAnimationFrame(checkNoise);
      };
      audioCheckRef.current = () => { if (noiseAnimId) cancelAnimationFrame(noiseAnimId); };
      checkNoise();
    }).catch(err => console.warn('Mic not accessible:', err));

    // ── Speech Recognition — AI keyword detection ────────────────────────────
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR();
      r.continuous    = true;
      r.interimResults = true;
      r.onresult = (ev) => {
        const text = Array.from(ev.results).map(x => x[0].transcript).join(' ').toLowerCase();
        const banned = ['chatgpt', 'siri', 'alexa', 'google assistant', 'hey google', 'help me answer'];
        if (banned.some(kw => text.includes(kw)))
          addViolation('ai_assistant_detected', 0.95, `Heard: "${text.slice(-60)}"`);
      };
      r.onend = () => { if (examStartedRef.current) { try { r.start(); } catch(e){} } };
      r.start();
      speechRecoRef.current = r;
    }

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('copy',        onClipboard);
      document.removeEventListener('paste',       onClipboard);
      document.removeEventListener('cut',         onClipboard);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('mousemove', resetInactivity);
      window.removeEventListener('keydown',   resetInactivity);
      if (inactivityRef.current)  clearTimeout(inactivityRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (audioCheckRef.current)   audioCheckRef.current();
      if (speechRecoRef.current)   { try { speechRecoRef.current.stop(); } catch(e){} }
    };
  }, [examStarted, addViolation]);

  // ── Frame analysis loop (AI Vision) ───────────────────────────────────────
  const captureAndAnalyze = useCallback(async () => {
    if (!webcamRef.current || isAnalyzing) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;
    setIsAnalyzing(true);
    try {
      const token = localStorage.getItem('token');
      // For preview (pre-exam), we send a dummy/null session_id
      const { data } = await axios.post(
        `${API_URL}/analyze-frame`,
        { session_id: sessionIdRef.current || 0, frame_data: imageSrc },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
      );
      // Update live AI status indicators
      setAiStatus({
        face:         !!data.face_detected,
        faces:        data.num_faces || 0,
        phone:        !!data.phone_detected,
        looking_away: !!data.looking_away,
      });
      // Map backend violations to our addViolation
      if (data.violations && data.violations.length > 0) {
        data.violations.forEach(v => addViolation(v.type, v.confidence, v.details || ''));
      }
    } catch (err) {
      console.warn('Frame analysis error:', err.message);
    } finally {
      setIsAnalyzing(false);
    }
  }, [isAnalyzing, addViolation]);

  // ── Frame interval — start when component mounts for preview ────────────────
  useEffect(() => {
    // We run analysis for PREVIEW even before starting (without session_id)
    // or with session_id once started.
    frameIntervalRef.current = setInterval(captureAndAnalyze, 2000); 
    return () => { if (frameIntervalRef.current) clearInterval(frameIntervalRef.current); };
  }, [captureAndAnalyze]);

  // ── Start exam ─────────────────────────────────────────────────────────────
  const startExam = async () => {
    try {
      const token = localStorage.getItem('token');
      const res  = await axios.post(`${API_URL}/start-exam`, { user_id: userData.userId }, { headers: { Authorization: `Bearer ${token}` } });
      const qRes = await axios.get(`${API_URL}/questions`, { headers: { Authorization: `Bearer ${token}` } });
      setQuestions(qRes.data.questions);
      setSessionId(res.data.session_id);
      setExamStarted(true);

      // Start MediaRecorder for webcam video backup
      if (webcamRef.current?.stream) {
        const mr = new MediaRecorder(webcamRef.current.stream, { mimeType: 'video/webm' });
        mr.ondataavailable = async (e) => {
          if (e.data.size > 0) {
            const fd = new FormData();
            fd.append('video', e.data);
            axios.post(`${API_URL}/upload-video?session_id=${res.data.session_id}`, fd).catch(() => {});
          }
        };
        mr.start(5000);
        mediaRecorderRef.current = mr;
      }
    } catch (err) {
      alert('Failed to start exam: ' + (err.response?.data?.detail || err.message));
    }
  };

  // ── Auto-submit with reason ────────────────────────────────────────────────
  const handleAutoSubmit = useCallback(async (reason = '') => {
    if (examSubmitting) return;
    setExamSubmitting(true);
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    try {
      const token = localStorage.getItem('token');
      const formattedAnswers = Object.entries(answersRef.current).map(([qId, ans]) => ({
        question_id: parseInt(qId), answer: ans.toString()
      }));
      await axios.post(`${API_URL}/submit-exam`,
        { session_id: sessionIdRef.current, answers: formattedAnswers },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) { console.error('Submit error:', err); }
    onExamComplete(sessionIdRef.current);
  }, [examSubmitting, onExamComplete]);

  const handleSubmitExam = () => {
    // Show confirmation modal before submitting
    setShowSubmitModal(true);
  };

  const confirmSubmit = () => {
    setShowSubmitModal(false);
    handleAutoSubmit('Student submitted');
  };

  const handleAnswerSelect = (questionId, value) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const severityViolations = violations.filter(v => (VIOLATION_WEIGHTS[v.type] || 0) >= 8);

  // ═════════════════════════════ MAIN RENDER ════════════════════════════════
  const attemptedCount = Object.keys(answers).length;
  const unattempted = questions.length - attemptedCount;
  const riskPctVal = Math.min(100, Math.round((violationScore / AUTO_SUBMIT_SCORE_THRESHOLD) * 100));

  return (
    <div className="exam-interface-wrapper" style={{ minHeight:'100vh', background:'var(--bg-primary)', position:'relative' }}>
      
      {/* ── Persistent Webcam Component ───────────────────────────────────── */}
      {/* We render this once and move it with CSS classes to avoid re-mounting */}
      <div className={`persistent-webcam-container ${examStarted ? 'in-sidebar' : 'in-preview'}`}>
        {/* Live AI Overlay */}
        <div className="webcam-status-badges">
          <span style={{ 
            padding:'4px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:700,
            background: aiStatus.face ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)', color:'white' 
          }}>
            {aiStatus.face ? `✓ Face (${aiStatus.faces})` : '✗ No Face'}
          </span>
          {aiStatus.phone && (
            <span style={{ padding:'4px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:700, background:'rgba(239,68,68,0.85)', color:'white', animation:'pulse 1s infinite' }}>
              📱 PHONE
            </span>
          )}
          {aiStatus.looking_away && (
            <span style={{ padding:'4px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:700, background:'rgba(245,158,11,0.85)', color:'white' }}>
              👀 LOOKING AWAY
            </span>
          )}
        </div>

        <Webcam
          ref={webcamRef} 
          screenshotFormat="image/jpeg" 
          width="100%"
          style={{ borderRadius: '12px', display: 'block', objectFit:'cover' }}
          onUserMedia={() => console.log('Camera Active')}
        />
        {isAnalyzing && <div className="ai-scanning-line"></div>}
      </div>

      {/* ── Pre-Exam Rules Overlay ────────────────────────────────────────── */}
      {!examStarted && (
        <div className="exam-start-container fade-in">
          <div className="exam-start-box" style={{ marginTop: '200px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎓</div>
              <h2 style={{ fontSize: '28px', margin: 0 }}>Welcome, {userData.name}!</h2>
              <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Please read all instructions before beginning</p>
            </div>

            <div className="exam-instructions" style={{ marginBottom:'20px' }}> 
              <h3 style={{ color: 'var(--accent-primary)', fontSize: '16px', marginBottom: '16px' }}>📋 Exam Rules & Instructions</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {[
                  '🎥 Webcam & microphone must remain active throughout the exam',
                  '📵 No mobile phones or unauthorized devices allowed',
                  '👤 Only you should be visible in the camera frame',
                  '🖥️ Exam will run in fullscreen — do NOT exit fullscreen',
                  '🔇 Maintain a quiet environment — loud noise will be flagged',
                  '🚫 Copy/paste, right-click, and tab switching are disabled',
                  '⏱️ You have 30 minutes. Auto-submission at time-up',
                  '⚠️ Excessive violations (score ≥ 80) will auto-submit the exam',
                ].map((r, i) => (
                  <li key={i} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontSize: '14px' }}>{r}</li>
                ))}
              </ul>
            </div>

            <div style={{ padding: '0 20px', textAlign:'center', marginBottom: '20px' }}>
               <div style={{ fontSize:'13px', color:'var(--text-muted)', marginBottom:'10px' }}>
                 AI Verification Active (See Top)
               </div>
            </div>

            <button onClick={startExam} className="btn-primary btn-large" style={{ marginTop:'0' }}>
              🚀 Begin Exam (Enters Fullscreen)
            </button>
          </div>
        </div>
      )}

      {/* ── Active Exam Interface ─────────────────────────────────────────── */}
      {examStarted && (
        <div className="exam-interface fade-in">

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(8px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'var(--bg-secondary)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'40px', maxWidth:'480px', width:'90%', boxShadow:'0 25px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ textAlign:'center', marginBottom:'24px' }}>
              <div style={{ fontSize:'48px', marginBottom:'12px' }}>📚</div>
              <h2 style={{ margin:'0 0 8px', fontSize:'22px' }}>Submit Exam?</h2>
              <p style={{ color:'var(--text-muted)', margin:0, fontSize:'14px' }}>This cannot be undone.</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'24px' }}>
              {[{ label:'Total', value:questions.length, color:'var(--accent-primary)' },
                { label:'Attempted', value:attemptedCount, color:'var(--success)' },
                { label:'Skipped', value:unattempted, color:unattempted>0?'var(--warning)':'var(--success)' }]
                .map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign:'center', padding:'16px', background:'rgba(255,255,255,0.05)', borderRadius:'12px' }}>
                    <div style={{ fontSize:'28px', fontWeight:800, color }}>{value}</div>
                    <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'4px' }}>{label}</div>
                  </div>
                ))}
            </div>
            {unattempted > 0 && (
              <div style={{ background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'10px', padding:'12px 16px', marginBottom:'20px', fontSize:'13px', color:'var(--warning)' }}>
                ⚠️ {unattempted} unanswered question{unattempted!==1?'s':''} will be left blank.
              </div>
            )}
            <div style={{ display:'flex', gap:'12px' }}>
              <button onClick={() => setShowSubmitModal(false)} className="btn-secondary" style={{ flex:1, padding:'14px', fontSize:'15px' }}>← Continue</button>
              <button onClick={confirmSubmit} className="btn-primary" style={{ flex:1, padding:'14px', fontSize:'15px', background:'linear-gradient(135deg,#10b981,#059669)' }}>✓ Submit Now</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <div className="exam-header">
        <div className="header-left">
          <h2>🎓 Exam Shield</h2>
          <p>{userData.name} · Session #{sessionId}</p>
        </div>
        <div className="header-right">
          <div className="timer" style={{ color: timeLeft < 300 ? 'var(--danger)' : 'var(--text-primary)' }}>
            ⏱️ {formatTime(timeLeft)}
          </div>
          <div className="violations-count">
            ⚠️ {violations.length} alerts
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Risk:</span>
            <div style={{ width: '80px', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${riskPctVal}%`, background: riskPctVal > 70 ? 'var(--danger)' : riskPctVal > 40 ? 'var(--warning)' : 'var(--success)', transition: 'width 0.5s ease, background 0.3s' }} />
            </div>
            <span style={{ color: riskPctVal > 70 ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 600 }}>{riskPctVal}%</span>
          </div>
          {examSubmitting && <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '13px' }}>Submitting...</span>}
        </div>
      </div>

      {/* ── Status Bar (network / fullscreen warnings as inline banners, no alert()) */}
      {(!isFullscreen || !isOnline) && (
        <div style={{ display: 'flex', gap: '0' }}>
          {!isOnline && (
            <div style={{ flex: 1, background: '#7f1d1d', color: 'white', padding: '10px 20px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>
              📶 Internet disconnected — reconnect immediately!
            </div>
          )}
          {!isFullscreen && (
            <div
              style={{ flex: 1, background: '#78350f', color: 'white', padding: '10px 20px', textAlign: 'center', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})}
            >
              🖥️ Not in fullscreen — click here to return
            </div>
          )}
        </div>
      )}

      {/* ── Violation Toast Banner (NON-blocking, appears in UI, never alert()) ── */}
      {toastViolation && (() => {
        const info = VIOLATION_INFO[toastViolation.type] || { emoji: '⚠️', title: toastViolation.type, color: '#f59e0b' };
        return (
          <div style={{
            position: 'sticky', top: 0, zIndex: 999,
            background: `${info.color}22`,
            borderLeft: `4px solid ${info.color}`,
            borderBottom: `1px solid ${info.color}44`,
            padding: '14px 24px',
            display: 'flex', alignItems: 'center', gap: '12px',
            animation: 'slideDown 0.3s ease-out',
          }}>
            <span style={{ fontSize: '24px' }}>{info.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: info.color, fontSize: '15px' }}>{info.title}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{toastViolation.details || 'Please follow exam rules'}</div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
              Confidence: {Math.round(toastViolation.confidence * 100)}%<br />
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Risk Score: {riskPctVal}%</span>
            </div>
            <button onClick={() => setToastViolation(null)} style={{ background: 'none', color: 'var(--text-muted)', fontSize: '18px', padding: '4px 8px' }}>✕</button>
          </div>
        );
      })()}

      {/* ── Auto-submit warning when risk is very high */}
      {riskPctVal >= 70 && riskPctVal < 100 && (
        <div style={{ background: 'rgba(239,68,68,0.15)', borderBottom: '1px solid rgba(239,68,68,0.3)', padding: '10px 24px', display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '13px', color: 'var(--danger)', fontWeight: 600 }}>
          🚨 High Risk Score ({riskPctVal}%) — Exam will auto-submit at 100%
        </div>
      )}

      {/* ── Main Exam Body ───────────────────────────────────────────────── */}
      <div className="exam-content">

        {/* ─── Left: Question Panel ─────────────────────────────────────────── */}
        <div className="question-panel">
          <div className="question-header">
            Question {currentQuestion + 1} of {questions.length}
            &nbsp;·&nbsp;
            <span style={{ color: Object.keys(answers).length === questions.length ? 'var(--success)' : 'var(--text-muted)' }}>
              {Object.keys(answers).length}/{questions.length} answered
            </span>
          </div>

          {questions.length > 0 && (
            <div className="question">
              <h3>{questions[currentQuestion].question}</h3>
              <div className="options">
                {questions[currentQuestion].type === 'mcq'
                  ? questions[currentQuestion].options.map((opt, idx) => (
                      <div
                        key={idx}
                        className={`option ${answers[questions[currentQuestion].id] === idx ? 'selected' : ''}`}
                        onClick={() => handleAnswerSelect(questions[currentQuestion].id, idx)}
                      >
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: '28px', height: '28px', borderRadius: '50%', marginRight: '12px', flexShrink: 0,
                          background: answers[questions[currentQuestion].id] === idx ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                          color: 'white', fontSize: '13px', fontWeight: 700,
                        }}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <label style={{ cursor: 'pointer' }}>{opt}</label>
                      </div>
                    ))
                  : (
                      <textarea
                        className="subjective-textarea"
                        rows={8}
                        placeholder="Write your detailed answer here..."
                        value={answers[questions[currentQuestion].id] || ''}
                        onChange={e => handleAnswerSelect(questions[currentQuestion].id, e.target.value)}
                      />
                    )
                }
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="question-navigation">
            <button className="btn-secondary" onClick={() => setCurrentQuestion(p => Math.max(0, p - 1))} disabled={currentQuestion === 0}>
              ← Previous
            </button>
            {currentQuestion < questions.length - 1
              ? <button className="btn-primary" onClick={() => setCurrentQuestion(p => p + 1)}>Next →</button>
              : <button className="btn-primary" style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }} onClick={handleSubmitExam}>
                  ✅ Submit Exam
                </button>
            }
          </div>

          {/* Question palette */}
          <div className="question-grid">
            {questions.map((q, i) => (
              <div
                key={q.id}
                className={`question-number ${answers[q.id] !== undefined ? 'answered' : ''} ${currentQuestion === i ? 'active' : ''}`}
                onClick={() => setCurrentQuestion(i)}
                title={`Q${i + 1}${answers[q.id] !== undefined ? ' (answered)' : ''}`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* ─── Right: Monitoring Panel ───────────────────────────────────────── */}
        <div className="monitoring-panel">
          <div className="webcam-section">
            <h4>Live Proctoring</h4>
            {/* The persistent webcam moves here via CSS 'in-sidebar' class */}
            <div className="webcam-placeholder-spacer" style={{ height: '220px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.1)' }}>
               <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Camera active in sidebar</span>
            </div>
          </div>

          {/* AI Status Indicators */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Monitoring Status</div>
            {[
              { label: 'Face Detection',   ok: aiStatus.face,           okText: `Active (${aiStatus.faces} face${aiStatus.faces !== 1 ? 's' : ''})`, badText: 'No face visible' },
              { label: 'Multi-Face Check', ok: aiStatus.faces <= 1,     okText: 'Clear',   badText: `${aiStatus.faces} faces!` },
              { label: 'Phone Detection',  ok: !aiStatus.phone,         okText: 'Clear',   badText: 'Phone detected!' },
              { label: 'Gaze Tracking',    ok: !aiStatus.looking_away,  okText: 'On screen', badText: 'Looking away' },
              { label: 'Noise Level',      ok: volumeLevel < 80,        okText: `Low (${volumeLevel})`, badText: `High! (${volumeLevel})` },
              { label: 'Network',          ok: isOnline,                okText: 'Online',  badText: 'Offline!' },
              { label: 'Fullscreen',       ok: isFullscreen,            okText: 'Active',  badText: 'Exited!' },
            ].map(({ label, ok, okText, badText }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{ color: ok ? 'var(--success)' : 'var(--danger)', fontWeight: 600, fontSize: '12px' }}>
                  {ok ? `✓ ${okText}` : `✗ ${badText}`}
                </span>
              </div>
            ))}

            {/* Noise volume bar */}
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Microphone Level</div>
              <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (volumeLevel / 255) * 100)}%`,
                  background: volumeLevel > 80 ? 'var(--danger)' : volumeLevel > 50 ? 'var(--warning)' : 'var(--success)',
                  transition: 'width 0.2s, background 0.2s' }} />
              </div>
            </div>
          </div>

          {/* Violation log */}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>Alerts Log</span>
            <span style={{ color: violations.length > 0 ? 'var(--danger)' : 'var(--success)' }}>{violations.length} total</span>
          </div>
          <div className="violations-list">
            {violations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--success)', fontSize: '13px', background: 'rgba(16,185,129,0.1)', borderRadius: '8px' }}>
                ✅ No violations — Keep it up!
              </div>
            ) : (
              violations.slice(-10).reverse().map((v, i) => {
                const info = VIOLATION_INFO[v.type] || { emoji: '⚠️', title: v.type, color: '#f59e0b' };
                return (
                  <div key={i} className="violation-item" style={{ borderLeftColor: info.color }}>
                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{info.emoji} {info.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      {new Date(v.timestamp).toLocaleTimeString()} · {Math.round(v.confidence * 100)}%
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Severe violations */}
          {severityViolations.length > 0 && (
            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(239,68,68,0.12)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--danger)', marginBottom: '6px' }}>
                🚨 Major Violations ({severityViolations.length})
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {severityViolations.slice(-3).map((v, i) => {
                  const info = VIOLATION_INFO[v.type] || { emoji: '⚠️', title: v.type };
                  return <div key={i}>{info.emoji} {info.title}</div>;
                })}
              </div>
            </div>
          )}
        </div>

      </div>
        </div>
      )}
    </div>
  );
}

export default ExamInterface;