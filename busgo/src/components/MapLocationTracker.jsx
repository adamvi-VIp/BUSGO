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
const MapLocationTracker = ({ socket, programmaticMoveRef }) => {
    const map = useMap();
    const lastCenterRef = useRef(null);
    const userInteractingRef = useRef(false);
    const [showUpdateButton, setShowUpdateButton] = useState(false);
    const [pendingCenter, setPendingCenter] = useState(null);
    const [location, setLocation] = useState(null);
    const watchId = useRef(null);

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

    const handleLocationSuccess = useCallback((position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ latitude, longitude });
        console.log('Location updated:', { latitude, longitude });
    }, []);

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
        if (navigator.geolocation && !watchId.current) {
            console.log("Starting location watch...");
            watchId.current = navigator.geolocation.watchPosition(
                handleLocationSuccess,
                handleLocationError,
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        }
    }, [handleLocationSuccess, handleLocationError]);

    // This check is now more reliable.
    const isAndroidApp = !!window.IS_ANDROID_APP;

    // Android app detection and location tracking setup
    useEffect(() => {
        // Expose the start function to the window so native Android code can call it.
        window.startLocationTracking = startLocationWatch;

        // If NOT in the app, start tracking immediately.
        if (!isAndroidApp) {
            console.log("Running in browser, starting location watch automatically.");
            startLocationWatch();
        } else {
            console.log("Running in Android App, waiting for native signal to start location watch.");
        }

        // Cleanup function to clear the watch when the component unmounts.
        return () => {
            if (watchId.current) {
                navigator.geolocation.clearWatch(watchId.current);
                watchId.current = null;
            }
            delete window.startLocationTracking; // Clean up the global function
        };
    }, [startLocationWatch, isAndroidApp]);

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

    // Floating button at bottom center, above the bottom menu
    return showUpdateButton ? (
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
    ) : null;
};

export default MapLocationTracker;
