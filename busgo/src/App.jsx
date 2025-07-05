import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import ConnectionStatus, { socket } from './components/ConnectionStatus';
import MessagesSection from './components/MessagesSection';
import ErrorsSection from './components/ErrorsSection';
import Pagination from './components/Pagination';
import LoadingScreen from './components/LoadingScreen';
import StopItem from './components/StopItem';
import locationIcon from './assets/location.svg';

// --- Map Components ---
function MapViewUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

const AppMap = React.memo(({ stops, userLocation }) => {
    const mapPosition = userLocation 
        ? [userLocation.latitude, userLocation.longitude] 
        : [50.0755, 14.4378]; // Prague center fallback

    return (
        <div className="absolute inset-0 z-0">
            <MapContainer center={mapPosition} zoom={14} scrollWheelZoom={true}>
                <MapViewUpdater center={mapPosition} zoom={14} />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {stops.map(stop => (
                    (stop.lat && stop.lon) && (
                        <Marker key={stop.uniqueStopPointId} position={[stop.lat, stop.lon]}>
                            <Popup>{stop.name} ({stop.platform || 'N/A'})</Popup>
                        </Marker>
                    )
                ))}
                {userLocation && (
                    <Marker position={[userLocation.latitude, userLocation.longitude]}>
                        <Popup>You are here</Popup>
                    </Marker>
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
        if (delayInSeconds === null || delayInSeconds === undefined || delayInSeconds < 0) {
            return null; // Don't show for early or on-time
        }
        const minutes = Math.floor(delayInSeconds / 60);
        const seconds = delayInSeconds % 60;
        return `+${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const delayString = formatDelay(arrival?.delay?.seconds);
    const isDeparting = remainingTime !== null && remainingTime <= 60000 && remainingTime > 0;

    return (
        <div className={`flex justify-between items-center p-3 mb-2 rounded-lg border-b border-gray-800 transition-all duration-300`}>
            <div className="flex items-center gap-3 min-w-0">
                <span className="px-3 py-1 rounded-md font-bold text-center text-sm shadow-md flex-shrink-0" style={{ backgroundColor: `#${route.route_color || '6c757d'}`, color: `#${route.route_text_color || 'ffffff'}` }}>
                    {route.short_name}
                </span>
                <span className="font-medium text-white truncate">{trip.headsign}</span>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
                {delayString && <span className="text-sm font-semibold text-orange-400 w-16 text-center">{delayString}</span>}
                <span className={`text-lg font-bold w-20 text-right ${isDeparting ? 'text-orange-400 animate-pulse' : 'text-white'}`}>
                    {formatRemainingTime(remainingTime)}
                </span>
            </div>
        </div>
    );
};

// --- Fullscreen Modal Component ---
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
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in" onClick={onClose}></div>
            <div className="fixed inset-0 z-[60] flex items-center justify-center">
                <div className="w-full h-full bg-background-secondary/95 backdrop-blur-xl flex flex-col animate-slide-up">
                    <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                        <div>
                            <h2 className="m-0 text-xl md:text-2xl text-white font-semibold">{name} - Platform {platform || ''}</h2>
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-gray-400 mt-1">
                                <span>Zone: {zone}</span>
                                <span>{getWheelchairAccessText(wheelchairAccess)}</span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="bg-red-500/50 border border-red-400/60 rounded-full text-white w-9 h-9 flex items-center justify-center cursor-pointer text-xl font-bold transition-all duration-200 ease-in-out hover:bg-red-600 hover:scale-110 active:scale-95 flex-shrink-0"
                            aria-label="Close modal"
                        >
                            ×
                        </button>
                    </header>

                    <div className="overflow-y-auto p-4">
                        {isLoadingRealTime && <LoadingScreen />}
                        {error && <div className="text-center text-red-400 p-6 bg-red-500/10 rounded-xl">{error.error}</div>}
                        {realTimeData && (
                            hasDepartures ? (
                                realTimeData.departures.map((arrival, index) => (
                                    <Arrival key={arrival.trip.id || index} arrival={arrival} />
                                ))
                            ) : (
                                <p className="text-center text-gray-500 p-10">No departures scheduled.</p>
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
        setIsLoadingRealTime(true);
        setRealTimeData(null);
        socket.emit('requestDepartures', stop.gtfsId);
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

    const cardsPerPage = 50;
    const indexOfLastCard = currentPage * cardsPerPage;
    const indexOfFirstCard = indexOfLastCard - cardsPerPage;
    const currentCards = stops.slice(indexOfFirstCard, indexOfLastCard);
    const totalPages = Math.ceil(stops.length / cardsPerPage);

    return (
        <div className="h-screen w-screen overflow-hidden bg-background-primary relative">
            <AppMap stops={stops} userLocation={userLocation} />
            
            <header className="absolute top-0 left-0 w-full z-20 p-4 pointer-events-none">
                <div className="max-w-xl w-full mx-auto flex flex-col items-center gap-3 pointer-events-auto">
                    <h1 className="m-0 font-bold text-3xl text-white tracking-tighter" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.7)' }}>
                        PID Departures
                    </h1>
                    <input
                        type="text"
                        className="w-full px-5 py-3 text-base border border-gray-500/50 rounded-xl outline-none transition-all duration-300 ease-in-out glass-effect text-white font-inter font-normal placeholder-gray-400 focus:shadow-lg focus:border-cyan-400"
                        placeholder="Search for a station..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                </div>
            </header>

            <div className={`
                absolute bottom-0 left-0 right-0 z-30
                transition-transform duration-500 ease-in-out
                ${isPanelExpanded ? 'translate-y-10' : 'translate-y-[calc(100%-220px)]'}
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
                                onClick={forceRefresh}
                                className="absolute right-0 top-0 text-xs bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 px-3 py-1.5 rounded-full border border-blue-400/30 transition-all duration-200 hover:scale-105 shadow-sm backdrop-blur-sm"
                            >
                                🔄
                            </button>
                        </div>
                        <span className="text-sm font-semibold block">
                            {isPanelExpanded ? (searchTerm ? "Search Results" : "Nearby Stations") : "Nearby Stations"}
                        </span>
                    </div>

                    <div className="flex-grow overflow-y-auto">
                         {isLoading ? (
                            <LoadingScreen />
                        ) : currentCards.length > 0 ? (
                            currentCards.map((stop) => (
                                <StopItem
                                    key={stop.uniqueStopPointId}
                                    stop={stop}
                                    handleStopSelect={() => handleStopSelect(stop)}
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
