import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from './components/ConnectionStatus';
import ErrorsSection from './components/ErrorsSection';
import BottomMenu from './components/BottomMenu';
import LoadingScreen from './components/LoadingScreen';
import iceIcon from './assets/ice.svg';
import SplashScreen from './components/SplashScreen';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import MapGL from './components/MapGL';
import VersionManager from './components/VersionManager';
import StandByMode from './components/StandByMode';


// --- Arrival Component (for the modal) ---
const Arrival = React.forwardRef(({ arrival, onDepartureClick, isActive }, ref) => {
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
        if (ms <= 0) return '00:00';
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

        const timeString = minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;

        if (delayInSeconds > 0) {
            return `+${timeString}`;
        } else if (delayInSeconds < 0) {
            return `-${timeString}`;
        } else {
            return `On time`;
        }
    };

    const delayString = formatDelay(arrival?.delay?.seconds);
    const isDeparting = remainingTime !== null && remainingTime <= 60000 && remainingTime >= -5000;

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
        <motion.div
            ref={ref}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
                layout: { type: 'spring', stiffness: 230, damping: 25, mass: 1 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 }
            }}
            onClick={() => onDepartureClick && onDepartureClick(arrival)}
            className={`flex justify-between items-center p-3 mb-2 rounded-lg border-b border-gray-800 overflow-x-hidden -ml-1 cursor-pointer hover:bg-white/5 active:bg-white/10 ${isActive ? 'bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)] ring-1 ring-cyan-500/30' : ''}`}
        >
            <div className="flex items-center gap-4 mb-1 min-w-0 flex-grow">
                <div className="flex flex-col items-center gap-1">
                    <span className="px-[10px] py-1 rounded-lg font-bold text-center text-base shadow-md flex-shrink-0 bg-yellow-500 text-black">
                        {route.short_name}
                    </span>
                    {isActive && (
                        <span
                            className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider animate-pulse"
                        >
                            Active
                        </span>
                    )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-white break-words block whitespace-normal truncate">
                            {trip.headsign}
                        </span>
                        <img
                            src={iceIcon}
                            alt="Air Conditioning"
                            className={`w-4 h-4 ${trip.is_air_conditioned ? 'ice-icon-ac' : 'ice-icon-no-ac'}`}
                        />
                    </div>

                    <div className="text-sm text-gray-400 flex items-center gap-2 mt-0.5">
                        {departure_timestamp?.scheduled && (() => {
                            const date = new Date(departure_timestamp.scheduled);
                            return !isNaN(date.getTime()) ? (
                                <span className="text-gray-300 font-bold tabular-nums">
                                    {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                            ) : null;
                        })()}
                        {delayString && (
                            <span className={`font-semibold ${delayColor}`}>{delayString}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 min-w-[70px] justify-end mr-2">
                <span
                    className={`text-lg font-bold text-right ${isDeparting ? 'text-orange-400 animate-pulse' : 'text-white'}`}
                >
                    {formattedTime !== 'N/A' && formattedTime !== null ? formattedTime : ''}
                </span>
            </div>
        </motion.div>
    );
});

// --- Stop Modal Component ---
const StopModal = ({ stop, onClose, realTimeData, isLoadingRealTime, error, onDepartureClick, activeTripId, setActiveTripId, setTripRouteStops }) => {
    const { name, platform, zone } = stop;

    // Sticky Focus State: remembers the "intended" active trip even if it disappears momentarily
    const [autoRefocusTripId, setAutoRefocusTripId] = React.useState(null);

    const hasDepartures = realTimeData && realTimeData.departures && realTimeData.departures.length > 0;

    // In StopModal, add a state and effect to force a re-render every second so the departures list is always up to date
    const [now, setNow] = React.useState(Date.now());
    React.useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Wrapper to intercept clicks and manage sticky state
    const handleDepartureClick = (arrival) => {
        if (arrival && arrival.trip) {
            if (activeTripId === arrival.trip.id) {
                // User explicitly toggled OFF - clear sticky state
                setAutoRefocusTripId(null);
            } else {
                // User explicitly toggled ON - set sticky state
                setAutoRefocusTripId(arrival.trip.id);
            }
        }
        // Call original prop
        if (onDepartureClick) onDepartureClick(arrival);
    };

    const processedDepartures = React.useMemo(() => {
        if (!realTimeData || !realTimeData.departures) return [];

        const filtered = realTimeData.departures
            .filter(arrival => {
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
                    arrivalTime = departureTimestamp < 1000000000000 ? departureTimestamp * 1000 : departureTimestamp;
                } else {
                    return false;
                }

                // --- STRICT FILTERING BY STATION LINE/DIRECTION ---
                const lineName = arrival.route?.short_name;
                const headsign = (arrival.trip?.headsign || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                const allowedLine = stop.lines?.find(l => String(l.name) === String(lineName));
                if (!allowedLine) return false;

                const d1 = (allowedLine.direction || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const d2 = (allowedLine.direction2 || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                const matchesDirection = headsign.includes(d1) || (d2 && headsign.includes(d2)) || d1.includes(headsign);
                if (!matchesDirection) return false;
                // ----------------------------------------------------

                const isThisActive = activeTripId === arrival.trip.id;
                // Threshold: -5s for instant switching (120s if active)
                const threshold = isThisActive ? -120000 : -5000;
                return arrivalTime - now > threshold;
            });

        // Group by line to show only the closest one per line
        const grouped = filtered.reduce((acc, arrival) => {
            const line = arrival.route?.short_name || 'Unknown';
            const isThisActive = activeTripId === arrival.trip.id;

            if (!acc[line]) {
                acc[line] = arrival;
            } else {
                if (isThisActive) {
                    acc[line] = arrival;
                } else if (activeTripId !== acc[line].trip.id) {
                    const aTime = new Date(acc[line].departure_timestamp?.predicted || acc[line].departure_timestamp?.scheduled).getTime();
                    const bTime = new Date(arrival.departure_timestamp?.predicted || arrival.departure_timestamp?.scheduled).getTime();
                    if (bTime < aTime) acc[line] = arrival;
                }
            }
            return acc;
        }, {});

        const sorted = Object.values(grouped)
            .sort((a, b) => {
                const aTime = new Date(a.departure_timestamp?.predicted || a.departure_timestamp?.scheduled).getTime();
                const bTime = new Date(b.departure_timestamp?.predicted || b.departure_timestamp?.scheduled).getTime();
                return aTime - bTime;
            });

        if (activeTripId) {
            return sorted.filter(d => d.trip.id === activeTripId);
        }
        return sorted;
    }, [realTimeData, activeTripId, now, stop.lines]);

    // Effect to clear active trip focus if it departs (or restore if it returns)
    React.useEffect(() => {
        if (!realTimeData || !realTimeData.departures) return;

        // Check if the currently active trip is still in the list
        const isActivePresent = activeTripId && processedDepartures.some(d => d.trip.id === activeTripId);

        if (activeTripId && !isActivePresent) {
            // It disappeared! Unfocus.
            setActiveTripId(null);
            if (setTripRouteStops) setTripRouteStops(null);
        } else if (!activeTripId && autoRefocusTripId) {
            // Nothing is focused, but we have a "Sticky" ID. Check if it's back in the list!
            const stickyTrip = processedDepartures.find(d => d.trip.id === autoRefocusTripId);
            if (stickyTrip) {
                console.log('Sticky Focus: Trip reappeared, restoring focus!', autoRefocusTripId);
                setActiveTripId(autoRefocusTripId);
                if (onDepartureClick) onDepartureClick(stickyTrip); // Trigger the path fetch
            }
        }
    }, [processedDepartures, activeTripId, setActiveTripId, setTripRouteStops, realTimeData, autoRefocusTripId, onDepartureClick]);

    return (
        <>
            <div className="fixed top-2 left-1/2 transform -translate-x-1/2 z-[60] w-full max-w-3xl mx-auto px-2 sm:px-4" style={{ pointerEvents: 'auto' }}>
                <motion.div
                    layout
                    transition={{
                        layout: { type: 'spring', stiffness: 230, damping: 25, mass: 1 }
                    }}
                    className="bg-background-secondary rounded-2xl shadow-2xl border border-gray-700/50 animate-slide-up overflow-hidden"
                    style={{
                        maxHeight: 'calc(100vh - 160px)', // 220px bottom menu + 40px gap
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <motion.header layout="position" className="flex items-center justify-between p-4 border-b border-gray-700/50 flex-shrink-0">
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <h2 className="m-0 text-lg font-semibold text-white truncate">{name}</h2>
                                {isLoadingRealTime && (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                                <span>Platform {platform || 'N/A'}</span>
                                <span>Zone {zone}</span>
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
                    </motion.header>

                    {/* Only this div scrolls */}
                    <div className={`${activeTripId ? 'overflow-y-hidden' : 'overflow-y-auto'} p-4 flex-1`} style={{ maxHeight: 'calc(100vh - 340px)' }}>
                        {error && <div className="text-center text-red-400 p-4 bg-red-500/10 rounded-xl text-sm">{error.error}</div>}
                        {realTimeData && (
                            processedDepartures.length > 0 ? (
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {processedDepartures.map((arrival) => (
                                        <Arrival
                                            key={arrival.route.short_name}
                                            arrival={arrival}
                                            onDepartureClick={handleDepartureClick}
                                            isActive={activeTripId === (arrival.trip.id)}
                                        />
                                    ))}
                                </AnimatePresence>
                            ) : (
                                !isLoadingRealTime && <p className="text-center text-gray-500 p-6 text-sm">No departures scheduled.</p>
                            )
                        )}
                    </div>
                </motion.div>
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
    const userLocationRef = useRef(null);
    // Add watcher id ref for continuous geolocation updates
    const geoWatchIdRef = useRef(null);
    const refreshInProgressRef = useRef(false);
    const initialMapSyncDoneRef = useRef(false);
    const [locationPermissionStatus, setLocationPermissionStatus] = useState('pending'); // 'pending', 'granted', 'denied'
    const [locationStatusDetail, setLocationStatusDetail] = useState('unknown'); // 'not_determined' | 'restricted' | 'denied' | 'authorized_when_in_use' | 'authorized_always' | 'temporary_limitation' | 'unknown'
    const [locationDecisionPending, setLocationDecisionPending] = useState(false);
    const locationDecisionPendingRef = useRef(false);
    const [isPanelExpanded, setIsPanelExpanded] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLayoutReady, setIsLayoutReady] = useState(false); // New state for layout readiness
    const [locationWaitRemainingSec, setLocationWaitRemainingSec] = useState(null);
    const [tripRouteStops, setTripRouteStops] = useState(null); // Array of stop IDs or null
    const [activeTripId, setActiveTripId] = useState(null); // ID of the currently selected bus trip

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

    // Pass setMapReady to AppMap so it can call when map is ready
    // Pass setLocationReady to location logic
    // Pass setStationsReady to stops logic

    const debounceTimeout = useRef(null);
    const hasFetchedForLocation = useRef(false);
    const permissionCheckIntervalRef = useRef(null);
    const permissionChecksRef = useRef(0);
    const denialConfirmRef = useRef(0);
    const waitTimeoutRef = useRef(null);
    const waitCountdownIntervalRef = useRef(null);
    const waitDeadlineRef = useRef(null);
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
                    // if (lastRequestedStopIdRef.current === stop.gtfsId && isLoadingRealTime) return; // Allow re-request to refresh
                    lastRequestedStopIdRef.current = stop.gtfsId;
                    setIsLoadingRealTime(true);
                    // DO NOT clear realTimeData here to prevent flashing
                    // setRealTimeData(null); 
                    console.log('[REOPEN] Requesting latest data for monitored station:', stop.name, stop.gtfsId);
                    socket.emit('requestDepartures', stop.gtfsId);
                    if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
                    departureTimeoutRef.current = setTimeout(() => {
                        if (isLoadingRealTime) {
                            setIsLoadingRealTime(false);
                            // Do not show error if we have stale data, just stop loading
                            // setErrors(prev => [...prev, 'Departure data loading timed out after reconnect. Please try again.']);
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

            if (source === 'map-movement' || source === 'periodic' || source === 'movement') {
                console.log(`Received stops for map update [${source}]:`, (newStops || []).length);
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
                if (refreshInProgressRef.current) {
                    // Merge refreshed results into map stops rather than replacing
                    setMapStops(prevMapStops => {
                        const existingStopIds = new Set(prevMapStops.map(s => s.uniqueStopPointId));
                        const uniqueNewStops = (stopsData || []).filter(s => !existingStopIds.has(s.uniqueStopPointId));
                        return [...prevMapStops, ...uniqueNewStops];
                    });
                    refreshInProgressRef.current = false;
                } else if (!initialMapSyncDoneRef.current) {
                    // One-time initial sync: ensure nearby stops are visible on first render
                    setMapStops(prevMapStops => {
                        const existingStopIds = new Set(prevMapStops.map(s => s.uniqueStopPointId));
                        const uniqueNewStops = (stopsData || []).filter(s => !existingStopIds.has(s.uniqueStopPointId));
                        return [...prevMapStops, ...uniqueNewStops];
                    });
                    initialMapSyncDoneRef.current = true;
                }
                setIsLoading(false);
                setStationsReady(true); // stations loaded
            }
        };

        const handleTripPathData = (data) => {
            if (data && Array.isArray(data.stops)) {
                console.log('Received trip path stops:', data.stops.length);
                // Extract stop IDs
                // Ensure we handle stop_id string format correctly
                const stopIds = data.stops.map(s => s.stop_id);
                setTripRouteStops(stopIds);
            }
        };

        const handleDepartureData = (data) => {
            if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);

            // Robustness check: If we receive absolutely nothing useful, don't clear the screen.
            // Exception: If the server explicitly says "no departures" (empty array), we typically trust it,
            // BUT the user reported vanishing data. So if we have data and receive empty, we might want to be careful.
            // For now, let's just protect against null/undefined or malformed objects.
            if (!data || typeof data !== 'object') {
                console.warn('Received invalid departure data, ignoring to preserve cache.');
                setIsLoadingRealTime(false);
                return;
            }

            setRealTimeData(data);
            setIsLoadingRealTime(false);
        };
        const handleStopsError = (error) => {
            setErrors(prev => [...prev, error.error || 'Failed to fetch stops.']);
            setIsLoading(false);
            refreshInProgressRef.current = false;
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
        socket.on('tripPathData', handleTripPathData);

        return () => {
            socket.off('stopsData', handleStopsData);
            socket.off('stopsError', handleStopsError);
            socket.off('departureData', handleDepartureData);
            socket.off('departureError', handleDepartureError);
            socket.off('tripPathData', handleTripPathData);
        };
    }, []);

    useEffect(() => {
        const INITIAL_LOCATION_INIT_DELAY_MS = 3000;
        const PERMISSION_RECHECK_FAST_MS = 5000;
        const PERMISSION_RECHECK_SLOW_MS = 15000;
        const PERMISSION_RECHECK_FAST_WINDOW_MS = 60000; // 1 minute
        const LOCATION_WAIT_TIMEOUT_MS = 20000; // fallback to default after 20s
        const DENIAL_CONFIRM_ATTEMPTS = 3; // persistent denial checks before messaging

        let hasEmittedInitialStops = false;
        function emitInitialStops(payload) {
            if (!hasEmittedInitialStops) {
                console.log('Emitting searchStops from App.jsx', payload);
                socket.emit('searchStops', payload);
                hasEmittedInitialStops = true;
            }
        }

        const mapPermissionState = (state) => {
            switch (state) {
                case 'granted':
                    return 'authorized_when_in_use';
                case 'denied':
                    return 'denied';
                case 'prompt':
                default:
                    return 'not_determined';
            }
        };

        const startPermissionMonitor = () => {
            if (!('permissions' in navigator)) return;
            permissionChecksRef.current = 0;
            permissionCheckIntervalRef.current = setInterval(async () => {
                try {
                    const status = await navigator.permissions.query({ name: 'geolocation' });
                    permissionChecksRef.current += 1;
                    const detail = mapPermissionState(status.state);
                    setLocationPermissionStatus(status.state);
                    setLocationStatusDetail(detail);
                    if (status.state === 'granted') {
                        // Immediately obtain location and proceed
                        tryGetLocation(true);
                    } else if (status.state === 'denied') {
                        denialConfirmRef.current += 1;
                        if (denialConfirmRef.current >= DENIAL_CONFIRM_ATTEMPTS) {
                            // Persistent denial: message, fallback to default stops, and stop monitoring
                            setErrors(prev => Array.from(new Set([...prev, 'Location access denied. You can enable it in system settings.'])));
                            setLocationPermissionStatus('denied');
                            setLocationStatusDetail('denied');
                            setLocationDecisionPending(false);
                            locationDecisionPendingRef.current = false;
                            emitInitialStops({ timestamp: Date.now() });
                            setLocationReady(true);
                            // Stop further monitoring to avoid flipping back to pending
                            stopPermissionMonitor();
                        }
                    }
                } catch { }
            }, PERMISSION_RECHECK_FAST_MS);
        };

        const stopPermissionMonitor = () => {
            if (permissionCheckIntervalRef.current) {
                clearInterval(permissionCheckIntervalRef.current);
                permissionCheckIntervalRef.current = null;
            }
            if (waitCountdownIntervalRef.current) {
                clearInterval(waitCountdownIntervalRef.current);
                waitCountdownIntervalRef.current = null;
            }
            waitDeadlineRef.current = null;
            setLocationWaitRemainingSec(null);
        };

        const tryGetLocation = (highAcc = false) => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ latitude, longitude });
                userLocationRef.current = { latitude, longitude };
                emitInitialStops({ lat: latitude, lon: longitude, timestamp: Date.now() });
                setLocationReady(true);
                setLocationPermissionStatus('granted');
                setLocationStatusDetail('authorized_when_in_use');
                setLocationDecisionPending(false);
                locationDecisionPendingRef.current = false;
                // After success, stop monitor
                stopPermissionMonitor();
                // Clear any fallback timeout
                if (waitTimeoutRef.current) {
                    clearTimeout(waitTimeoutRef.current);
                    waitTimeoutRef.current = null;
                }
                if (waitCountdownIntervalRef.current) {
                    clearInterval(waitCountdownIntervalRef.current);
                    waitCountdownIntervalRef.current = null;
                }
                waitDeadlineRef.current = null;
                setLocationWaitRemainingSec(null);

                // Start continuous watch for real-time updates
                try {
                    if (geoWatchIdRef.current == null && navigator.geolocation) {
                        const options = { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 };
                        geoWatchIdRef.current = navigator.geolocation.watchPosition(
                            (pos) => {
                                const { latitude: lat2, longitude: lon2 } = pos.coords;
                                setUserLocation({ latitude: lat2, longitude: lon2 });
                                userLocationRef.current = { latitude: lat2, longitude: lon2 };
                            },
                            (err) => {
                                console.warn('[GEO WATCH] error', err);
                            },
                            options
                        );
                    }
                } catch { }
            }, (error) => {
                // Handle temporary limitations
                const tempLimitation = error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT;
                if (tempLimitation) {
                    setLocationStatusDetail('temporary_limitation');
                    // Retry once with opposite accuracy setting
                    navigator.geolocation.getCurrentPosition(position => {
                        const { latitude, longitude } = position.coords;
                        setUserLocation({ latitude, longitude });
                        userLocationRef.current = { latitude, longitude };
                        emitInitialStops({ lat: latitude, lon: longitude, timestamp: Date.now() });
                        setLocationReady(true);
                        setLocationPermissionStatus('granted');
                        setLocationStatusDetail('authorized_when_in_use');
                        setLocationDecisionPending(false);
                        locationDecisionPendingRef.current = false;
                        stopPermissionMonitor();
                        if (waitTimeoutRef.current) {
                            clearTimeout(waitTimeoutRef.current);
                            waitTimeoutRef.current = null;
                        }
                        if (waitCountdownIntervalRef.current) {
                            clearInterval(waitCountdownIntervalRef.current);
                            waitCountdownIntervalRef.current = null;
                        }
                        waitDeadlineRef.current = null;
                        setLocationWaitRemainingSec(null);
                    }, () => {
                        // keep waiting; do not display denial yet
                    }, { enableHighAccuracy: !highAcc, timeout: highAcc ? 10000 : 15000, maximumAge: 30000 });
                } else {
                    // If denied via prompt, keep waiting; monitor will decide persistent denial
                    setLocationStatusDetail('denied');
                }
            }, {
                timeout: highAcc ? 10000 : 15000,
                enableHighAccuracy: highAcc,
                maximumAge: 30000
            });
        };

        if (navigator.geolocation && !hasFetchedForLocation.current) {
            hasFetchedForLocation.current = true;
            setLocationDecisionPending(true);
            locationDecisionPendingRef.current = true;
            setMessages(prev => Array.from(new Set([...prev, 'Waiting for location permission...'])));
            // Initial delay to avoid premature denial handling
            setTimeout(async () => {
                if ('permissions' in navigator) {
                    try {
                        const status = await navigator.permissions.query({ name: 'geolocation' });
                        if (status.state === 'granted') {
                            setLocationPermissionStatus('granted');
                        } else {
                            setLocationPermissionStatus('pending');
                        }
                        setLocationStatusDetail(mapPermissionState(status.state));
                        if (status.state === 'granted') {
                            // Get location immediately
                            tryGetLocation(true);
                        } else if (status.state === 'prompt') {
                            // Prompt once, then monitor and wait
                            tryGetLocation(true);
                            startPermissionMonitor();
                            // Setup fallback timeout for default stops
                            // Start countdown for remaining wait time
                            waitDeadlineRef.current = Date.now() + LOCATION_WAIT_TIMEOUT_MS;
                            setLocationWaitRemainingSec(Math.ceil(LOCATION_WAIT_TIMEOUT_MS / 1000));
                            if (!waitCountdownIntervalRef.current) {
                                waitCountdownIntervalRef.current = setInterval(() => {
                                    const remainingMs = (waitDeadlineRef.current || 0) - Date.now();
                                    const sec = Math.max(0, Math.ceil(remainingMs / 1000));
                                    setLocationWaitRemainingSec(sec);
                                    if (remainingMs <= 0 && waitCountdownIntervalRef.current) {
                                        clearInterval(waitCountdownIntervalRef.current);
                                        waitCountdownIntervalRef.current = null;
                                    }
                                }, 500);
                            }
                            waitTimeoutRef.current = setTimeout(() => {
                                if (!userLocationRef.current && locationDecisionPendingRef.current) {
                                    // Switch to default without showing denial yet
                                    setMessages(prev => Array.from(new Set([...prev, 'Using default location until permission is granted.'])));
                                    emitInitialStops({ timestamp: Date.now() });
                                    setLocationReady(true);
                                    setLocationPermissionStatus('denied');
                                    // Ensure we do not continue monitoring after fallback
                                    stopPermissionMonitor();
                                    if (waitCountdownIntervalRef.current) {
                                        clearInterval(waitCountdownIntervalRef.current);
                                        waitCountdownIntervalRef.current = null;
                                    }
                                    waitDeadlineRef.current = null;
                                    setLocationWaitRemainingSec(null);
                                }
                            }, LOCATION_WAIT_TIMEOUT_MS);
                        } else if (status.state === 'denied') {
                            // Start monitor and fallback after timeout
                            startPermissionMonitor();
                            waitDeadlineRef.current = Date.now() + LOCATION_WAIT_TIMEOUT_MS;
                            setLocationWaitRemainingSec(Math.ceil(LOCATION_WAIT_TIMEOUT_MS / 1000));
                            if (!waitCountdownIntervalRef.current) {
                                waitCountdownIntervalRef.current = setInterval(() => {
                                    const remainingMs = (waitDeadlineRef.current || 0) - Date.now();
                                    const sec = Math.max(0, Math.ceil(remainingMs / 1000));
                                    setLocationWaitRemainingSec(sec);
                                    if (remainingMs <= 0 && waitCountdownIntervalRef.current) {
                                        clearInterval(waitCountdownIntervalRef.current);
                                        waitCountdownIntervalRef.current = null;
                                    }
                                }, 500);
                            }
                            waitTimeoutRef.current = setTimeout(() => {
                                if (!userLocationRef.current && locationDecisionPendingRef.current) {
                                    setMessages(prev => Array.from(new Set([...prev, 'Using default location until permission is granted.'])));
                                    emitInitialStops({ timestamp: Date.now() });
                                    setLocationReady(true);
                                    setLocationPermissionStatus('denied');
                                    // Ensure we do not continue monitoring after fallback
                                    stopPermissionMonitor();
                                    if (waitCountdownIntervalRef.current) {
                                        clearInterval(waitCountdownIntervalRef.current);
                                        waitCountdownIntervalRef.current = null;
                                    }
                                    waitDeadlineRef.current = null;
                                    setLocationWaitRemainingSec(null);
                                }
                            }, LOCATION_WAIT_TIMEOUT_MS);
                        }
                    } catch {
                        // Permissions API not supported or failed
                        tryGetLocation(true);
                        waitDeadlineRef.current = Date.now() + LOCATION_WAIT_TIMEOUT_MS;
                        setLocationWaitRemainingSec(Math.ceil(LOCATION_WAIT_TIMEOUT_MS / 1000));
                        if (!waitCountdownIntervalRef.current) {
                            waitCountdownIntervalRef.current = setInterval(() => {
                                const remainingMs = (waitDeadlineRef.current || 0) - Date.now();
                                const sec = Math.max(0, Math.ceil(remainingMs / 1000));
                                setLocationWaitRemainingSec(sec);
                                if (remainingMs <= 0 && waitCountdownIntervalRef.current) {
                                    clearInterval(waitCountdownIntervalRef.current);
                                    waitCountdownIntervalRef.current = null;
                                }
                            }, 500);
                        }
                        waitTimeoutRef.current = setTimeout(() => {
                            if (!userLocationRef.current && locationDecisionPendingRef.current) {
                                setMessages(prev => Array.from(new Set([...prev, 'Using default location until permission is granted.'])));
                                emitInitialStops({ timestamp: Date.now() });
                                setLocationReady(true);
                                setLocationPermissionStatus('denied');
                                stopPermissionMonitor();
                                if (waitCountdownIntervalRef.current) {
                                    clearInterval(waitCountdownIntervalRef.current);
                                    waitCountdownIntervalRef.current = null;
                                }
                                waitDeadlineRef.current = null;
                                setLocationWaitRemainingSec(null);
                            }
                        }, LOCATION_WAIT_TIMEOUT_MS);
                    }
                } else {
                    // No permissions API; proceed with location get and timeout fallback
                    tryGetLocation(true);
                    waitDeadlineRef.current = Date.now() + LOCATION_WAIT_TIMEOUT_MS;
                    setLocationWaitRemainingSec(Math.ceil(LOCATION_WAIT_TIMEOUT_MS / 1000));
                    if (!waitCountdownIntervalRef.current) {
                        waitCountdownIntervalRef.current = setInterval(() => {
                            const remainingMs = (waitDeadlineRef.current || 0) - Date.now();
                            const sec = Math.max(0, Math.ceil(remainingMs / 1000));
                            setLocationWaitRemainingSec(sec);
                            if (remainingMs <= 0 && waitCountdownIntervalRef.current) {
                                clearInterval(waitCountdownIntervalRef.current);
                                waitCountdownIntervalRef.current = null;
                            }
                        }, 500);
                    }
                    waitTimeoutRef.current = setTimeout(() => {
                        if (!userLocationRef.current && locationDecisionPendingRef.current) {
                            setMessages(prev => Array.from(new Set([...prev, 'Using default location until permission is granted.'])));
                            emitInitialStops({ timestamp: Date.now() });
                            setLocationReady(true);
                            setLocationPermissionStatus('denied');
                            stopPermissionMonitor();
                            if (waitCountdownIntervalRef.current) {
                                clearInterval(waitCountdownIntervalRef.current);
                                waitCountdownIntervalRef.current = null;
                            }
                            waitDeadlineRef.current = null;
                            setLocationWaitRemainingSec(null);
                        }
                    }, LOCATION_WAIT_TIMEOUT_MS);
                }
            }, INITIAL_LOCATION_INIT_DELAY_MS);
        } else if (!navigator.geolocation) {
            // Browser doesn't support geolocation
            console.log('[INIT] Geolocation not supported, using default location');
            setIsLoading(false);
            setLocationReady(true);
            setLocationPermissionStatus('denied');
            setLocationStatusDetail('restricted');
            setLocationDecisionPending(false);
        }

        return () => {
            if (permissionCheckIntervalRef.current) {
                clearInterval(permissionCheckIntervalRef.current);
                permissionCheckIntervalRef.current = null;
            }
            if (waitTimeoutRef.current) {
                clearTimeout(waitTimeoutRef.current);
                waitTimeoutRef.current = null;
            }
            if (waitCountdownIntervalRef.current) {
                clearInterval(waitCountdownIntervalRef.current);
                waitCountdownIntervalRef.current = null;
            }
            waitDeadlineRef.current = null;
            setLocationWaitRemainingSec(null);
        };
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
                // DO NOT clear realTimeData here
                // setRealTimeData(null);
                if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
                departureTimeoutRef.current = setTimeout(() => {
                    if (isLoadingRealTime) {
                        setIsLoadingRealTime(false);
                        // setErrors(prev => [...prev, 'Departure data loading timed out after reconnect. Please try again.']);
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
        // On mount, if selectedStop exists, re-monitor it (in case of reload)
        if (
            selectedStop &&
            lastRequestedStopIdRef.current !== selectedStop.gtfsId
        ) {
            socket.emit('requestDepartures', selectedStop.gtfsId);
            lastRequestedStopIdRef.current = selectedStop.gtfsId;
            setIsLoadingRealTime(true);
            // DO NOT clear realTimeData
            // setRealTimeData(null);
            if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
            departureTimeoutRef.current = setTimeout(() => {
                if (isLoadingRealTime) {
                    setIsLoadingRealTime(false);
                    // setErrors(prev => [...prev, 'Departure data loading timed out after reconnect. Please try again.']);
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
                // When search is cleared via keyboard, immediately show nearby stations
                if (userLocation && locationPermissionStatus === 'granted') {
                    console.log('Emitting searchStops from App.jsx', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                    socket.emit('searchStops', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                } else if (locationPermissionStatus === 'denied') {
                    console.log('Emitting searchStops from App.jsx', { timestamp: Date.now() });
                    socket.emit('searchStops', { timestamp: Date.now() });
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
        setTripRouteStops(null); // Clear route on new selection
        setActiveTripId(null);
        setIsPanelExpanded(false);
        setIsLoadingRealTime(true);
        setRealTimeData(null); // Clear only on explicit new selection
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

    const handleLocationClick = useCallback(() => {
        if (!userLocation) return;

        // Use existing programmaticMoveRef pattern
        if (programmaticMoveRef) programmaticMoveRef.current = true;

        // Dispatch event for MapGL to handle move or use mapRef if available
        // MapGL already listens for userLocation changes for initial move, 
        // but here we want to force move and close modal.

        // Close modal
        setSelectedStop(null);
        setTripRouteStops(null);
        setActiveTripId(null);

        // MapGL.jsx has an effect that flies to userLocation ONLY on first availability.
        // To force a move now, we can use a custom event or update a state that MapGL watches.
        // Actually, MapGL watches selectedStop for moves.
        // Let's use the CustomEvent pattern used in search results if needed, 
        // or just let the user see their dot. 
        // Wait, MapGL doesn't have a 'move to user' prop besides the initial one.
        // I'll add a 'moveToUser' trigger or just fire a map-move event.
        window.dispatchEvent(new CustomEvent('map-move', {
            detail: { center: [userLocation.longitude, userLocation.latitude], zoom: 16 }
        }));
    }, [userLocation, programmaticMoveRef]);

    const removeError = useCallback((id) => {
        setErrors(errors.filter((_, i) => i !== id));
    }, [errors]);

    const forceRefresh = () => {
        refreshInProgressRef.current = true;
        // setBottomMenuStops([]); // Removed to preserve existing stops
        // setMapStops([]); // removed to preserve existing map stops for merging
        setSearchTerm('');
        setIsPanelExpanded(false);
        setIsLoading(true);
        hasFetchedForLocation.current = false; // Reset to allow re-fetching on next load
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ latitude, longitude });
                userLocationRef.current = { latitude, longitude };
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
        refreshInProgressRef.current = true;
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
                const { stop, openedAt, realTimeData: cachedData, activeTripId: cachedActiveTripId } = JSON.parse(cached);
                if (stop && openedAt && Date.now() - openedAt < STATION_CACHE_MAX_AGE) {
                    setSelectedStop(stop);
                    if (cachedData) {
                        setRealTimeData(cachedData);
                    }
                    if (cachedActiveTripId) {
                        setActiveTripId(cachedActiveTripId);
                    }
                    // Fetch stops around user's location (if available)
                    const isValidLatLon = stop.lat !== undefined && stop.lon !== undefined && !isNaN(stop.lat) && !isNaN(stop.lon);
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(position => {
                            const { latitude, longitude } = position.coords;
                            setUserLocation({ latitude, longitude });
                            userLocationRef.current = { latitude, longitude };
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
        } catch { }
    }, []);

    // When station modal is opened, cache with timestamp
    useEffect(() => {
        if (selectedStop) {
            localStorage.setItem(STATION_CACHE_KEY, JSON.stringify({
                stop: selectedStop,
                openedAt: Date.now(),
                realTimeData: realTimeData, // Persist the departures too
                activeTripId: activeTripId // Persist the active trip
            }));
        } else {
            localStorage.removeItem(STATION_CACHE_KEY);
        }
    }, [selectedStop, realTimeData, activeTripId]); // Added activeTripId dep

    // Clear geolocation watcher on unmount
    useEffect(() => {
        return () => {
            if (geoWatchIdRef.current != null) {
                try { navigator.geolocation.clearWatch(geoWatchIdRef.current); } catch { }
                geoWatchIdRef.current = null;
            }
        };
    }, []);

    return (
        <div
            className={`relative${isStandalone ? ' pb-8' : ''}`}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: 'calc(var(--vh, 1vh) * 100)',
                overflow: 'hidden',
                WebkitOverflowScrolling: 'touch',
                // Prevent iOS rubber banding
                overscrollBehavior: 'none',
                MozOverscrollBehavior: 'none',
                backgroundColor: '#0a0a0a', // Add the dark background color
            }}
        >
            <StandByMode activeTripId={activeTripId} realTimeData={realTimeData} />
            <MapGL
                stops={mapStops}
                userLocation={userLocation}
                onStopSelect={handleStopSelect}
                selectedStop={selectedStop}
                socket={socket}
                isRefreshing={isRefreshing}
                programmaticMoveRef={programmaticMoveRef}
                setMapReady={setMapReady}
                highlightedStopIds={tripRouteStops}
            />

            <header
                className={`absolute top-0 left-0 w-full z-20 px-4 pb-4 pointer-events-none${isAndroidApp ? ' mt-20' : ''}`}
                style={{
                    paddingTop: 'calc(1rem + env(safe-area-inset-top))',
                    ...(isAndroidApp ? { marginTop: 30 } : {})
                }}
            >
                <div className="max-w-xl w-full mx-auto flex flex-col items-center gap-3 pointer-events-auto">
                    <h1 className="m-0 font-bold text-3xl text-white tracking-tighter font-onest" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.7)' }}>
                        BusGo
                    </h1>
                    <div className="relative w-full">
                        <input
                            type="text"
                            className={`w-full px-5 py-3 pl-6 text-base border border-gray-500/50 rounded-3xl outline-none transition-all duration-300 ease-in-out glass-effect text-white font-inter font-normal placeholder-gray-400 focus:shadow-lg focus:border-cyan-400${isAndroidApp ? ' mt-4' : ''}`}
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

            {isPanelExpanded && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
                    onClick={() => setIsPanelExpanded(false)}
                />
            )}
            {/* Prevent clicks on menu from propagating to map (or closing the panel if we decide that) */}
            <div onClick={(e) => e.stopPropagation()}>
                <BottomMenu
                    bottomMenuStops={bottomMenuStops}
                    selectedStop={selectedStop}
                    onStopSelect={(stop) => {
                        setSelectedStop(stop);
                        setTripRouteStops(null); // Clear route on new selection
                        setActiveTripId(null);
                    }}
                    setIsPanelExpanded={setIsPanelExpanded}
                    isPanelExpanded={isPanelExpanded}
                    isLoading={isLoading}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    handleRefreshClick={handleRefreshClick}
                    isRefreshing={isRefreshing}
                    userLocation={userLocation}
                    isStandalone={isStandalone}
                    selectedStopRef={selectedStopRef}
                    menuScrollRef={menuScrollRef}
                    isWaitingForLocation={((locationPermissionStatus === 'pending' || locationPermissionStatus === 'prompt') && locationDecisionPending && !userLocation)}
                    locationWaitRemainingSec={locationWaitRemainingSec}
                    onLocationClick={handleLocationClick}
                />
            </div>

            {selectedStop && (
                <StopModal
                    stop={selectedStop}
                    onClose={() => {
                        setSelectedStop(null);
                        setTripRouteStops(null);
                        setActiveTripId(null);
                    }}
                    realTimeData={realTimeData}
                    isLoadingRealTime={isLoadingRealTime}
                    error={errors.find(e => e.stopId === selectedStop.gtfsId)}
                    onDepartureClick={(arrival) => {
                        if (arrival && arrival.trip) {
                            if (activeTripId === arrival.trip.id) {
                                // Toggle OFF
                                console.log('Departure clicked (Toggle ID match), clearing focus');
                                setActiveTripId(null);
                                setTripRouteStops(null);
                            } else {
                                // Toggle ON
                                console.log('Departure clicked, requesting path for:', arrival.trip.id);
                                setActiveTripId(arrival.trip.id);
                                // Send full trip object to helper server resolve IDs
                                socket.emit('getTripPath', arrival.trip);
                            }
                        }
                    }}
                    activeTripId={activeTripId}
                    setActiveTripId={setActiveTripId}
                    setTripRouteStops={setTripRouteStops}
                />
            )}
            <ErrorsSection errors={errors.filter(e => !e.stopId)} removeError={removeError} />
            {/* PWA Install Prompt */}
            <PWAInstallPrompt
                isVisible={showPWAInstall}
                onClose={() => {
                    setShowPWAInstall(false);
                    setPwaPromptDismissed(true);
                }}
            />
            <VersionManager />
        </div>
    );
}

export default App;