/**
 * Configuració centralitzada de l'API
 */

// URL base de l'API - automàticament detecta si estem en local o producció
export const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : '';

// Configuració d'axios per defecte
export const configureAxios = (axios) => {
  axios.defaults.baseURL = API_URL;

  // Interceptor per afegir token d'autenticació
  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('hermes_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
};

export default API_URL;
