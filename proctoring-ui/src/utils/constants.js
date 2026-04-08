// API Configuration
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
export const USE_MOCK_API = process.env.REACT_APP_USE_MOCK === 'true';

// Exam Configuration
export const EXAM_DURATION = 1800; // 30 minutes in seconds
export const FRAME_ANALYSIS_INTERVAL = 3000; // 3 seconds
export const QUESTIONS_PER_PAGE = 1;

// Violation Types
export const VIOLATION_TYPES = {
  NO_FACE: 'no_face',
  MULTIPLE_PERSONS: 'multiple_persons',
  LOOKING_AWAY_HORIZONTAL: 'looking_away_horizontal',
  LOOKING_AWAY_VERTICAL: 'looking_away_vertical',
  PHONE_DETECTED: 'phone_detected',
  BOOK_DETECTED: 'book_detected',
  TAB_SWITCH: 'tab_switch'
};

// Violation Display Names
export const VIOLATION_LABELS = {
  [VIOLATION_TYPES.NO_FACE]: 'No Face Detected',
  [VIOLATION_TYPES.MULTIPLE_PERSONS]: 'Multiple Persons',
  [VIOLATION_TYPES.LOOKING_AWAY_HORIZONTAL]: 'Looking Away (Horizontal)',
  [VIOLATION_TYPES.LOOKING_AWAY_VERTICAL]: 'Looking Away (Vertical)',
  [VIOLATION_TYPES.PHONE_DETECTED]: 'Phone Detected',
  [VIOLATION_TYPES.BOOK_DETECTED]: 'Book Detected',
  [VIOLATION_TYPES.TAB_SWITCH]: 'Tab Switch Detected'
};

// Exam Status
export const EXAM_STATUS = {
  NOT_STARTED: 'not_started',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  TERMINATED: 'terminated'
};

// Local Storage Keys
export const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER_ID: 'user_id',
  USER_NAME: 'user_name',
  SESSION_ID: 'session_id'
};

// Routes
export const ROUTES = {
  LOGIN: '/',
  REGISTER: '/register',
  EXAM: '/exam',
  ADMIN: '/admin'
};

// API Endpoints
export const API_ENDPOINTS = {
  LOGIN: '/login',
  REGISTER: '/register',
  START_EXAM: '/start-exam',
  END_EXAM: '/end-exam',
  ANALYZE_FRAME: '/analyze-frame',
  GET_VIOLATIONS: '/violations',
  GET_SUMMARY: '/exam-summary'
};

// Webcam Configuration
export const WEBCAM_CONFIG = {
  WIDTH: 640,
  HEIGHT: 480,
  FACING_MODE: 'user',
  SCREENSHOT_FORMAT: 'image/jpeg',
  SCREENSHOT_QUALITY: 0.8
};

// Chart Colors
export const CHART_COLORS = {
  PRIMARY: '#667eea',
  DANGER: '#e74c3c',
  SUCCESS: '#28a745',
  WARNING: '#ffc107',
  INFO: '#17a2b8'
};

// Test Credentials
export const TEST_CREDENTIALS = {
  EMAIL: 'student@test.com',
  PASSWORD: 'password123'
};