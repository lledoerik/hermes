import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Login.css';

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    let result;
    if (isLogin) {
      result = await login(username, password);
    } else {
      result = await register(username, password, email, displayName);
    }

    setLoading(false);

    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <img src="/img/caduceus.png" alt="Hermes" className="login-logo" />
          <h1>Hermes</h1>
          <p>{isLogin ? 'Inicia sessió per continuar' : 'Crea un compte nou'}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Usuari</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="El teu nom d'usuari"
              required
              autoComplete="username"
            />
          </div>

          {!isLogin && (
            <>
              <div className="form-group">
                <label htmlFor="displayName">Nom a mostrar</label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Com vols que et diguem?"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email (opcional)</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemple.com"
                  autoComplete="email"
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="password">Contrasenya</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="La teva contrasenya"
              required
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading
              ? 'Carregant...'
              : isLogin
                ? 'Iniciar sessió'
                : 'Crear compte'
            }
          </button>
        </form>

        <div className="login-footer">
          <p>
            {isLogin ? 'No tens compte?' : 'Ja tens compte?'}
            <button
              type="button"
              className="toggle-mode"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
            >
              {isLogin ? 'Registra\'t' : 'Inicia sessió'}
            </button>
          </p>
        </div>

        <button
          type="button"
          className="skip-login"
          onClick={() => navigate('/')}
        >
          Continuar sense compte →
        </button>
      </div>
    </div>
  );
}

export default Login;
