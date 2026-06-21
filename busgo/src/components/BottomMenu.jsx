import React, { useRef, useCallback, useState, useEffect } from 'react';
import StopItem from './StopItem';
import Pagination from './Pagination';
import LoadingScreen from './LoadingScreen';
import locationIcon from '../assets/location.svg';
import refreshIcon from '../assets/refresh.svg';

const BottomMenu = ({
    bottomMenuStops,
    isLoading,
    isWaitingForLocation,
    locationWaitRemainingSec,
    searchTerm,
    isPanelExpanded,
    setIsPanelExpanded,
    currentPage,
    setCurrentPage,
    selectedStop,
    onStopSelect, // Fix: App.jsx passes onStopSelect
    handleRefreshClick,
    isRefreshing,
    userLocation,
    isStandalone,
    selectedStopRef,
    menuScrollRef,
    onLocationClick,
    cardsPerPage = 50
}) => {
    // Constants for positions
    const EXPANDED_Y = 140; // Increased to sit under SearchBar
    const COLLAPSED_MARGIN = 160; // Distance from bottom of screen to top of collapsed menu

    // Helper to get collapsed Y position
    const getCollapsedY = () => {
        const vh = parseFloat(document.documentElement.style.getPropertyValue('--vh')) || window.innerHeight * 0.01;
        const currentWindowHeight = vh * 100;
        return currentWindowHeight - COLLAPSED_MARGIN;
    };

    // State
    const [isDragging, setIsDragging] = useState(false);
    const [startY, setStartY] = useState(0);
    const [currentY, setCurrentY] = useState(0);
    // Initialize with numeric value directly
    const [translateY, setTranslateY] = useState(isPanelExpanded ? EXPANDED_Y : getCollapsedY());
    const [touchVelocity, setTouchVelocity] = useState(0);
    const [lastTouchTimestamp, setLastTouchTimestamp] = useState(0);
    const [lastTouchY, setLastTouchY] = useState(0);
    const menuRef = useRef(null);

    // Update state when window resizes to keep collapsed position correct
    useEffect(() => {
        const handleResize = () => {
            if (!isPanelExpanded && !isDragging) {
                setTranslateY(getCollapsedY());
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isPanelExpanded, isDragging]);

    // Update translateY when isPanelExpanded changes from outside
    useEffect(() => {
        if (isDragging) return;
        setTranslateY(isPanelExpanded ? EXPANDED_Y : getCollapsedY());
    }, [isPanelExpanded, isDragging]);

    const VELOCITY_THRESHOLD = 0.5;

    // Derived values for interpolation
    const vh = parseFloat(document.documentElement.style.getPropertyValue('--vh')) || window.innerHeight * 0.01;
    const windowHeight = vh * 100;
    const collapsedY = getCollapsedY();
    const totalTravel = collapsedY - EXPANDED_Y;

    // Calculate progress (0 = expanded, 1 = collapsed)
    // Clamp values to ensure we don't go out of bounds
    const clampedY = Math.max(EXPANDED_Y, Math.min(translateY, collapsedY));
    const progress = Math.max(0, Math.min(1, (clampedY - EXPANDED_Y) / totalTravel));

    // Interpolated styles
    const MARGIN_MAX = 10; // 0.5rem (left-2)
    const BOTTOM_MARGIN_MAX = 0;
    const RADIUS_MAX = 40; // Increased from 24 (rounded-3xl) to 40 for "more rounded"

    const sideMargin = progress * MARGIN_MAX;
    const bottomGap = progress * BOTTOM_MARGIN_MAX;
    const bottomRadius = 0;
    const topRadius = RADIUS_MAX;

    // Calculate height dynamically
    // When expanded: Height = Window - EXPANDED_Y (top gap)
    // When collapsed: We want the bottom to be at (Window - BottomGap)
    // So VisualBottom = TranslateY + Height
    // -> TranslateY + Height = Window - BottomGap
    // -> Height = Window - BottomGap - TranslateY
    // Be careful with the top gap (EXPANDED_Y is 10px from top)
    // Actually, translateY IS the top position relative to screen top (since anchor is top-0 essentially in valid logic, but we used bottom-0)
    // If we switch to top-0 logic for calculation it is easier.
    // Let's assume layout is full screen absolute.
    const dynamicHeight = windowHeight - bottomGap - translateY;

    const handleTouchStart = (e) => {
        const target = e.target;
        const isHandle = target.classList.contains('drag-handle') ||
            target.closest('.menu-header') !== null;

        if (isHandle) {
            setIsDragging(true);
            setStartY(e.touches[0].clientY);
            // Capture current Y from state directly, no need to read DOM
            setCurrentY(e.touches[0].clientY);
            setTouchVelocity(0);
            setLastTouchTimestamp(Date.now());
            setLastTouchY(e.touches[0].clientY);
            e.target.dataset.dragging = 'true';
        }
    };

    const handleTouchMove = (e) => {
        if (!isDragging) return;

        const touchY = e.touches[0].clientY;
        const deltaY = touchY - currentY; // Change since last event

        // Calculate new position
        // simple 1:1 movement follows finger exactly
        let newTranslateY = translateY + deltaY;

        // Constrain
        newTranslateY = Math.max(EXPANDED_Y, Math.min(getCollapsedY(), newTranslateY));

        setTranslateY(newTranslateY);
        setCurrentY(touchY); // Update for next delta

        // Velocity tracking
        const now = Date.now();
        const timeDelta = now - lastTouchTimestamp;
        if (timeDelta > 0) {
            const newVelocity = (lastTouchY - touchY) / timeDelta;
            setTouchVelocity(newVelocity);
            setLastTouchTimestamp(now);
            setLastTouchY(touchY);
        }

        if (e.target.dataset.dragging === 'true' || e.target.closest('.menu-header')) {
            e.preventDefault();
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) return;

        setIsDragging(false);

        const currentPosition = translateY;
        const threshold = EXPANDED_Y + (collapsedY - EXPANDED_Y) * 0.4;

        const hasSignificantUpwardVelocity = touchVelocity > VELOCITY_THRESHOLD;
        const hasSignificantDownwardVelocity = touchVelocity < -VELOCITY_THRESHOLD;

        let shouldExpand;

        if (hasSignificantUpwardVelocity) {
            shouldExpand = true;
        } else if (hasSignificantDownwardVelocity) {
            shouldExpand = false;
        } else {
            shouldExpand = currentPosition < threshold;
        }

        if (shouldExpand) {
            setIsPanelExpanded(true);
            setTranslateY(EXPANDED_Y);
        } else {
            setIsPanelExpanded(false);
            setTranslateY(collapsedY);
        }
        setTouchVelocity(0);
    };

    // Add event listeners 
    useEffect(() => {
        const menuElement = menuRef.current;
        if (!menuElement) return;

        const dragHandle = menuElement.querySelector('.drag-handle');
        const menuHeader = menuElement.querySelector('.menu-header');

        const touchStartHandler = (e) => handleTouchStart(e);
        const touchMoveHandler = (e) => {
            // We need to attach this non-passively to prevent scroll
            if (!isDragging) return;
            e.preventDefault(); // Critical for avoiding browser scroll while dragging
            handleTouchMove(e);
        };
        // We also need a window level move handler if the finger leaves the element? 
        // No, touchmove target is usually the element started on.
        // But let's attach move/end to window to be safe? 
        // Actually typical pattern is attaching move/end to window/document during drag.
        // But here keeping it simple as per existing code structure which used element listeners. 
        // We just need to make sure we call the latest closure state.
        // Since we are using state values in the handler, relying on useEffect dependencies is tricky.
        // Ideally we should use refs for mutable values during drag to avoid re-binding listeners on every render.
        // But for now, let's just make sure the effect re-runs when drag state changes.
        // Actually, pure React event handlers on the div might be smoother but we want non-passive.

        // To properly handle closures with addEventListener in useEffect:
        // We can't really access the *latest* state inside the listener unless we use refs.
        // Since I rewrote the handlers to use state (translateY), they will be stale if I don't re-bind.
        // The safest way without refs is using the function form of setState, but we need 'currentY' etc.
        // Let's rely on the React ref pattern for values that change fast.

        // HOWEVER, to avoid massive refactoring, I will just bind the listeners. 
        // But wait, `handleTouchMove` uses `translateY` from state.
        // If I bind it once, it captures initial `translateY`.
        // I need to use a Ref for `translateY` and `currentY` to avoid stale closures in event listeners
        // OR re-bind on change (expensive).

        // Let's USE REFS for the drag logic variables to ensure performance and correctness.
    }, [isDragging]); // Relying on the below Ref-based effect instead.

    // Ref-based drag state to solve closure issues
    const stateRef = useRef({
        translateY: translateY,
        currentY: currentY,
        isDragging: isDragging,
        lastTouchTimestamp: 0,
        lastTouchY: 0,
        touchVelocity: 0
    });

    // Keep ref synced
    useEffect(() => {
        stateRef.current.translateY = translateY;
        stateRef.current.currentY = currentY;
        stateRef.current.isDragging = isDragging;
    }, [translateY, currentY, isDragging]);

    // Re-implement the listeners using Refs to avoid re-binding
    useEffect(() => {
        const menuElement = menuRef.current;
        if (!menuElement) return;

        const onTouchStart = (e) => {
            const target = e.target;
            const isHandle = target.classList.contains('drag-handle') || target.closest('.menu-header') !== null;
            if (!isHandle) return;

            const touchY = e.touches[0].clientY;
            setIsDragging(true);
            setStartY(touchY);
            setCurrentY(touchY);
            stateRef.current.isDragging = true;
            stateRef.current.currentY = touchY;
            stateRef.current.lastTouchTimestamp = Date.now();
            stateRef.current.lastTouchY = touchY;
            stateRef.current.touchVelocity = 0;
            // No need to set translateY here, it starts from whatever it is
        };

        const onTouchMove = (e) => {
            if (!stateRef.current.isDragging) return;
            e.preventDefault(); // Stop scrolling

            const touchY = e.touches[0].clientY;
            const deltaY = touchY - stateRef.current.currentY;
            const currentTransY = stateRef.current.translateY;

            let newTransY = currentTransY + deltaY;
            newTransY = Math.max(EXPANDED_Y, Math.min(getCollapsedY(), newTransY));

            // Update state and Ref
            setTranslateY(newTransY);
            setCurrentY(touchY); // This triggers re-render, verifying frame rate...

            // Update refs immediately for next frame calc (though React state update is async, 
            // we need to accumulate deltas correctly. 
            // Actually, using delta from *previous frame* touch position is better.
            stateRef.current.currentY = touchY;
            // Note: setTranslateY is async, so stateRef.current.translateY won't update until effect runs.
            // We must manually update the ref's "current effective translateY" for the next event *within this closure*?
            // No, standard `delta` approach: delta is (TouchNow - TouchPrev). NewPos = OldPos + Delta.
            // We need `OldPos` to be the up-to-date position. 
            // So we should update stateRef.current.translateY immediately to `newTransY`.
            stateRef.current.translateY = newTransY;

            // Velocity
            const now = Date.now();
            const timeDelta = now - stateRef.current.lastTouchTimestamp;
            if (timeDelta > 0) {
                const newVel = (stateRef.current.lastTouchY - touchY) / timeDelta;
                stateRef.current.touchVelocity = newVel;
                stateRef.current.lastTouchTimestamp = now;
                stateRef.current.lastTouchY = touchY;
            }
        };

        const onTouchEnd = () => {
            if (!stateRef.current.isDragging) return;
            setIsDragging(false);

            const currentPos = stateRef.current.translateY;
            const vel = stateRef.current.touchVelocity;
            const threshold = EXPANDED_Y + (getCollapsedY() - EXPANDED_Y) * 0.4;

            let expand = false;
            if (vel > VELOCITY_THRESHOLD) expand = true;
            else if (vel < -VELOCITY_THRESHOLD) expand = false;
            else expand = currentPos < threshold;

            if (expand) {
                setIsPanelExpanded(true);
                setTranslateY(EXPANDED_Y);
            } else {
                setIsPanelExpanded(false);
                setTranslateY(getCollapsedY());
            }
        };

        menuElement.addEventListener('touchstart', onTouchStart, { passive: true });
        menuElement.addEventListener('touchmove', onTouchMove, { passive: false });
        menuElement.addEventListener('touchend', onTouchEnd);

        return () => {
            menuElement.removeEventListener('touchstart', onTouchStart);
            menuElement.removeEventListener('touchmove', onTouchMove);
            menuElement.removeEventListener('touchend', onTouchEnd);
        };
    }, []); // Run once! using Refs for state


    const indexOfLastCard = currentPage * cardsPerPage;
    const indexOfFirstCard = indexOfLastCard - cardsPerPage;
    const currentCards = bottomMenuStops.slice(indexOfFirstCard, indexOfLastCard);
    const totalPages = Math.ceil(bottomMenuStops.length / cardsPerPage);

    return (
        <div
            ref={menuRef}
            className="absolute z-[70] touch-none"
            style={{
                bottom: `${bottomGap}px`,
                left: `${sideMargin}px`,
                right: `${sideMargin}px`,
                height: `${dynamicHeight}px`,
                transition: isDragging ? 'none' : 'height 500ms cubic-bezier(0.23, 1, 0.32, 1), bottom 500ms cubic-bezier(0.23, 1, 0.32, 1), left 500ms cubic-bezier(0.23, 1, 0.32, 1), right 500ms cubic-bezier(0.23, 1, 0.32, 1)',
                willChange: 'height, bottom, left, right',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                perspective: 1000,
            }}
        // Events attached via ref
        >
            <div
                className={`w-full h-full flex flex-col glass-effect shadow-2xl overflow-hidden`}
                style={{
                    borderTopLeftRadius: `${topRadius}px`,
                    borderTopRightRadius: `${topRadius}px`,
                    borderBottomLeftRadius: `${bottomRadius}px`,
                    borderBottomRightRadius: `${bottomRadius}px`,
                }}
            >
                <div className="p-3 px-5 text-center text-gray-300 border-b border-gray-700/60 menu-header cursor-grab active:cursor-grabbing shrink-0">
                    <div className="relative">
                        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-1 drag-handle"></div>
                        {userLocation && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onLocationClick && onLocationClick();
                                }}
                                className="absolute left-0 top-0 text-gray-400 hover:text-white transition-colors duration-200 z-[80]"
                                aria-label="Center on my location"
                            >
                                <img src={locationIcon} alt="Location" className="w-5 h-5 opacity-60 m-1" />
                            </button>
                        )}
                        <button
                            onClick={handleRefreshClick}
                            className="absolute right-0 top-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 active:from-blue-500/30 active:to-cyan-500/30 px-3 py-1 rounded-full border border-blue-400/30 transition-all duration-200 hover:scale-105 shadow-sm backdrop-blur-sm flex items-center justify-center"
                        >
                            <img
                                src={refreshIcon}
                                alt="Refresh"
                                className={`w-5 h-5 transition-transform duration-200 ${isRefreshing ? 'animate-spin-reverse' : ''}`}
                            />
                        </button>
                    </div>
                    <span className="text-sm font-semibold flex items-center justify-center gap-2">
                        {searchTerm ? "Search Results" : "Nearby Stations"}
                        {isLoading && bottomMenuStops.length > 0 && (
                            <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        )}
                    </span>
                    {isWaitingForLocation && locationWaitRemainingSec != null && (
                        <div className="mt-1 text-xs text-gray-300">
                            Waiting for GPS location ({locationWaitRemainingSec}s)
                        </div>
                    )}
                </div>

                <div className="flex-grow overflow-y-auto overscroll-contain" ref={menuScrollRef}>
                    {isLoading && bottomMenuStops.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-2">
                            <LoadingScreen secondaryText={null} />
                        </div>
                    ) : currentCards.length > 0 ? (
                        currentCards.map((stop) => (
                            <StopItem
                                key={stop.uniqueStopPointId}
                                stop={stop}
                                handleStopSelect={() => onStopSelect && onStopSelect(stop)}
                                isSelected={selectedStop && (
                                    (stop.gtfsId && String(selectedStop.gtfsId) === String(stop.gtfsId)) ||
                                    (stop.uniqueStopPointId && String(selectedStop.uniqueStopPointId) === String(stop.uniqueStopPointId))
                                )}
                                ref={selectedStop && (
                                    (stop.gtfsId && String(selectedStop.gtfsId) === String(stop.gtfsId)) ||
                                    (stop.uniqueStopPointId && String(selectedStop.uniqueStopPointId) === String(stop.uniqueStopPointId))
                                ) ? selectedStopRef : null}
                            />
                        ))
                    ) : (
                        <p className="text-gray-400 text-center p-10">
                            {searchTerm ? 'No stops match your search.' : 'Nearby stops will appear here.'}
                        </p>
                    )}
                </div>

                {totalPages > 1 && isPanelExpanded && (
                    <div className={`flex-shrink-0 border-t border-gray-700/60${isStandalone ? ' py-4' : ' py-4'}`}>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            handlePageChange={(page) => setCurrentPage(page)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default BottomMenu;
