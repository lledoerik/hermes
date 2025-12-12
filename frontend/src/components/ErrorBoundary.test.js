import React from 'react';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// Component que llança un error per testejar
class ThrowError extends React.Component {
  render() {
    if (this.props.shouldThrow) {
      throw new Error(this.props.errorMessage || 'Test error');
    }
    return <div>Component funciona correctament</div>;
  }
}

// Silenciar console.error per tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

describe('ErrorBoundary', () => {
  describe('Funcionament normal', () => {
    test('renderitza children correctament quan no hi ha errors', () => {
      render(
        <ErrorBoundary>
          <div>Contingut normal</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Contingut normal')).toBeInTheDocument();
    });

    test('renderitza múltiples children sense errors', () => {
      render(
        <ErrorBoundary>
          <div>Primer element</div>
          <div>Segon element</div>
          <div>Tercer element</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Primer element')).toBeInTheDocument();
      expect(screen.getByText('Segon element')).toBeInTheDocument();
      expect(screen.getByText('Tercer element')).toBeInTheDocument();
    });
  });

  describe('Gestió d\'errors', () => {
    test('captura errors i mostra UI de fallback', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.queryByText('Component funciona correctament')).not.toBeInTheDocument();
      expect(screen.getByText(/alguna cosa ha anat malament/i)).toBeInTheDocument();
    });

    test('mostra missatge d\'error personalitzat', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Error de xarxa" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/alguna cosa ha anat malament/i)).toBeInTheDocument();
    });

    test('captura errors en components anidats', () => {
      render(
        <ErrorBoundary>
          <div>
            <div>
              <ThrowError shouldThrow={true} />
            </div>
          </div>
        </ErrorBoundary>
      );

      expect(screen.getByText(/alguna cosa ha anat malament/i)).toBeInTheDocument();
    });

    test('no captura errors en event handlers (comportament esperat de React)', () => {
      // Nota: ErrorBoundary només captura errors en rendering, lifecycle methods, etc.
      // NO captura errors en event handlers - això és comportament intencionat de React
      const ComponentAmbEventHandler = () => {
        const handleClick = () => {
          // Aquest error NO serà capturat per ErrorBoundary
          throw new Error('Error en event handler');
        };

        return <button onClick={handleClick}>Click em</button>;
      };

      // Aquest test verifica que el component es renderitza
      // L'error en onClick no es produirà fins que es faci click
      render(
        <ErrorBoundary>
          <ComponentAmbEventHandler />
        </ErrorBoundary>
      );

      expect(screen.getByText('Click em')).toBeInTheDocument();
    });
  });

  describe('UI de fallback', () => {
    test('mostra botó de recarregar pàgina', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const reloadButton = screen.getByRole('button', { name: /recarregar pàgina/i });
      expect(reloadButton).toBeInTheDocument();
    });

    test('mostra icona d\'alerta', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Verificar que hi ha l'element SVG de l'icona d'alerta
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    test('mostra missatge informatiu', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText(/intenta-ho de nou/i)
      ).toBeInTheDocument();
    });
  });

  describe('Recuperació', () => {
    test('pot recuperar-se mostrant nou contingut', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/alguna cosa ha anat malament/i)).toBeInTheDocument();

      // Actualitzar amb component que no llança error
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      // ErrorBoundary no es recupera automàticament (necessita unmount/remount)
      // Això és comportament esperat
      expect(screen.getByText(/alguna cosa ha anat malament/i)).toBeInTheDocument();
    });
  });

  describe('Logging', () => {
    test('fa log de l\'error a console.error', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Error de test" />
        </ErrorBoundary>
      );

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Accessibilitat', () => {
    test('UI de fallback té classe error-boundary', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const errorBoundary = container.querySelector('.error-boundary');
      expect(errorBoundary).toBeInTheDocument();
    });

    test('botó de recarregar és accessible via teclat', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: /recarregar pàgina/i });
      button.focus();
      expect(button).toHaveFocus();
    });
  });

  describe('Casos extrems', () => {
    test('gestiona errors amb missatges molt llargs', () => {
      const longErrorMessage = 'E'.repeat(1000);

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage={longErrorMessage} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/alguna cosa ha anat malament/i)).toBeInTheDocument();
    });

    test('gestiona múltiples errors consecutius', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Error 1" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/alguna cosa ha anat malament/i)).toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Error 2" />
        </ErrorBoundary>
      );

      // Hauria de seguir mostrant UI de fallback
      expect(screen.getByText(/alguna cosa ha anat malament/i)).toBeInTheDocument();
    });
  });
});
