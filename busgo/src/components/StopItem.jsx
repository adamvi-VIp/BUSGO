import React from 'react';

const getWheelchairAccessText = (access) => {
    if (access === 1) return "♿ Accessible";
    if (access === 2) return "⛔ Not Accessible";
    switch (String(access).toLowerCase()) {
        case 'accessible': case 'yes': return "♿ Accessible";
        case 'not_accessible': case 'no': return "⛔ Not Accessible";
        default: return "♿ No Info";
    }
};

const StopItem = ({ stop, handleStopSelect }) => {
    const { name, platform, zone, wheelchairAccess, lines } = stop;

    return (
        <div
            onClick={handleStopSelect}
            className="glass-effect backdrop-blur-20 border border-gray-700/80 rounded-2xl p-5 cursor-pointer transition-all duration-300 ease-in-out shadow-lg hover:-translate-y-1.5 hover:shadow-cyan-500/10 hover:border-cyan-500/50"
        >
            <div className="flex justify-between items-start mb-3">
                <h2 className="text-xl font-semibold text-white text-left mr-4 leading-tight">
                    {name}
                </h2>
                {platform && (
                    <span className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-3 py-1 rounded-xl font-semibold text-sm shadow-md flex-shrink-0">
                        P: {platform}
                    </span>
                )}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mb-4">
                <span>Zone: {zone}</span>
                <span>{getWheelchairAccessText(wheelchairAccess)}</span>
            </div>

            {lines && lines.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700/50">
                    <strong className="text-gray-300 font-medium text-sm mb-2 block">Lines:</strong>
                    <div className="flex flex-wrap gap-2">
                        {lines.slice(0, 5).map((line) => (
                             <span key={line.name} className="font-semibold text-white bg-gray-600/50 px-2 py-1 rounded-md text-xs shadow-sm">
                                {line.name}
                             </span>
                        ))}
                        {lines.length > 5 && (
                            <span className="font-semibold text-gray-400 bg-gray-700/50 px-2 py-1 rounded-md text-xs shadow-sm">
                                +{lines.length - 5} more
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StopItem;
