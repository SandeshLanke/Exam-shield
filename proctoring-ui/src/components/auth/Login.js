import React, { useState } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:8000';

function Login({ onLogin }) {
  const [email, setEmail] = useState('student@test.com');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/register' : '/login';
      const data = isRegister 
        ? { email, password, name }
        : { email, password };

      const response = await axios.post(`${API_URL}${endpoint}`, data);
      
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('userId', response.data.user_id);
      
      onLogin({
        token: response.data.access_token,
        userId: response.data.user_id,
        name: response.data.name
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>🎓 AI Proctoring System</h1>
        <h2>{isRegister ? 'Register' : 'Login'}</h2>
        
        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Enter your name"
              />
            </div>
          )}
          
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Loading...' : (isRegister ? 'Register' : 'Login')}
          </button>
        </form>
        
        <p className="toggle-auth">
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <span onClick={() => setIsRegister(!isRegister)}>
            {isRegister ? 'Login' : 'Register'}
          </span>
        </p>
        
        <div className="test-credentials">
          <p><strong>Test Credentials:</strong></p>
          <p>Email: student@test.com</p>
          <p>Password: password123</p>
        </div>
      </div>
    </div>
  );
}

export default Login;