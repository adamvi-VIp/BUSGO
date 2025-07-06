import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

const MapLocationTracker = ({ socket }) => {
    const map = useMap();
    const timeoutRef = useRef(null);
    const lastCenterRef = useRef(null);

    useEffect(() => {
        const handleMapMove = () => {
            const center = map.getCenter();
            const currentCenter = [center.lat, center.lng];
            
            // Check if center has actually changed significantly (minimum 0.002 degrees ~ 200m)
            if (!lastCenterRef.current || 
                Math.abs(lastCenterRef.current[0] - currentCenter[0]) > 0.002 || 
                Math.abs(lastCenterRef.current[1] - currentCenter[1]) > 0.002) {
                
                // Clear existing timeout
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                }
                
                // Set new timeout to fetch stops after 0.5 seconds of no movement
                timeoutRef.current = setTimeout(() => {
                    console.log('[MAP] Fetching stops for new location:', currentCenter);
                    if (socket.connected) {
                        socket.emit('searchStops', { 
                            lat: currentCenter[0], 
                            lon: currentCenter[1], 
                            timestamp: Date.now(),
                            source: 'map-movement'
                        });
                    } else {
                        console.log('[MAP] Backend not connected, skipping stop fetch');
                    }
                    // Don't call onLocationChange to avoid moving map back to user location
                }, 500);
                
                lastCenterRef.current = currentCenter;
            }
        };

        // Listen to map move events
        map.on('moveend', handleMapMove);

        return () => {
            map.off('moveend', handleMapMove);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [map, socket]);

    return null; // This component doesn't render anything
};

export default MapLocationTracker; 