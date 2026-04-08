import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_URL = 'http://localhost:8000';

function AdminDashboard({ sessionId, userData, onLogout }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExamSummary();
  }, []);

  const fetchExamSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/exam-summary/${sessionId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading exam results...</div>;
  }

  if (!summary) {
    return <div className="error">Failed to load exam summary</div>;
  }

  // Prepare data for chart
  const chartData = Object.entries(summary.violation_counts || {}).map(([type, count]) => ({
    name: type.replace(/_/g, ' '),
    count: count
  }));

  const calculateDuration = () => {
    if (!summary.session.start_time || !summary.session.end_time) return 'N/A';
    const start = new Date(summary.session.start_time);
    const end = new Date(summary.session.end_time);
    const diff = Math.floor((end - start) / 1000 / 60);
    return `${diff} minutes`;
  };

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h1>Exam Summary Report</h1>
        <button onClick={onLogout} className="btn-secondary">Logout</button>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon">👤</div>
          <div className="card-content">
            <h3>Student</h3>
            <p>{summary.user.name}</p>
            <small>{summary.user.email}</small>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">⏱️</div>
          <div className="card-content">
            <h3>Duration</h3>
            <p>{calculateDuration()}</p>
            <small>Total time taken</small>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <h3>Total Violations</h3>
            <p className="violation-number">{summary.total_violations}</p>
            <small>Suspicious activities detected</small>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon">✅</div>
          <div className="card-content">
            <h3>Status</h3>
            <p className="status-text">{summary.session.status}</p>
            <small>Exam completed</small>
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="chart-section">
          <h2>Violation Breakdown</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#e74c3c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="violations-timeline">
        <h2>Violation Timeline</h2>
        {summary.violations.length === 0 ? (
          <div className="no-violations">
            <p>✅ No violations detected during the exam</p>
          </div>
        ) : (
          <div className="timeline">
            {summary.violations.map((violation, index) => (
              <div key={index} className="timeline-item">
                <div className="timeline-marker"></div>
                <div className="timeline-content">
                  <div className="timeline-time">
                    {new Date(violation.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="timeline-violation">
                    <strong>{violation.violation_type.replace(/_/g, ' ')}</strong>
                    <span className="confidence">
                      Confidence: {(violation.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="action-buttons">
        <button className="btn-primary">Download Report (PDF)</button>
        <button className="btn-secondary">Export Data (CSV)</button>
      </div>
    </div>
  );
}

export default AdminDashboard;