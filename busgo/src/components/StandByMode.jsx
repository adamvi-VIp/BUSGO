import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import iceIcon from '../assets/ice.svg';

const StandByMode = ({ activeTripId, realTimeData }) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    // Update clock
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Find active arrival
    const activeArrival = React.useMemo(() => {
        if (!activeTripId || !realTimeData?.departures) return null;
        return realTimeData.departures.find(d => d.trip.id === activeTripId);
    }, [activeTripId, realTimeData]);

    // Calculate time helper (reused logic roughly)
    const getDisplayTime = (arrival) => {
        if (!arrival) return null;
        const departureTimestamp = arrival.departure_timestamp?.predicted || arrival.departure_timestamp?.scheduled;
        if (!departureTimestamp) return null;

        let targetTime;
        if (typeof departureTimestamp === 'number') {
            targetTime = departureTimestamp < 1000000000000 ? departureTimestamp * 1000 : departureTimestamp;
        } else {
            targetTime = new Date(departureTimestamp).getTime();
        }

        const diff = Math.max(0, targetTime - Date.now());
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        // Return object for formatting
        return { minutes, seconds, rawDiff: diff, targetDate: new Date(targetTime) };
    };

    const getDelay = (arrival) => {
        if (arrival?.delay_min === undefined || arrival?.delay_min === null) return null;
        const delay = arrival.delay_min;
        if (delay === 0) return { text: 'On time', color: 'text-green-400' };
        if (delay > 0) return { text: `+${delay} min`, color: 'text-red-400' };
        return { text: `${delay} min`, color: 'text-blue-400' };
    };

    const timeData = activeArrival ? getDisplayTime(activeArrival) : null;
    const delayData = activeArrival ? getDelay(activeArrival) : null;

    return (
        <div className="fixed inset-0 z-[9999] bg-black text-white overflow-hidden hidden landscape:flex flex-col items-center justify-center font-onest">
            {/* Background pure black */}

            <AnimatePresence mode="wait">
                {!activeTripId ? (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="flex flex-col items-center justify-center gap-4 text-center p-8"
                    >
                        <h1 className="text-4xl font-bold text-gray-200">Please choose bus to track</h1>
                        <p className="text-xl text-gray-500">Select a trip in portrait mode first</p>
                    </motion.div>
                ) : activeArrival && timeData ? (
                    <motion.div
                        key="content"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="w-full h-full relative"
                    >
                        {/* CENTER: BIG TIME */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex items-baseline justify-center leading-none text-white drop-shadow-2xl gap-8">
                                {/* Minutes - Only show if > 0 */}
                                {timeData.minutes > 0 && (
                                    <div className="flex items-baseline">
                                        <span className="text-[14rem] font-bold tracking-tighter tabular-nums">{timeData.minutes}</span>
                                        <span className="text-5xl font-medium text-gray-400 ml-4">min</span>
                                    </div>
                                )}
                                {/* Seconds */}
                                <div className="flex items-baseline">
                                    <span className="text-[14rem] font-bold tracking-tighter tabular-nums text-gray-200">{timeData.seconds.toString().padStart(2, '0')}</span>
                                    <span className="text-5xl font-medium text-gray-500 ml-4">s</span>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM LEFT: Bus Info */}
                        <div className="absolute bottom-8 left-10 flex flex-col items-start gap-2">
                            <div className="flex items-center gap-4">
                                <div className="bg-yellow-500 text-black text-5xl font-bold px-6 py-2 rounded-xl shadow-lg">
                                    {activeArrival.route.short_name}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-white text-3xl font-bold truncate max-w-[400px]">
                                        {activeArrival.trip.headsign}
                                    </span>
                                    {/* Scheduled Arrival & AC Info Row */}
                                    <div className="flex items-center gap-4 mt-2">
                                        {/* Scheduled Arrival Time */}
                                        <div className="text-2xl font-bold text-white bg-gray-800/80 px-3 py-1 rounded-lg">
                                            {timeData.targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                        </div>

                                        {/* AC Indicator */}
                                        {activeArrival.trip.is_air_conditioned && (
                                            <div className="flex items-center gap-2 text-cyan-400">
                                                <img src={iceIcon} className="w-6 h-6 ice-icon-ac" alt="AC" />
                                                <span className="text-lg font-medium">AC Equipped</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM RIGHT: Delay Info */}
                        {delayData && (
                            <div className="absolute bottom-8 right-10 text-right">
                                <div className={`text-6xl font-bold ${delayData.color} drop-shadow-lg`}>
                                    {delayData.text}
                                </div>
                                <div className="text-gray-500 text-xl font-medium mt-1 uppercase tracking-wider">
                                    Real-time Delay
                                </div>
                            </div>
                        )}

                    </motion.div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StandByMode;
