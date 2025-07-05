import React from 'react';

const ErrorsSection = ({ errors, removeError }) => {
    if (!errors || errors.length === 0) {
        return null;
    }

    return (
        <div className="fixed top-5 left-5 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
            {errors.map((error, index) => (
                <div key={index} className="bg-red-500/15 backdrop-blur-20 border border-red-500/30 rounded-2xl p-4 text-white font-inter text-sm font-normal leading-relaxed shadow-lg transform -translate-x-full animate-slide-in-right pointer-events-auto transition-all duration-300 ease-in-out hover:translate-x-0 hover:scale-105 hover:shadow-xl flex items-start gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="text-xl flex-shrink-0 mt-0.5">⚠️</div>
                        <div className="flex-1 min-w-0">
                            <span className="font-medium break-words text-white">
                                {typeof error === 'string' ? error : JSON.stringify(error)}
                            </span>
                        </div>
                    </div>
                    <button 
                        className="glass-effect-dark border border-gray-600 rounded-lg text-gray-300 w-6 h-6 flex items-center justify-center cursor-pointer text-xl font-semibold transition-all duration-200 ease-in-out hover:glass-effect hover:border-gray-500 hover:text-white hover:scale-110 active:scale-95 flex-shrink-0 mt-0.5"
                        onClick={() => removeError(index)}
                        aria-label="Close error"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ErrorsSection;
