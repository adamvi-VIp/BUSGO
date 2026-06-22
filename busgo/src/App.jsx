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
import { getStopPrimaryId, stopHasLines, stopMatchesId } from './utils/stopIdentity.js';


const DEBUG_LOGS = true;

// --- Helper Utilities ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371;
    const deg2rad = (deg) => deg * (Math.PI / 180);
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

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
            data-haptic
            className={`flex items-center gap-3 p-3 mb-2 rounded-lg border-b border-gray-800 overflow-hidden -ml-1 cursor-pointer hover:bg-white/5 active:bg-white/10 ${isActive ? 'bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)] ring-1 ring-cyan-500/30' : ''}`}
        >
            <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <span className="max-w-[64px] px-[10px] py-1 rounded-lg font-bold text-center text-base shadow-md bg-yellow-500 text-black truncate">
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
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-white block truncate min-w-0">
                            {trip.headsign}
                        </span>
                        <img
                            src={iceIcon}
                            alt="Air Conditioning"
                            className={`w-4 h-4 ${trip.is_air_conditioned ? 'ice-icon-ac' : 'ice-icon-no-ac'}`}
                        />
                    </div>

                    <div className="text-sm text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        {departure_timestamp?.scheduled && (() => {
                            const date = new Date(departure_timestamp.scheduled);
                            return !isNaN(date.getTime()) ? (
                                <span className="text-gray-300 font-bold tabular-nums whitespace-nowrap">
                                    {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                            ) : null;
                        })()}
                        {delayString && (
                            <span className={`font-semibold whitespace-nowrap ${delayColor}`}>{delayString}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-center flex-shrink-0 w-[86px] justify-end mr-1 overflow-hidden">
                <span
                    className={`block w-full text-right text-xl font-extrabold tabular-nums whitespace-nowrap leading-none transition-none ${isDeparting ? 'text-orange-300' : 'text-white'}`}
                    style={{ contain: 'layout paint' }}
                >
                    {formattedTime !== 'N/A' && formattedTime !== null ? formattedTime : ''}
                </span>
            </div>
        </motion.div>
    );
});

// --- Stop Modal Component ---
const StopModal = ({ stop, onClose, realTimeData, isLoadingRealTime, error, onDepartureClick, activeTripId, setActiveTripId, setTripRouteStops, clearTripFocus }) => {
    const { name, platform, zone } = stop;
    const stopMeta = [
        platform ? `Platform ${platform}` : null,
        zone ? `Zone ${zone}` : null
    ].filter(Boolean);
    const stopLines = React.useMemo(() => Array.isArray(stop.lines) ? stop.lines : [], [stop.lines]);
    const hasLineRules = stopLines.length > 0;

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
        const departures = realTimeData?.departures || (Array.isArray(realTimeData) ? realTimeData : []);
        if (departures.length === 0) return [];

        const filtered = departures
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

                if (hasLineRules) {
                    const allowedLine = stopLines.find(l => String(l.name) === String(lineName));
                    if (!allowedLine) return false;

                    const d1 = (allowedLine.direction || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const d2 = (allowedLine.direction2 || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                    const matchesDirection = headsign.includes(d1) || (d2 && headsign.includes(d2)) || d1.includes(headsign);
                    if (!matchesDirection) return false;
                }
                // ----------------------------------------------------

                const isThisActive = String(activeTripId) === String(arrival.trip.id);
                // Threshold: -5s for instant switching (120s if active)
                const threshold = isThisActive ? -120000 : -5000;
                return arrivalTime - now > threshold;
            });

        // Group by line to show only the closest one per line
        const grouped = filtered.reduce((acc, arrival) => {
            const line = arrival.route?.short_name || 'Unknown';
            const isThisActive = String(activeTripId) === String(arrival.trip.id);

            if (!acc[line]) {
                acc[line] = arrival;
            } else {
                if (isThisActive) {
                    acc[line] = arrival;
                } else if (String(activeTripId) !== String(acc[line].trip.id)) {
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
            return sorted.filter(d => String(d.trip.id) === String(activeTripId));
        }
        return sorted;
    }, [realTimeData, activeTripId, now, stopLines, hasLineRules]);

    // Effect to clear active trip focus if it departs (or restore if it returns)
    React.useEffect(() => {
        if (!realTimeData || !realTimeData.departures) return;

        // Check if the currently active trip is still in the list
        // Use String() for safety
        const isActivePresent = activeTripId && processedDepartures.some(d => String(d.trip.id) === String(activeTripId));

        if (activeTripId && !isActivePresent) {
            // It disappeared! Unfocus.
            if (clearTripFocus) {
                clearTripFocus();
            } else {
                setActiveTripId(null);
                if (setTripRouteStops) setTripRouteStops(null);
            }
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
            <div
                className="fixed left-1/2 transform -translate-x-1/2 z-[90] w-full max-w-3xl mx-auto px-2 sm:px-4"
                style={{
                    pointerEvents: 'auto',
                    top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
                }}
            >
                <motion.div
                    layout
                    transition={{
                        layout: { type: 'spring', stiffness: 230, damping: 25, mass: 1 }
                    }}
                    className="bg-background-secondary rounded-2xl shadow-2xl border border-gray-700/50 animate-slide-up overflow-hidden"
                    style={{
                        maxHeight: 'calc((var(--vh, 1vh) * 100) - env(safe-area-inset-top, 0px) - 160px)',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <motion.header layout="position" className="flex items-center justify-between p-4 border-b border-gray-700/50 flex-shrink-0">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="m-0 text-lg font-semibold text-white truncate">{name}</h2>
                                {isLoadingRealTime && (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                )}
                            </div>
                            {stopMeta.length > 0 && (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mt-1">
                                    {stopMeta.map(item => <span key={item}>{item}</span>)}
                                </div>
                            )}
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
                    <div className={`${activeTripId ? 'overflow-y-hidden' : 'overflow-y-auto'} p-4 flex-1`} style={{ maxHeight: 'calc((var(--vh, 1vh) * 100) - env(safe-area-inset-top, 0px) - 340px)' }}>
                        {error && <div className="text-center text-red-400 p-4 bg-red-500/10 rounded-xl text-sm">{error.error}</div>}
                        {realTimeData && (
                            processedDepartures.length > 0 ? (
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {processedDepartures.map((arrival) => (
                                        <Arrival
                                            key={arrival.route.short_name}
                                            arrival={arrival}
                                            onDepartureClick={handleDepartureClick}
                                            isActive={String(activeTripId) === String(arrival.trip.id)}
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
    const [locationResolutionState, _setLocationResolutionState] = useState('idle'); // 'idle' | 'requesting' | 'gps' | 'fallback' | 'denied'
    const [tripRouteStops, setTripRouteStops] = useState(null); // Array of stop IDs or null
    const [tripRouteGeometry, setTripRouteGeometry] = useState(null); // GeoJSON geometry for the route line
    const [tripShapeDistances, setTripShapeDistances] = useState(null);
    const [tripStops, setTripStops] = useState([]);
    const [tripVehiclePosition, setTripVehiclePosition] = useState(null);
    const [tripRouteColor, setTripRouteColor] = useState(null);
    const [tripRouteShortName, setTripRouteShortName] = useState(null);
    const [metroLines, setMetroLines] = useState(null);
    const [activeTripId, setActiveTripId] = useState(null); // ID of the currently selected bus trip
    const [activeTripContext, setActiveTripContext] = useState(null);
    const activeTripIdRef = useRef(null);
    const selectedStopDataRef = useRef(null);

    // PWA Install Prompt state
    const [showPWAInstall, setShowPWAInstall] = useState(false);
    const [pwaPromptDismissed, setPwaPromptDismissed] = useState(false);

    // SplashScreen loading state
    const [mapReady, _setMapReady] = useState(false);
    const [locationReady, _setLocationReady] = useState(false);
    const [stationsReady, _setStationsReady] = useState(false);
    const [showSplash, setShowSplash] = useState(true);
    const [isLoadingTripPath, setIsLoadingTripPath] = useState(false);
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
    const clearTripFocus = useCallback(() => {
        activeTripIdRef.current = null;
        setActiveTripId(null);
        setTripRouteStops(null);
        setTripRouteGeometry(null);
        setTripShapeDistances(null);
        setTripStops([]);
        setTripVehiclePosition(null);
        setTripRouteColor(null);
        setTripRouteShortName(null);
        setActiveTripContext(null);
    }, []);

    const buildTripContext = (arrival) => {
        const tripId = arrival?.trip?.gtfs_trip_id || arrival?.trip?.id;
        const clientTripId = arrival?.trip?.id || tripId;
        const anchorStop = selectedStopDataRef.current || selectedStop;
        const delaySeconds = Number(arrival?.delay?.seconds);
        return {
            tripId,
            clientTripId,
            anchorStopId: arrival?.stop?.id || getStopPrimaryId(anchorStop) || null,
            anchorPredictedDeparture: arrival?.departure_timestamp?.predicted || null,
            anchorScheduledDeparture: arrival?.departure_timestamp?.scheduled || null,
            delaySeconds: Number.isFinite(delaySeconds) ? delaySeconds : null
        };
    };

    useEffect(() => {
        activeTripIdRef.current = activeTripId;
    }, [activeTripId]);

    useEffect(() => {
        selectedStopDataRef.current = selectedStop;
    }, [selectedStop]);

    // Calculate progress: 0, 33, 66, 100
    const progress = (mapReady + locationReady + stationsReady) / 3 * 100;

    // Hide splash when all are ready
    useEffect(() => {
        if (mapReady && locationReady && stationsReady) {
            setTimeout(() => setShowSplash(false), 500); // fade out
        }
    }, [mapReady, locationReady, stationsReady]);

    // --- Loading Watchdog ---
    // If any loading state is stuck for > 30s, hard-refresh to clear stuck sockets/state
    // Skip if splash is showing or if we're explicitly still in the loading sequence
    useEffect(() => {
        let timer;
        const anyLoading = (isLoading || isLoadingRealTime || isRefreshing || isLoadingTripPath) && !showSplash;

        if (anyLoading) {
            timer = setTimeout(() => {
                console.warn('[WATCHDOG] Loading stuck for > 30s. Triggering emergency reset...');
                window.location.reload();
            }, 30000);
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [isLoading, isLoadingRealTime, isRefreshing, isLoadingTripPath, showSplash]);

    // Pass setMapReady to AppMap so it can call when map is ready
    // Pass setLocationReady to location logic
    // Pass setStationsReady to stops logic

    const debounceTimeout = useRef(null);
    const hasFetchedForLocation = useRef(false);
    const waitTimeoutRef = useRef(null);
    const waitCountdownIntervalRef = useRef(null);
    const waitDeadlineRef = useRef(null);
    const locationRequestIdRef = useRef(0);
    const locationResolutionStateRef = useRef('idle');
    const locationRefetchStopsOnNextFixRef = useRef(false);
    const selectedStopRef = useRef(null);
    const menuScrollRef = useRef(null);
    const programmaticMoveRef = useRef(false);
    const departureTimeoutRef = useRef(null);
    const lastRequestedStopIdRef = useRef(null);

    const setLocationResolutionState = (value) => {
        locationResolutionStateRef.current = value;
        _setLocationResolutionState(value);
    };

    const pushUniqueError = (message) => {
        setErrors(prev => (prev.some(err => err === message) ? prev : [...prev, message]));
    };

    const emitNearbyStops = ({ location = userLocationRef.current, source, forceDefault = false } = {}) => {
        const payload = !forceDefault && location
            ? { lat: location.latitude, lon: location.longitude, timestamp: Date.now(), ...(source ? { source } : {}) }
            : { timestamp: Date.now(), ...(source ? { source } : {}) };

        console.log('Emitting searchStops from App.jsx', payload);
        socket.emit('searchStops', payload);
    };

    const clearLocationWaitState = () => {
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

    const startLocationWaitState = (durationMs, onTimeout, showCountdown = false) => {
        clearLocationWaitState();
        waitDeadlineRef.current = Date.now() + durationMs;

        if (showCountdown) {
            setLocationWaitRemainingSec(Math.ceil(durationMs / 1000));
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

        waitTimeoutRef.current = setTimeout(onTimeout, durationMs);
    };

    const applyResolvedLocation = (coords, { requestStops = true } = {}) => {
        const nextLocation = {
            latitude: coords.latitude,
            longitude: coords.longitude
        };

        setUserLocation(nextLocation);
        userLocationRef.current = nextLocation;
        setLocationPermissionStatus('granted');
        setLocationStatusDetail('authorized_when_in_use');
        setLocationResolutionState('gps');
        setLocationDecisionPending(false);
        locationDecisionPendingRef.current = false;
        clearLocationWaitState();
        setLocationReady(true);

        if (requestStops) {
            locationRefetchStopsOnNextFixRef.current = false;
            emitNearbyStops({ location: nextLocation });
        }
    };

    const ensureLocationWatch = ({ refetchStopsOnFirstFix = false } = {}) => {
        if (!navigator.geolocation) return;

        if (refetchStopsOnFirstFix) {
            locationRefetchStopsOnNextFixRef.current = true;
        }

        if (geoWatchIdRef.current != null) return;

        geoWatchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const shouldRequestStops = locationRefetchStopsOnNextFixRef.current;
                applyResolvedLocation(pos.coords, { requestStops: shouldRequestStops });
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                    locationRefetchStopsOnNextFixRef.current = false;
                    setUserLocation(null);
                    userLocationRef.current = null;
                    setLocationPermissionStatus('denied');
                    setLocationStatusDetail('denied');
                    setLocationResolutionState('denied');
                    setLocationDecisionPending(false);
                    locationDecisionPendingRef.current = false;
                    clearLocationWaitState();
                    return;
                }

                console.warn('[GEO WATCH] error', err);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 10000
            }
        );
    };

    const fallbackToNearbyStops = ({
        detail = 'temporary_limitation',
        permissionDenied = false,
        keepWatching = true,
        showError = false
    } = {}) => {
        clearLocationWaitState();
        setLocationDecisionPending(false);
        locationDecisionPendingRef.current = false;
        setLocationReady(true);

        if (permissionDenied) {
            locationRefetchStopsOnNextFixRef.current = false;
            setUserLocation(null);
            userLocationRef.current = null;
            setLocationPermissionStatus('denied');
            setLocationStatusDetail('denied');
            setLocationResolutionState('denied');
            if (showError) {
                pushUniqueError('Location access denied. Showing default nearby stops.');
            }
            emitNearbyStops({ forceDefault: true });
            return;
        }

        setLocationPermissionStatus(prev => (prev === 'granted' ? prev : 'pending'));
        setLocationStatusDetail(detail);
        setLocationResolutionState('fallback');
        emitNearbyStops({
            location: userLocationRef.current,
            forceDefault: !userLocationRef.current
        });

        if (keepWatching) {
            ensureLocationWatch({ refetchStopsOnFirstFix: true });
        } else {
            locationRefetchStopsOnNextFixRef.current = false;
        }
    };

    const acquireLocationAndStops = ({ requestReason = 'startup', showWaitingUi = false } = {}) => {
        const FAST_LOCATION_TIMEOUT_MS = 5000;
        const FAST_LOCATION_MAX_AGE_MS = 60000;
        const shouldShowWaitUi = showWaitingUi && !userLocationRef.current;

        if (!navigator.geolocation) {
            console.log(`[${requestReason.toUpperCase()}] Geolocation not supported, using fallback location`);
            fallbackToNearbyStops({ detail: 'restricted', keepWatching: false });
            return;
        }

        const requestId = locationRequestIdRef.current + 1;
        locationRequestIdRef.current = requestId;
        let settled = false;

        const resolveOnce = (callback) => {
            if (settled || locationRequestIdRef.current !== requestId) return;
            settled = true;
            callback();
        };

        if (!userLocationRef.current) {
            setLocationPermissionStatus(prev => (prev === 'denied' ? prev : 'pending'));
            setLocationStatusDetail('not_determined');
        }

        if (shouldShowWaitUi) {
            setLocationResolutionState('requesting');
            setLocationDecisionPending(true);
            locationDecisionPendingRef.current = true;
        } else {
            setLocationDecisionPending(false);
            locationDecisionPendingRef.current = false;
            setLocationWaitRemainingSec(null);
        }

        startLocationWaitState(
            FAST_LOCATION_TIMEOUT_MS,
            () => resolveOnce(() => {
                fallbackToNearbyStops({ detail: 'temporary_limitation', keepWatching: true });
            }),
            shouldShowWaitUi
        );

        navigator.geolocation.getCurrentPosition(
            (position) => resolveOnce(() => {
                applyResolvedLocation(position.coords, { requestStops: true });
                ensureLocationWatch();
            }),
            (error) => resolveOnce(() => {
                if (error.code === error.PERMISSION_DENIED) {
                    fallbackToNearbyStops({
                        permissionDenied: true,
                        keepWatching: false,
                        showError: true
                    });
                    return;
                }

                fallbackToNearbyStops({ detail: 'temporary_limitation', keepWatching: true });
            }),
            {
                timeout: FAST_LOCATION_TIMEOUT_MS,
                enableHighAccuracy: false,
                maximumAge: FAST_LOCATION_MAX_AGE_MS
            }
        );
    };

    // Add a function to request the latest data for the monitored station
    const requestLatestMonitoredStation = useCallback(() => {
        try {
            const stored = sessionStorage.getItem('selectedStop');
            if (stored) {
                const stop = JSON.parse(stored);
                const stopId = getStopPrimaryId(stop);
                if (stop && stopId) {
                    const hasLines = stopHasLines(stop);
                    // Only prevent duplicate emits if we're currently loading for this station
                    // if (lastRequestedStopIdRef.current === stop.gtfsId && isLoadingRealTime) return; // Allow re-request to refresh
                    lastRequestedStopIdRef.current = stopId;
                    setIsLoadingRealTime(hasLines);
                    if (!hasLines) setRealTimeData(prev => prev || { stopId, departures: [] });
                    // DO NOT clear realTimeData here to prevent flashing
                    // setRealTimeData(null); 
                    console.log('[REOPEN] Requesting latest data for monitored station:', stop.name, stopId);
                    socket.emit('requestDepartures', stopId);
                    if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
                    departureTimeoutRef.current = setTimeout(() => {
                        if (lastRequestedStopIdRef.current === stopId) {
                            setIsLoadingRealTime(false);
                            setRealTimeData(prev => prev || { stopId, departures: [] });
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
            const isObjectResponse = typeof response === 'object' && response !== null && !Array.isArray(response) && response.stops;
            const newStops = (isObjectResponse ? response.stops : response) || [];
            const source = isObjectResponse ? response.source : null;

            // Recalculate distances relative to userLocation if available
            const loc = userLocationRef.current || userLocation;
            const stopsWithUserDist = newStops.map(s => {
                if (loc) {
                    return { ...s, distance: getDistanceFromLatLonInKm(loc.latitude, loc.longitude, s.lat, s.lon) };
                }
                return s;
            });

            if (source === 'map-movement' || source === 'periodic' || source === 'movement') {
                console.log(`Received stops for map update [${source}]:`, stopsWithUserDist.length);

                // Add new stops to existing map stops, avoiding duplicates.
                setMapStops(prevMapStops => {
                    const existingUniqueIds = new Set(prevMapStops.map(s => String(s.uniqueStopPointId)));
                    const existingGtfsIds = new Set(prevMapStops.map(s => s.gtfsId ? String(s.gtfsId) : null).filter(Boolean));

                    const uniqueNewStops = stopsWithUserDist.filter(s => {
                        const uid = String(s.uniqueStopPointId);
                        const gid = s.gtfsId ? String(s.gtfsId) : null;
                        return !existingUniqueIds.has(uid) && (!gid || !existingGtfsIds.has(gid));
                    });
                    return [...prevMapStops, ...uniqueNewStops];
                });

                // SYNC BOTTOM MENU: If no active search, update bottom list with nearby stops from map
                if (!searchTerm || searchTerm.trim().length === 0) {
                    setBottomMenuStops(prev => {
                        // Merge and sort by distance (now relative to user)
                        const existingUniqueIds = new Set(prev.map(s => String(s.uniqueStopPointId)));
                        const uniqueNew = stopsWithUserDist.filter(s => !existingUniqueIds.has(String(s.uniqueStopPointId)));
                        const merged = [...prev, ...uniqueNew].map(s => {
                            if (loc) {
                                return { ...s, distance: getDistanceFromLatLonInKm(loc.latitude, loc.longitude, s.lat, s.lon) };
                            }
                            return s;
                        }).sort((a, b) => (a.distance || 0) - (b.distance || 0));
                        return merged.slice(0, 100); // Limit list size
                    });
                }
            } else { // This handles initial load, search, and manual refresh.
                console.log('Received stops for bottom menu:', stopsWithUserDist.length);
                const sortedStops = [...stopsWithUserDist].sort((a, b) => (a.distance || 0) - (b.distance || 0));

                setBottomMenuStops(sortedStops);

                // Merge into map stops
                setMapStops(prevMapStops => {
                    const existingIds = new Set(prevMapStops.map(s => String(s.uniqueStopPointId)));
                    const uniqueNew = sortedStops.filter(s => !existingIds.has(String(s.uniqueStopPointId)));
                    return [...prevMapStops, ...uniqueNew];
                });

                if (refreshInProgressRef.current) {
                    refreshInProgressRef.current = false;
                }
                initialMapSyncDoneRef.current = true;
                setIsLoading(false);
                setStationsReady(true);
            }
        };

        const handleTripPathData = (data) => {
            if (data?.tripId && activeTripIdRef.current && String(data.tripId) !== String(activeTripIdRef.current)) return;
            if (data && Array.isArray(data.stops)) {
                console.log('Received trip path stops:', data.stops.length);

                // Map to internal format and merge into mapStops so they actually appear on map
                const mappedStops = data.stops.map(s => {
                    const stopId = s.stop_id || s.gtfsId || s.uniqueStopPointId;
                    const gtfsIds = Array.isArray(s.gtfsIds) && s.gtfsIds.length ? s.gtfsIds : [s.gtfsId || stopId].filter(Boolean);
                    return {
                        uniqueStopPointId: s.uniqueStopPointId || stopId,
                        gtfsId: s.gtfsId || stopId,
                        gtfsIds,
                        name: s.stop_name,
                        lat: s.lat,
                        lon: s.lon,
                        stop_sequence: s.stop_sequence,
                        platform: s.platform || null,
                        zone: s.zone || null,
                        lines: Array.isArray(s.lines) ? s.lines : [],
                        // Use type from server, fallback to selected stop type (via REF to avoid stale closure) or bus
                        mainTrafficType: s.mainTrafficType || selectedStopDataRef.current?.mainTrafficType || 'bus',
                        is_night: s.is_night || false
                    };
                });

                setMapStops(prev => {
                    const existingIds = new Set(prev.map(st => String(st.uniqueStopPointId)));
                    const newAdded = mappedStops.filter(s => !existingIds.has(String(s.uniqueStopPointId)));

                    if (newAdded.length > 0) {
                        console.log(`[FOCUS] Adding ${newAdded.length} new stations to map cache.`);
                        return [...prev, ...newAdded];
                    }
                    return prev;
                });

                const stopIds = Array.from(new Set(mappedStops.flatMap(s => [
                    s.gtfsId,
                    s.uniqueStopPointId,
                    ...(Array.isArray(s.gtfsIds) ? s.gtfsIds : [])
                ]).filter(Boolean).map(String)));
                setTripRouteStops(stopIds);
                setTripStops(mappedStops);
                setTripRouteGeometry(data.geometry);
                setTripShapeDistances(Array.isArray(data.shapeDistances) ? data.shapeDistances : null);
                setTripRouteColor(data.routeColor || null);
                setTripRouteShortName(data.routeShortName || null);
                setTripVehiclePosition(data.vehiclePosition || null);

                // Ensure activeTripId is set (robustness for direct URL entry or deep links later)
                if (data.tripId) {
                    activeTripIdRef.current = data.tripId;
                    setActiveTripId(data.tripId);
                }

                setIsLoadingTripPath(false);
            }
        };

        const handleTripPathError = (data) => {
            console.error('Trip path error:', data.error);
            setIsLoadingTripPath(false);
            clearTripFocus();
            setErrors(prev => [...prev, { error: data.error || 'Failed to load trip path.' }]);
        };

        const handleTripVehiclePositionData = (data) => {
            if (!data || String(data.tripId) !== String(activeTripIdRef.current)) return;
            setTripVehiclePosition(data.position || null);
        };

        const handleTripVehiclePositionError = (data) => {
            if (!data || String(data.tripId) !== String(activeTripIdRef.current)) return;
            setTripVehiclePosition(null);
        };

        const handleMetroLinesData = (data) => {
            if (data && Array.isArray(data.features)) setMetroLines(data);
        };

        const handleDepartureData = (data) => {
            const currentStop = selectedStopDataRef.current;
            if (data?.stopId && !stopMatchesId(currentStop, data.stopId)) {
                if (DEBUG_LOGS) console.log(`[CLIENT] Ignoring stale departureData for ${data.stopId}`);
                return;
            }

            if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
            setIsLoadingRealTime(false);

            if (data && Array.isArray(data.departures)) {
                // Store FULL object to match StopModal expectation
                setRealTimeData(data);
                setErrors(prev => prev.filter(e => !(e && typeof e === 'object' && stopMatchesId(currentStop, e.stopId))));

                const currentActiveTripId = activeTripIdRef.current;
                if (DEBUG_LOGS) console.log(`[CLIENT] Received ${data.departures.length} departures. ActiveTripId: ${currentActiveTripId}`);

                // --- Sticky Trip Persistence Validation ---
                if (currentActiveTripId) {
                    const normActiveId = String(currentActiveTripId);
                    const tripExistsAtThisStop = data.departures.some(d => String(d.trip?.id) === normActiveId);

                    if (DEBUG_LOGS) console.log(`[STICKY] Checking Trip ${normActiveId} in new data (${data.departures.length} departures). Found? ${tripExistsAtThisStop}`);

                    if (!tripExistsAtThisStop) {
                        console.log(`[STATION SWITCH] Trip ${normActiveId} not found at new stop. Falling back to normal mode.`);
                        clearTripFocus();
                    } else {
                        console.log(`[STATION SWITCH] Active trip ${normActiveId} confirmed at new stop.`);
                    }
                }
            } else {
                console.warn('Received departures without array:', data);
                setRealTimeData(null);
            }
        };
        const handleStopsError = (error) => {
            setErrors(prev => [...prev, error.error || 'Failed to fetch stops.']);
            setIsLoading(false);
            refreshInProgressRef.current = false;
        };
        const handleDepartureError = (data) => {
            const currentStop = selectedStopDataRef.current;
            if (data?.stopId && !stopMatchesId(currentStop, data.stopId)) {
                if (DEBUG_LOGS) console.log(`[CLIENT] Ignoring stale departureError for ${data.stopId}`);
                return;
            }

            if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
            setIsLoadingRealTime(false);

            // If departure load fails, we can't confirm trip persistence
            clearTripFocus();

            setErrors(prev => [...prev, { stopId: data?.stopId, error: data?.error || 'Failed to load real-time data.' }]);
        };

        socket.on('stopsData', handleStopsData);
        socket.on('stopsError', handleStopsError);
        socket.on('departureData', handleDepartureData);
        socket.on('departureError', handleDepartureError);
        socket.on('tripPathData', handleTripPathData);
        socket.on('tripPathError', handleTripPathError);
        socket.on('tripVehiclePositionData', handleTripVehiclePositionData);
        socket.on('tripVehiclePositionError', handleTripVehiclePositionError);
        socket.on('metroLinesData', handleMetroLinesData);

        socket.emit('getMetroLines');

        return () => {
            socket.off('stopsData', handleStopsData);
            socket.off('stopsError', handleStopsError);
            socket.off('departureData', handleDepartureData);
            socket.off('departureError', handleDepartureError);
            socket.off('tripPathData', handleTripPathData);
            socket.off('tripPathError', handleTripPathError);
            socket.off('tripVehiclePositionData', handleTripVehiclePositionData);
            socket.off('tripVehiclePositionError', handleTripVehiclePositionError);
            socket.off('metroLinesData', handleMetroLinesData);
        };
    }, [clearTripFocus]);

    useEffect(() => {
        if (!activeTripId) {
            setTripVehiclePosition(null);
            return undefined;
        }

        const tripPayload = activeTripContext || activeTripId;
        socket.emit('getTripVehiclePosition', tripPayload);
        const id = setInterval(() => {
            socket.emit('getTripVehiclePosition', tripPayload);
        }, 5000);

        return () => clearInterval(id);
    }, [activeTripId, activeTripContext]);

    useEffect(() => {
        if (!hasFetchedForLocation.current) {
            hasFetchedForLocation.current = true;
            acquireLocationAndStops({ requestReason: 'startup', showWaitingUi: true });
        }

        return () => {
            clearLocationWaitState();
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
                if (locationPermissionStatus === 'denied') {
                    emitNearbyStops({ forceDefault: true });
                } else if (userLocationRef.current) {
                    emitNearbyStops({ location: userLocationRef.current });
                } else if (locationResolutionStateRef.current === 'fallback') {
                    emitNearbyStops({ forceDefault: true });
                }
            }
            // If a stop is selected, re-monitor it
            const selectedStopId = getStopPrimaryId(selectedStop);
            if (
                selectedStopId &&
                lastRequestedStopIdRef.current !== selectedStopId
            ) {
                const hasLines = stopHasLines(selectedStop);
                socket.emit('requestDepartures', selectedStopId);
                lastRequestedStopIdRef.current = selectedStopId;
                setIsLoadingRealTime(hasLines);
                if (!hasLines) setRealTimeData(prev => prev || { stopId: selectedStopId, departures: [] });
                // DO NOT clear realTimeData here
                // setRealTimeData(null);
                if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
                departureTimeoutRef.current = setTimeout(() => {
                    if (lastRequestedStopIdRef.current === selectedStopId) {
                        setIsLoadingRealTime(false);
                        setRealTimeData(prev => prev || { stopId: selectedStopId, departures: [] });
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
        const selectedStopId = getStopPrimaryId(selectedStop);
        if (
            selectedStopId &&
            lastRequestedStopIdRef.current !== selectedStopId
        ) {
            const hasLines = stopHasLines(selectedStop);
            socket.emit('requestDepartures', selectedStopId);
            lastRequestedStopIdRef.current = selectedStopId;
            setIsLoadingRealTime(hasLines);
            if (!hasLines) setRealTimeData(prev => prev || { stopId: selectedStopId, departures: [] });
            // DO NOT clear realTimeData
            // setRealTimeData(null);
            if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
            departureTimeoutRef.current = setTimeout(() => {
                if (lastRequestedStopIdRef.current === selectedStopId) {
                    setIsLoadingRealTime(false);
                    setRealTimeData(prev => prev || { stopId: selectedStopId, departures: [] });
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
            const selectedStopId = getStopPrimaryId(selectedStop);
            if (selectedStopId) socket.emit('stopDepartureMonitoring', selectedStopId);
            selectedStopDataRef.current = null;
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
                if (locationPermissionStatus === 'denied') {
                    emitNearbyStops({ forceDefault: true });
                } else if (userLocationRef.current) {
                    emitNearbyStops({ location: userLocationRef.current });
                } else if (locationResolutionStateRef.current === 'fallback') {
                    emitNearbyStops({ forceDefault: true });
                }
            }
        }, 300);
    }, [selectedStop, userLocation, locationPermissionStatus]);

    const handleStopSelect = (stop) => {
        if (!stop || (!stop.gtfsId && !stop.uniqueStopPointId)) {
            console.error('Invalid stop selection:', stop);
            return;
        }

        const stopGtfsId = stop.gtfsId ? String(stop.gtfsId) : null;
        const stopUniqueId = stop.uniqueStopPointId ? String(stop.uniqueStopPointId) : null;
        const requestStopId = getStopPrimaryId(stop);

        // Prevent duplicate requests for the same stop
        if (selectedStop && (
            (stopGtfsId && String(selectedStop.gtfsId) === stopGtfsId) ||
            (stopUniqueId && String(selectedStop.uniqueStopPointId) === stopUniqueId)
        ) && !isLoadingRealTime) {
            return;
        }

        const selectedStopId = getStopPrimaryId(selectedStop);
        if (selectedStopId && selectedStopId !== requestStopId) {
            socket.emit('stopDepartureMonitoring', selectedStopId);
        }

        // Sync Map Selection to Bottom Menu:
        // If we select a stop from the map that isn't in our current arrivals list, inject it.
        // Use BOTH IDs for strict deduplication to prevent React key warnings.
        // FORCE STRING normalization on all IDs involved.
        setBottomMenuStops(prev => {
            const targetGtfsId = stop.gtfsId ? String(stop.gtfsId) : null;
            const targetUniqueId = stop.uniqueStopPointId ? String(stop.uniqueStopPointId) : null;

            const exists = prev.some(s => {
                const currentGtfsId = s.gtfsId ? String(s.gtfsId) : null;
                const currentUniqueId = s.uniqueStopPointId ? String(s.uniqueStopPointId) : null;
                return (targetGtfsId && currentGtfsId === targetGtfsId) ||
                    (targetUniqueId && currentUniqueId === targetUniqueId);
            });

            if (!exists) {
                console.log(`[SYNC] Injecting map-selected stop ${stop.name} into bottom menu list.`);
                // Recalculate distance for the new stop to ensure correct sorting
                const loc = userLocationRef.current || userLocation;
                const stopWithDist = { ...stop };
                if (loc) {
                    stopWithDist.distance = getDistanceFromLatLonInKm(loc.latitude, loc.longitude, stop.lat, stop.lon);
                }

                const merged = [...prev, stopWithDist].sort((a, b) => (a.distance || 0) - (b.distance || 0));
                return merged.slice(0, 100);
            }
            // If already exists, just return as is - don't move it!
            return prev;
        });

        selectedStopDataRef.current = stop;
        setSelectedStop(stop);

        // Auto-Exit Focus mode: 
        // If we have an active trip, check if this newly selected stop is part of it.
        // If not, we disable focus mode and clear the curve.
        if (activeTripId && tripRouteStops) {
            const isPartOfTrip = tripRouteStops.includes(stopGtfsId) || tripRouteStops.includes(stopUniqueId);
            if (!isPartOfTrip) {
                console.log(`[FOCUS] Selected stop ${stop.name} is not part of trip ${activeTripId}. Disabling focus mode.`);
                clearTripFocus();
            }
        }

        setIsLoadingTripPath(false); // Proactively cancel trip loading state

        setIsPanelExpanded(false); // Close menu on selection
        const hasLines = stopHasLines(stop);
        setIsLoadingRealTime(hasLines);
        setRealTimeData(hasLines ? null : { stopId: requestStopId, departures: [] }); // Clear only on explicit new selection

        console.log(`[CLIENT] Emitting requestDepartures for ${requestStopId}`);
        socket.emit('requestDepartures', requestStopId);
        lastRequestedStopIdRef.current = requestStopId;

        if (departureTimeoutRef.current) clearTimeout(departureTimeoutRef.current);
        departureTimeoutRef.current = setTimeout(() => {
            if (lastRequestedStopIdRef.current === requestStopId) {
                setIsLoadingRealTime(false);
                setRealTimeData(prev => prev || { stopId: requestStopId, departures: [] });
            }
        }, 10000);

        // Persist selected stop immediately
        sessionStorage.setItem('selectedStop', JSON.stringify(stop));

        // Auto scroll to stop in menu
        setTimeout(() => {
            if (selectedStopRef.current && menuScrollRef.current) {
                const container = menuScrollRef.current;
                const element = selectedStopRef.current;
                const scrollTop = element.offsetTop - container.offsetTop;
                container.scrollTo({ top: scrollTop, behavior: 'smooth' });
            }
        }, 100);
    };

    const handleCloseModal = () => {
        if (selectedStop) {
            const selectedStopId = getStopPrimaryId(selectedStop);
            if (selectedStopId) socket.emit('stopDepartureMonitoring', selectedStopId);
        }
        selectedStopDataRef.current = null;
        setSelectedStop(null);
        setRealTimeData(null);
        clearTripFocus();
        setIsLoadingTripPath(false);
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
        selectedStopDataRef.current = null;
        setSelectedStop(null);
        clearTripFocus();

        // Scroll bottom menu back to top
        if (menuScrollRef.current) {
            menuScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }

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
        acquireLocationAndStops({ requestReason: 'refresh', showWaitingUi: false });
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
            const viewportHeight = window.visualViewport?.height || window.innerHeight;
            document.documentElement.style.setProperty('--vh', `${viewportHeight * 0.01}px`);
        }
        setVh();
        const animationFrame = requestAnimationFrame(setVh);
        const settleTimers = [250, 750, 1500].map((delay) => setTimeout(setVh, delay));
        setIsLayoutReady(true);
        window.addEventListener('resize', setVh);
        window.addEventListener('orientationchange', setVh);
        window.visualViewport?.addEventListener('resize', setVh);
        window.visualViewport?.addEventListener('scroll', setVh);
        return () => {
            cancelAnimationFrame(animationFrame);
            settleTimers.forEach(clearTimeout);
            window.removeEventListener('resize', setVh);
            window.removeEventListener('orientationchange', setVh);
            window.visualViewport?.removeEventListener('resize', setVh);
            window.visualViewport?.removeEventListener('scroll', setVh);
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
                    const isValidLatLon = stop.lat !== undefined && stop.lon !== undefined && !isNaN(stop.lat) && !isNaN(stop.lon);
                    if (!userLocationRef.current && locationResolutionStateRef.current !== 'requesting') {
                        emitNearbyStops({ forceDefault: true });
                    }
                    if (isValidLatLon) {
                        setTimeout(() => {
                            socket.emit('searchStops', { lat: stop.lat, lon: stop.lon, timestamp: Date.now(), source: 'map-movement' });
                        }, 500);
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
            className="relative"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100dvh',
                minHeight: 'calc((var(--vh, 1vh) * 100) + env(safe-area-inset-bottom, 0px))',
                overflow: 'hidden',
                WebkitOverflowScrolling: 'touch',
                // Prevent iOS rubber banding
                overscrollBehavior: 'none',
                MozOverscrollBehavior: 'none',
                backgroundColor: '#0a0a0a', // Add the dark background color
            }}
        >
            <div
                aria-hidden="true"
                className="pointer-events-none fixed top-0 left-0 right-0 z-10"
                style={{
                    height: 'calc(env(safe-area-inset-top, 0px) + 72px)',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.55) 48%, rgba(0,0,0,0))',
                }}
            />
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
                tripStops={tripStops}
                routeGeometry={tripRouteGeometry}
                routeShapeDistances={tripShapeDistances}
                routeColor={tripRouteColor}
                routeShortName={tripRouteShortName}
                tripVehiclePosition={tripVehiclePosition}
                metroLines={metroLines}
                activeTripId={activeTripId}
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
                                    if (locationPermissionStatus === 'denied') {
                                        emitNearbyStops({ forceDefault: true });
                                    } else if (userLocationRef.current) {
                                        emitNearbyStops({ location: userLocationRef.current });
                                    } else if (locationResolutionStateRef.current === 'fallback') {
                                        emitNearbyStops({ forceDefault: true });
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
                    onStopSelect={handleStopSelect}
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
                    isWaitingForLocation={(locationResolutionState === 'requesting' && locationDecisionPending && !userLocation)}
                    locationWaitRemainingSec={locationWaitRemainingSec}
                    onLocationClick={handleLocationClick}
                />
            </div>

            {selectedStop && (
                <StopModal
                    stop={selectedStop}
                    onClose={handleCloseModal}
                    realTimeData={realTimeData}
                    isLoadingRealTime={isLoadingRealTime || isLoadingTripPath}
                    error={errors.find(e => e && typeof e === 'object' && stopMatchesId(selectedStop, e.stopId))}
                    onDepartureClick={(arrival) => {
                        if (arrival && arrival.trip) {
                            const tripContext = buildTripContext(arrival);
                            if (activeTripId === tripContext.clientTripId) {
                                // Toggle OFF
                                console.log('Departure clicked (Toggle ID match), clearing focus');
                                clearTripFocus();
                            } else {
                                // Toggle ON
                                console.log('Departure clicked, requesting path for:', tripContext.tripId);
                                setIsPanelExpanded(false); // Close menu on trip select
                                activeTripIdRef.current = tripContext.clientTripId;
                                setActiveTripId(tripContext.clientTripId);
                                setActiveTripContext(tripContext);
                                setTripRouteStops(null);
                                setTripRouteGeometry(null); // Reset until new one arrives
                                setTripShapeDistances(null);
                                setTripStops([]);
                                setTripVehiclePosition(null);
                                setTripRouteColor(null);
                                setTripRouteShortName(null);
                                setIsLoadingTripPath(true);
                                socket.emit('getTripPath', tripContext);
                            }
                        }
                    }}
                    activeTripId={activeTripId}
                    setActiveTripId={setActiveTripId}
                    setTripRouteStops={setTripRouteStops}
                    clearTripFocus={clearTripFocus}
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
