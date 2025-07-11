import React, { useState, useEffect } from 'react';

const PWAInstallPrompt = React.memo(({ isVisible, onClose }) => {
    const [activePlatform, setActivePlatform] = useState('ios');
    const [isStandalone, setIsStandalone] = useState(false);
    const [showConfirmExit, setShowConfirmExit] = useState(false);

    // Detect platform function
    const detectPlatform = () => {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        
        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            return 'ios';
        } else if (/android/i.test(userAgent)) {
            return 'android';
        } else {
            return 'ios'; // Default to iOS for other platforms
        }
    };

    useEffect(() => {
        // Check if app is running in standalone mode (installed as PWA)
        setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || 
                       window.navigator.standalone === true);
    }, []);

    useEffect(() => {
        // Auto-detect platform on mount
        const platform = detectPlatform();
        setActivePlatform(platform);
    }, []);

    // Don't show if app is already in standalone mode
    if (isStandalone) {
        return null;
    }

    if (!isVisible) {
        return null;
    }

    const iosSteps = [
        {
            step: 1,
            instruction: "Tap the Share button",
            description: "Look for the square with an arrow pointing up"
        },
        {
            step: 2,
            instruction: "Scroll down and tap 'Add to Home Screen'",
            description: "You'll see this option in the share menu"
        },
        {
            step: 3,
            instruction: "Tap 'Add' to install",
            description: "The app will be added to your home screen"
        }
    ];

    const androidSteps = [
        {
            step: 1,
            instruction: "Tap the ⋮ menu button",
            description: "Look for three dots in the top right corner"
        },
        {
            step: 2,
            instruction: "Tap 'Add to Home screen' or 'Install app'",
            description: "The exact text may vary by browser"
        },
        {
            step: 3,
            instruction: "Tap 'Add' or 'Install' to confirm",
            description: "The app will be installed on your device"
        }
    ];

    const getSteps = () => {
        switch (activePlatform) {
            case 'ios':
                return iosSteps;
            case 'android':
                return androidSteps;
            default:
                return iosSteps; // Default to iOS steps
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-[9998] flex items-center justify-center">
            <div className="glass-effect w-full h-full max-w-none max-h-none overflow-y-auto border-0">
                {/* Header */}
                <div className="p-6 pb-4">
                    <div className="flex items-center justify-center mb-4">
                        <h2 className="text-xl font-bold text-white">Install BusGo</h2>
                    </div>
                    
                    <p className="text-gray-300 text-sm mb-6 text-center">
                        Use BusGo in your library for the best experience<br/>with better access and a native app feel.
                    </p>

                    {/* Platform Toggle */}
                    <div className="flex items-center justify-center space-x-2 mb-6">
                        <button
                            onClick={() => setActivePlatform('ios')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                activePlatform === 'ios'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            iOS
                        </button>
                        <button
                            onClick={() => setActivePlatform('android')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                activePlatform === 'android'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            Android
                        </button>
                    </div>
                </div>

                {/* Installation Steps */}
                <div className="px-6 pb-6">
                    <div className="space-y-4">
                        {getSteps().map((step, index) => (
                            <div key={`step-${activePlatform}-${index}`} className="flex items-start space-x-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                    {step.step}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-white font-medium mb-1">
                                        {step.instruction}
                                    </h3>
                                    <p className="text-gray-400 text-sm">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Platform-specific note */}
                    <div className="mt-6 p-4 bg-gray-800 rounded-lg">
                        <p className="text-gray-300 text-sm">
                            {activePlatform === 'ios' && 
                                "After installation, you can access BusGo from your home screen just like any other app."
                            }
                            {activePlatform === 'android' && 
                                "After installation, you can access BusGo from your home screen just like any other app."
                            }
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 pb-6">
                    <p className="text-center text-gray-400 text-sm mb-4">
                        Install BusGo for the best experience
                    </p>
                    
                    {/* Developer exit option */}
                    <div className="text-center">
                        <button
                            onClick={() => setShowConfirmExit(true)}
                            className="text-xs text-red-800 hover:text-red-400 transition-colors underline text-center"
                        >
                            Developer: Skip installation (not recommended)
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Confirmation Dialog */}
            {showConfirmExit && (
                <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="glass-effect rounded-lg p-6 max-w-sm w-full">
                        <h3 className="text-lg font-bold text-white mb-4 text-center">
                            Are you sure?
                        </h3>
                        <p className="text-gray-300 text-sm mb-6 text-center">
                            You'll miss out on the best BusGo experience. The app will work better when installed.
                        </p>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => setShowConfirmExit(false)}
                                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                Skip Installation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default PWAInstallPrompt; 