import React, { useState, useEffect, useCallback, useRef } from 'react';
import ConnectionStatus, { socket } from './components/ConnectionStatus';
import MessagesSection from './components/MessagesSection';
import ErrorsSection from './components/ErrorsSection';
import Pagination from './components/Pagination';
import LoadingScreen from './components/LoadingScreen';
import StopItem from './components/StopItem';

// The Modal component is now defined separately for clarity and reliability.
const StopModal = ({
    stop,
    onClose,
    realTimeData,
    isLoadingRealTime,
    error,
    vehicleStatus,
    departedTrips,
    departureAnimations
}) => {
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

    // This component is dedicated to being the fullscreen modal.
    return (
        <>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-fade-in" onClick={onClose}></div>
            <div className="fixed inset-0 z-[60]">
                <div className="w-full h-full bg-background-secondary/95 backdrop-blur-xl flex flex-col animate-slide-up">
                    <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                        <div>
                            <h2 className="m-0 text-2xl text-white font-semibold">{name}</h2>
                            <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                                {platform && <span className="bg-blue-600 text-white px-2 py-0.5 rounded-md font-semibold">Platform: {platform}</span>}
                                <span>Zone: {zone}</span>
                                <span>{getWheelchairAccessText(wheelchairAccess)}</span>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="bg-red-500/50 border border-red-400/60 rounded-full text-white w-9 h-9 flex items-center justify-center cursor-pointer text-xl font-bold transition-all duration-200 ease-in-out hover:bg-red-600 hover:scale-110 active:scale-95"
                            aria-label="Close modal"
                        >
                            ×
                        </button>
                    </header>

                    <div className="overflow-y-auto p-4">
                        {isLoadingRealTime && <div className="text-center text-gray-400 p-6">Loading departures...</div>}
                        {error && <div className="text-center text-red-400 p-6 bg-red-500/10 rounded-xl">{error.error}</div>}
                        {realTimeData && (
                            hasDepartures ? (
                                realTimeData.departures.map((arrival, index) => {
                                    const tripId = arrival?.trip?.trip_id;
                                    const isInactive = vehicleStatus?.inactive?.includes(tripId);
                                    const isDeparted = departedTrips.has(tripId);
                                    const departureAnimation = departureAnimations.get(tripId);
                                    return (
                                        <Arrival
                                            key={tripId || index}
                                            arrival={arrival}
                                            isInactive={isInactive}
                                            isDeparted={isDeparted}
                                            departureAnimation={departureAnimation}
                                        />
                                    );
                                })
                            ) : (
                                <p className="text-center text-gray-500 p-6">No departures scheduled.</p>
                            )
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

// Arrival component used inside the modal
const Arrival = ({ arrival, isInactive, isDeparted, departureAnimation }) => {
    const { route, trip, departure } = arrival;
    const [remainingTime, setRemainingTime] = useState(null);

    useEffect(() => {
        if (!departure || !departure.timestamp_predicted) {
            setRemainingTime(null);
            return;
        }
        const calculateRemaining = () => {
            const arrivalTime = new Date(departure.timestamp_predicted).getTime();
            const now = Date.now();
            setRemainingTime(Math.max(0, arrivalTime - now));
        };
        calculateRemaining();
        const interval = setInterval(calculateRemaining, 1000);
        return () => clearInterval(interval);
    }, [departure]);

    const formatRemainingTime = (ms) => {
        if (ms === null) return 'N/A';
        if (ms <= 0) return "Departed";
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const delayString = departure?.delay_seconds > 0 ? `+${Math.floor(departure.delay_seconds / 60)} min` : null;
    const isDeparting = remainingTime !== null && remainingTime <= 60000 && remainingTime > 0;

    return (
        <div className={`flex justify-between items-center p-3 mb-2 rounded-lg border-b border-gray-800 transition-all duration-300 ${isDeparted ? 'opacity-40' : ''} ${departureAnimation ? 'animate-fade-in' : ''}`}>
            <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-md font-bold text-center text-sm shadow-md" style={{ backgroundColor: `#${route.route_color || '6c757d'}`, color: `#${route.route_text_color || 'ffffff'}` }}>
                    {route.short_name}
                </span>
                <span className="font-medium text-white">{trip.headsign}</span>
            </div>
            <div className="flex items-center gap-4">
                {delayString && <span className="text-sm font-semibold text-orange-400">{delayString}</span>}
                <span className={`text-lg font-bold w-20 text-right ${isDeparting ? 'text-orange-400 animate-pulse' : 'text-white'}`}>
                    {formatRemainingTime(remainingTime)}
                </span>
            </div>
        </div>
    );
};


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
    const [lastUpdateTime, setLastUpdateTime] = useState('');
    const [isScrolled, setIsScrolled] = useState(false);
    const [vehiclePosition, setVehiclePosition] = useState(null);
    const [loadingTripId, setLoadingTripId] = useState(null);
    const [vehicleStatus, setVehicleStatus] = useState({ active: [], inactive: [] });
    const [departedTrips, setDepartedTrips] = useState(new Set());
    const [departureAnimations, setDepartureAnimations] = useState(new Map());

    const debounceTimeout = useRef(null);
    const hasFetchedForLocation = useRef(false);

    useEffect(() => {
        const handleStopsData = (data) => {
            const flattenedStops = data.stopGroups?.flatMap(group =>
                group.stops.map(stop => ({
                    ...stop,
                    name: group.name,
                    id: stop.gtfsIds?.[0] || stop.id,
                }))
            ) || data || [];
            setStops(flattenedStops);
            setCurrentPage(1);
            setIsLoading(false);
        };

        const handleDepartureData = (data) => {
            setRealTimeData(data);
            setIsLoadingRealTime(false);
            setLastUpdateTime(new Date().toLocaleTimeString());
        };

        const handleStopsError = (error) => setErrors(prev => [...prev, error.error || 'Failed to fetch stops.']);
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
        const handleScroll = () => setIsScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        
        // Initial data fetch logic
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                if (!hasFetchedForLocation.current) {
                    hasFetchedForLocation.current = true;
                    socket.emit('searchStops', { lat: position.coords.latitude, lon: position.coords.longitude });
                }
            }, () => {
                setIsLoading(false);
                setErrors(prev => [...prev, "Location access denied. Please search manually."]);
            }, { timeout: 8000 });
        } else {
            setIsLoading(false);
        }

        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleSearchChange = useCallback((event) => {
        const newSearchTerm = event.target.value;
        setSearchTerm(newSearchTerm);
        setSelectedStop(null);

        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

        debounceTimeout.current = setTimeout(() => {
            setIsLoading(true);
            socket.emit('searchStops', { query: newSearchTerm });
        }, 500);
    }, []);

    const handleStopSelect = (stop) => {
        setSelectedStop(stop);
        setIsLoadingRealTime(true);
        setRealTimeData(null);
        socket.emit('requestDepartures', stop.id);
    };

    const handleCloseModal = () => {
        setSelectedStop(null);
        setRealTimeData(null);
    };

    const removeError = (index) => {
        setErrors(errors.filter((_, i) => i !== index));
    };

    const cardsPerPage = 20;
    const indexOfLastCard = currentPage * cardsPerPage;
    const indexOfFirstCard = indexOfLastCard - cardsPerPage;
    const currentCards = stops.slice(indexOfFirstCard, indexOfLastCard);
    const totalPages = Math.ceil(stops.length / cardsPerPage);

    return (
        <div className="text-center py-5 pt-36 mx-auto flex flex-col items-center min-h-screen">
            <header className={`fixed top-0 left-0 w-full z-40 transition-all duration-400 ease-in-out ${isScrolled ? 'glass-effect shadow-lg' : 'glass-effect-dark'}`}>
                <div className="max-w-6xl w-full mx-auto flex flex-col items-center gap-3 py-3 px-6">
                    <h1 className="m-0 font-semibold text-3xl bg-gradient-to-br from-white to-gray-300 bg-clip-text text-transparent tracking-tight">
                        PID Departures
                    </h1>
                    <p className="text-xs text-gray-400 h-4 m-0 font-normal">
                        {lastUpdateTime && `Last Update: ${lastUpdateTime}`}
                    </p>
                    <ConnectionStatus />
                    <input
                        type="text"
                        className="w-4/5 max-w-lg px-5 py-3 text-base border border-gray-600 rounded-xl outline-none transition-all duration-300 ease-in-out glass-effect text-white font-inter font-normal placeholder-gray-500 focus:shadow-lg focus:border-blue-500/50 focus:glass-effect focus:-translate-y-0.5"
                        placeholder="Search for a station..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                    />
                </div>
            </header>
            
            <main className="relative w-full max-w-7xl mt-8">
                {isLoading ? (
                    <LoadingScreen />
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 justify-center px-5">
                            {currentCards.length > 0 ? (
                                currentCards.map((stop, index) => (
                                    <StopItem
                                        key={`${stop.id}-${stop.name}-${index}`}
                                        stop={stop}
                                        handleStopSelect={() => handleStopSelect(stop)}
                                    />
                                ))
                            ) : (
                                <p className="text-gray-500 col-span-full mt-16 text-xl">
                                    {searchTerm ? 'No bus stops match your search.' : 'Search for a stop to begin.'}
                                </p>
                            )}
                        </div>
                        {totalPages > 1 && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                handlePageChange={(page) => setCurrentPage(page)}
                            />
                        )}
                    </>
                )}
            </main>

            {selectedStop && (
                <StopModal
                    stop={selectedStop}
                    onClose={handleCloseModal}
                    realTimeData={realTimeData}
                    isLoadingRealTime={isLoadingRealTime}
                    error={errors.find(e => e.stopId === selectedStop.id)}
                    vehicleStatus={vehicleStatus}
                    departedTrips={departedTrips}
                    departureAnimations={departureAnimations}
                />
            )}

            <MessagesSection messages={messages} />
            <ErrorsSection errors={errors.filter(e => !e.stopId)} removeError={removeError} />
        </div>
    );
}

export default App;
