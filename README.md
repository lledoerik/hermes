# 🎬 Hermes Media Server

Sistema de streaming personal amb control total sobre arxius MKV multi-pista.

## ⚡ Instal·lació Ràpida

1. **Prerequisits:**
   - Python 3.11+
   - Node.js 16+
   - FFmpeg

2. **Instal·lació:**
   ```batch
   install.bat
   ```

3. **Configuració:**
   - Edita `config/settings.py` amb les teves rutes

4. **Escaneig inicial:**
   ```batch
   start-scan.bat
   ```

5. **Iniciar sistema:**
   ```batch
   start-all.bat
   ```

## 🌐 Accés

- **Frontend:** http://localhost:3000
- **API Docs:** http://localhost:8000/docs

## 📁 Estructura

```
hermes/
├── backend/           # API FastAPI
│   ├── main.py       # API principal
│   ├── scanner/      # Scanner de media
│   └── streaming/    # Motor HLS
├── frontend/         # React UI
│   └── src/
│       └── App.js   # App principal
├── config/          # Configuració
│   └── settings.py  # Rutes i opcions
├── storage/         # Base de dades i cache
└── scripts/         # Scripts d'utilitat
```

## 🚀 Característiques

- ✅ Scanner intel·ligent de MKV
- ✅ Detecció de pistes d'àudio i subtítols
- ✅ API REST completa
- ✅ Frontend React modern
- ✅ Suport per sèries i pel·lícules
- ✅ Compatible amb estructura Jellyfin

## 🛠️ Per producció (hermes.cat)

1. Compila el frontend:
   ```batch
   cd frontend
   npm run build
   ```

2. Configura IIS o nginx per servir el build
3. Assegura't que els ports 3000 i 8000 estan oberts

---

**Versió:** 1.0.0  
**Creat amb:** Python + FastAPI + React
