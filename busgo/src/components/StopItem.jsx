import React from 'react';

const StopItem = React.forwardRef(({ stop, handleStopSelect, isSelected }, ref) => {
    const { name, zone, lines } = stop;

    return (
        <div
            ref={isSelected ? ref : null}
            onClick={() => !isSelected && handleStopSelect()}
            className={`w-full p-3 pr-4 flex items-center gap-4 border-b border-gray-700/60 transition-all duration-200 ${
                isSelected 
                    ? 'bg-cyan-500/20 border-l-4 border-l-cyan-400 cursor-default' 
                    : 'bg-transparent hover:bg-cyan-500/10 cursor-pointer'
            }`}
        >
            <div className="flex-grow min-w-0">
                <h2 className="text-base font-semibold text-white truncate">
                    {name}
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    <span>Zone: {zone}</span>
                </div>
            </div>
            <div className="flex-shrink-0 flex flex-wrap-reverse justify-end gap-1.5 max-w-[50%]">
                 {lines?.slice(0, 4).map((line, index) => (
                    <span key={`${line.name}-${index}`} className="font-medium text-white bg-gray-600/60 px-2 py-0.5 rounded text-xs shadow-sm">
                       {line.name}
                    </span>
                ))}
                {lines?.length > 4 && (
                   <span className="font-medium text-gray-400 bg-gray-700/70 px-2 py-0.5 rounded text-xs shadow-sm">
                        +{lines.length - 4}
                    </span>
                )}
            </div>
        </div>
    );
});

export default StopItem;
