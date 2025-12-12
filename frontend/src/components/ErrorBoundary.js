import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('Error capturatpel ErrorBoundary:', error, errorInfo);

    this.setState({
      error,
      errorInfo
    });

    // Aquí es podria enviar l'error a un servei de tracking (Sentry, etc.)
    // reportErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    // Recarregar la pàgina
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <div className="error-boundary__icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>

            <h1 className="error-boundary__title">Alguna cosa ha anat malament</h1>
            <p className="error-boundary__message">
              Ho sentim, s'ha produït un error inesperat. Si us plau, intenta-ho de nou.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="error-boundary__details">
                <summary>Detalls de l'error (només visible en desenvolupament)</summary>
                <pre className="error-boundary__stack">
                  <strong>{this.state.error.toString()}</strong>
                  {this.state.errorInfo && (
                    <>
                      <br /><br />
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <div className="error-boundary__actions">
              <button className="btn btn-primary btn-md" onClick={this.handleReset}>
                Tornar a l'inici
              </button>
              <button className="btn btn-secondary btn-md" onClick={() => window.location.reload()}>
                Recarregar pàgina
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
