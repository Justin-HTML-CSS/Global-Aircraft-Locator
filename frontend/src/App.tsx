import React, { useState, useEffect } from 'react';
import CesiumViewer from './components/CesiumViewer/CesiumViewer';
import AircraftList from './components/AircraftList/AircraftList';
import Controls from './components/Controls/Controls';
import LoadingSpinner from './components/UI/LoadingSpinner';
import StatusBadge from './components/UI/StatusBadge';
import type { Aircraft } from './types';
import { useAircraftData } from './hooks/useAircraftData';
import { Plane, Globe, RefreshCw, Signal, Satellite, Navigation, Eye, MapPin } from 'lucide-react';

function App() {
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const MAX_DISPLAY_COUNT = 100; // Batch selection size — always track 100
  const [displayLimit, setDisplayLimit] = useState(100); // How many to show on the globe
  
  const [showLabels, setShowLabels] = useState(true);
  const [showPaths, setShowPaths] = useState(false);
  const [viewMode, setViewMode] = useState<'global' | 'follow' | 'cockpit' | 'approach' | 'satellite'>('global');
  
  // Filter states
  const [enabledCategories, setEnabledCategories] = useState<Set<number>>(new Set([2, 3, 4, 6, 7, 8, 14]));
  
  // Store selected aircraft IDs to keep them stable across API updates
  const [selectedAircraftIds, setSelectedAircraftIds] = useState<Set<string>>(new Set());
  
  // Track last-seen time for each aircraft (to keep them even if temporarily missing)
  const [aircraftLastSeen, setAircraftLastSeen] = useState<Map<string, number>>(new Map());

  const { aircraft, loading, error, refresh, total } = useAircraftData(100000); // Fetch max available
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');

  const [showMobileAircraftList, setShowMobileAircraftList] = useState(true);

  // Select 100 random aircraft only once on initial load
  useEffect(() => {
    if (!aircraft.length || selectedAircraftIds.size > 0) return;

    const excludedCategories = new Set([5, 9, 10]);
    const categoryFiltered = aircraft.filter(plane => 
      !excludedCategories.has(plane.category) && enabledCategories.has(plane.category)
    );

    const shuffled = [...categoryFiltered].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, MAX_DISPLAY_COUNT);
    const ids = new Set(selected.map(a => a.icao24));
    
    setSelectedAircraftIds(ids);
    
    // Initialize last-seen timestamps
    const lastSeen = new Map<string, number>();
    selected.forEach(plane => {
      lastSeen.set(plane.icao24, Date.now());
    });
    setAircraftLastSeen(lastSeen);
    
    console.log(`✅ Selected ${ids.size} aircraft to track continuously`);
  }, [aircraft.length]); // Only run when aircraft data first loads

  // Update last-seen timestamps and immediately replace any missing aircraft to maintain 100
  useEffect(() => {
    if (aircraft.length === 0 || selectedAircraftIds.size === 0) return;

    const now = Date.now();
    const currentIds = new Set(selectedAircraftIds);
    const updatedLastSeen = new Map(aircraftLastSeen);
    
    // Update timestamps for aircraft currently in API response
    aircraft.forEach(plane => {
      if (currentIds.has(plane.icao24)) {
        updatedLastSeen.set(plane.icao24, now);
      }
    });

    // Find missing aircraft and replace them immediately to maintain 100
    const excludedCategories = new Set([5, 9, 10]);
    const currentApiIds = new Set(aircraft.map(a => a.icao24));
    let replacements = 0;
    
    // Check each selected aircraft
    for (const id of currentIds) {
      if (!currentApiIds.has(id)) {
        // This aircraft is no longer in API response - find a replacement immediately
        const replacement = aircraft.find(plane =>
          !currentIds.has(plane.icao24) &&
          !excludedCategories.has(plane.category) &&
          enabledCategories.has(plane.category)
        );
        
        if (replacement) {
          currentIds.delete(id);
          currentIds.add(replacement.icao24);
          updatedLastSeen.delete(id);
          updatedLastSeen.set(replacement.icao24, now);
          replacements++;
        }
      }
    }

    // Also check if we have fewer than 100 aircraft and fill the gap
    if (currentIds.size < MAX_DISPLAY_COUNT) {
      const neededCount = MAX_DISPLAY_COUNT - currentIds.size;
      const availableAircraft = aircraft.filter(plane =>
        !currentIds.has(plane.icao24) &&
        !excludedCategories.has(plane.category) &&
        enabledCategories.has(plane.category)
      );

      // Add up to the needed count
      for (let i = 0; i < Math.min(neededCount, availableAircraft.length); i++) {
        const newAircraft = availableAircraft[i];
        currentIds.add(newAircraft.icao24);
        updatedLastSeen.set(newAircraft.icao24, now);
        replacements++;
      }
    }

    if (replacements > 0) {
      setSelectedAircraftIds(currentIds);
      setAircraftLastSeen(updatedLastSeen);
      console.log(`🔄 Replaced ${replacements} aircraft | Total now: ${currentIds.size}/100`);
    } else {
      // Just update the timestamps
      setAircraftLastSeen(updatedLastSeen);
    }
  }, [aircraft, selectedAircraftIds.size]); // Run on each aircraft data update

  // When enabled categories change, remove aircraft of disabled categories so replacements are triggered
  useEffect(() => {
    if (selectedAircraftIds.size === 0) return;

    const newIds = new Set(selectedAircraftIds);
    let changed = false;

    for (const id of selectedAircraftIds) {
      const plane = aircraft.find(a => a.icao24 === id);
      if (plane && !enabledCategories.has(plane.category)) {
        newIds.delete(id);
        changed = true;
      }
    }

    if (changed) {
      setSelectedAircraftIds(newIds);
    }
  }, [enabledCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter to only show the selected aircraft (stable across updates)
  const filteredAircraft = React.useMemo(() => {
    if (selectedAircraftIds.size === 0) return [];
    
    // Return only aircraft that are in our selected set AND have an enabled category, capped by displayLimit
    const displayed = aircraft.filter(a => selectedAircraftIds.has(a.icao24) && enabledCategories.has(a.category));
    return displayed.slice(0, displayLimit);
  }, [aircraft, selectedAircraftIds, enabledCategories, displayLimit]);

  // Filter handlers
  const handleToggleCategory = (category: number) => {
    const newCategories = new Set(enabledCategories);
    if (newCategories.has(category)) {
      newCategories.delete(category);
    } else {
      newCategories.add(category);
    }
    setEnabledCategories(newCategories);
  };

  // Handle refresh - trigger backend cache clear, then re-fetch and pick new random aircraft
  const handleRefresh = async () => {
    try {
      // Signal backend to refresh its cache
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
      await fetch(`${apiUrl}/refresh`, { method: 'POST' });
      console.log('💾 Backend cache refresh triggered');
      
      // Wait a moment for backend to prepare fresh data
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now trigger the fetch hook refresh
      refresh();
      
      // Clear selection only AFTER refresh is called (not before)
      // so the new aircraft list populates before we filter
      setTimeout(() => {
        setSelectedAircraftIds(new Set()); // Reset selection to force new random selection
      }, 1000);
    } catch (error) {
      console.error('Error during refresh:', error);
      // Still trigger refresh even if the POST fails
      refresh();
    }
  };

  // Monitor connection status
  useEffect(() => {
    const handleOnline = () => setConnectionStatus('online');
    const handleOffline = () => setConnectionStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (loading && aircraft.length === 0) {
    return (
      <div className="h-screen flex flex-col bg-gray-900 text-white items-center justify-center">
        {error ? (
          <div className="text-center p-8 max-w-md">
            <div className="text-red-400 text-4xl mb-4">⚠️</div>
            <h2 className="text-xl sm:text-2xl font-semibold mb-2">Backend Connection Error</h2>
            <p className="text-gray-400 mb-4">{error}</p>
            <p className="text-gray-500 text-sm mb-6">Make sure the backend is running:</p>
            <code className="bg-gray-800 p-3 rounded block text-xs mb-4 text-left">cd backend && npm run dev</code>
            <button
              onClick={handleRefresh}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <LoadingSpinner size="lg" text="Initializing aircraft tracking..." />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-900 text-white">

      {/* ─── HEADER ─────────────────────────────────────────────────── */}
      <header className="flex-none bg-gray-800 border-b border-gray-700 px-4 py-3">
        {/* Top row: logo + title + action buttons */}
        <div className="flex items-center justify-between gap-2">

          {/* Left: logo + title */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
            <Globe className="w-5 h-5 sm:w-8 sm:h-8 text-blue-400 flex-shrink-0" />
            <div className="min-w-0 overflow-hidden">
              <h1 className="text-[15px] sm:text-xl md:text-2xl font-bold leading-tight truncate">
                Global Plane Tracker
              </h1>
              <p className="text-gray-400 text-xs hidden sm:block truncate">
                Real-time worldwide aircraft tracking with CesiumJS 3D
              </p>
            </div>
          </div>

          {/* Right: status badges + view buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status badges — visible on sm+ */}
            <div className="hidden sm:flex items-center gap-2">
              <StatusBadge
                status={connectionStatus}
                text={connectionStatus === 'online' ? 'Connected' : 'Offline'}
              />
              <StatusBadge status="online" text={`${filteredAircraft.length} Active`} />
            </div>

            {/* Global 3D View */}
            <button
              onClick={() => { setSelectedAircraft(null); setViewMode('global'); }}
              className={`flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg transition text-sm ${
                viewMode === 'global' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <Globe className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Global 3D View</span>
            </button>

            {/* Satellite View */}
            <button
              onClick={() => { setSelectedAircraft(null); setViewMode('satellite'); }}
              className={`flex items-center gap-1 px-2 sm:px-4 py-2 rounded-lg transition text-sm ${
                viewMode === 'satellite' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <Satellite className="w-4 h-4 flex-shrink-0" />
              <span className="hidden sm:inline">Satellite View</span>
            </button>
          </div>
        </div>

        {/* Stats bar — hidden on mobile to save vertical space */}
        <div className="hidden md:flex items-center justify-between text-sm flex-wrap gap-2 mt-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center">
              <Signal className="w-4 h-4 mr-1 text-green-400" />
              <span>Live Data</span>
            </div>
            <div className="flex items-center">
              <Satellite className="w-4 h-4 mr-1 text-blue-400" />
              <span>3D Globe</span>
            </div>
            <div className="flex items-center">
              <Plane className="w-4 h-4 mr-1 text-orange-400" />
              <span>{total} Total Aircraft</span>
            </div>
          </div>
          <div className="text-gray-400">
            Displaying {filteredAircraft.length}/{MAX_DISPLAY_COUNT} random aircraft • Live updates every 1s
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT ────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

        {/* Left Panel — Aircraft List (desktop only; mobile uses the floating overlay) */}
        <div className="hidden lg:flex flex-col w-full lg:w-1/4 bg-gray-800 border-r border-gray-700 overflow-hidden">
          <AircraftList
            aircraft={filteredAircraft}
            selectedAircraft={selectedAircraft}
            onSelectAircraft={(ac) => {
              setSelectedAircraft(ac);
              if (viewMode === 'satellite') setViewMode('approach');
            }}
            loading={loading}
            error={error}
          />
        </div>

        {/* Centre Panel — 3D Globe */}
        <div className="flex flex-col flex-1 relative bg-gray-900">
          {error && aircraft.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <div className="text-center p-8 max-w-md">
                <div className="text-red-400 text-4xl mb-4">⚠️</div>
                <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
                <p className="text-gray-400 mb-4">{error}</p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={handleRefresh}
                    className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg"
                  >
                    Retry Connection
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg"
                  >
                    Reload Page
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <CesiumViewer
              aircraft={filteredAircraft}
              selectedAircraft={selectedAircraft}
              maxDisplayCount={MAX_DISPLAY_COUNT}
              viewMode={viewMode}
              showLabels={showLabels}
              showPaths={showPaths}
              enabledCategories={enabledCategories}
              onSelectAircraft={(ac) => {
                setSelectedAircraft(ac);
                setShowMobileAircraftList(false);
              }}
              onDeselectAircraft={() => {
                setSelectedAircraft(null);
                setViewMode('global');
                setShowMobileAircraftList(true);
              }}
              onViewModeChange={setViewMode}
            />
          )}

          {/* ── Compact aircraft list — bottom-left on mobile/tablet ── */}
          {showMobileAircraftList ? (
            <div className="lg:hidden absolute bottom-4 left-4 z-20 w-44 h-64 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
              <AircraftList
                aircraft={filteredAircraft}
                selectedAircraft={selectedAircraft}
                onSelectAircraft={(ac) => {
                  setSelectedAircraft(ac);
                  if (viewMode === 'satellite') setViewMode('approach');
                  setShowMobileAircraftList(false);
                }}
                loading={loading}
                error={error}
                compact
                displayLimit={displayLimit}
                onDisplayLimitChange={setDisplayLimit}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowMobileAircraftList(true)}
              className="lg:hidden absolute bottom-4 left-4 z-20 flex items-center gap-1 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl px-[10px] py-[8px] sm:px-[13px] sm:py-[10px] text-[13px] sm:text-[16px] text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <Plane className="w-[15px] h-[15px] sm:w-[17px] sm:h-[17px] text-blue-400" />
              <span>Aircraft</span>
            </button>
          )}

          {/* ── Compact controls widget — bottom-right on mobile/tablet (only when aircraft selected) ── */}
          {selectedAircraft && (
          <div className="lg:hidden absolute bottom-4 right-4 z-20 w-[112px] sm:w-[264px] bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl p-[8px] sm:p-[17px]">
            {/* View Modes — only when an aircraft is selected */}
            {selectedAircraft && (
              <div>
                <div className="flex items-center gap-0.5 mb-1">
                  <Globe className="w-[12px] h-[12px] sm:w-[22px] sm:h-[22px] text-gray-400" />
                  <span className="text-[12px] sm:text-[21px] text-gray-300 font-medium">View Modes</span>
                </div>
                <div className="space-y-0.5">
                  {([
                    { id: 'follow',  name: 'Follow 3D',  icon: Navigation },
                    { id: 'cockpit', name: 'Cockpit',    icon: Eye },
                    { id: 'approach',name: 'Follow 2D',  icon: MapPin },
                  ] as const).map(({ id, name, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setViewMode(id);
                      }}
                      className={`w-full flex items-center gap-1 px-1 py-px rounded text-[12px] sm:text-[21px] transition ${
                        viewMode === id
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800/60'
                      }`}
                    >
                      <Icon className="w-[10px] h-[10px] sm:w-[18px] sm:h-[18px] shrink-0" />
                      <span className="truncate">{name}</span>
                      {viewMode === id && <div className="w-1 h-1 bg-white rounded-full ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Right Panel — Controls */}
        <div className="hidden lg:flex flex-col w-full lg:w-1/4 bg-gray-800 border-l border-gray-700 overflow-hidden">
          <Controls
            maxDisplayCount={displayLimit}
            onMaxDisplayCountChange={setDisplayLimit}
            selectedAircraft={selectedAircraft}
            onToggleLabels={() => setShowLabels(!showLabels)}
            onTogglePaths={() => setShowPaths(!showPaths)}
            showLabels={showLabels}
            showPaths={showPaths}
            viewMode={viewMode}
            onViewModeChange={(mode) => {
              setViewMode(mode);
            }}
            enabledCategories={enabledCategories}
            onToggleCategory={handleToggleCategory}
            aircraft={aircraft}
          />
        </div>
      </main>

      {/* ─── MOBILE BOTTOM FILTER BAR (hidden on lg+) ───────────────── */}
      <nav className="flex-none lg:hidden bg-gray-800 border-t border-gray-700 px-4 pt-1 pb-2">
        <p className="text-[10px] font-bold text-gray-400 mb-1">Aircraft Filters</p>
        <div className="flex justify-between items-center">
          {([
            { id: 2,  src: 'https://justinw.uk/air/Light-Aircraft.png',   label: 'Light' },
            { id: 3,  src: 'https://justinw.uk/air/Small-Jets.png',         label: 'Small Jets' },
            { id: 4,  src: 'https://justinw.uk/air/Large-Commercial.png',   label: 'Large' },
            { id: 6,  src: 'https://justinw.uk/air/Heavy-Jets.png',         label: 'Heavy' },
            { id: 7,  src: 'https://justinw.uk/air/High-Performance.png',   label: 'Hi-Perf' },
            { id: 8,  src: 'https://justinw.uk/air/Helicopters.png',        label: 'Heli' },
            { id: 14, src: 'https://justinw.uk/air/UAVs-Drones.png',        label: 'UAV' },
          ] as const).map(cat => (
            <label key={cat.id} className="flex flex-row items-center gap-0.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledCategories.has(cat.id)}
                onChange={() => handleToggleCategory(cat.id)}
                className="w-3 h-3 accent-blue-500 cursor-pointer"
              />
              <img
                src={cat.src}
                alt={cat.label}
                className={`w-5 h-5 transition-opacity ${enabledCategories.has(cat.id) ? 'opacity-100' : 'opacity-25'}`}
              />
            </label>
          ))}
        </div>
      </nav>

      {/* ─── FOOTER (hidden on mobile to preserve space) ─────────────── */}
      <footer className="flex-none hidden md:block bg-gray-800 border-t border-gray-700 p-3">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between text-sm text-gray-400 gap-2">
          <div>
            <span className="font-medium">Data:</span> OpenSky Network • Cesium Ion • Google Maps
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span>Displaying {filteredAircraft.length}/{MAX_DISPLAY_COUNT} • Total: {total} aircraft</span>
            <span className="hidden sm:inline">•</span>
            <span>v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;