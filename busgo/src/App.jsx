import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import ConnectionStatus, { socket } from './components/ConnectionStatus';
import MessagesSection from './components/MessagesSection';
import ErrorsSection from './components/ErrorsSection';
import Pagination from './components/Pagination';
import LoadingScreen from './components/LoadingScreen';
import StopItem from './components/StopItem';
import MapLocationTracker from './components/MapLocationTracker';
import locationIcon from './assets/location.svg';
import refreshIcon from './assets/refresh.svg';
import iceIcon from './assets/ice.svg';

// --- Map Components ---
function MapViewUpdater({ center, zoom, shouldUpdate }) {
  const map = useMap();
  useEffect(() => {
    if (center && shouldUpdate) {
      console.log('[MAP] Moving camera to:', center);
      map.flyTo(center, zoom, {
        duration: 1,
        easeLinearity: 0.25
      });
    }
  }, [shouldUpdate]); // Only depend on shouldUpdate, not center or zoom
  return null;
}

const AppMap = React.memo(({ stops, userLocation, onStopSelect, selectedStop, socket }) => {
    const mapPosition = userLocation 
        ? [userLocation.latitude, userLocation.longitude] 
        : [50.0755, 14.4378]; // Prague center fallback

    // Use selected stop position if available, otherwise use user location
    const centerPosition = selectedStop && selectedStop.lat && selectedStop.lon
        ? [selectedStop.lat, selectedStop.lon]
        : mapPosition;

    // Track when we should actually move the camera
    const [shouldUpdateCamera, setShouldUpdateCamera] = useState(false);
    
    // Only move camera when a stop is selected (not when user location changes or stops update)
    useEffect(() => {
        if (selectedStop) {
            console.log('[MAP] Stop selected, moving camera to:', selectedStop.name);
            setShouldUpdateCamera(true);
            // Reset after a short delay to prevent continuous updates
            setTimeout(() => setShouldUpdateCamera(false), 100);
        }
    }, [selectedStop?.gtfsId]);

    // Only log when stops or selectedStop changes, not on every render
    useEffect(() => {
        console.log('AppMap rendering with position:', centerPosition, 'stops:', stops.length, 'userLocation:', userLocation, 'selectedStop:', selectedStop?.name);
    }, [stops.length, selectedStop?.gtfsId, centerPosition]);

    return (
        <div className="absolute inset-0 z-0 h-full w-full">
            <MapContainer 
                center={centerPosition} 
                zoom={selectedStop ? 16 : 16} 
                scrollWheelZoom={true}
                zoomControl={false}
                style={{ height: '100%', width: '100%' }}
                attributionControl={false}
            >
                {/* Only move camera when stop is selected, not when user moves map */}
                <MapViewUpdater center={centerPosition} zoom={selectedStop ? 16 : 16} shouldUpdate={shouldUpdateCamera} />
                <MapLocationTracker socket={socket} />
                <TileLayer
                    attribution=""
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {stops.map(stop => (
                    (stop.lat && stop.lon) && (
                        <Marker 
                            key={stop.uniqueStopPointId} 
                            position={[stop.lat, stop.lon]}
                            icon={L.divIcon({
                                className: `custom-stop-marker ${selectedStop && selectedStop.gtfsId === stop.gtfsId ? 'cursor-default' : 'cursor-pointer'}`,
                                html: `
                                    <div class="bg-blue-500 text-white rounded-lg w-8 h-8 text-xs font-bold shadow-xl border-2 border-gray-300 flex items-center justify-center ${selectedStop && selectedStop.gtfsId === stop.gtfsId ? 'opacity-50' : 'hover:bg-blue-600'} transition-all duration-200">
                                        ${stop.platform || 'P'}
                                    </div>
                                `,
                                iconSize: [32, 32],
                                iconAnchor: [16, 16]
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
    console.log('Arrival object:', JSON.stringify(arrival, null, 2));
    const { route, trip, departure_timestamp } = arrival;
    const [remainingTime, setRemainingTime] = useState(null);

    useEffect(() => {
        // Access departure_timestamp directly from arrival object
        let departureTimestamp = departure_timestamp?.predicted || 
                               departure_timestamp?.scheduled;
        
        console.log('Departure timestamp:', departureTimestamp);
        console.log('Departure timestamp object:', departure_timestamp);

        if (!departureTimestamp) {
            setRemainingTime(null);
            return;
        }
        
        const calculateRemaining = () => {
            let arrivalTime;
            
            // Handle different timestamp formats
            if (typeof departureTimestamp === 'string') {
                // Try to parse as ISO string first
                const parsed = new Date(departureTimestamp);
                if (isNaN(parsed.getTime())) {
                    // Try parsing as Unix timestamp (seconds)
                    const unixTimestamp = parseInt(departureTimestamp);
                    if (!isNaN(unixTimestamp)) {
                        arrivalTime = unixTimestamp * 1000; // Convert to milliseconds
                    } else {
                        console.error('Cannot parse timestamp string:', departureTimestamp);
                        setRemainingTime(null);
                        return;
                    }
                } else {
                    arrivalTime = parsed.getTime();
                }
            } else if (typeof departureTimestamp === 'number') {
                // If it's already a timestamp in milliseconds
                if (departureTimestamp < 1000000000000) {
                    // Likely Unix timestamp in seconds, convert to milliseconds
                    arrivalTime = departureTimestamp * 1000;
                } else {
                    // Already in milliseconds
                    arrivalTime = departureTimestamp;
                }
            } else {
                console.error('Unknown timestamp format:', departureTimestamp);
                setRemainingTime(null);
                return;
            }
            
            const now = Date.now();
            console.log('Arrival time:', arrivalTime, 'Now:', now, 'Difference:', arrivalTime - now);
            setRemainingTime(Math.max(0, arrivalTime - now));
        };
        calculateRemaining();
        const interval = setInterval(calculateRemaining, 1000);
        return () => clearInterval(interval);
    }, [departure_timestamp]);

    const formatRemainingTime = (ms) => {
        if (ms === null) return 'N/A';
        if (ms <= 0) return "Departed";
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
            return null; // Don't show for unknown delays
        }
        
        const minutes = Math.floor(Math.abs(delayInSeconds) / 60);
        const seconds = Math.abs(delayInSeconds) % 60;
        
        if (delayInSeconds > 0) {
            if (minutes === 0) {
                return `+${seconds}s`; // Just seconds for under a minute
            } else {
                return `+${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        } else if (delayInSeconds < 0) {
            if (minutes === 0) {
                return `-${seconds}s`; // Just seconds for under a minute
            } else {
                return `-${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        } else {
            return `00:00`; // On time
        }
    };

    const delayString = formatDelay(arrival?.delay?.seconds);
    const isDeparting = remainingTime !== null && remainingTime <= 60000 && remainingTime > 0;
    
    // Determine delay color based on delay value
    const getDelayColor = (delayInSeconds) => {
        if (delayInSeconds === null || delayInSeconds === undefined) return '';
        if (delayInSeconds === 0) return 'text-green-400'; // On time - green
        if (delayInSeconds > 0) return 'text-orange-400'; // Delayed - orange
        if (delayInSeconds < 0) return 'text-blue-400'; // Early - blue
        return '';
    };
    
    const delayColor = getDelayColor(arrival?.delay?.seconds);

    return (
        <div className={`flex justify-between items-start p-3 mb-2 rounded-lg border-b border-gray-800 transition-all duration-300`}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                    <span className="px-3 py-1 rounded-md font-bold text-center text-sm shadow-md flex-shrink-0 bg-yellow-500 text-black">
                        {route.short_name}
                    </span>
                    <div className="flex-1 min-w-0">
                        <span className="font-medium text-white truncate block">{trip.headsign}</span>
                        {delayString && (
                            <div className="text-xs text-gray-400 flex items-center gap-2 mt-1">
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
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-lg font-bold w-20 text-right ${isDeparting ? 'text-orange-400 animate-pulse' : 'text-white'}`}>
                    {formatRemainingTime(remainingTime)}
                </span>
            </div>
        </div>
    );
};

// --- Modern Bubble Modal Component ---
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

    return (
        <>
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-lg">
                <div className="bg-background-secondary rounded-2xl shadow-2xl border border-gray-700/50 animate-slide-up max-h-[calc(100vh-8rem)] overflow-hidden">
                    <header className="flex items-center justify-between p-4 border-b border-gray-700/50">
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
                            className="bg-gray-800/80 hover:bg-gray-700/80 border border-gray-600/50 rounded-xl text-gray-300 hover:text-white w-8 h-8 flex items-center justify-center cursor-pointer transition-all duration-200 ease-in-out hover:scale-105 active:scale-95 flex-shrink-0 ml-3 group"
                            aria-label="Close modal"
                        >
                            <svg className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </header>

                    <div className="overflow-y-auto p-4" style={{ maxHeight: 'calc(100vh - 12rem)' }}>
                        {isLoadingRealTime && <LoadingScreen />}
                        {error && <div className="text-center text-red-400 p-4 bg-red-500/10 rounded-xl text-sm">{error.error}</div>}
                        {realTimeData && (
                            hasDepartures ? (
                                realTimeData.departures.map((arrival, index) => (
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
    const [stops, setStops] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedStop, setSelectedStop] = useState(null);
    const [realTimeData, setRealTimeData] = useState(null);
    const [isLoadingRealTime, setIsLoadingRealTime] = useState(false);
    const [messages, setMessages] = useState([]);
    const [errors, setErrors] = useState([]);
    const [userLocation, setUserLocation] = useState(null);
    const [isPanelExpanded, setIsPanelExpanded] = useState(false);

    const debounceTimeout = useRef(null);
    const hasFetchedForLocation = useRef(false);
    const selectedStopRef = useRef(null);
    const menuScrollRef = useRef(null);

    useEffect(() => {
        const handleStopsData = (data) => {
            console.log('Received stops data:', data);
            if (data && data.length > 0) {
                console.log('Sample stop:', data[0]);
                console.log('Sample uniqueStopPointId:', data[0].uniqueStopPointId);
            }
            setStops(data || []);
            setIsLoading(false);
        };
        const handleDepartureData = (data) => {
            console.log('Received departure data:', JSON.stringify(data, null, 2));
            if (data.departures && data.departures.length > 0) {
                console.log('Sample departure:', JSON.stringify(data.departures[0], null, 2));
            }
            setRealTimeData(data);
            setIsLoadingRealTime(false);
        };
        const handleStopsError = (error) => {
            setErrors(prev => [...prev, error.error || 'Failed to fetch stops.']);
            setIsLoading(false);
        };
        const handleDepartureError = (error) => {
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
        if (navigator.geolocation && !hasFetchedForLocation.current) {
            hasFetchedForLocation.current = true;
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ latitude, longitude });
                // Add timestamp to force fresh data
                socket.emit('searchStops', { lat: latitude, lon: longitude, timestamp: Date.now() });
            }, () => {
                setIsLoading(false);
                setErrors(prev => [...prev, "Location access denied. Using default location."]);
            });
        } else {
             setIsLoading(false);
        }
    }, []);

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
            if (newSearchTerm.length > 0) {
                 setIsLoading(true);
                 socket.emit('searchStops', { query: newSearchTerm, timestamp: Date.now() });
            } else {
                // When search is cleared, refresh nearby stations
                setIsLoading(true);
                if (userLocation) {
                    socket.emit('searchStops', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                } else {
                    // Fallback to default location if no user location
                    socket.emit('searchStops', { timestamp: Date.now() });
                }
            }
        }, 300);
    }, [selectedStop, userLocation]);

    const handleStopSelect = (stop) => {
        if (selectedStop && selectedStop.gtfsId !== stop.gtfsId) {
            socket.emit('stopDepartureMonitoring', selectedStop.gtfsId);
        }
        setSelectedStop(stop);
        setIsPanelExpanded(false); // Collapse bottom menu when station is selected
        setIsLoadingRealTime(true);
        setRealTimeData(null);
        socket.emit('requestDepartures', stop.gtfsId);
        
        // Scroll to selected station after a short delay to ensure DOM is updated
        setTimeout(() => {
            if (selectedStopRef.current && menuScrollRef.current) {
                const container = menuScrollRef.current;
                const element = selectedStopRef.current;
                
                // Calculate position to put selected station at the top of collapsed menu
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
    };

    const removeError = (index) => {
        setErrors(errors.filter((_, i) => i !== index));
    };

    // Force refresh function
    const forceRefresh = () => {
        setStops([]);
        setSearchTerm('');
        setIsPanelExpanded(false);
        setIsLoading(true);
        hasFetchedForLocation.current = false;
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ latitude, longitude });
                socket.emit('searchStops', { lat: latitude, lon: longitude, timestamp: Date.now() });
            }, () => {
                setIsLoading(false);
                setErrors(prev => [...prev, "Location access denied. Using default location."]);
            });
        }
    };

    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefreshClick = () => {
        setIsRefreshing(true);
        forceRefresh();
        // Stop spinning after a short delay
        setTimeout(() => setIsRefreshing(false), 1000);
    };



    const cardsPerPage = 50;
    const indexOfLastCard = currentPage * cardsPerPage;
    const indexOfFirstCard = indexOfLastCard - cardsPerPage;
    const currentCards = stops.slice(indexOfFirstCard, indexOfLastCard);
    const totalPages = Math.ceil(stops.length / cardsPerPage);

    return (
        <div className="h-screen w-screen overflow-hidden bg-background-primary relative">
            <AppMap 
                stops={stops} 
                userLocation={userLocation} 
                onStopSelect={handleStopSelect} 
                selectedStop={selectedStop}
                socket={socket}
            />
            
            <header className="absolute top-0 left-0 w-full z-20 p-4 pointer-events-none">
                <div className="max-w-xl w-full mx-auto flex flex-col items-center gap-3 pointer-events-auto">
                    <h1 className="m-0 font-bold text-3xl text-white tracking-tighter" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.7)' }}>
                        HopGo
                    </h1>
                    <div className="relative w-full">
                        <input
                            type="text"
                            className="w-full px-5 py-3 pr-12 text-base border border-gray-500/50 rounded-xl outline-none transition-all duration-300 ease-in-out glass-effect text-white font-inter font-normal placeholder-gray-400 focus:shadow-lg focus:border-cyan-400"
                            placeholder="Search for a station..."
                            value={searchTerm}
                            onChange={handleSearchChange}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setIsPanelExpanded(false);
                                    if (userLocation) {
                                        setIsLoading(true);
                                        socket.emit('searchStops', { lat: userLocation.latitude, lon: userLocation.longitude, timestamp: Date.now() });
                                    } else {
                                        setIsLoading(true);
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

            <div className={`
                absolute bottom-0 left-0 right-0 z-30
                transition-transform duration-500 ease-in-out
                ${isPanelExpanded ? 'translate-y-10' : 'translate-y-[calc(100%-170px)]'}
            `}>
                <div className="w-full h-[calc(100vh-80px)] max-w-3xl mx-auto flex flex-col glass-effect rounded-t-2xl shadow-2xl overflow-hidden">
                    <div className="p-3 text-center text-gray-300 border-b border-gray-700/60">
                        <div className="relative">
                            <div className="w-10 h-1.5 bg-gray-600 rounded-full mx-auto mb-1 cursor-pointer" onClick={() => setIsPanelExpanded(!isPanelExpanded)}></div>
                            {userLocation && (
                                <div className="absolute left-0 top-0 text-gray-400 text-sm">
                                    <img src={locationIcon} alt="Location" className="w-5 h-5 opacity-60 m-1" />
                                </div>
                            )}
                            <button 
                                onClick={handleRefreshClick}
                                className="absolute right-0 top-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 px-3 py-1 rounded-full border border-blue-400/30 transition-all duration-200 hover:scale-105 shadow-sm backdrop-blur-sm flex items-center justify-center"
                            >
                                <img 
                                    src={refreshIcon} 
                                    alt="Refresh" 
                                    className={`w-5 h-5 transition-transform duration-200 ${isRefreshing ? 'animate-spin-reverse' : ''}`}
                                />
                            </button>
                        </div>
                        <span className="text-sm font-semibold block">
                            {searchTerm ? "Search Results" : "Nearby Stations"}
                        </span>
                    </div>

                    <div className="flex-grow overflow-y-auto" ref={menuScrollRef}>
                         {isLoading ? (
                            <LoadingScreen />
                        ) : currentCards.length > 0 ? (
                            currentCards.map((stop) => (
                                <StopItem
                                    key={stop.uniqueStopPointId}
                                    stop={stop}
                                    handleStopSelect={() => handleStopSelect(stop)}
                                    isSelected={selectedStop && selectedStop.gtfsId === stop.gtfsId}
                                    ref={selectedStop && selectedStop.gtfsId === stop.gtfsId ? selectedStopRef : null}
                                />
                            ))
                        ) : (
                            <p className="text-gray-400 text-center p-10">
                                {searchTerm ? 'No stops match your search.' : 'Nearby stops will appear here.'}
                            </p>
                        )}
                    </div>

                    {totalPages > 1 && isPanelExpanded && (
                        <div className="flex-shrink-0 border-t border-gray-700/60">
                             <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                handlePageChange={(page) => setCurrentPage(page)}
                            />
                        </div>
                    )}
                </div>
            </div>

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
        </div>
    );
}

export default App;
