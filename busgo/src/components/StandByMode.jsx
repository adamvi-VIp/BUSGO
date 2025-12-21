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
        // App.jsx uses arrival?.delay?.seconds, so we should too.
        // Fallback to delay_min just in case, but prefer seconds.
        let delaySeconds = arrival?.delay?.seconds;
        if (delaySeconds === undefined && arrival?.delay_min !== undefined) {
            delaySeconds = arrival.delay_min * 60;
        }

        if (delaySeconds === undefined || delaySeconds === null) return null;

        const absSeconds = Math.abs(delaySeconds);
        const mins = Math.floor(absSeconds / 60);
        const secs = absSeconds % 60;
        const timeString = mins > 0 ? `${mins} min ${secs} s` : `${secs} s`;

        if (delaySeconds === 0) return { text: 'On time', color: 'text-green-400' };
        if (delaySeconds > 0) return { text: `+${timeString}`, color: 'text-red-400' };
        return { text: `-${timeString}`, color: 'text-blue-400' };
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
                        className="w-full h-full flex flex-col p-4 md:p-8"
                    >
                        {/* CENTER: BIG TIME (Takes available space) */}
                        <div className="flex-1 flex items-center justify-center min-h-0">
                            <div className="flex items-baseline justify-center leading-none text-white drop-shadow-2xl gap-[2vw]">
                                {/* Minutes - Only show if > 0 */}
                                {timeData.minutes > 0 && (
                                    <div className="flex items-baseline">
                                        <span className="text-[42vh] font-bold tracking-tighter tabular-nums">{timeData.minutes}</span>
                                        <span className="text-[10vh] font-medium text-gray-400 ml-[1vw]">min</span>
                                    </div>
                                )}
                                {/* Seconds */}
                                <div className="flex items-baseline">
                                    <span className="text-[42vh] font-bold tracking-tighter tabular-nums text-gray-200">{timeData.seconds.toString().padStart(2, '0')}</span>
                                    <span className="text-[10vh] font-medium text-gray-500 ml-[1vw]">s</span>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM ROW: Info & Delay */}
                        <div className="flex justify-between items-end shrink-0 w-full mb-2">
                            {/* LEFT: Bus Info */}
                            <div className="flex flex-col items-start gap-[1vh]">
                                <div className="flex items-center gap-[2vw]">
                                    <div className="bg-yellow-500 text-black text-[8vh] font-bold px-[3vh] py-[1vh] rounded-[2vh] shadow-lg leading-none">
                                        {activeArrival.route.short_name}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-white text-[5vh] font-bold truncate max-w-[55vw] leading-tight">
                                            {activeArrival.trip.headsign}
                                        </span>
                                        {/* Scheduled Arrival & AC Info Row */}
                                        <div className="flex items-center gap-[2vw] mt-[0.5vh]">
                                            {/* Scheduled Arrival Time */}
                                            <div className="text-[4vh] font-bold text-white bg-gray-800/80 px-[2vh] py-[0.5vh] rounded-lg leading-none">
                                                {timeData.targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                            </div>

                                            {/* AC Indicator */}
                                            {activeArrival.trip.is_air_conditioned && (
                                                <div className="flex items-center gap-[1vh] text-cyan-400">
                                                    <img src={iceIcon} className="w-[4vh] h-[4vh] ice-icon-ac" alt="AC" />
                                                    <span className="text-[3vh] font-medium">AC Equipped</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT: Delay Info */}
                            {delayData && (
                                <div className="text-right">
                                    <div className={`text-[9vh] font-bold ${delayData.color} drop-shadow-lg leading-none`}>
                                        {delayData.text}
                                    </div>
                                    <div className="text-gray-500 text-[3vh] font-medium mt-[0.5vh] uppercase tracking-wider">
                                        Real-time Delay
                                    </div>
                                </div>
                            )}
                        </div>
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
