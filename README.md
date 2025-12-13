# HERMES

A personal media library management system with intelligent metadata integration and a modern user interface.

## Overview

Hermes is a self-hosted media server that helps you organize, browse, and manage your personal media collection. It automatically scans your library, fetches rich metadata from TMDB (The Movie Database), and presents everything through an elegant, responsive web interface.

## Features

### Library Management
- Automatic scanning of media directories
- Support for movies and TV series organization
- Compatible with Jellyfin/Plex folder structures
- Multi-language audio and subtitle track detection

### Metadata Integration
- Automatic metadata fetching from TMDB
- High-quality poster and backdrop images
- Cast and crew information
- Ratings and release dates
- Episode details for TV series

### User System
- JWT-based authentication
- Personal watchlist management
- Continue watching progress tracking
- User preferences and settings

### Modern Interface
- Responsive design for desktop and mobile
- Dark theme optimized for media browsing
- Infinite scroll carousels
- Real-time search functionality
- Season and episode navigation for series

## Technology Stack

### Backend
- **Framework:** FastAPI (Python 3.11+)
- **Database:** SQLite with SQLAlchemy ORM
- **Authentication:** JWT tokens with python-jose
- **API Documentation:** Automatic OpenAPI/Swagger

### Frontend
- **Framework:** React 18
- **Routing:** React Router v6
- **Styling:** CSS with custom design system
- **HTTP Client:** Axios

### External Services
- **Metadata:** TMDB API

## Requirements

- Python 3.11 or higher
- Node.js 16 or higher
- FFmpeg (for media analysis)
- TMDB API key

## Installation

#### Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

#### Frontend Setup

```bash
cd frontend
npm install
```

#### Running in Development

Start the backend:
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Start the frontend:
```bash
cd frontend
npm start
```

## Configuration

### Media Library Paths

Edit `config/settings.py` to configure your media directories:

```python
MOVIES_PATH = "D:/Media/Movies"
SERIES_PATH = "D:/Media/Series"
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TMDB_API_KEY` | Your TMDB API key | Required |
| `JWT_SECRET` | Secret key for JWT tokens | Auto-generated |
| `DATABASE_URL` | SQLite database path | `storage/hermes.db` |

## Project Structure

```
hermes/
├── backend/
│   ├── main.py              # FastAPI application entry point
│   ├── auth/                # Authentication module
│   ├── scanner/             # Media library scanner
│   ├── database/            # Database models and operations
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── pages/           # Page components
│   │   ├── context/         # React context providers
│   │   ├── services/        # API service layer
│   │   └── styles/          # Global styles and design system
│   ├── public/              # Static assets
│   └── package.json         # Node.js dependencies
├── config/
│   └── settings.py          # Application configuration
├── storage/                 # Database and cache files
└── scripts/                 # Utility scripts
```

## API Documentation

Once the backend is running, access the interactive API documentation at:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/movies` | GET | List all movies |
| `/api/series` | GET | List all series |
| `/api/search` | GET | Search media library |
| `/api/auth/login` | POST | User authentication |
| `/api/watchlist` | GET/POST | Manage watchlist |

## Production Deployment

### Building for Production

```bash
cd frontend
npm run build
```

The build output will be in `frontend/build/`, ready to be served by any static file server.

## Development

### Running Tests

Backend tests:
```bash
cd backend
pytest
```

Frontend tests:
```bash
cd frontend
npm test
```

### Code Style

- Backend: Follow PEP 8 guidelines
- Frontend: ESLint with React recommended rules

## License

This project is for personal use. All rights reserved.

## Acknowledgments

- [TMDB](https://www.themoviedb.org/) for providing the metadata API
- [FastAPI](https://fastapi.tiangolo.com/) for the excellent Python web framework
- [React](https://reactjs.org/) for the frontend framework

---

**Version:** 2.0.0
