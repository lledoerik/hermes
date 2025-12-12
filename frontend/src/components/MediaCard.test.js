import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MediaCard from './MediaCard';

// Mock AuthContext
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    isAuthenticated: true,
    isAdmin: false,
  }),
}));

// Helper per renderitzar amb Router
const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('MediaCard', () => {
  const mockItem = {
    id: 1,
    name: 'Breaking Bad',
    title: 'Breaking Bad',
    rating: 9.5,
    year: 2008,
    poster: '/poster.jpg',
    overview: 'A high school chemistry teacher turned methamphetamine producer',
  };

  describe('Rendering', () => {
    test('renderitza el títol correctament', () => {
      renderWithRouter(<MediaCard item={mockItem} type="series" />);
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });

    test('renderitza el rating quan existeix', () => {
      renderWithRouter(<MediaCard item={mockItem} type="series" />);
      expect(screen.getByText('9.5')).toBeInTheDocument();
    });

    test('renderitza l\'any quan existeix', () => {
      renderWithRouter(<MediaCard item={mockItem} type="series" />);
      expect(screen.getByText('2008')).toBeInTheDocument();
    });

    test('no renderitza rating si no existeix', () => {
      const itemSenseRating = { ...mockItem, rating: null };
      renderWithRouter(<MediaCard item={itemSenseRating} type="series" />);
      expect(screen.queryByText('9.5')).not.toBeInTheDocument();
    });

    test('aplica classe base de media-card', () => {
      const { container } = renderWithRouter(
        <MediaCard item={mockItem} type="series" />
      );
      expect(container.querySelector('.media-card')).toBeInTheDocument();
    });
  });

  describe('Interaccions', () => {
    test('té botó de informació accessible', () => {
      renderWithRouter(<MediaCard item={mockItem} type="series" />);

      const infoButton = screen.getByLabelText('Veure detalls de Breaking Bad');
      expect(infoButton).toBeInTheDocument();
    });

    test('botó de detalls pot rebre focus', () => {
      renderWithRouter(<MediaCard item={mockItem} type="series" />);

      const detailsButton = screen.getByLabelText('Veure detalls de Breaking Bad');
      detailsButton.focus();
      expect(detailsButton).toHaveFocus();
    });
  });

  describe('Accessibilitat', () => {
    test('té ARIA label correcte per al botó de details', () => {
      renderWithRouter(<MediaCard item={mockItem} type="series" />);

      const detailsButton = screen.getByLabelText('Veure detalls de Breaking Bad');
      expect(detailsButton).toBeInTheDocument();
    });

    test('icones són accessibles', () => {
      const { container } = renderWithRouter(<MediaCard item={mockItem} type="series" />);

      const icons = container.querySelectorAll('svg');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Tipus de contingut', () => {
    test('renderitza correctament per sèries', () => {
      const { container } = renderWithRouter(<MediaCard item={mockItem} type="series" />);
      expect(container.querySelector('.media-card')).toBeInTheDocument();
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });

    test('renderitza correctament per pel·lícules', () => {
      const { container } = renderWithRouter(<MediaCard item={mockItem} type="movies" />);
      expect(container.querySelector('.media-card')).toBeInTheDocument();
      expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
    });

    test('renderitza correctament per contingut TMDB', () => {
      const tmdbItem = { ...mockItem, id: 'tmdb-12345' };
      const { container } = renderWithRouter(<MediaCard item={tmdbItem} type="series" />);
      expect(container.querySelector('.media-card')).toBeInTheDocument();
    });
  });

  describe('Estat de visió', () => {
    test('mostra progress bar quan hi ha watch_progress', () => {
      const itemAmbProgress = { ...mockItem, watch_progress: 75 };
      const { container } = renderWithRouter(
        <MediaCard item={itemAmbProgress} type="series" />
      );

      const progressBar = container.querySelector('.media-card__progress-bar');
      expect(progressBar).toBeInTheDocument();
      // El component mostra el progress bar (no fem assert de l'estil inline)
    });

    test('no mostra progress bar si watch_progress és 0', () => {
      const itemSenseProgress = { ...mockItem, watch_progress: 0 };
      const { container } = renderWithRouter(
        <MediaCard item={itemSenseProgress} type="series" />
      );

      expect(container.querySelector('.media-card__progress')).not.toBeInTheDocument();
    });
  });

  describe('Casos extrems', () => {
    test('renderitza correctament amb item mínim', () => {
      const minimalItem = { id: 1, name: 'Test' };
      renderWithRouter(<MediaCard item={minimalItem} type="series" />);
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    test('gestiona títols molt llargs', () => {
      const itemTitolLlarg = {
        ...mockItem,
        name: 'Aquest és un títol extremadament llarg que hauria de ser truncat per evitar problemes de layout',
      };
      renderWithRouter(<MediaCard item={itemTitolLlarg} type="series" />);
      expect(screen.getByText(itemTitolLlarg.name)).toBeInTheDocument();
    });

    test('gestiona ratings amb molts decimals', () => {
      const itemRatingDecimals = { ...mockItem, rating: 9.456789 };
      renderWithRouter(<MediaCard item={itemRatingDecimals} type="series" />);
      // El component mostra el rating tal com ve (sense formatar)
      expect(screen.getByText(/9\.45/)).toBeInTheDocument();
    });
  });
});
