import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

// Initialize socket connection
export const socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001');

const ConnectionStatus = () => {
    const [isConnected, setIsConnected] = useState(socket.connected);

    useEffect(() => {
        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
        };
    }, []);

    return (
        <div className="connection-status" style={{ marginBottom: '10px' }}>
            <span style={{
                height: '10px',
                width: '10px',
                backgroundColor: isConnected ? '#4CAF50' : '#F44336',
                borderRadius: '50%',
                display: 'inline-block',
                marginRight: '8px',
                boxShadow: `0 0 5px ${isConnected ? '#4CAF50' : '#F44336'}`
            }}></span>
            <span style={{ color: '#ccc', fontSize: '0.9em' }}>
                {isConnected ? 'Connected' : 'Disconnected'}
            </span>
        </div>
    );
};

export default ConnectionStatus;
