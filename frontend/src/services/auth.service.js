import { http } from './http.js';

// Las respuestas de login y /me traen { user, permissions }.
export const authService = {
  sessions: () => http.get('/auth/sessions'),
  revokeOtherSessions: () => http.post('/auth/sessions/revoke-others'),
  login: (credentials) => http.post('/auth/login', credentials),
  logout: () => http.post('/auth/logout'),
  me: () => http.get('/auth/me'),
  redeem: (data) => http.post('/auth/redeem', data),
  changePassword: (currentPassword, newPassword) => http.post('/auth/password', { currentPassword, newPassword }),
};
