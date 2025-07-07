import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

/**
 * A component that tracks map movements and requests new stop data for the visible area.
 * It debounces requests to avoid flooding the server while the user is panning the map.
 * @param {object} props - Component props.
 * @param {object} props.socket - The Socket.IO client instance.
 */
const MapLocationTracker = ({ socket }) => {
    const map = useMap();
    const timeoutRef = useRef(null);
    const lastCenterRef = useRef(null);

    useEffect(() => {
        const handleMapMove = () => {
            const center = map.getCenter();
            const currentCenter = [center.lat, center.lng];
            
            // Check if center has actually changed significantly to avoid redundant fetches
            if (!lastCenterRef.current || 
                Math.abs(lastCenterRef.current[0] - currentCenter[0]) > 0.002 || 
                Math.abs(lastCenterRef.current[1] - currentCenter[1]) > 0.002) {
                
                // Clear any existing timeout to reset the debounce timer
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                }
                
                // Set a new timeout to fetch stops after 0.5 seconds of map idle time
                timeoutRef.current = setTimeout(() => {
                    console.log('[MAP] Map idle. Fetching stops for new location:', currentCenter);
                    
                    // Emit an event to the server to get stops for the new map center.
                    // The 'source' property is crucial for the server to echo back,
                    // allowing the client to distinguish this data from initial/search data.
                    socket.emit('searchStops', { 
                        lat: currentCenter[0], 
                        lon: currentCenter[1], 
                        timestamp: Date.now(),
                        source: 'map-movement' // This flag identifies the request source
                    });
                }, 500); // 500ms debounce delay
                
                // Update the last known center
                lastCenterRef.current = currentCenter;
            }
        };

        // Listen to the 'moveend' event, which fires after the map has finished moving
        map.on('moveend', handleMapMove);

        // Cleanup function to remove the event listener and clear any pending timeouts
        return () => {
            map.off('moveend', handleMapMove);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [map, socket]);

    // This component does not render anything to the DOM
    return null;
};

export default MapLocationTracker;
