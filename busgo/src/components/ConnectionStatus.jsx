import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

// Initialize socket connection.
// In development, it uses the current origin (localhost:5173)
// In production, it connects to the same domain (nginx proxy)
const socketUrl = import.meta.env.PROD ? window.location.origin : undefined;
export const socket = io(socketUrl);

const ConnectionStatus = () => {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [connectionStatus, setConnectionStatus] = useState('connecting');

    useEffect(() => {
        const onConnect = () => {
            setIsConnected(true);
            setConnectionStatus('connected');
        };
        const onDisconnect = () => {
            setIsConnected(false);
            setConnectionStatus('disconnected');
        };
        const onConnecting = () => {
            setConnectionStatus('connecting');
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connecting', onConnecting);

        // Handle connection errors for better feedback
        socket.on('connect_error', () => {
            setConnectionStatus('disconnected');
        });

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connecting', onConnecting);
            socket.off('connect_error');
        };
    }, []);

    return (
        <div className={`flex items-center gap-2 px-3 py-2 glass-effect backdrop-blur-10 border border-gray-600 rounded-xl font-inter text-sm font-medium transition-all duration-300 ease-in-out hover:glass-effect hover:border-gray-500 hover:-translate-y-0.5 ${connectionStatus === 'connected' ? 'text-green-400' : ''} ${connectionStatus === 'disconnected' ? 'text-red-400' : ''} ${connectionStatus === 'connecting' ? 'text-orange-400' : ''}`}>
            <div className="relative flex items-center justify-center">
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ease-in-out ${connectionStatus === 'connected' ? 'bg-green-400 shadow-lg shadow-green-400/50' : ''} ${connectionStatus === 'disconnected' ? 'bg-red-400 shadow-lg shadow-red-400/50' : ''} ${connectionStatus === 'connecting' ? 'bg-orange-400 shadow-lg shadow-orange-400/50' : ''}`}></div>
                {connectionStatus === 'connecting' && <div className="absolute w-4 h-4 border-2 border-orange-400/30 rounded-full animate-pulse"></div>}
            </div>
            <span className="font-medium tracking-wide">
                {connectionStatus === 'connected' && 'Connected'}
                {connectionStatus === 'disconnected' && 'Disconnected'}
                {connectionStatus === 'connecting' && 'Connecting...'}
            </span>
        </div>
    );
};

export default ConnectionStatus;
