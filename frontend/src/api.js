import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('scai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the saved login is no longer valid (new SECRET_KEY, new database, expired token),
// clear it and go back to the sign-in screen instead of failing silently with 401.
api.interceptors.response.use(
  response => response,
  error => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
      localStorage.removeItem('scai_token');
      localStorage.removeItem('scai_user');
      window.location.assign('/');
    }
    return Promise.reject(error);
  }
);

export default api;
