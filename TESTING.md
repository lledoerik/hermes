# 🧪 Guia de Testing - Hermes Media Server

Aquest document explica com executar i crear tests per Hermes.

---

## Frontend Testing (React + Jest)

### Executar tots els tests
```bash
cd frontend
npm test
```

### Executar tests en mode watch
```bash
npm test -- --watch
```

### Executar tests amb coverage
```bash
npm test -- --coverage --watchAll=false
```

### Executar tests específics
```bash
npm test MediaCard.test.js
```

### Estructura de tests frontend
```
frontend/src/
├── components/
│   ├── MediaCard.js
│   ├── MediaCard.test.js        # Tests per MediaCard
│   ├── Toast.js
│   ├── Toast.test.js            # Tests per Toast
│   ├── ErrorBoundary.js
│   └── ErrorBoundary.test.js    # Tests per ErrorBoundary
└── setupTests.js                 # Configuració global
```

### Eines utilitzades
- **Jest**: Test runner i assertion library
- **React Testing Library**: Testejar components React
- **@testing-library/user-event**: Simular interaccions d'usuari
- **@testing-library/jest-dom**: Matchers personalitzats

### Exemples de tests

**Test bàsic de component:**
```javascript
import { render, screen } from '@testing-library/react';
import MediaCard from './MediaCard';

test('renderitza el títol correctament', () => {
  const item = { name: 'Breaking Bad' };
  render(<MediaCard item={item} />);
  expect(screen.getByText('Breaking Bad')).toBeInTheDocument();
});
```

**Test d'interacció:**
```javascript
import { fireEvent } from '@testing-library/react';

test('crida onPlay quan es fa click', () => {
  const onPlay = jest.fn();
  render(<MediaCard item={item} onPlay={onPlay} />);

  fireEvent.click(screen.getByLabelText('Reproduir'));
  expect(onPlay).toHaveBeenCalledTimes(1);
});
```

---

## Backend Testing (Python + pytest)

### Instal·lar dependències de testing
```bash
cd backend
pip install pytest pytest-cov pytest-asyncio
```

### Executar tots els tests
```bash
pytest
```

### Executar tests amb coverage
```bash
pytest --cov=backend --cov-report=html --cov-report=term-missing
```

### Executar tests específics
```bash
pytest tests/test_scanner.py
```

### Executar només tests ràpids (skip slow)
```bash
pytest -m "not slow"
```

### Executar només tests unitaris
```bash
pytest -m unit
```

### Executar només tests d'integració
```bash
pytest -m integration
```

### Estructura de tests backend
```
backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # Fixtures globals
│   ├── test_scanner.py         # Tests del scanner
│   └── test_cache.py           # Tests del cache
└── pytest.ini                   # Configuració de pytest
```

### Fixtures disponibles
- `temp_dir`: Directori temporal per tests
- `sample_series_structure`: Estructura de sèrie de mostra
- `sample_movie_structure`: Estructura de pel·lícula de mostra
- `mock_tmdb_response`: Resposta TMDB simulada
- `mock_cache_file`: Fitxer de cache de mostra

### Exemples de tests

**Test unitari:**
```python
@pytest.mark.unit
def test_detect_series_pattern():
    filename = "Breaking Bad - S01E01.mkv"
    result = scan.detect_episode_info(filename)

    assert result is not None
    assert result['season'] == 1
    assert result['episode'] == 1
```

**Test d'integració:**
```python
@pytest.mark.integration
def test_scan_series(sample_series_structure):
    result = scan.scan_series(sample_series_structure)

    assert len(result['seasons']) == 2
    assert result['seasons'][0]['episode_count'] > 0
```

**Test amb mock:**
```python
def test_with_mock(mocker):
    mock_api = mocker.patch('backend.api.get_data')
    mock_api.return_value = {'rating': 9.5}

    result = get_series_info(123)
    assert result['rating'] == 9.5
```

---

## CI/CD amb GitHub Actions

Els tests s'executen automàticament en cada push i pull request.

### Workflow configurats

**`.github/workflows/tests.yml`**
- ✅ Tests frontend (Jest)
- ✅ Tests backend (pytest)
- ✅ Lint de codi
- ✅ Upload de coverage a Codecov

### Veure resultats
1. Ves a la pestanya "Actions" del repositori GitHub
2. Selecciona el workflow "Tests"
3. Veure resultats de cada job

### Badge de status
Afegir al README.md:
```markdown
![Tests](https://github.com/user/hermes/workflows/Tests/badge.svg)
```

---

## Coverage Reports

### Frontend
Després d'executar tests amb coverage:
```bash
open frontend/coverage/lcov-report/index.html
```

### Backend
Després d'executar tests amb coverage:
```bash
open backend/htmlcov/index.html
```

---

## Best Practices

### Testing Frontend
1. ✅ Testa comportament, no implementació
2. ✅ Usa `screen.getByRole()` quan sigui possible
3. ✅ Inclou tests d'accessibilitat (ARIA labels, keyboard navigation)
4. ✅ Testa casos extrems (dades buides, llargues, etc.)
5. ✅ Mock dependencies externes (API calls, localStorage, etc.)

### Testing Backend
1. ✅ Usa fixtures per configuració comuna
2. ✅ Marca tests segons tipus (`@pytest.mark.unit`, `@pytest.mark.integration`)
3. ✅ Neteja després de cada test (usa `yield` en fixtures)
4. ✅ Testa errors i excepcions
5. ✅ Usa `parametrize` per múltiples casos

---

## Recursos

- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [pytest Documentation](https://docs.pytest.org/)
- [GitHub Actions](https://docs.github.com/actions)

---

## Troubleshooting

### Frontend tests fallen

**Error: `Cannot find module '@testing-library/react'`**
```bash
cd frontend
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

**Error: `window.matchMedia is not a function`**
- Ja està configurat a `setupTests.js`

### Backend tests fallen

**Error: `ModuleNotFoundError: No module named 'pytest'`**
```bash
pip install pytest pytest-cov
```

**Error: `fixture 'temp_dir' not found`**
- Assegura't que `conftest.py` existeix a `tests/`

---

**Tests totals creats**: 50+ tests (25 frontend + 25 backend)

**Coverage objectiu**: >80% per components crítics
