import React from 'react';

const LoadingScreen = ({ secondaryText = null }) => {
    return (
        <div className="flex flex-col items-center justify-center p-4">
            {secondaryText ? (
                <div className="mb-2 text-sm text-gray-300">{secondaryText}</div>
            ) : null}
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
        </div>
    );
};

export default LoadingScreen;
