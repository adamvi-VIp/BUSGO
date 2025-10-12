import React, { useState, useEffect } from 'react';

const MessagesSection = ({ messages }) => {
    const [visibleMessages, setVisibleMessages] = useState([]);

    useEffect(() => {
        if (messages && messages.length > 0) {
            // Add new messages with animation
            const newMessages = messages.slice(-3); // Show only last 3 messages
            setVisibleMessages(newMessages);
        } else {
            setVisibleMessages([]);
        }
    }, [messages]);

    if (!visibleMessages || visibleMessages.length === 0) {
        return null;
    }

    return (
        <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
            {visibleMessages.map((message, index) => (
                <div 
                    key={message.id || index} 
                    className={`glass-effect backdrop-blur-20 border border-gray-500 rounded-2xl p-4 text-white font-inter text-sm font-normal leading-relaxed shadow-lg transform translate-x-full animate-slide-in-right pointer-events-auto transition-all duration-300 ease-in-out hover:translate-x-0 hover:scale-105 hover:shadow-xl ${message.type === 'departure' ? 'bg-orange-500/15 border-orange-500/30 animate-fade-in-up' : ''} ${message.type === 'info' ? 'bg-blue-500/15 border-blue-500/30' : ''}`}
                >
                    <div className="flex items-start gap-3">
                        <div className="text-xl flex-shrink-0 mt-0.5">
                            {message.type === 'departure' && '🚌'}
                            {message.type === 'info' && 'ℹ️'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-medium mb-1 break-words">{message.message}</div>
                            {message.timestamp && (
                                <div className="text-xs text-gray-400 font-normal">{message.timestamp}</div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default MessagesSection;
