✈️ Global Plane Tracker
A full-stack real-time aircraft tracking application that renders live flight data on an interactive 3D globe. Built as a portfolio project to explore WebSockets, 3D geospatial rendering, and RESTful API integration.

Features
Live flight data — Fetches real-time aircraft positions from the OpenSky Network API (OAuth2 authenticated), refreshed every 5 seconds via WebSocket

Interactive 3D globe — Built with CesiumJS via the Resium React wrapper; supports satellite and flat globe view modes

Aircraft categories — 7 icon types (Light Aircraft, Jets, Helicopters, Drones, etc.) with canvas-drawn labels per plane

Filtering & search — Filter by aircraft category or search by callsign/ICAO; live aircraft count badge

Info panel — Click any aircraft to see callsign, altitude, speed, heading, vertical rate, country of origin, and squawk code

Responsive UI — Mobile-friendly layout with a collapsible controls panel and custom fullscreen button for tablet/mobile

Up to 100 aircraft displayed simultaneously

Project Structure:
├── frontend/               # React + Vite app
│   ├── src/
│   │   ├── components/
│   │   │   ├── CesiumViewer/   # 3D globe, entities, click handlers
│   │   │   ├── AircraftList/   # Sidebar aircraft list
│   │   │   ├── Controls/       # Filter & view mode controls
│   │   │   └── UI/             # InfoCard, StatusBadge, LoadingSpinner
│   │   ├── hooks/              # useAircraftData, useAircraftOrientation
│   │   ├── services/api/       # aircraftService (HTTP + WS)
│   │   ├── types/              # Aircraft & AircraftResponse interfaces
│   │   └── utils/              # Heading/orientation helpers
│   └── public/aircraft-icons/  # PNG icons per aircraft category
│
└── backend/                # Node.js Express server
    └── src/
        ├── server.js           # REST endpoints + Socket.io broadcasts
        └── services/
            └── OpenSkyService.js  # OAuth2 token management + API calls
