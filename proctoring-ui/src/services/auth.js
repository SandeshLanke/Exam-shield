import { STORAGE_KEYS } from '../utils/constants';

class AuthService {
  // Save auth data to localStorage
  saveAuthData(token, userId, userName) {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId.toString());
    localStorage.setItem(STORAGE_KEYS.USER_NAME, userName);
  }

  // Get auth data from localStorage
  getAuthData() {
    return {
      token: localStorage.getItem(STORAGE_KEYS.TOKEN),
      userId: parseInt(localStorage.getItem(STORAGE_KEYS.USER_ID)),
      userName: localStorage.getItem(STORAGE_KEYS.USER_NAME)
    };
  }

  // Clear auth data
  clearAuthData() {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_ID);
    localStorage.removeItem(STORAGE_KEYS.USER_NAME);
    localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
  }

  // Check if user is authenticated
  isAuthenticated() {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    return !!token;
  }

  // Get current user
  getCurrentUser() {
    if (!this.isAuthenticated()) {
      return null;
    }
    
    return {
      userId: parseInt(localStorage.getItem(STORAGE_KEYS.USER_ID)),
      userName: localStorage.getItem(STORAGE_KEYS.USER_NAME),
      token: localStorage.getItem(STORAGE_KEYS.TOKEN)
    };
  }

  // Save session ID
  saveSessionId(sessionId) {
    localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId.toString());
  }

  // Get session ID
  getSessionId() {
    return parseInt(localStorage.getItem(STORAGE_KEYS.SESSION_ID));
  }

  // Clear session ID
  clearSessionId() {
    localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
  }
}

export const authService = new AuthService();
export default authService;