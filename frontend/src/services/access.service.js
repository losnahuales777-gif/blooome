import { http } from './http.js';

export const accessService = {
  catalog: () => http.get('/access/catalog'),
  audit: (paging) => http.get('/access/audit', paging),
  roles: () => http.get('/access/roles'),
  createRole: (data) => http.post('/access/roles', data),
  updateRole: (id, data) => http.patch(`/access/roles/${Number(id)}`, data),
};
