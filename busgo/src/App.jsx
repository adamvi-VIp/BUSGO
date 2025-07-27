import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { socket } from './components/ConnectionStatus';
import MessagesSection from './components/MessagesSection';
import ErrorsSection from './components/ErrorsSection';
import MapLocationTracker from './components/MapLocationTracker';
import BottomMenu from './components/BottomMenu';
import LoadingScreen from './components/LoadingScreen';
import iceIcon from './assets/ice.svg';
import stationBoxIcon from './assets/stationbox.png';
import SplashScreen from './components/SplashScreen';
import PWAInstallPrompt from './components/PWAInstallPrompt';

// --- Map Components ---
function MapViewUpdater({ center, zoom, shouldUpdate, programmaticMoveRef, setMapReady }) {
  const map = useMap();

  useEffect(() => {
    // On initial mount, invalidate the map's size to ensure it's rendered correctly.
    // This is a fix for a race condition on mobile devices where the map
    // may initialize before the viewport height is correctly calculated.
    if (map) {
      map.invalidateSize();
      if (setMapReady) setMapReady(true);
    }
  }, [map, setMapReady]);

  useEffect(() => {
    if (center && shouldUpdate) {
      if (programmaticMoveRef) programmaticMoveRef.current = true;
      console.log('[MAP] Moving camera to:', center);
      map.flyTo(center, zoom, {
        duration: 1,
        easeLinearity: 0.25
      });
    }
  }, [shouldUpdate, center, zoom, map, programmaticMoveRef]);
  return null;
}

const AppMap = React.memo(({ stops, userLocation, onStopSelect, selectedStop, socket, isRefreshing, shouldUpdateCamera, programmaticMoveRef, setMapReady, stationBoxLoaded }) => {
    const mapPosition = userLocation
        ? [userLocation.latitude, userLocation.longitude]
        : [50.0755, 14.4378]; // Prague center fallback

    const centerPosition = selectedStop && selectedStop.lat !== undefined && selectedStop.lon !== undefined && !isNaN(selectedStop.lat) && !isNaN(selectedStop.lon)
        ? [selectedStop.lat, selectedStop.lon]
        : mapPosition;

    const [localShouldUpdateCamera, setLocalShouldUpdateCamera] = useState(false);
    const [visibleStops, setVisibleStops] = useState(stops);
    const mapRef = useRef();

    useEffect(() => {
        setVisibleStops(stops); // Reset visible stops when stops change
    }, [stops]);

    // Update visible stops based on map bounds
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        const updateVisibleStops = () => {
            const bounds = map.getBounds();
            setVisibleStops(
                stops.filter(stop =>
                    stop.lat && stop.lon && bounds.contains([stop.lat, stop.lon])
                )
            );
        };
        map.on('moveend', updateVisibleStops);
        updateVisibleStops();
        return () => map.off('moveend', updateVisibleStops);
    }, [stops]);

    useEffect(() => {
        if (selectedStop) {
            console.log('[MAP] Stop selected, moving camera to:', selectedStop.name);
            setLocalShouldUpdateCamera(true);
            setTimeout(() => setLocalShouldUpdateCamera(false), 100);
        }
    }, [selectedStop?.gtfsId]);
    
    useEffect(() => {
        if (isRefreshing && userLocation) {
            console.log('[MAP] Refresh clicked, moving camera to user location');
            setLocalShouldUpdateCamera(true);
            setTimeout(() => setLocalShouldUpdateCamera(false), 100);
        }
    }, [isRefreshing, userLocation]);
    
    useEffect(() => {
        if (shouldUpdateCamera && userLocation) {
            console.log('[MAP] Moving camera to user location on app start');
            setLocalShouldUpdateCamera(true);
            setTimeout(() => setLocalShouldUpdateCamera(false), 100);
        }
    }, [shouldUpdateCamera, userLocation]);

    useEffect(() => {
        console.log('AppMap rendering with position:', centerPosition, 'stops:', stops.length, 'userLocation:', userLocation, 'selectedStop:', selectedStop?.name);
    }, [stops.length, selectedStop?.gtfsId, userLocation, centerPosition]);

    return (
        <div className="absolute inset-0 z-0 h-full w-full">
            <MapContainer
                center={centerPosition}
                zoom={selectedStop ? 16 : 16}
                scrollWheelZoom={true}
                zoomControl={false}
                style={{ height: '100%', width: '100%' }}
                attributionControl={false}
                whenCreated={mapInstance => { mapRef.current = mapInstance; }}
            >
                <MapViewUpdater center={centerPosition} zoom={selectedStop ? 16 : 16} shouldUpdate={localShouldUpdateCamera} programmaticMoveRef={programmaticMoveRef} setMapReady={setMapReady} />
                <MapLocationTracker socket={socket} programmaticMoveRef={programmaticMoveRef} />
                <TileLayer
                    attribution=""
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {visibleStops.map(stop => (
                    (stop.lat && stop.lon) && (
                        <Marker
                            key={stop.uniqueStopPointId}
                            position={[stop.lat, stop.lon]}
                            icon={L.divIcon({
                                className: `custom-stop-marker ${selectedStop && selectedStop.gtfsId === stop.gtfsId ? 'opacity-50' : ''}`,
                                html: `
                                    <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
                                        <img src='${stationBoxIcon}' alt='Station' style="width: 34px; height: 34px; display: block; opacity: 1;" />
                                        ${stationBoxLoaded ? `<span style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: white; text-shadow: 0 1px 4px rgba(0,0,0,0.7); pointer-events: none;">${stop.platform || 'P'}</span>` : ''}
                                    </div>
                                `,
                                iconSize: [34, 34],
                                iconAnchor: [17, 17]
                            })}
                            eventHandlers={{
                                click: () => {
                                    if (onStopSelect && typeof onStopSelect === 'function' && (!selectedStop || selectedStop.gtfsId !== stop.gtfsId)) {
                                        onStopSelect(stop);
                                    }
                                }
                            }}
                        />
                    )
                ))}
                {userLocation && (
                    <Marker
                        position={[userLocation.latitude, userLocation.longitude]}
                        icon={L.divIcon({
                            className: 'custom-user-marker',
                            html: `
                                <div class="relative">
                                    <div class="w-3 h-3 bg-blue-500 rounded-full animate-ping absolute inset-0"></div>
                                    <div class="w-3 h-3 bg-blue-500 rounded-full relative z-10"></div>
                                </div>
                            `,
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })}
                    />
                )}
            </MapContainer>
        </div>
    );
});

// --- Arrival Component (for the modal) ---
const Arrival = ({ arrival }) => {
    const { route, trip, departure_timestamp } = arrival;
    const [remainingTime, setRemainingTime] = useState(null);

    useEffect(() => {
        let departureTimestamp = departure_timestamp?.predicted ||
                               departure_timestamp?.scheduled;
        
        if (!departureTimestamp) {
            setRemainingTime(null);
            return;
        }
        
        const calculateRemaining = () => {
            let arrivalTime;
            
            if (typeof departureTimestamp === 'string') {
                const parsed = new Date(departureTimestamp);
                if (isNaN(parsed.getTime())) {
                    const unixTimestamp = parseInt(departureTimestamp);
                    if (!isNaN(unixTimestamp)) {
                        arrivalTime = unixTimestamp * 1000;
                    } else {
                        console.error('Cannot parse timestamp string:', departureTimestamp);
                        setRemainingTime(null);
                        return;
                    }
                } else {
                    arrivalTime = parsed.getTime();
                }
            } else if (typeof departureTimestamp === 'number') {
                if (departureTimestamp < 1000000000000) {
                    arrivalTime = departureTimestamp * 1000;
                } else {
                    arrivalTime = departureTimestamp;
                }
            } else {
                console.error('Unknown timestamp format:', departureTimestamp);
                setRemainingTime(null);
                return;
            }
            
            const now = Date.now();
            setRemainingTime(Math.max(0, arrivalTime - now));
        };
        calculateRemaining();
        const interval = setInterval(calculateRemaining, 1000);
        return () => clearInterval(interval);
    }, [departure_timestamp]);

    const formatRemainingTime = (ms) => {
        if (ms === null) return 'N/A';
        if (ms <= 0) return '';
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    };

    const formatDelay = (delayInSeconds) => {
        if (delayInSeconds === null || delayInSeconds === undefined) {
            return null;
        }
        
        const minutes = Math.floor(Math.abs(delayInSeconds) / 60);
        const seconds = Math.abs(delayInSeconds) % 60;
        
        if (delayInSeconds > 0) {
            return `+${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else if (delayInSeconds < 0) {
            return `-${minutes}:${seconds.toString().padStart(2, '0')}`;
        } else {
            return `00:00`;
        }
    };

    const delayString = formatDelay(arrival?.delay?.seconds);
    const isDeparting = remainingTime !== null && remainingTime <= 60000 && remainingTime > 0;
    
    const getDelayColor = (delayInSeconds) => {
        if (delayInSeconds === null || delayInSeconds === undefined) return '';
        if (delayInSeconds === 0) return 'text-green-400';
        if (delayInSeconds > 0) return 'text-orange-400';
        if (delayInSeconds < 0) return 'text-blue-400';
        return '';
    };
    
    const delayColor = getDelayColor(arrival?.delay?.seconds);

    // In Arrival component, only render the time if it is not null and not 'N/A'.
    const formattedTime = formatRemainingTime(remainingTime);

    return (
        <div className={`flex justify-between items-center p-3 mb-2 rounded-lg border-b border-gray-800 transition-all duration-300 overflow-x-hidden -ml-1`}>
            <div className="flex items-center gap-4 mb-1 min-w-0">
                <span className="px-[10px] py-1 rounded-md font-bold text-center text-sm shadow-md flex-shrink-0 bg-yellow-500 text-black">
                    {route.short_name}
                </span>
                <div className="flex-1 min-w-0">
                    <span className="font-medium text-white break-words block whitespace-normal">
                        {trip.headsign}
                    </span>
                    {delayString && (
                        <div className="text-sm text-gray-400 flex items-center gap-2 mt-0">
                            <span className={`font-semibold ${delayColor}`}>{delayString}</span>
                            <img
                                src={iceIcon}
                                alt="Air Conditioning"
                                className={`w-4 h-4 ${trip.is_air_conditioned ? 'ice-icon-ac' : 'ice-icon-no-ac'}`}
                            />
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-lg font-bold text-right ${isDeparting ? 'text-orange-400 animate-pulse' : 'text-white'} mr-1`}
                >
                    {formattedTime !== 'N/A' && formattedTime !== null ? formattedTime : ''}
                </span>
            </div>
        </div>
    );
};

// --- Stop Modal Component ---
const StopModal = ({ stop, onClose, realTimeData, isLoadingRealTime, error }) => {
    const { name, platform, zone, wheelchairAccess } = stop;

    const getWheelchairAccessText = (access) => {
        if (access === 1) return "♿ Accessible";
        if (access === 2) return "⛔ Not Accessible";
        switch (String(access).toLowerCase()) {
            case 'accessible': case 'yes': return "♿ Accessible";
            case 'not_accessible': case 'no': return "⛔ Not Accessible";
            default: return "♿ No Info";
        }
    };

    const hasDepartures = realTimeData && realTimeData.departures && realTimeData.departures.length > 0;

    // In StopModal, add a state and effect to force a re-render every second so the departures list is always up to date
    const [now, setNow] = React.useState(Date.now());
    React.useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <div className="fixed top-2 left-1/2 transform -translate-x-1/2 z-[60] w-full max-w-3xl mx-auto px-2 sm:px-4" style={{ pointerEvents: 'auto' }}>
                <div className="bg-background-secondary rounded-2xl shadow-2xl border border-gray-700/50 animate-slide-up overflow-hidden"
                    style={{
                        maxHeight: 'calc(100vh - 160px)', // 220px bottom menu + 40px gap
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <header className="flex items-center justify-between p-4 border-b border-gray-700/50 flex-shrink-0">
                        <div className="flex-1">
                            <h2 className="m-0 text-lg font-semibold text-white truncate">{name}</h2>
                            <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                <span>Platform {platform || 'N/A'}</span>
                                <span>Zone {zone}</span>
                                <span>{getWheelchairAccessText(wheelchairAccess)}</span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="bg-red-600/80 hover:bg-red-700/90 border border-red-400/60 rounded-xl text-white hover:text-white w-8 h-8 flex items-center justify-center cursor-pointer transition-all duration-200 ease-in-out hover:scale-105 active:scale-95 flex-shrink-0 ml-3 group focus:outline-none focus:ring-2 focus:ring-red-400"
                            aria-label="Close modal"
                        >
                            <svg className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </header>

                    {/* Only this div scrolls */}
                    <div className="overflow-y-auto p-4 flex-1" style={{ maxHeight: 'calc(100vh - 340px)' }}>
                        {isLoadingRealTime && !realTimeData && <LoadingScreen />}
                        {error && <div className="text-center text-red-400 p-4 bg-red-500/10 rounded-xl text-sm">{error.error}</div>}
                        {realTimeData && (
                            hasDepartures ? (
                                // Group by line and only show the next future departure for each line
                                Object.values(
                                    realTimeData.departures
                                        .filter(arrival => {
                                            // Calculate remaining time for each arrival
                                            const departureTimestamp = arrival.departure_timestamp?.predicted || arrival.departure_timestamp?.scheduled;
                                            let arrivalTime;
                                            if (typeof departureTimestamp === 'string') {
                                                const parsed = new Date(departureTimestamp);
                                                if (!isNaN(parsed.getTime())) {
                                                    arrivalTime = parsed.getTime();
                                                } else {
                                                    const unixTimestamp = parseInt(departureTimestamp);
                                                    if (!isNaN(unixTimestamp)) {
                                                        arrivalTime = unixTimestamp * 1000;
                                                    } else {
                                                        return false;
                                                    }
                                                }
                                            } else if (typeof departureTimestamp === 'number') {
                                                if (departureTimestamp < 1000000000000) {
                                                    arrivalTime = departureTimestamp * 1000;
                                                } else {
                                                    arrivalTime = departureTimestamp;
                                                }
                                            } else {
                                                return false;
                                            }
                                            return arrivalTime - now > 0;
                                        })
                                        .reduce((acc, arrival) => {
                                            const line = arrival.route?.short_name || 'Unknown';
                                            if (!acc[line]) {
                                                acc[line] = arrival;
                                            } else {
                                                // Only keep the soonest
                                                const aTime = new Date(acc[line].departure_timestamp?.predicted || acc[line].departure_timestamp?.scheduled).getTime();
                                                const bTime = new Date(arrival.departure_timestamp?.predicted || arrival.departure_timestamp?.scheduled).getTime();
                                                if (bTime < aTime) acc[line] = arrival;
                                            }
                                            return acc;
                                        }, {}))
                                    .map((arrival, index) => (
                                        <Arrival key={arrival.trip.id || index} arrival={arrival} />
                                    ))
                            ) : (
                                <p className="text-center text-gray-500 p-6 text-sm">No departures scheduled.</p>
                            )
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};


// --- Main App Component ---
function App() {
    // State for stops in the bottom menu (from initial load or search)
    const [bottomMenuStops, setBottomMenuStops] = useState([]);
    // State for all stops to be displayed on the map
    const [mapStops, setMapStops] = useState([]);

    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedStop, setSelectedStop] = useState(() => {
        // Restore selected stop from sessionStorage if available
        try {
            const stored = sessionStorage.getItem('selectedStop');
            return stored ? JSON.parse(stored) : null;
        } catch {
            return null;
        }
    });
    const [realTimeData, setRealTimeData] = useState(null);
    const [isLoadingRealTime, setIsLoadingRealTime] = useState(false);
    const [messages, setMessages] = useState([]);
    const [errors, setErrors] = useState([]);
    const [userLocation, setUserLocation] = useState(null);
    const [locationPermissionStatus, setLocationPermissionStatus] = useState('pending'); // 'pending', 'granted', 'denied'
    const [isPanelExpanded, setIsPanelExpanded] = useState(false);
    const [shouldUpdateCamera, setShouldUpdateCamera] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLayoutReady, setIsLayoutReady] = useState(false); // New state for layout readiness

    // PWA Install Prompt state
    const [showPWAInstall, setShowPWAInstall] = useState(false);
    const [pwaPromptDismissed, setPwaPromptDismissed] = useState(false);

    // SplashScreen loading state
    const [mapReady, _setMapReady] = useState(false);
    const [locationReady, _setLocationReady] = useState(false);
    const [stationsReady, _setStationsReady] = useState(false);
    const [showSplash, setShowSplash] = useState(true);
    const mapReadyRef = useRef(false);
    const locationReadyRef = useRef(false);
    const stationsReadyRef = useRef(false);
    const setMapReady = (val) => {
        if (val && !mapReadyRef.current) {
            mapReadyRef.current = true;
            _setMapReady(true);
        } else if (!val) {
            console.warn('Attempted to set mapReady to false, ignored.');
        }
    };
    const setLocationReady = (val) => {
        if (val && !locationReadyRef.current) {
            locationReadyRef.current = true;
            _setLocationReady(true);
        } else if (!val) {
            console.warn('Attempted to set locationReady to false, ignored.');
        }
    };
    const setStationsReady = (val) => {
        if (val && !stationsReadyRef.current) {
            stationsReadyRef.current = true;
            _setStationsReady(true);
        } else if (!val) {
            console.warn('Attempted to set stationsReady to false, ignored.');
        }
    };

    // Calculate progress: 0, 33, 66, 100
    const progress = (mapReady + locationReady + stationsReady) / 3 * 100;

    // Hide splash when all are ready
    useEffect(() => {
        if (mapReady && locationReady && stationsReady) {
            setTimeout(() => setShowSplash(false), 500); // fade out
        }
    }, [mapReady, locationReady, stationsReady]);

    // Add state to track if stationBoxIcon is loaded
    const [stationBoxLoaded, setStationBoxLoaded] = useState(false);

    useEffect(() => {
      const img = new window.Image();
      img.src = stationBoxIcon;
      img.onload = () => setStationBoxLoaded(true);
    }, []);

    // Pass setMapReady to AppMap so it can call when map is ready
    // Pass setLocationReady to location logic
    // Pass setStationsReady to stops logic

    const debounceTimeout = useRef(null);
    const hasFetchedForLocation = useRef(false);
    const selectedStopRef = useRef(null);
    const menuScrollRef = useRef(null);
    const programmaticMoveRef = useRef(false);
    const hasEmittedDefaultRef = useRef(false);
    const departureTimeoutRef = useRef(null);
    const lastRequestedStopIdRef = useRef(null);

    // Add a function to request the latest data for the monitored station
    const requestLatestMonitoredStation = useCallback(() => {
        try {
            const stored = sessionStorage.getItem('selectedStop');
            if (stored) {
                const stop = JSON.parse(stored);
                if (stop && stop.gtfsId) {
                    // Only prevent duplicate emits if we're currently loading for this station
                    if (lastRequestedStopIdRef.current === stop.gtfsId && isLoadingRealTime) return;
                    lastRequestedStopIdRef.current = stop.gtfsId;
                    setIsLoadingRealTime(true);
                    setRealTimeData(null);
                    console.log('[REOPEN] Requesting latest data for monitored station:', stop.name, stop.gtfsId);
                    socket.emit('requestDepartures', stop.gtfsId);
                    if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
                    departureTimeoutRef.current = setTimeout(() => {
                        if (isLoadingRealTime) {
                            setIsLoadingRealTime(false);
                            setErrors(prev => [...prev, 'Departure data loading timed out after reconnect. Please try again.']);
                        }
                    }, 10000);
                }
            }
        } catch (e) {
            // Ignore
        }
    }, [isLoadingRealTime]);

    // Reset lastRequestedStopIdRef on app start to ensure clean state
    useEffect(() => {
        lastRequestedStopIdRef.current = null;
    }, []);

    useEffect(() => {
        /**
         * Handles incoming stop data from the server.
         * This function now differentiates between data for the main list (bottom menu)
         * and data that should only be added to the map (from map movements).
         * * This relies on the backend echoing a 'source' property in the response,
         * which is set to 'map-movement' by the MapLocationTracker component.
         */
        const handleStopsData = (response) => {
            // Defensively check if the response is an array (old behavior)
            // or an object with a 'source' property (new behavior).
            const isObjectResponse = typeof response === 'object' && response !== null && !Array.isArray(response) && response.stops;
            
            const newStops = isObjectResponse ? response.stops : response;
            const source = isObjectResponse ? response.source : null;

            if (source === 'map-movement') {
                console.log('Received stops from map movement:', newStops.length);
                // Add new stops to existing map stops, avoiding duplicates.
                setMapStops(prevMapStops => {
                    const existingStopIds = new Set(prevMapStops.map(s => s.uniqueStopPointId));
                    const uniqueNewStops = (newStops || []).filter(s => !existingStopIds.has(s.uniqueStopPointId));
                    return [...prevMapStops, ...uniqueNewStops];
                });
                // Do NOT setStationsReady here
            } else { // This handles initial load, search, and manual refresh.
                console.log('Received stops for bottom menu:', newStops.length);
                let stopsData = newStops || [];
                // Sort stops by distance on the frontend
                if (Array.isArray(stopsData)) {
                    stopsData = stopsData.sort((a, b) => a.distance - b.distance);
                }
                setBottomMenuStops(stopsData);
                setMapStops(stopsData); // Reset map stops to match the main list.
                setIsLoading(false);
                setStationsReady(true); // stations loaded
            }
        };

        const handleDepartureData = (data) => {
            if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
            setRealTimeData(data);
            setIsLoadingRealTime(false);
        };
        const handleStopsError = (error) => {
            setErrors(prev => [...prev, error.error || 'Failed to fetch stops.']);
            setIsLoading(false);
        };
        const handleDepartureError = (error) => {
            if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
            setErrors(prev => [...prev, error.error || `Failed to get real-time data.`]);
            setIsLoadingRealTime(false);
        };

        socket.on('stopsData', handleStopsData);
        socket.on('stopsError', handleStopsError);
        socket.on('departureData', handleDepartureData);
        socket.on('departureError', handleDepartureError);

        return () => {
            socket.off('stopsData', handleStopsData);
            socket.off('stopsError', handleStopsError);
            socket.off('departureData', handleDepartureData);
            socket.off('departureError', handleDepartureError);
        };
    }, []);

    useEffect(() => {
        let hasEmittedInitialStops = false;
        function emitInitialStops(payload) {
            if (!hasEmittedInitialStops) {
                console.log('Emitting searchStops from App.jsx', payload);
                socket.emit('searchStops', payload);
                hasEmittedInitialStops = true;
            }
        }
        if (navigator.geolocation && !hasFetchedForLocation.current) {
            hasFetchedForLocation.current = true;
            console.log('[INIT] Fetching location and stops...');
            // Check location permission status first
            navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => {
                setLocationPermissionStatus(permissionStatus.state);
                if (permissionStatus.state === 'denied') {
                    // Permission already denied, use default location
                    console.log('[INIT] Location permission already denied, using default location');
                    setIsLoading(false);
                    setErrors(prev => [...prev, "Location access denied. Using default location."]);
                    emitInitialStops({ timestamp: Date.now() });
                    setLocationReady(true);
                    setLocationPermissionStatus('denied');
                } else {
                    // Try to get location
                    navigator.geolocation.getCurrentPosition(position => {
                        const { latitude, longitude } = position.coords;
                        setUserLocation({ latitude, longitude });
                        emitInitialStops({ lat: latitude, lon: longitude, timestamp: Date.now() });
                        setShouldUpdateCamera(true);
                        setTimeout(() => setShouldUpdateCamera(false), 100);
                        setLocationReady(true);
                        setLocationPermissionStatus('granted');
                    }, (error) => {
                        console.log('[INIT] Location access denied:', error.message);
                        setIsLoading(false);
                        setErrors(prev => [...prev, "Location access denied. Using default location."]);
                        emitInitialStops({ timestamp: Date.now() });
                        setLocationReady(true);
                        setLocationPermissionStatus('denied');
                    }, {
                        timeout: 10000, // 10 second timeout
                        enableHighAccuracy: false,
                        maximumAge: 60000 // 1 minute cache
                    });
                }
            }).catch(() => {
                // Fallback for browsers that don't support permissions API
                navigator.geolocation.getCurrentPosition(position => {
                    const { latitude, longitude } = position.coords;
                    setUserLocation({ latitude, longitude });
                    emitInitialStops({ lat: latitude, lon: longitude, timestamp: Date.now() });
                    setShouldUpdateCamera(true);
                    setTimeout(() => setShouldUpdateCamera(false), 100);
                    setLocationReady(true);
                    setLocationPermissionStatus('granted');
                }, (error) => {
                    console.log('[INIT] Location access denied:', error.message);
                    setIsLoading(false);
                    setErrors(prev => [...prev, "Location access denied. Using default location."]);
                    emitInitialStops({ timestamp: Date.now() });
                    setLocationReady(true);
                    setLocationPermissionStatus('denied');
                }, {
                    timeout: 10000,
                    enableHighAccuracy: false,
                    maximumAge: 60000
                });
            });
        } else if (!navigator.geolocation) {
            // Browser doesn't support geolocation
            console.log('[INIT] Geolocation not supported, using default location');
            setIsLoading(false);
            setLocationReady(true);
            setLocationPermissionStatus('denied');
        }
    }, []);

    // Persist selectedStop in sessionStorage
    useEffect(() => {
        if (selectedStop) {
            sessionStorage.setItem('selectedStop', JSON.stringify(selectedStop));
        } else {
            sessionStorage.removeItem('selectedStop');
        }
    }, [selectedStop]);

    // Robust reconnection and visibility handling
    useEffect(() => {
        let isReconnecting = false;
        let lastRequestTime = 0;
        
        // Helper to re-request stops and departures
        const reRequestData = () => {
            const now = Date.now();
            if (isReconnecting || (now - lastRequestTime) < 2000) return; // Prevent duplicate requests within 2 seconds
            isReconnecting = true;
            lastRequestTime = now;
            
            console.log('[RECONNECT] Requesting data...');
            
            // Preserve current search state on reconnect
            if (searchTerm && searchTerm.length > 0) {
                console.log('Emitting searchStops from App.jsx', { query: searchTerm, timestamp: Date.now() });
                socket.emit('searchStops', { query: searchTerm, timestamp: Date.now() });
            } else {
                // Show nearby stations (location or default)
                if (userLocation && locationPermissionStatus === 'granted') {
                    if (!hasEmittedDefaultRef.current) {
                        console.log('Emitting searchStops from App.jsx', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                        socket.emit('searchStops', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                        hasEmittedDefaultRef.current = true;
                    }
                } else if (locationPermissionStatus === 'denied') {
                    if (!hasEmittedDefaultRef.current) {
                        console.log('Emitting searchStops from App.jsx', { timestamp: Date.now() });
                        socket.emit('searchStops', { timestamp: Date.now() });
                        hasEmittedDefaultRef.current = true;
                    }
                }
                // If locationPermissionStatus is still 'pending', don't request anything yet
            }
            // If a stop is selected, re-monitor it
            if (
                selectedStop &&
                lastRequestedStopIdRef.current !== selectedStop.gtfsId
            ) {
                socket.emit('requestDepartures', selectedStop.gtfsId);
                lastRequestedStopIdRef.current = selectedStop.gtfsId;
                setIsLoadingRealTime(true);
                setRealTimeData(null);
                if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
                departureTimeoutRef.current = setTimeout(() => {
                    if (isLoadingRealTime) {
                        setIsLoadingRealTime(false);
                        setErrors(prev => [...prev, 'Departure data loading timed out after reconnect. Please try again.']);
                    }
                }, 10000);
            }
            
            // Reset flag after a delay
            setTimeout(() => {
                isReconnecting = false;
            }, 2000);
        };
        
        // On socket reconnect
        const onConnect = () => {
            reRequestData();
        };
        socket.on('connect', onConnect);
        
        // On tab visibility
        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                reRequestData();
                requestLatestMonitoredStation();
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        
        // On mount, if selectedStop exists, re-monitor it (in case of reload)
        if (
            selectedStop &&
            lastRequestedStopIdRef.current !== selectedStop.gtfsId
        ) {
            socket.emit('requestDepartures', selectedStop.gtfsId);
            lastRequestedStopIdRef.current = selectedStop.gtfsId;
            setIsLoadingRealTime(true);
            setRealTimeData(null);
            if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
            departureTimeoutRef.current = setTimeout(() => {
                if (isLoadingRealTime) {
                    setIsLoadingRealTime(false);
                    setErrors(prev => [...prev, 'Departure data loading timed out after reconnect. Please try again.']);
                }
            }, 10000);
        }
        
        return () => {
            socket.off('connect', onConnect);
            document.removeEventListener('visibilitychange', onVisibility);
        };
            }, [userLocation, searchTerm, locationPermissionStatus, selectedStop, requestLatestMonitoredStation]); // Added locationPermissionStatus to dependencies

    const handleSearchChange = useCallback((event) => {
        const newSearchTerm = event.target.value;
        setSearchTerm(newSearchTerm);
        
        if (selectedStop) {
            socket.emit('stopDepartureMonitoring', selectedStop.gtfsId);
            setSelectedStop(null);
        }
        
        setIsPanelExpanded(newSearchTerm.length > 0);

        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

        debounceTimeout.current = setTimeout(() => {
            setIsLoading(true);
            if (newSearchTerm.length > 0) {
                 console.log('Emitting searchStops from App.jsx', { query: newSearchTerm, timestamp: Date.now() });
                 socket.emit('searchStops', { query: newSearchTerm, timestamp: Date.now() });
            } else {
                if (userLocation && locationPermissionStatus === 'granted') {
                    if (!hasEmittedDefaultRef.current) {
                        console.log('Emitting searchStops from App.jsx', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                        socket.emit('searchStops', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                        hasEmittedDefaultRef.current = true;
                    }
                } else if (locationPermissionStatus === 'denied') {
                    if (!hasEmittedDefaultRef.current) {
                        console.log('Emitting searchStops from App.jsx', { timestamp: Date.now() });
                        socket.emit('searchStops', { timestamp: Date.now() });
                        hasEmittedDefaultRef.current = true;
                    }
                }
                // If locationPermissionStatus is still 'pending', don't request anything yet
            }
        }, 300);
            }, [selectedStop, userLocation, locationPermissionStatus]);

    const handleStopSelect = (stop) => {
        // Prevent duplicate requests for the same stop only if we're not in a loading state
        if (selectedStop && selectedStop.gtfsId === stop.gtfsId && !isLoadingRealTime) {
            return;
        }
        
        if (selectedStop && selectedStop.gtfsId !== stop.gtfsId) {
            socket.emit('stopDepartureMonitoring', selectedStop.gtfsId);
        }
        setSelectedStop(stop);
        setIsPanelExpanded(false);
        setIsLoadingRealTime(true);
        setRealTimeData(null);
        socket.emit('requestDepartures', stop.gtfsId);
        lastRequestedStopIdRef.current = stop.gtfsId;
        if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
        departureTimeoutRef.current = setTimeout(() => {
            if (isLoadingRealTime) {
                setIsLoadingRealTime(false);
                setErrors(prev => [...prev, 'Departure data loading timed out. Please try again.']);
            }
        }, 10000);
        // Persist selected stop immediately
        sessionStorage.setItem('selectedStop', JSON.stringify(stop));
        setTimeout(() => {
            if (selectedStopRef.current && menuScrollRef.current) {
                const container = menuScrollRef.current;
                const element = selectedStopRef.current;
                const scrollTop = element.offsetTop - container.offsetTop;
                container.scrollTo({
                    top: scrollTop,
                    behavior: 'smooth'
                });
            }
        }, 100);
    };
    
    const handleCloseModal = () => {
        if (selectedStop) {
            socket.emit('stopDepartureMonitoring', selectedStop.gtfsId);
        }
        setSelectedStop(null);
        setRealTimeData(null);
        lastRequestedStopIdRef.current = null; // Reset the last requested stop ID
        // Remove from sessionStorage
        sessionStorage.removeItem('selectedStop');
    };

    const removeError = (index) => {
        setErrors(errors.filter((_, i) => i !== index));
    };

    const forceRefresh = () => {
        setBottomMenuStops([]);
        setMapStops([]);
        setSearchTerm('');
        setIsPanelExpanded(false);
        setIsLoading(true);
        hasFetchedForLocation.current = false; // Reset to allow re-fetching on next load
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ latitude, longitude });
                setLocationPermissionStatus('granted');
                console.log('Emitting searchStops from App.jsx', { lat: latitude, lon: longitude, timestamp: Date.now() });
                socket.emit('searchStops', { lat: latitude, lon: longitude, timestamp: Date.now() });
            }, (error) => {
                console.log('[REFRESH] Location access denied:', error.message);
                setIsLoading(false);
                setErrors(prev => [...prev, "Location access denied. Using default location."]);
                setLocationPermissionStatus('denied');
                console.log('Emitting searchStops from App.jsx', { timestamp: Date.now() });
                socket.emit('searchStops', { timestamp: Date.now() });
            }, {
                timeout: 10000,
                enableHighAccuracy: false,
                maximumAge: 60000
            });
        } else {
            console.log('[REFRESH] Geolocation not supported, using default location');
            setLocationPermissionStatus('denied');
            console.log('Emitting searchStops from App.jsx', { timestamp: Date.now() });
            socket.emit('searchStops', { timestamp: Date.now() });
        }
    };

    const handleRefreshClick = () => {
        setIsRefreshing(true);
        forceRefresh();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    // Mobile 100vh fix and layout readiness
    useEffect(() => {
        function setVh() {
            document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        }
        setVh();
        setIsLayoutReady(true);
        window.addEventListener('resize', setVh);
        window.addEventListener('orientationchange', setVh);
        return () => {
            window.removeEventListener('resize', setVh);
            window.removeEventListener('orientationchange', setVh);
        };
    }, []);

    // Detect standalone mode once at render
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
      window.navigator.standalone === true;

    // This check is now more reliable because the native code injects the variable.
    const isAndroidApp = !!window.IS_ANDROID_APP;

    // Show PWA install prompt when not in standalone mode and not in Android app
    useEffect(() => {
        if (!isStandalone && !isAndroidApp && !showPWAInstall && !pwaPromptDismissed) {
            // Show the prompt immediately when app loads
            setShowPWAInstall(true);
        }
    }, [isStandalone, isAndroidApp, showPWAInstall, pwaPromptDismissed]);

    // Persistent station modal memory
    const STATION_CACHE_KEY = 'lastOpenedStation';
    const STATION_CACHE_MAX_AGE = 10 * 60 * 1000; // 30 minutes in ms

    // On mount, restore station if timestamp is recent
    useEffect(() => {
        try {
            const cached = localStorage.getItem(STATION_CACHE_KEY);
            if (cached) {
                const { stop, openedAt } = JSON.parse(cached);
                if (stop && openedAt && Date.now() - openedAt < STATION_CACHE_MAX_AGE) {
                    setSelectedStop(stop);
                    // Fetch stops around user's location (if available)
                    const isValidLatLon = stop.lat !== undefined && stop.lon !== undefined && !isNaN(stop.lat) && !isNaN(stop.lon);
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(position => {
                            const { latitude, longitude } = position.coords;
                            setUserLocation({ latitude, longitude });
                            socket.emit('searchStops', { lat: latitude, lon: longitude, timestamp: Date.now() });
                            // After user's location, also search around the cached stop if valid
                            if (isValidLatLon) {
                                setTimeout(() => {
                                    socket.emit('searchStops', { lat: stop.lat, lon: stop.lon, timestamp: Date.now(), source: 'map-movement' });
                                }, 500);
                            }
                        }, () => {
                            // If location fails, search around default location, then cached stop if valid
                            const DEFAULT_LAT = 50.0874654;
                            const DEFAULT_LON = 14.4212535;
                            socket.emit('searchStops', { lat: DEFAULT_LAT, lon: DEFAULT_LON, timestamp: Date.now() });
                            if (isValidLatLon) {
                                setTimeout(() => {
                                    socket.emit('searchStops', { lat: stop.lat, lon: stop.lon, timestamp: Date.now(), source: 'map-movement' });
                                }, 500);
                            }
                        });
                    } else {
                        // No geolocation support: search around default location, then cached stop if valid
                        const DEFAULT_LAT = 50.0874654;
                        const DEFAULT_LON = 14.4212535;
                        socket.emit('searchStops', { lat: DEFAULT_LAT, lon: DEFAULT_LON, timestamp: Date.now() });
                        if (isValidLatLon) {
                            setTimeout(() => {
                                socket.emit('searchStops', { lat: stop.lat, lon: stop.lon, timestamp: Date.now(), source: 'map-movement' });
                            }, 500);
                        }
                    }
                } else {
                    localStorage.removeItem(STATION_CACHE_KEY);
                }
            }
        } catch {}
    }, []);

    // When station modal is opened, cache with timestamp
    useEffect(() => {
        if (selectedStop) {
            localStorage.setItem(STATION_CACHE_KEY, JSON.stringify({ stop: selectedStop, openedAt: Date.now() }));
        } else {
            localStorage.removeItem(STATION_CACHE_KEY);
        }
    }, [selectedStop]);

    return (
        <div
            className={`relative${isStandalone ? ' pb-8' : ''}`}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                overflow: 'hidden',
                WebkitOverflowScrolling: 'touch',
                // Prevent iOS rubber banding
                overscrollBehavior: 'none',
                MozOverscrollBehavior: 'none',
                backgroundColor: '#0a0a0a', // Add the dark background color
            }}
        >
            <AppMap 
                stops={mapStops} 
                userLocation={userLocation} 
                onStopSelect={handleStopSelect} 
                selectedStop={selectedStop}
                socket={socket}
                isRefreshing={isRefreshing}
                shouldUpdateCamera={shouldUpdateCamera}
                programmaticMoveRef={programmaticMoveRef}
                setMapReady={setMapReady}
                stationBoxLoaded={stationBoxLoaded} // <-- pass as prop
            />

            <header
                className={`absolute top-0 left-0 w-full z-20 p-4 pointer-events-none${isAndroidApp ? ' mt-20' : ''}`}
                style={isAndroidApp ? { marginTop: 30 } : {}}
            >
                <div className="max-w-xl w-full mx-auto flex flex-col items-center gap-3 pointer-events-auto">
                    <h1 className="m-0 font-bold text-3xl text-white tracking-tighter font-onest" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.7)' }}>
                        BusGo
                    </h1>
                    <div className="relative w-full">
                        <input
                            type="text"
                            className={`w-full px-5 py-3 pr-12 text-base border border-gray-500/50 rounded-xl outline-none transition-all duration-300 ease-in-out glass-effect text-white font-inter font-normal placeholder-gray-400 focus:shadow-lg focus:border-cyan-400${isAndroidApp ? ' mt-4' : ''}`}
                            placeholder="Search for a station..."
                            value={searchTerm}
                            onChange={handleSearchChange}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setIsPanelExpanded(false);
                                    setIsLoading(true);
                                    if (userLocation) {
                                        console.log('Emitting searchStops from App.jsx', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                                        socket.emit('searchStops', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                                    } else {
                                        console.log('Emitting searchStops from App.jsx', { timestamp: Date.now() });
                                        socket.emit('searchStops', { timestamp: Date.now() });
                                    }
                                }}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors duration-200"
                                aria-label="Clear search"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <BottomMenu
                bottomMenuStops={bottomMenuStops}
                isLoading={isLoading}
                searchTerm={searchTerm}
                isPanelExpanded={isPanelExpanded}
                setIsPanelExpanded={setIsPanelExpanded}
                                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                selectedStop={selectedStop}
                handleStopSelect={handleStopSelect}
                handleRefreshClick={handleRefreshClick}
                isRefreshing={isRefreshing}
                userLocation={userLocation}
                isStandalone={isStandalone}
                selectedStopRef={selectedStopRef}
                menuScrollRef={menuScrollRef}
            />

            {selectedStop && (
                <StopModal
                    stop={selectedStop}
                    onClose={handleCloseModal}
                    realTimeData={realTimeData}
                    isLoadingRealTime={isLoadingRealTime}
                    error={errors.find(e => e.stopId === selectedStop.gtfsId)}
                />
            )}
            <MessagesSection messages={messages} />
            <ErrorsSection errors={errors.filter(e => !e.stopId)} removeError={removeError} />
            {/* PWA Install Prompt */}
            <PWAInstallPrompt 
                isVisible={showPWAInstall} 
                onClose={() => {
                    setShowPWAInstall(false);
                    setPwaPromptDismissed(true);
                }} 
            />
        </div>
    );
}

export default App;