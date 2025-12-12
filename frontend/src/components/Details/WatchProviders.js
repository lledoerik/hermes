import React from 'react';
import './WatchProviders.css';

/**
 * WatchProviders - Mostra on es pot veure el contingut en streaming
 * Integració amb TMDB watch providers per mostrar plataformes disponibles
 */
function WatchProviders({ providers }) {
  if (!providers || !providers.available) {
    return null;
  }

  const { flatrate, rent, buy, link } = providers;
  const hasAnyProviders = (flatrate && flatrate.length > 0) ||
                          (rent && rent.length > 0) ||
                          (buy && buy.length > 0);

  if (!hasAnyProviders) {
    return null;
  }

  return (
    <div className="watch-providers">
      {/* Streaming (Subscripció) */}
      {flatrate && flatrate.length > 0 && (
        <div className="watch-providers__row">
          <span className="watch-providers__label">Disponible a:</span>
          <div className="watch-providers__logos">
            {flatrate.map((provider) => (
              <a
                key={provider.id}
                href={provider.deep_link || link}
                target="_blank"
                rel="noopener noreferrer"
                className="watch-providers__logo"
                title={`Veure a ${provider.name}`}
                aria-label={`Veure a ${provider.name}`}
              >
                {provider.logo ? (
                  <img
                    src={provider.logo}
                    alt={provider.name}
                    loading="lazy"
                  />
                ) : (
                  <span className="watch-providers__name">{provider.name}</span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Llogar */}
      {rent && rent.length > 0 && (
        <div className="watch-providers__row">
          <span className="watch-providers__label">Llogar a:</span>
          <div className="watch-providers__logos">
            {rent.slice(0, 5).map((provider) => (
              <a
                key={provider.id}
                href={provider.deep_link || link}
                target="_blank"
                rel="noopener noreferrer"
                className="watch-providers__logo"
                title={`Llogar a ${provider.name}`}
                aria-label={`Llogar a ${provider.name}`}
              >
                {provider.logo ? (
                  <img
                    src={provider.logo}
                    alt={provider.name}
                    loading="lazy"
                  />
                ) : (
                  <span className="watch-providers__name">{provider.name}</span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Comprar */}
      {buy && buy.length > 0 && (
        <div className="watch-providers__row">
          <span className="watch-providers__label">Comprar a:</span>
          <div className="watch-providers__logos">
            {buy.slice(0, 5).map((provider) => (
              <a
                key={provider.id}
                href={provider.deep_link || link}
                target="_blank"
                rel="noopener noreferrer"
                className="watch-providers__logo"
                title={`Comprar a ${provider.name}`}
                aria-label={`Comprar a ${provider.name}`}
              >
                {provider.logo ? (
                  <img
                    src={provider.logo}
                    alt={provider.name}
                    loading="lazy"
                  />
                ) : (
                  <span className="watch-providers__name">{provider.name}</span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WatchProviders;
