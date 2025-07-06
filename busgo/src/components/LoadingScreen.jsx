import React from 'react';

const LoadingScreen = () => {
    return (
        <div className="flex justify-center items-center p-8">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
        </div>
    );
};

export default LoadingScreen;
