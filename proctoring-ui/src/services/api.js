import axios from 'axios';
import { mockAPI } from './mockAPI';
import { 
  API_BASE_URL, 
  USE_MOCK_API, 
  API_ENDPOINTS,
  STORAGE_KEYS 
} from '../utils/constants';

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_ID);
      localStorage.removeItem(STORAGE_KEYS.USER_NAME);
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// API Service Class
class APIService {
  // Authentication
  async login(email, password) {
    if (USE_MOCK_API) {
      return mockAPI.login(email, password);
    }
    
    try {
      const response = await apiClient.post(API_ENDPOINTS.LOGIN, {
        email,
        password
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  }

  async register(email, password, name) {
    if (USE_MOCK_API) {
      return mockAPI.register(email, password, name);
    }
    
    try {
      const response = await apiClient.post(API_ENDPOINTS.REGISTER, {
        email,
        password,
        name
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  }

  // Exam Management
  async startExam(userId) {
    if (USE_MOCK_API) {
      return mockAPI.startExam(userId);
    }
    
    try {
      const response = await apiClient.post(API_ENDPOINTS.START_EXAM, {
        user_id: userId
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Failed to start exam');
    }
  }

  async endExam(sessionId) {
    if (USE_MOCK_API) {
      return mockAPI.endExam(sessionId);
    }
    
    try {
      const response = await apiClient.post(`${API_ENDPOINTS.END_EXAM}/${sessionId}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Failed to end exam');
    }
  }

  // Frame Analysis
  async analyzeFrame(sessionId, frameData) {
    if (USE_MOCK_API) {
      return mockAPI.analyzeFrame(sessionId, frameData);
    }
    
    try {
      const response = await apiClient.post(API_ENDPOINTS.ANALYZE_FRAME, {
        session_id: sessionId,
        frame_data: frameData
      });
      return response.data;
    } catch (error) {
      console.error('Frame analysis error:', error);
      // Don't throw error for frame analysis to prevent exam interruption
      return {
        face_detected: true,
        num_faces: 1,
        looking_away: false,
        violations: []
      };
    }
  }

  // Get Violations
  async getViolations(sessionId) {
    if (USE_MOCK_API) {
      return mockAPI.getViolations(sessionId);
    }
    
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.GET_VIOLATIONS}/${sessionId}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Failed to fetch violations');
    }
  }

  // Get Exam Summary
  async getExamSummary(sessionId) {
    if (USE_MOCK_API) {
      return mockAPI.getExamSummary(sessionId);
    }
    
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.GET_SUMMARY}/${sessionId}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || 'Failed to fetch exam summary');
    }
  }
}

export const api = new APIService();
export default api;