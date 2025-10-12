import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from 'react-leaflet';

/**
 * A component that shows a button to update stations after the user moves the map.
 * Only fetches stations when the button is clicked.
 * Also handles location tracking with Android app detection.
 * @param {object} props - Component props.
 * @param {object} props.socket - The Socket.IO client instance.
 * @param {object} props.programmaticMoveRef - Ref to distinguish programmatic moves.
 */
const MapLocationTracker = ({ socket, programmaticMoveRef, onUserLocationUpdate }) => {
    const map = useMap();
    const lastCenterRef = useRef(null);
    const userInteractingRef = useRef(false);
    const [showUpdateButton, setShowUpdateButton] = useState(false);
    const [pendingCenter, setPendingCenter] = useState(null);
    const [location, setLocation] = useState(null);
    const watchId = useRef(null);
    const intervalIdRef = useRef(null);
    const lastEmittedRef = useRef(null);
    const lastPositionRef = useRef(null);
    const highAccuracyRef = useRef(true);
    const lastMovementTimestampRef = useRef(0);

    useEffect(() => {
        const handleMoveStart = () => {
            userInteractingRef.current = true;
        };

        const handleMapMove = () => {
            // If this was a programmatic move, skip and reset flag
            if (programmaticMoveRef && programmaticMoveRef.current) {
                programmaticMoveRef.current = false;
                userInteractingRef.current = false;
                setShowUpdateButton(false);
                return;
            }
            if (!userInteractingRef.current) return;
            const center = map.getCenter();
            const currentCenter = [center.lat, center.lng];
            // Only show button if center changed significantly
            if (!lastCenterRef.current ||
                Math.abs(lastCenterRef.current[0] - currentCenter[0]) > 0.002 ||
                Math.abs(lastCenterRef.current[1] - currentCenter[1]) > 0.002) {
                setPendingCenter(currentCenter);
                setShowUpdateButton(true);
            }
            userInteractingRef.current = false;
        };

        map.on('movestart', handleMoveStart);
        map.on('moveend', handleMapMove);

        return () => {
            map.off('movestart', handleMoveStart);
            map.off('moveend', handleMapMove);
        };
    }, [map, programmaticMoveRef]);

    const toRad = (value) => (value * Math.PI) / 180;
    const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
        const R = 6371000; // meters
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const emitNearbyStops = useCallback((coords, source = 'periodic') => {
        if (!coords) return;
        const payload = {
            lat: coords.latitude,
            lon: coords.longitude,
            timestamp: Date.now(),
            source
        };
        console.log('Emitting searchStops from MapLocationTracker', payload);
        socket.emit('searchStops', payload);
        lastEmittedRef.current = coords;
    }, [socket]);

    const handleLocationSuccess = useCallback((position) => {
        const { latitude, longitude } = position.coords;
        const coords = { latitude, longitude };
        setLocation(coords);
        lastPositionRef.current = coords;
        if (typeof onUserLocationUpdate === 'function') {
            onUserLocationUpdate(coords);
        }
        console.log('Location updated:', coords);
        // Emit if moved significantly (>100m) since last emission to reduce server load/battery
        if (lastEmittedRef.current) {
            const dist = haversineDistanceMeters(
                lastEmittedRef.current.latitude,
                lastEmittedRef.current.longitude,
                latitude,
                longitude
            );
            if (dist > 100) {
                emitNearbyStops(coords, 'movement');
            }
        }
        // Adaptive accuracy: use speed if available, otherwise infer by distance change
        const speed = position.coords.speed; // m/s (may be null)
        const now = Date.now();
        const movedRecently = lastMovementTimestampRef.current && (now - lastMovementTimestampRef.current) < 60000;
        const significantMove = lastPositionRef.current ? haversineDistanceMeters(
            lastPositionRef.current.latitude,
            lastPositionRef.current.longitude,
            latitude,
            longitude
        ) > 30 : false;
        if (significantMove) lastMovementTimestampRef.current = now;

        // Switch to high accuracy when moving fast, otherwise prefer lower accuracy
        const shouldHighAcc = (speed != null && speed > 2) || significantMove || movedRecently;
        if (shouldHighAcc && !highAccuracyRef.current) {
            restartWatch(true);
        } else if (!shouldHighAcc && highAccuracyRef.current) {
            restartWatch(false);
        }
    }, [emitNearbyStops, onUserLocationUpdate]);

    const handleLocationError = useCallback((error) => {
        console.error('Location error:', error);
        let errorMessage = 'Unknown location error.';
        switch (error.code) {
            case error.PERMISSION_DENIED:
                errorMessage = 'Location access denied.';
                break;
            case error.POSITION_UNAVAILABLE:
                errorMessage = 'Location information unavailable.';
                break;
            case error.TIMEOUT:
                errorMessage = 'Location request timed out.';
                break;
        }
        console.error(errorMessage);
    }, []);

    const startLocationWatch = useCallback(() => {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported.');
            return;
        }
        if (watchId.current) return;
        console.log('Starting location watch (adaptive accuracy)...');
        watchId.current = navigator.geolocation.watchPosition(
            handleLocationSuccess,
            (error) => {
                handleLocationError(error);
                // iOS Safari workaround: on POSITION_UNAVAILABLE/TIMEOUT, retry a one-shot getCurrentPosition
                if (
                    error.code === error.POSITION_UNAVAILABLE ||
                    error.code === error.TIMEOUT
                ) {
                    navigator.geolocation.getCurrentPosition(
                        handleLocationSuccess,
                        handleLocationError,
                        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
                    );
                }
            },
            {
                // Start with high accuracy for smooth initial lock
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000,
            }
        );
        highAccuracyRef.current = true;
    }, [handleLocationSuccess, handleLocationError]);

    const restartWatch = useCallback((enableHighAccuracy) => {
        if (!navigator.geolocation) return;
        if (watchId.current) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
        }
        watchId.current = navigator.geolocation.watchPosition(
            handleLocationSuccess,
            handleLocationError,
            {
                enableHighAccuracy,
                timeout: enableHighAccuracy ? 10000 : 15000,
                maximumAge: enableHighAccuracy ? 5000 : 30000,
            }
        );
        highAccuracyRef.current = enableHighAccuracy;
        console.log('Restarted watch with', enableHighAccuracy ? 'high' : 'low', 'accuracy');
    }, [handleLocationSuccess, handleLocationError]);

    // Auto-start continuous tracking on mount
    useEffect(() => {
        if (!navigator.geolocation) {
            console.warn('Geolocation unsupported in this browser.');
            return;
        }
        if (!window.isSecureContext) {
            console.warn('Geolocation may be blocked without HTTPS. Ensure a secure origin (https).');
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const coords = { latitude, longitude };
                setLocation(coords);
                lastPositionRef.current = coords;
                if (typeof onUserLocationUpdate === 'function') {
                    onUserLocationUpdate(coords);
                }
                emitNearbyStops(coords, 'initial');
                startLocationWatch();
            },
            (error) => {
                handleLocationError(error);
                startLocationWatch();
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
        if (!intervalIdRef.current) {
            intervalIdRef.current = setInterval(() => {
                if (lastPositionRef.current) {
                    emitNearbyStops(lastPositionRef.current, 'periodic');
                }
            }, 5 * 60 * 1000);
        }
        return () => {
            if (watchId.current) {
                navigator.geolocation.clearWatch(watchId.current);
                watchId.current = null;
            }
            if (intervalIdRef.current) {
                clearInterval(intervalIdRef.current);
                intervalIdRef.current = null;
            }
        };
    }, [emitNearbyStops, startLocationWatch, handleLocationError]);

    // This check is now more reliable.
    const isAndroidApp = !!window.IS_ANDROID_APP;

    // Android app detection and location tracking setup
    useEffect(() => {
        // Expose a no-op for Android native integration if needed
        window.startLocationTracking = () => {};
        // Always keep watch active; do not pause on visibility to maintain uninterrupted tracking
        return () => {
            delete window.startLocationTracking;
        };
    }, []);

    const handleUpdateStations = () => {
        if (pendingCenter) {
            lastCenterRef.current = pendingCenter;
            const payload = {
                lat: pendingCenter[0],
                lon: pendingCenter[1],
                timestamp: Date.now(),
                source: 'map-movement'
            };
            console.log('Emitting searchStops from MapLocationTracker', payload);
            socket.emit('searchStops', payload);
            setShowUpdateButton(false);
        }
    };

    // Floating button to update stations for current map area
    return (
        <>
            {showUpdateButton && (
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '235px', // Place above the bottom menu
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    pointerEvents: 'auto',
                }}>
                    <button
                        onClick={handleUpdateStations}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-full shadow-lg border border-blue-300 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                        Search stations for this area
                    </button>
                </div>
            )}
        </>
    );
};

export default MapLocationTracker;
