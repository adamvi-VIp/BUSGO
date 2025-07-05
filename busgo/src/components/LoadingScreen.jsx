import React from 'react';

const LoadingScreen = () => {
    return (
        <div className="flex justify-center items-center min-h-96 w-full col-span-full">
            <div className="flex flex-col items-center gap-6 p-10 glass-effect backdrop-blur-20 border border-gray-600 rounded-3xl shadow-lg transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl">
                <div className="relative w-15 h-15">
                    <div className="absolute w-full h-full border-3 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
                    <div className="absolute w-4/5 h-4/5 top-2.5 left-2.5 border-3 border-transparent border-t-green-400 rounded-full animate-spin" style={{animationDelay: '-0.4s'}}></div>
                    <div className="absolute w-3/5 h-3/5 top-3 left-3 border-3 border-transparent border-t-orange-400 rounded-full animate-spin" style={{animationDelay: '-0.8s'}}></div>
                </div>
                <h2 className="m-0 text-3xl font-semibold text-white text-center tracking-tight">Loading Stations</h2>
                <p className="m-0 text-base text-gray-400 text-center font-normal">Finding nearby bus stops...</p>
            </div>
        </div>
    );
};

export default LoadingScreen;
