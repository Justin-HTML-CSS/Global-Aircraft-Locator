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

Tech Stack

Frontend
Tech	Purpose
React 19 + TypeScript -	UI framework
Vite 7 - Build tool
CesiumJS 1.137 + Resium	- 3D globe rendering
Tailwind CSS v4 - Styling
Socket.io-client - Real-time WebSocket updates
TanStack Query - Data fetching/caching
Framer Motion - Animations
Zustand - State management

Backend
Tech  Purpose
Node.js + Express - REST API & WebSocket server
Socket.io - Push updates to connected clients
Axios - OpenSky API requests
OpenSky Network API - Live flight data source
