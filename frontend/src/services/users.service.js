import { http } from './http.js';

// encodeURIComponent no es necesario con ids numericos, pero Number() garantiza que lo sean.
const userPath = (id, suffix = '') => `/users/${Number(id)}${suffix}`;

export const usersService = {
  list: (paging) => http.get('/users', paging),
  create: (data) => http.post('/users', data),
  update: (id, data) => http.patch(userPath(id), data),
  setStatus: (id, isActive) => http.patch(userPath(id, '/status'), { isActive }),
  changeRole: (id, role) => http.patch(userPath(id, '/role'), { role }),
  getPermissions: (id) => http.get(userPath(id, '/permissions')),
  setPermissions: (id, permissions) => http.put(userPath(id, '/permissions'), { permissions }),
  resetPassword: (id) => http.post(userPath(id, '/reset-password')),
  remove: (id) => http.delete(userPath(id)),
  grantTemporary: (id, data) => http.post(userPath(id, '/permissions/temporary'), data),
  transfer: (id, targetUserId, deactivateSource) =>
    http.post(userPath(id, '/transfer'), { targetUserId: Number(targetUserId), deactivateSource }),
};
