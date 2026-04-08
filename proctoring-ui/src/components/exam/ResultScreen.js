import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

const VERDICT_CONFIG = {
  CLEAN:       { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: '✅', label: 'Clean' },
  LOW_RISK:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⚠️', label: 'Low Risk' },
  MEDIUM_RISK: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: '🚨', label: 'Medium Risk' },
  HIGH_RISK:   { color: '#dc2626', bg: 'rgba(220,38,38,0.18)',  icon: '🔴', label: 'High Risk' },
};

const VIOLATION_LABELS = {
  phone_usage: 'Phone Detected', multiple_persons: 'Multiple Faces',
  tab_change: 'Tab Switch', exited_fullscreen: 'Fullscreen Exit',
  no_face: 'No Face', ai_assistant_detected: 'AI Assistant',
  noise_detected: 'Loud Noise', browser_lockdown: 'Copy/Paste Attempt',
  looking_away_horizontal: 'Looking Away (H)', looking_away_vertical: 'Looking Away (V)',
  eyes_not_visible: 'Eyes Not Visible', unusual_head_angle: 'Head Angle',
  too_far_from_camera: 'Too Far Away', network_issue: 'Network Issue',
};

function ResultScreen({ sessionId, userData, onLogout }) {
  const [report, setReport]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const token = localStorage.getItem('token');
        const { data } = await axios.get(`${API_URL}/exam-report/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setReport(data);
      } catch (err) {
        setError('Could not load exam report. ' + (err.response?.data?.detail || err.message));
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [sessionId]);

  const handleDownload = () => {
    window.open(`${API_URL}/export-report/${sessionId}`, '_blank');
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg-primary)', flexDirection:'column', gap:'16px' }}>
      <div style={{ width:'48px', height:'48px', borderRadius:'50%', border:'3px solid var(--accent-primary)', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />
      <p style={{ color:'var(--text-secondary)' }}>Loading your assessment report...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg-primary)', flexDirection:'column', gap:'16px' }}>
      <div style={{ fontSize:'48px' }}>😞</div>
      <p style={{ color:'var(--danger)' }}>{error}</p>
      <button className="btn-primary" onClick={onLogout}>Return to Login</button>
    </div>
  );

  const { score, verdict, verdict_message, violations, violation_counts, risk_score, question_results,
          student_name, student_email, start_time, end_time, duration_minutes, plagiarism_flags } = report;
  const vc = VERDICT_CONFIG[verdict] || VERDICT_CONFIG.CLEAN;

  const Tab = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        padding:'10px 20px', borderRadius:'8px', fontSize:'14px', fontWeight:500,
        background: activeTab===id ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
        color: activeTab===id ? 'white' : 'var(--text-secondary)',
        border: activeTab===id ? 'none' : '1px solid rgba(255,255,255,0.08)',
        cursor:'pointer', transition:'all 0.2s',
      }}
    >{label}</button>
  );

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-primary)', padding:'0 0 60px' }}>

      {/* Header */}
      <div style={{ background:'var(--bg-glass)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.05)', padding:'20px 40px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <h1 style={{ margin:0, fontSize:'22px', background:'var(--accent-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
            🎓 Exam Shield — Assessment Report
          </h1>
          <p style={{ margin:'4px 0 0', color:'var(--text-muted)', fontSize:'13px' }}>
            {student_name} · {student_email} · Session #{sessionId}
          </p>
        </div>
        <div style={{ display:'flex', gap:'12px' }}>
          <button onClick={handleDownload} className="btn-secondary" style={{ fontSize:'13px', display:'flex', alignItems:'center', gap:'8px' }}>
            ⬇️ Download CSV Report
          </button>
          <button onClick={onLogout} className="btn-secondary" style={{ fontSize:'13px' }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth:'1200px', margin:'0 auto', padding:'40px 24px' }}>

        {/* Top Summary Cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:'20px', marginBottom:'32px' }}>
          {/* Score */}
          <div style={{ background:'var(--bg-glass)', backdropFilter:'blur(12px)', borderRadius:'16px', padding:'24px', border:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize:'12px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>Score</div>
            <div style={{ fontSize:'40px', fontWeight:800, color:'var(--accent-primary)' }}>{score.percentage}%</div>
            <div style={{ fontSize:'14px', color:'var(--text-secondary)', marginTop:'4px' }}>{score.correct}/{score.total_mcq} correct · Grade <strong style={{color:'white'}}>{score.grade}</strong></div>
          </div>

          {/* Attempted */}
          <div style={{ background:'var(--bg-glass)', backdropFilter:'blur(12px)', borderRadius:'16px', padding:'24px', border:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize:'12px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>Questions</div>
            <div style={{ fontSize:'40px', fontWeight:800, color:'var(--success)' }}>{score.attempted}</div>
            <div style={{ fontSize:'14px', color:'var(--text-secondary)', marginTop:'4px' }}>of {score.total_questions} attempted</div>
          </div>

          {/* Duration */}
          <div style={{ background:'var(--bg-glass)', backdropFilter:'blur(12px)', borderRadius:'16px', padding:'24px', border:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize:'12px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>Duration</div>
            <div style={{ fontSize:'40px', fontWeight:800, color:'#60a5fa' }}>{duration_minutes ?? '—'}</div>
            <div style={{ fontSize:'14px', color:'var(--text-secondary)', marginTop:'4px' }}>minutes</div>
          </div>

          {/* Risk Score */}
          <div style={{ background:'var(--bg-glass)', backdropFilter:'blur(12px)', borderRadius:'16px', padding:'24px', border:`1px solid ${vc.color}33` }}>
            <div style={{ fontSize:'12px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>Integrity Risk</div>
            <div style={{ fontSize:'40px', fontWeight:800, color: vc.color }}>{risk_score}</div>
            <div style={{ fontSize:'14px', marginTop:'4px' }}>
              <span style={{ color:vc.color, fontWeight:600 }}>{vc.icon} {vc.label}</span>
            </div>
          </div>

          {/* Violations */}
          <div style={{ background:'var(--bg-glass)', backdropFilter:'blur(12px)', borderRadius:'16px', padding:'24px', border:'1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize:'12px', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'8px' }}>Violations</div>
            <div style={{ fontSize:'40px', fontWeight:800, color: violations.length > 0 ? 'var(--danger)' : 'var(--success)' }}>{violations.length}</div>
            <div style={{ fontSize:'14px', color:'var(--text-secondary)', marginTop:'4px' }}>{plagiarism_flags > 0 ? `+ ${plagiarism_flags} plagiarism flag(s)` : 'No plagiarism detected'}</div>
          </div>
        </div>

        {/* Integrity Verdict Banner */}
        <div style={{ background: vc.bg, border:`1px solid ${vc.color}44`, borderRadius:'12px', padding:'20px 24px', marginBottom:'32px', display:'flex', alignItems:'center', gap:'16px' }}>
          <span style={{ fontSize:'32px' }}>{vc.icon}</span>
          <div>
            <div style={{ fontWeight:700, fontSize:'18px', color:vc.color }}>Integrity Verdict: {vc.label}</div>
            <div style={{ fontSize:'14px', color:'var(--text-secondary)', marginTop:'4px' }}>{verdict_message}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:'10px', marginBottom:'24px', flexWrap:'wrap' }}>
          <Tab id="overview"   label="📊 Overview" />
          <Tab id="questions"  label="📝 Question Results" />
          <Tab id="violations" label={`🚨 Violations (${violations.length})`} />
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'24px' }}>
            {/* Score breakdown */}
            <div style={{ background:'var(--bg-glass)', borderRadius:'14px', padding:'28px', border:'1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin:'0 0 20px', fontSize:'16px' }}>Score Breakdown</h3>
              <div style={{ marginBottom:'20px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'14px', color:'var(--text-secondary)', marginBottom:'8px' }}>
                  <span>Result</span><span style={{color:'white', fontWeight:700}}>{score.percentage}%</span>
                </div>
                <div style={{ height:'12px', background:'rgba(255,255,255,0.08)', borderRadius:'6px', overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${score.percentage}%`, background: score.percentage>=60?'var(--success)':'var(--danger)', transition:'width 1s ease', borderRadius:'6px' }} />
                </div>
              </div>
              {[
                ['Correct Answers', score.correct, 'var(--success)'],
                ['Wrong / Unattempted', score.total_questions - score.correct, 'var(--danger)'],
                ['Total Questions', score.total_questions, 'var(--accent-primary)'],
                ['Attempted', score.attempted, '#60a5fa'],
              ].map(([label, val, color]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)', fontSize:'14px' }}>
                  <span style={{color:'var(--text-secondary)'}}>{label}</span>
                  <span style={{color, fontWeight:700}}>{val}</span>
                </div>
              ))}
            </div>

            {/* Violation breakdown */}
            <div style={{ background:'var(--bg-glass)', borderRadius:'14px', padding:'28px', border:'1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ margin:'0 0 20px', fontSize:'16px' }}>Violation Breakdown</h3>
              {Object.keys(violation_counts).length === 0
                ? <div style={{ textAlign:'center', padding:'30px', color:'var(--success)', background:'rgba(16,185,129,0.08)', borderRadius:'10px', fontSize:'14px' }}>✅ No violations recorded</div>
                : Object.entries(violation_counts).sort((a,b)=>b[1]-a[1]).map(([type, count]) => (
                    <div key={type} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.05)', fontSize:'13px' }}>
                      <span style={{color:'var(--text-secondary)'}}>{VIOLATION_LABELS[type] || type}</span>
                      <span style={{ padding:'3px 10px', background:'rgba(239,68,68,0.15)', color:'var(--danger)', borderRadius:'99px', fontWeight:700 }}>{count}×</span>
                    </div>
                  ))
              }
            </div>
          </div>
        )}

        {/* Question Results Tab */}
        {activeTab === 'questions' && (
          <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
            {question_results.map((q, i) => {
              const isCorrect = q.is_correct;
              const attempted = q.attempted;
              const borderColor = !attempted ? 'rgba(255,255,255,0.08)' : isCorrect ? '#10b981' : '#ef4444';
              return (
                <div key={q.id} style={{ background:'var(--bg-glass)', borderRadius:'12px', padding:'24px', border:`1px solid ${borderColor}33`, borderLeft:`4px solid ${borderColor}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'16px', marginBottom:'14px' }}>
                    <div>
                      <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'1px' }}>
                        Q{i+1} · {q.type === 'mcq' ? 'Multiple Choice' : 'Subjective'}
                      </div>
                      <div style={{ fontSize:'16px', color:'white', fontWeight:500, lineHeight:1.5 }}>{q.question}</div>
                    </div>
                    <div style={{ flexShrink:0, padding:'6px 14px', borderRadius:'99px', fontWeight:700, fontSize:'13px',
                      background: !attempted ? 'rgba(255,255,255,0.06)' : isCorrect ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                      color: !attempted ? 'var(--text-muted)' : isCorrect ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {!attempted ? 'Not attempted' : isCorrect ? '✓ Correct' : '✗ Wrong'}
                    </div>
                  </div>

                  {q.type === 'mcq' && q.options.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                      {q.options.map((opt, idx) => {
                        const isStudentPick  = q.student_answer_index === String(idx);
                        const isRightAnswer  = q.correct_answer === String(idx);
                        const bg = isRightAnswer
                          ? 'rgba(16,185,129,0.15)'
                          : (isStudentPick && !isRightAnswer) ? 'rgba(239,68,68,0.13)' : 'rgba(255,255,255,0.03)';
                        const border = isRightAnswer ? '#10b981' : (isStudentPick && !isRightAnswer) ? '#ef4444' : 'rgba(255,255,255,0.08)';
                        return (
                          <div key={idx} style={{ padding:'10px 16px', borderRadius:'8px', background:bg, border:`1px solid ${border}`, fontSize:'14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <span style={{ color: isRightAnswer ? '#86efac' : isStudentPick ? '#fca5a5' : 'var(--text-secondary)' }}>
                              <strong style={{marginRight:'8px'}}>{String.fromCharCode(65+idx)}.</strong>{opt}
                            </span>
                            <span style={{fontSize:'11px', color: isRightAnswer ? '#10b981' : isStudentPick ? '#ef4444' : 'transparent'}}>
                              {isRightAnswer ? '✓ Correct Answer' : isStudentPick ? 'Your Answer' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {q.type === 'subjective' && (
                    <div>
                      <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'8px', marginTop:'4px' }}>Your Answer:</div>
                      <div style={{ background:'rgba(0,0,0,0.2)', padding:'14px 16px', borderRadius:'8px', fontSize:'14px', color:'var(--text-secondary)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                        {q.student_answer_label || <em>No answer provided</em>}
                      </div>
                      {q.plagiarism_flag && (
                        <div style={{ marginTop:'10px', padding:'8px 14px', background:'rgba(239,68,68,0.12)', borderRadius:'8px', fontSize:'13px', color:'var(--danger)' }}>
                          ⚠️ Possible plagiarism detected ({q.plagiarism_score}% similarity to other submissions)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Violations Tab */}
        {activeTab === 'violations' && (
          <div>
            {violations.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px', color:'var(--success)', background:'rgba(16,185,129,0.08)', borderRadius:'14px', fontSize:'16px' }}>
                ✅ No violations were recorded during this exam.
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <div style={{ fontSize:'13px', color:'var(--text-muted)', marginBottom:'8px' }}>Showing all {violations.length} recorded events in chronological order</div>
                {violations.map((v, i) => {
                  const label = VIOLATION_LABELS[v.violation_type] || v.violation_type;
                  const conf  = Math.round(v.confidence * 100);
                  const high  = ['phone_usage','multiple_persons','ai_assistant_detected'].includes(v.violation_type);
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'16px', padding:'14px 18px', background:'var(--bg-glass)', borderRadius:'10px', border:`1px solid ${high?'rgba(239,68,68,0.25)':'rgba(255,255,255,0.05)'}` }}>
                      <div style={{ fontSize:'28px', width:'40px', textAlign:'center' }}>
                        {high ? '🔴' : conf >= 80 ? '🟠' : '🟡'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:'14px', color: high?'var(--danger)':'white' }}>{label}</div>
                        <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>
                          {new Date(v.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ padding:'4px 12px', borderRadius:'99px', fontSize:'12px', fontWeight:700,
                        background: conf>=80 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                        color: conf>=80 ? 'var(--danger)' : 'var(--warning)' }}>
                        {conf}% confidence
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResultScreen;
