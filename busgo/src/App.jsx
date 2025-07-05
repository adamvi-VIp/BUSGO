import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import ConnectionStatus, { socket } from './components/ConnectionStatus';
import MessagesSection from './components/MessagesSection';
import ErrorsSection from './components/ErrorsSection';
import StopItem from './components/StopItem';
import Pagination from './components/Pagination';
import LoadingScreen from './components/LoadingScreen';

// GPS Manager Class to handle location services
class GPSManager {
    constructor() {
        this.watchId = null;
        this.subscribers = new Set();
    }

    start() {
        if (this.watchId) return;
        const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
        this.watchId = navigator.geolocation.watchPosition(
            this.handlePositionUpdate.bind(this),
            this.handleError.bind(this),
            options
        );
    }

    stop() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    handlePositionUpdate(position) {
        this.subscribers.forEach(callback => callback(position.coords));
    }

    handleError(error) {
        console.error("GPS Error:", error);
        this.subscribers.forEach(callback => callback(null, error));
    }
}

// Helper function to remove spaces and diacritics from text
const normalizeText = (text) => {
    if (!text) return '';
    return text
        .normalize("NFD") // Decompose combined graphemes (e.g., 'č' -> 'c' + 'ˇ')
        .replace(/[\u0300-\u036f]/g, "") // Remove the diacritical marks
        .replace(/\s+/g, '') // Remove all spaces
        .toLowerCase(); // Convert to lower case for consistency
};

function App() {
    const [stops, setStops] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedStop, setSelectedStop] = useState(null);
    const [closingStopId, setClosingStopId] = useState(null);
    const [realTimeData, setRealTimeData] = useState(null);
    const [isLoadingRealTime, setIsLoadingRealTime] = useState(false);
    const [messages, setMessages] = useState([]);
    const [errors, setErrors] = useState([]);
    const [lastUpdateTime, setLastUpdateTime] = useState('');
    const [isScrolled, setIsScrolled] = useState(false);
    const [vehiclePosition, setVehiclePosition] = useState(null);
    const [loadingTripId, setLoadingTripId] = useState(null);
    const [vehicleStatus, setVehicleStatus] = useState({ active: [], inactive: [] });

    const debounceTimeout = useRef(null);
    const gpsManager = useRef(null);
    const hasFetchedForLocation = useRef(false);

    // Socket event listeners
    useEffect(() => {
        const handleStopsData = (data) => {
            if (data && data.stopGroups) {
                const flattenedStops = data.stopGroups.flatMap(group =>
                    group.stops.map(stop => ({
                        ...stop,
                        name: group.name, // Add name from the parent group
                        // Use the GTFS ID for API calls, as it's more reliable for real-time data
                        id: stop.gtfsIds && stop.gtfsIds.length > 0 ? stop.gtfsIds[0] : stop.id,
                    }))
                );
                setStops(flattenedStops);
            } else {
                // Fallback for old data format or empty responses
                setStops(data || []);
            }
            setCurrentPage(1);
            setIsLoading(false);
        };
        const handleStopsError = (error) => {
            setErrors(prev => [...prev, error.error || 'Failed to fetch stops.']);
            setIsLoading(false);
        };
        const handleDepartureData = (data) => {
            console.log('[FRONTEND] Received departureData:', data);
            setRealTimeData(data);
            setIsLoadingRealTime(false);
            setLastUpdateTime(new Date().toLocaleTimeString());
        };
        const handleDepartureError = (error) => {
            setErrors(prev => [...prev, error.error || `Failed to get real-time data for stop ${error.stopId}.`]);
            setIsLoadingRealTime(false);
        };
        const handleVehiclePositionData = (data) => {
            setVehiclePosition(data);
            setLoadingTripId(null);
        };
        const handleVehiclePositionError = (error) => {
            setErrors(prev => [...prev, error.error || `Failed to get vehicle position for trip ${error.tripId}.`]);
            setLoadingTripId(null);
        };
        const handleVehicleStatusUpdate = (data) => {
            setVehicleStatus(data);
        };

        socket.on('stopsData', handleStopsData);
        socket.on('stopsError', handleStopsError);
        socket.on('departureData', handleDepartureData);
        socket.on('departureError', handleDepartureError);
        socket.on('vehiclePositionData', handleVehiclePositionData);
        socket.on('vehiclePositionError', handleVehiclePositionError);
        socket.on('vehicleStatusUpdate', handleVehicleStatusUpdate);

        return () => {
            socket.off('stopsData', handleStopsData);
            socket.off('stopsError', handleStopsError);
            socket.off('departureData', handleDepartureData);
            socket.off('departureError', handleDepartureError);
            socket.off('vehiclePositionData', handleVehiclePositionData);
            socket.off('vehiclePositionError', handleVehiclePositionError);
            socket.off('vehicleStatusUpdate', handleVehicleStatusUpdate);
        };
    }, []);

    // Effect for initializing GPS and handling scroll
    useEffect(() => {
        gpsManager.current = new GPSManager();
        const unsubscribe = gpsManager.current.subscribe((location, error) => {
            if (error) {
                setIsLoading(false);
                setErrors(prev => [...prev, `Location Error: ${error.message}`]);
                if(stops.length === 0) setIsLoading(false);
                return;
            }
            if (location && !hasFetchedForLocation.current) {
                hasFetchedForLocation.current = true;
                setIsLoading(true);
                // *** FIX: Using socket.emit to fetch stops by location ***
                socket.emit('searchStops', { lat: location.latitude, lon: location.longitude });
                gpsManager.current.stop();
            }
        });

        gpsManager.current.start();
        
        const initialLoadTimeout = setTimeout(() => {
             if(isLoading) {
                setIsLoading(false);
                if(!hasFetchedForLocation.current) {
                    setErrors(prev => [...prev, "Could not determine location. Please search for a stop manually."]);
                }
             }
        }, 8000);

        const handleScroll = () => setIsScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);

        return () => {
            unsubscribe();
            gpsManager.current?.stop();
            window.removeEventListener('scroll', handleScroll);
            clearTimeout(initialLoadTimeout);
        };
    }, []); // Removed dependencies to ensure it only runs once on mount


    const handleSearchChange = useCallback((event) => {
        const newSearchTerm = event.target.value;
        setSearchTerm(newSearchTerm);
        setSelectedStop(null);

        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        debounceTimeout.current = setTimeout(() => {
            const normalizedSearchTerm = normalizeText(newSearchTerm);

            if (normalizedSearchTerm.trim() === '') {
                setStops([]);
                hasFetchedForLocation.current = false;
                if (gpsManager.current) {
                    setIsLoading(true);
                    gpsManager.current.start();
                }
                return;
            }
            setIsLoading(true);
            socket.emit('searchStops', { query: normalizedSearchTerm });
        }, 500);
    }, []);

    const handleStopSelect = (stop) => {
        if (selectedStop && selectedStop.id === stop.id) {
            setClosingStopId(stop.id);
            setTimeout(() => {
                setSelectedStop(null);
                setRealTimeData(null);
                setVehiclePosition(null);
                setClosingStopId(null);
            }, 500);
        } else {
            setSelectedStop(stop);
            setIsLoadingRealTime(true);
            setRealTimeData(null);
            setVehiclePosition(null);
            socket.emit('requestDepartures', stop.id);
        }
    };

    const handleTrackVehicle = (tripId) => {
        if (loadingTripId === tripId) return;
        setLoadingTripId(tripId);
        setVehiclePosition(null);
        socket.emit('requestVehiclePosition', tripId);
    };

    const removeError = (index) => {
        setErrors(errors.filter((_, i) => i !== index));
    };

    const cardsPerPage = 20;
    const indexOfLastCard = currentPage * cardsPerPage;
    const indexOfFirstCard = indexOfLastCard - cardsPerPage;
    const currentCards = stops.slice(indexOfFirstCard, indexOfLastCard);
    const totalPages = Math.ceil(stops.length / cardsPerPage);

    const handlePageChange = (pageNumber) => {
        setCurrentPage(pageNumber);
    };

    return (
        <div className={`App ${selectedStop ? 'stop-selected' : ''}`}>
             <header className={`App-header ${isScrolled ? 'scrolled' : ''}`}>
                <div className="header-content">
                    <h1>PID Departures</h1>
                    <p className="last-update">{lastUpdateTime && `Last Update: ${lastUpdateTime}`}</p>
                    <ConnectionStatus />
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search for a station..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                </div>
            </header>
            <div className="content-area">
                <div className="stops-grid">
                    {isLoading ? (
                        <LoadingScreen />
                    ) : currentCards.length > 0 ? (
                        currentCards.map(stop => (
                            <StopItem
                                key={stop.id}
                                stop={stop}
                                isSelected={selectedStop?.id === stop.id}
                                isClosing={closingStopId === stop.id}
                                isLoadingRealTime={isLoadingRealTime && selectedStop?.id === stop.id}
                                realTimeData={selectedStop?.id === stop.id ? realTimeData : null}
                                error={errors.find(e => e.stopId === stop.id)}
                                handleStopSelect={handleStopSelect}
                                handleTrackVehicle={handleTrackVehicle}
                                vehiclePosition={vehiclePosition}
                                loadingTripId={loadingTripId}
                                vehicleStatus={vehicleStatus}
                            />
                        ))
                    ) : (
                        <p className="no-stops-message">{searchTerm ? 'No bus stops match your search.' : 'Search for a stop or enable location services to find nearby stations.'}</p>
                    )}
                </div>
                {totalPages > 1 && !selectedStop && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        handlePageChange={handlePageChange}
                    />
                )}
            </div>
            <MessagesSection messages={messages} />
            <ErrorsSection errors={errors.filter(e => !e.stopId)} removeError={removeError} />
        </div>
    );
}

export default App;
