// Mock API Service for Frontend Development
// Set USE_MOCK_API = true in .env to use this

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class MockAPIService {
  constructor() {
    this.mockUsers = [
      {
        id: 1,
        email: 'student@test.com',
        password: 'password123',
        name: 'Test Student'
      }
    ];
    
    this.mockSessions = [];
    this.mockViolations = [];
  }

  // Authentication
  async login(email, password) {
    await delay(800);
    
    const user = this.mockUsers.find(u => u.email === email && u.password === password);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    return {
      access_token: `mock-token-${Date.now()}`,
      token_type: 'bearer',
      user_id: user.id,
      name: user.name
    };
  }

  async register(email, password, name) {
    await delay(1000);
    
    const existingUser = this.mockUsers.find(u => u.email === email);
    if (existingUser) {
      throw new Error('Email already registered');
    }
    
    const newUser = {
      id: this.mockUsers.length + 1,
      email,
      password,
      name
    };
    
    this.mockUsers.push(newUser);
    
    return {
      access_token: `mock-token-${Date.now()}`,
      token_type: 'bearer',
      user_id: newUser.id,
      name: newUser.name
    };
  }

  // Exam Management
  async startExam(userId) {
    await delay(500);
    
    const session = {
      id: Date.now(),
      user_id: userId,
      start_time: new Date().toISOString(),
      end_time: null,
      status: 'active'
    };
    
    this.mockSessions.push(session);
    
    return {
      session_id: session.id,
      start_time: session.start_time,
      status: session.status
    };
  }

  async endExam(sessionId) {
    await delay(500);
    
    const session = this.mockSessions.find(s => s.id === sessionId);
    if (session) {
      session.end_time = new Date().toISOString();
      session.status = 'completed';
    }
    
    return {
      message: 'Exam ended successfully',
      end_time: session?.end_time || new Date().toISOString()
    };
  }

  // Frame Analysis
  async analyzeFrame(sessionId, frameData) {
    await delay(300);
    
    const violations = [];
    const randomNum = Math.random();
    
    // Randomly generate violations for testing (30% chance)
    if (randomNum > 0.7) {
      const violationTypes = [
        { type: 'looking_away_horizontal', confidence: 0.85 },
        { type: 'looking_away_vertical', confidence: 0.78 },
        { type: 'no_face', confidence: 0.92 },
        { type: 'multiple_persons', confidence: 0.88 }
      ];
      
      const randomViolation = violationTypes[Math.floor(Math.random() * violationTypes.length)];
      violations.push(randomViolation);
      
      // Store violation
      this.mockViolations.push({
        id: this.mockViolations.length + 1,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        violation_type: randomViolation.type,
        confidence: randomViolation.confidence
      });
    }
    
    return {
      face_detected: violations.every(v => v.type !== 'no_face'),
      num_faces: violations.some(v => v.type === 'multiple_persons') ? 2 : 1,
      looking_away: violations.some(v => v.type.includes('looking_away')),
      violations
    };
  }

  // Get Violations
  async getViolations(sessionId) {
    await delay(400);
    
    const violations = this.mockViolations.filter(v => v.session_id === sessionId);
    
    return {
      violations
    };
  }

  // Get Exam Summary
  async getExamSummary(sessionId) {
    await delay(1000);
    
    const session = this.mockSessions.find(s => s.id === sessionId);
    const violations = this.mockViolations.filter(v => v.session_id === sessionId);
    
    // If no violations in memory, generate some mock data
    const mockViolations = violations.length > 0 ? violations : [
      {
        id: 1,
        session_id: sessionId,
        timestamp: new Date(Date.now() - 1200000).toISOString(),
        violation_type: 'looking_away_horizontal',
        confidence: 0.89
      },
      {
        id: 2,
        session_id: sessionId,
        timestamp: new Date(Date.now() - 900000).toISOString(),
        violation_type: 'no_face',
        confidence: 0.95
      },
      {
        id: 3,
        session_id: sessionId,
        timestamp: new Date(Date.now() - 600000).toISOString(),
        violation_type: 'multiple_persons',
        confidence: 0.87
      },
      {
        id: 4,
        session_id: sessionId,
        timestamp: new Date(Date.now() - 300000).toISOString(),
        violation_type: 'looking_away_vertical',
        confidence: 0.82
      }
    ];
    
    // Count violations by type
    const violationCounts = {};
    mockViolations.forEach(v => {
      violationCounts[v.violation_type] = (violationCounts[v.violation_type] || 0) + 1;
    });
    
    return {
      session: session || {
        id: sessionId,
        user_id: 1,
        start_time: new Date(Date.now() - 1800000).toISOString(),
        end_time: new Date().toISOString(),
        status: 'completed'
      },
      user: {
        name: 'Test Student',
        email: 'student@test.com'
      },
      total_violations: mockViolations.length,
      violation_counts: violationCounts,
      violations: mockViolations
    };
  }
}

export const mockAPI = new MockAPIService();