import React, { useState, useEffect } from 'react';
import './StopItem.css';

const getWheelchairAccessText = (access) => {
    // Handle numeric values from potential old data structures
    if (access === 1) return "♿ Accessible";
    if (access === 2) return "⛔ Not Accessible";

    // Handle new string values
    switch (String(access).toLowerCase()) {
        case 'accessible':
        case 'yes':
            return "♿ Accessible";
        case 'not_accessible':
        case 'no':
            return "⛔ Not Accessible";
        default: // 'unknown', null, undefined etc.
            return "♿ No Info";
    }
};

const VehiclePositionInfo = ({ position }) => {
    if (!position || !position.properties) {
        return <div className="vehicle-info not-found">Vehicle position not available.</div>;
    }
    const { bearing, speed, last_update } = position.properties;
    const lastUpdateDate = new Date(last_update);
    const timeSinceUpdate = Math.round((new Date() - lastUpdateDate) / 1000);

    return (
        <div className="vehicle-info">
            <span>Bearing: <strong>{bearing}°</strong></span>
            <span>Speed: <strong>{speed} km/h</strong></span>
            <span>Updated: <strong>{timeSinceUpdate}s ago</strong></span>
        </div>
    );
};

const Arrival = ({ arrival, isInactive }) => {
    const { route, trip, departure } = arrival;
    const [remainingTime, setRemainingTime] = useState(null);

    useEffect(() => {
        if (!departure || !departure.timestamp_predicted) {
            setRemainingTime(null);
            return;
        }

        const calculateRemaining = () => {
            const arrivalTime = new Date(departure.timestamp_predicted).getTime();
            const now = new Date().getTime();
            const difference = arrivalTime - now;
            setRemainingTime(difference > 0 ? difference : 0);
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

    const formatDelay = (totalSeconds) => {
        if (!totalSeconds || totalSeconds <= 0) {
            return null;
        }
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `+${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const delayString = formatDelay(departure?.delay_seconds);

    return (
        <div className={`arrival-wrapper${isInactive ? ' inactive' : ''}`}>
            <div className={`arrival-item ${departure?.delay_seconds > 0 ? 'delayed' : ''}${isInactive ? ' inactive' : ''}`}>
                <div className="route-info">
                    <span className="route-short-name" style={{ backgroundColor: `#${route.route_color || '6c757d'}`, color: `#${route.route_text_color || 'ffffff'}` }}>
                        {route.short_name}
                    </span>
                    <span className="trip-headsign">{trip.headsign}</span>
                    {isInactive && <span className="inactive-badge">Inactive</span>}
                </div>
                <div className="time-info">
                    <span className="departure-time">{formatRemainingTime(remainingTime)}</span>
                </div>
                <div className="delay-container">
                    {delayString ? (
                        <span className="delay-info">{delayString}</span>
                    ) : (
                        <span className="ontime-info">On time</span>
                    )}
                </div>
            </div>
        </div>
    );
};

// Haversine formula to calculate distance between two lat/lon points
const getDistance = (lat1, lon1, lat2, lon2) => {
    if (lat1 === null || lon1 === null) return null;
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        0.5 - Math.cos(dLat) / 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        (1 - Math.cos(dLon)) / 2;
    return (R * 2 * Math.asin(Math.sqrt(a))).toFixed(1); // Return distance in km, rounded to 1 decimal
};

const StopItem = ({ stop, userLocation, isSelected, isClosing, isLoadingRealTime, realTimeData, error, handleStopSelect, handleTrackVehicle, vehiclePosition, loadingTripId, vehicleStatus }) => {
    const { name, platform, zone, wheelchairAccess, lat, lon } = stop;
    const [distance, setDistance] = useState(null);

    useEffect(() => {
        if (userLocation && lat && lon) {
            const dist = getDistance(userLocation.latitude, userLocation.longitude, lat, lon);
            setDistance(dist);
        }
    }, [userLocation, lat, lon]);

    const hasDepartures = realTimeData && realTimeData.departures && realTimeData.departures.length > 0;

    if (isSelected) {
        console.log('[StopItem] realTimeData for stop', stop.id, realTimeData);
        console.log('[StopItem] hasDepartures:', hasDepartures);
    }

    return (
        <div 
            className={`stop-item ${isSelected ? 'selected' : ''} ${isClosing ? 'closing' : ''}`}
            onClick={() => handleStopSelect(stop)}
        >
            <div className="stop-header">
                <h2>{name}</h2>
                <div className="header-details">
                    {distance !== null && <span className="distance-info">{distance} km</span>}
                    {platform && <span className="platform-code">P: {platform}</span>}
                </div>
            </div>
            <div className="stop-details">
                <span className="zone-info">Zone: {zone}</span>
                <span className="wheelchair-info">{getWheelchairAccessText(wheelchairAccess)}</span>
            </div>
            {/* Render bus lines and destinations if available */}
            {stop.lines && stop.lines.length > 0 && (
                <div className="lines-list">
                    <strong>Bus Lines:</strong>
                    <ul>
                        {stop.lines.map((line, idx) => (
                            <li key={idx} className="line-item">
                                <span className="line-name">{line.name}</span>
                                {line.direction && (
                                    <span className="line-destination"> → {line.direction}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {isSelected && (
                <div className="arrivals-container">
                    {isLoadingRealTime && <div className="realtime-loader">Loading departures...</div>}
                    {error && <div className="realtime-error">{error.error}</div>}
                    {realTimeData && (
                        hasDepartures ? (
                            realTimeData.departures.map((arrival, index) => {
                                const tripId = arrival?.trip?.trip_id;
                                const isInactive = vehicleStatus?.inactive?.includes(tripId);
                                return (
                                    <Arrival 
                                        key={index} 
                                        arrival={arrival}
                                        isInactive={isInactive}
                                    />
                                );
                            })
                        ) : (
                            <p className="no-departures">No departures scheduled.</p>
                        )
                    )}
                </div>
            )}
        </div>
    );
};

export default StopItem;