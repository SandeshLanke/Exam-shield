import React, { useState } from 'react';
import './App.css';
import Login from './components/auth/Login';
import ExamInterface from './components/exam/ExamInterface';
import ResultScreen from './components/exam/ResultScreen';
import AdminDashboard from './components/admin/AdminDashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState(null);
  const [view, setView] = useState('exam');   // 'exam' | 'result' | 'admin'
  const [sessionId, setSessionId] = useState(null);

  const handleLogin = (user) => {
    setIsAuthenticated(true);
    setUserData(user);
    setView('exam');
  };

  const handleExamComplete = (sid) => {
    setSessionId(sid);
    setView('result');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserData(null);
    setSessionId(null);
    setView('exam');
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  if (view === 'result' && sessionId) {
    return (
      <ResultScreen
        sessionId={sessionId}
        userData={userData}
        onLogout={handleLogout}
        onViewAdmin={() => setView('admin')}
      />
    );
  }

  if (view === 'admin') {
    return (
      <AdminDashboard
        sessionId={sessionId}
        userData={userData}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <ExamInterface
      userData={userData}
      onExamComplete={handleExamComplete}
    />
  );
}

export default App;