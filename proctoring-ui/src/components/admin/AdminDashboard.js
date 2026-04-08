import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ResultScreen from '../exam/ResultScreen';

const API_URL = 'http://localhost:8000';

function AdminDashboard({ onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      // Using a fallback for list-all-sessions if needed, otherwise just current logic
      const response = await axios.get(`${API_URL}/all-sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSessions(response.data);
    } catch (err) {
      console.warn('Could not fetch sessions list:', err.message);
      setError('You are viewing the results review pane. Click on a session to view details.');
    } finally {
      setLoading(false);
    }
  };

  if (selectedSessionId) {
    return (
      <div className="admin-review-mode">
        <div style={{ background:'var(--bg-secondary)', padding:'10px 40px', borderBottom:'1px solid rgba(255,255,255,0.05)', display:'flex', alignItems:'center', gap:'20px' }}>
          <button onClick={() => setSelectedSessionId(null)} className="btn-secondary" style={{ fontSize:'13px' }}>
            ← Back to Session List
          </button>
          <span style={{ color:'var(--text-muted)', fontSize:'13px' }}>Reviewing Session #{selectedSessionId}</span>
        </div>
        <ResultScreen
          sessionId={selectedSessionId}
          userData={{ name: 'Admin' }}
          onLogout={onLogout}
        />
      </div>
    );
  }

  return (
    <div className="admin-dashboard-container" style={{ padding:'40px', background:'var(--bg-primary)', minHeight:'100vh' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'40px' }}>
        <div>
          <h1 style={{ background:'var(--accent-gradient)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', fontSize:'32px', margin:0 }}>
            🛡️ Admin Control Panel
          </h1>
          <p style={{ color:'var(--text-muted)', marginTop:'8px' }}>Monitor exam integrity and review candidate assessments</p>
        </div>
        <button onClick={onLogout} className="btn-secondary">Logout</button>
      </div>

      <div style={{ background:'var(--bg-glass)', borderRadius:'20px', border:'1px solid rgba(255,255,255,0.05)', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left' }}>
          <thead style={{ background:'rgba(255,255,255,0.02)', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
            <tr>
              <th style={{ padding:'20px', color:'var(--text-muted)', fontSize:'13px', fontWeight:600 }}>STUDENT</th>
              <th style={{ padding:'20px', color:'var(--text-muted)', fontSize:'13px', fontWeight:600 }}>STATUS</th>
              <th style={{ padding:'20px', color:'var(--text-muted)', fontSize:'13px', fontWeight:600 }}>START TIME</th>
              <th style={{ padding:'20px', color:'var(--text-muted)', fontSize:'13px', fontWeight:600 }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ padding:'60px', textAlign:'center', color:'var(--text-muted)' }}>
                  {loading ? 'Fetching records...' : 'No exam records found.'}
                </td>
              </tr>
            ) : (
              sessions.map(s => (
                <tr key={s.id} style={{ borderBottom:'1px solid rgba(255,255,255,0.05)', transition:'var(--transition)' }}>
                  <td style={{ padding:'20px' }}>
                    <div style={{ fontWeight:600, color:'white' }}>{s.user_name || 'Test Student'}</div>
                    <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>{s.user_email || 'student@test.com'}</div>
                  </td>
                  <td style={{ padding:'20px' }}>
                    <span style={{
                      padding:'4px 12px', borderRadius:'99px', fontSize:'12px', fontWeight:600,
                      background: s.status === 'completed' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.15)',
                      color: s.status === 'completed' ? 'var(--success)' : 'var(--accent-primary)'
                    }}>
                      {s.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding:'20px', fontSize:'14px', color:'var(--text-secondary)' }}>
                    {new Date(s.start_time).toLocaleString()}
                  </td>
                  <td style={{ padding:'20px' }}>
                    <button
                      onClick={() => setSelectedSessionId(s.id)}
                      className="btn-primary"
                      style={{ padding:'8px 16px', fontSize:'13px' }}
                    >
                      View Full Report
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminDashboard;