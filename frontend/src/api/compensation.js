import { api } from './client';

export const compensationApi = {
  adoptions: () => api.get('/org/catalogue-adoptions'),
  proposeAdoption: (body) => api.post('/org/catalogue-adoptions', body),
  decideAdoption: (id, decision) => api.post(`/org/catalogue-adoptions/${id}/decide`, { decision }),
  assignments: (employeeId) => api.get(`/org/compensation?${new URLSearchParams({ employeeId })}`),
  proposeAssignment: (body) => api.post('/org/compensation', body),
  decideAssignment: (id, decision) => api.post(`/org/compensation/${id}/decide`, { decision }),
  financialChanges: () => api.get('/org/financial-changes'),
  proposeFinancialChange: (body) => api.post('/org/financial-changes', body),
  decideFinancialChange: (id, decision) => api.post(`/org/financial-changes/${id}/decide`, { decision }),
};
