import React from 'react';

const ErrorsSection = ({ errors, removeError }) => {
    if (!errors || errors.length === 0) {
        return null;
    }

    return (
        <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-3 max-w-sm w-full px-4 pointer-events-none items-center">
            {errors.map((error, index) => (
                <div key={index} className="bg-red-500/40 backdrop-blur-20 border border-red-500/30 rounded-2xl p-4 text-white font-inter text-sm font-normal leading-relaxed shadow-lg pointer-events-auto transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-xl flex items-center gap-3 w-full max-w-sm">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="text-xl flex-shrink-0">⚠️</div>
                        <div className="flex-1 min-w-0">
                            <span className="font-medium break-words text-white">
                                {typeof error === 'string' ? error : JSON.stringify(error)}
                            </span>
                        </div>
                    </div>
                    <button 
                        className="glass-effect-dark border border-gray-600 rounded-lg text-gray-300 h-full aspect-square flex items-center justify-center cursor-pointer text-xl font-semibold transition-all duration-200 ease-in-out hover:glass-effect hover:border-gray-500 hover:text-white hover:scale-110 active:scale-95 flex-shrink-0 p-1"
                        onClick={() => removeError(index)}
                        aria-label="Close error"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ErrorsSection;
