import React from 'react';
// Basic component, can be styled similarly to ErrorsSection if needed.
const MessagesSection = ({ messages }) => {
    if (!messages || messages.length === 0) {
        return null;
    }

    return (
        <div className="messages-section">
            {messages.map((message, index) => (
                <div key={index} className="message">
                    {message}
                </div>
            ))}
        </div>
    );
};

export default MessagesSection;
