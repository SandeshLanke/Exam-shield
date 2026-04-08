import React, { useState } from 'react';
import './App.css';
import Login from './components/auth/Login';
import ExamInterface from './components/exam/ExamInterface';
import AdminDashboard from './components/admin/AdminDashboard';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userData, setUserData] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [examCompleted, setExamCompleted] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const handleLogin = (user) => {
    setIsAuthenticated(true);
    setUserData(user);
  };

  const handleExamComplete = (sid) => {
    setExamCompleted(true);
    setSessionId(sid);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserData(null);
    setExamCompleted(false);
    setSessionId(null);
    setShowAdmin(false);
  };

  return (
    <div className="App">
      {!isAuthenticated ? (
        <Login onLogin={handleLogin} />
      ) : examCompleted ? (
        <AdminDashboard 
          sessionId={sessionId} 
          userData={userData}
          onLogout={handleLogout}
        />
      ) : (
        <ExamInterface 
          userData={userData} 
          onExamComplete={handleExamComplete}
        />
      )}
    </div>
  );
}

export default App;