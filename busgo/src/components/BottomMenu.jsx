import React, { useRef, useCallback, useState, useEffect } from 'react';
import StopItem from './StopItem';
import Pagination from './Pagination';
import LoadingScreen from './LoadingScreen';
import locationIcon from '../assets/location.svg';
import refreshIcon from '../assets/refresh.svg';

const BottomMenu = ({
    bottomMenuStops,
    isLoading,
    searchTerm,
    isPanelExpanded,
    setIsPanelExpanded,
    currentPage,
    setCurrentPage,
    selectedStop,
    handleStopSelect,
    handleRefreshClick,
    isRefreshing,
    userLocation,
    isStandalone,
    selectedStopRef,
    menuScrollRef,
    cardsPerPage = 50
}) => {
    // Touch gesture state
    const [isDragging, setIsDragging] = useState(false);
    const [startY, setStartY] = useState(0);
    const [currentY, setCurrentY] = useState(0);
    const [translateY, setTranslateY] = useState(isPanelExpanded ? 10 : 'calc(100% - 220px)');
    const [touchVelocity, setTouchVelocity] = useState(0);
    const [lastTouchTimestamp, setLastTouchTimestamp] = useState(0);
    const [lastTouchY, setLastTouchY] = useState(0);
    const menuRef = useRef(null);
    
    // Constants for inertia behavior
    const VELOCITY_THRESHOLD = 0.5; // pixels per millisecond
    const indexOfLastCard = currentPage * cardsPerPage;
    const indexOfFirstCard = indexOfLastCard - cardsPerPage;
    const currentCards = bottomMenuStops.slice(indexOfFirstCard, indexOfLastCard);
    const totalPages = Math.ceil(bottomMenuStops.length / cardsPerPage);

    // Handle touch events for dragging
    const handleTouchStart = (e) => {
        // Only initiate drag if touch started on the handle or header area
        const target = e.target;
        const isHandle = target.classList.contains('drag-handle') || 
                        target.closest('.menu-header') !== null;
        
        if (isHandle) {
            // Get the current menu position before starting the drag
            const menuElement = menuRef.current;
            const currentTranslateY = window.getComputedStyle(menuElement).transform;
            let currentY = 0;
            
            // Extract the current Y position from the transform matrix
            if (currentTranslateY && currentTranslateY !== 'none') {
                const matrix = new DOMMatrix(currentTranslateY);
                currentY = matrix.m42; // Get the Y translation value
            } else {
                // Fallback if transform is not set
                currentY = isPanelExpanded ? 10 : window.innerHeight - 220;
            }
            
            setIsDragging(true);
            // Store the touch start position
            setStartY(e.touches[0].clientY);
            // Store the current Y position
            setCurrentY(e.touches[0].clientY);
            // Set the initial translateY to match current position
            setTranslateY(`${currentY}px`);
            // Reset velocity tracking
            setTouchVelocity(0);
            setLastTouchTimestamp(Date.now());
            setLastTouchY(e.touches[0].clientY);
            // Mark the event as being handled by the drag system
            e.target.dataset.dragging = 'true';
        }
    };

    // This function is now only used as a reference for the touchMoveHandler in useEffect
    // We're not attaching it directly to any elements to avoid passive event listener issues
    const handleTouchMove = (e) => {
        if (!isDragging) return;
        
        // Get the current touch position
        const touchY = e.touches[0].clientY;
        
        // Calculate how far the touch has moved from the start
        const deltaY = touchY - startY;
        
        // Get the current menu position
        const menuElement = menuRef.current;
        const currentTranslateY = window.getComputedStyle(menuElement).transform;
        let currentY = 0;
        
        // Extract the current Y position from the transform matrix
        if (currentTranslateY && currentTranslateY !== 'none') {
            const matrix = new DOMMatrix(currentTranslateY);
            currentY = matrix.m42; // Get the Y translation value
        }
        
        // Calculate the new position with increased sensitivity (1.2x)
        const newTranslateY = currentY + (touchY - currentY) * 1.2;
        
        // Apply constraints to keep the menu within bounds
        const minTranslateY = 10; // Fully expanded position (10px from top)
        const maxTranslateY = window.innerHeight - 220; // Collapsed position
        
        const constrainedTranslateY = Math.max(minTranslateY, Math.min(newTranslateY, maxTranslateY));
        
        // Update the menu position
        setTranslateY(`${constrainedTranslateY}px`);
        setCurrentY(touchY);
        
        // Calculate and update velocity
        const now = Date.now();
        const timeDelta = now - lastTouchTimestamp;
        if (timeDelta > 0) {
            // Calculate pixels per millisecond
            const newVelocity = (lastTouchY - touchY) / timeDelta;
            setTouchVelocity(newVelocity);
            setLastTouchTimestamp(now);
            setLastTouchY(touchY);
        }
        
        // Prevent default only when we're actually dragging the menu
        // This allows scrolling in the content area
        if (e.target.dataset.dragging === 'true' || e.target.closest('.menu-header')) {
            e.preventDefault();
        }
    };

    const handleTouchEnd = () => {
        if (!isDragging) return;
        
        setIsDragging(false);
        
        // Get the current numeric position
        const currentPosition = typeof translateY === 'string' && translateY.endsWith('px') 
            ? parseFloat(translateY) 
            : window.innerHeight - 220;
        
        // Determine threshold for snap (40% of the draggable area)
        const windowHeight = window.innerHeight;
        const expandedPosition = 10;
        const collapsedPosition = windowHeight - 220;
        const threshold = expandedPosition + (collapsedPosition - expandedPosition) * 0.4;
        
        // Check if we have a significant velocity (positive is downward, negative is upward)
        const hasSignificantUpwardVelocity = touchVelocity > VELOCITY_THRESHOLD;
        const hasSignificantDownwardVelocity = touchVelocity < -VELOCITY_THRESHOLD;
        
        // Determine final state based on position and velocity
        let shouldExpand;
        
        if (hasSignificantUpwardVelocity) {
            // Fast upward flick - expand regardless of position
            shouldExpand = true;
            console.log('Fast upward flick detected - expanding menu');
        } else if (hasSignificantDownwardVelocity) {
            // Fast downward flick - collapse regardless of position
            shouldExpand = false;
            console.log('Fast downward flick detected - collapsing menu');
        } else {
            // No significant velocity - use position threshold
            shouldExpand = currentPosition < threshold;
        }
        
        // Snap to position based on decision
        if (shouldExpand) {
            setIsPanelExpanded(true);
            setTranslateY(`${expandedPosition}px`);
        } else {
            setIsPanelExpanded(false);
            setTranslateY(`${collapsedPosition}px`);
        }
        
        // Reset velocity
        setTouchVelocity(0);
    };
    
    // Update translateY when isPanelExpanded changes from outside
    useEffect(() => {
        if (isDragging) return; // Don't override during active drag
        
        setTranslateY(isPanelExpanded ? '50px' : 'calc(100% - 220px)');
    }, [isPanelExpanded, isDragging]);
    
    // Add event listeners for touch events on the drag handle and menu header
    useEffect(() => {
        const menuElement = menuRef.current;
        if (!menuElement) return;

        // Get the drag handle and menu header elements
        const dragHandle = menuElement.querySelector('.drag-handle');
        const menuHeader = menuElement.querySelector('.menu-header');
        
        // Function to handle touch start on the drag handle or menu header
        const touchStartHandler = (e) => {
            handleTouchStart(e);
        };
        
        // Function to handle touch move events
        const touchMoveHandler = (e) => {
            if (!isDragging) return;
            
            // Only prevent default when we're actually dragging the menu
            // This allows scrolling in the content area to work
            e.preventDefault();
            
            // Get the current touch position
            const touchY = e.touches[0].clientY;
            
            // Get the current menu position from the style
            const currentTranslateY = window.getComputedStyle(menuElement).transform;
            let baseY = 0;
            
            // Extract the current Y position from the transform matrix
            if (currentTranslateY && currentTranslateY !== 'none') {
                const matrix = new DOMMatrix(currentTranslateY);
                baseY = matrix.m42; // Get the Y translation value
            } else {
                // Fallback if transform is not set
                baseY = isPanelExpanded ? 10 : window.innerHeight - 220;
            }
            
            // Update the current touch position for reference
            setCurrentY(touchY);
            
            const windowHeight = window.innerHeight;
            
            // Calculate new position directly based on finger movement
            // This ensures the menu follows the finger exactly
            let newTranslateY = baseY + (touchY - currentY);
            
            // Apply constraints to keep the menu within bounds
            newTranslateY = Math.max(10, Math.min(windowHeight - 220, newTranslateY));
            
            // Update the menu position immediately
            setTranslateY(`${newTranslateY}px`);
            
            // Calculate and update velocity for inertia
            const now = Date.now();
            const timeDelta = now - lastTouchTimestamp;
            if (timeDelta > 0) {
                // Calculate pixels per millisecond (negative is upward)
                const newVelocity = (lastTouchY - touchY) / timeDelta;
                setTouchVelocity(newVelocity);
                setLastTouchTimestamp(now);
                setLastTouchY(touchY);
            }
            
            // Update current position reference for next move
            setCurrentY(touchY);
        };
        
        // Add passive touch start listeners for better performance
        if (dragHandle) {
            dragHandle.addEventListener('touchstart', touchStartHandler, { passive: true });
        }
        
        if (menuHeader) {
            menuHeader.addEventListener('touchstart', touchStartHandler, { passive: true });
        }
        
        // Add non-passive touch move listener to the menu element
        // This allows us to call preventDefault() when needed
        menuElement.addEventListener('touchmove', touchMoveHandler, { passive: false });
        
        // Prevent touch events in the content area from being captured by the menu's drag handlers
        const contentArea = menuScrollRef.current;
        // Define contentTouchHandler outside the if block so it's accessible in the cleanup function
        const contentTouchHandler = (e) => {
            // Only if we're not already dragging the menu
            if (!isDragging) {
                // Stop propagation to prevent the menu's handlers from capturing this event
                e.stopPropagation();
            }
        };
        
        if (contentArea) {
            contentArea.addEventListener('touchstart', contentTouchHandler, { passive: true });
            contentArea.addEventListener('touchmove', contentTouchHandler, { passive: true });
        }
        
        return () => {
            // Clean up event listeners
            if (dragHandle) {
                dragHandle.removeEventListener('touchstart', touchStartHandler);
            }
            
            if (menuHeader) {
                menuHeader.removeEventListener('touchstart', touchStartHandler);
            }
            
            menuElement.removeEventListener('touchmove', touchMoveHandler);
            
            if (contentArea) {
                contentArea.removeEventListener('touchstart', contentTouchHandler);
                contentArea.removeEventListener('touchmove', contentTouchHandler);
            }
        };
    }, [isDragging, isPanelExpanded, startY, currentY, lastTouchY, lastTouchTimestamp, touchVelocity, menuScrollRef]);
    
    // This useEffect is no longer needed as we've integrated content area handling
    // into the main touch event useEffect above

    return (
        <div 
            ref={menuRef}
            className="absolute bottom-0 left-0 right-0 z-30 touch-none"
            style={{
                transform: `translateY(${translateY})`,
                transition: isDragging ? 'none' : 'transform 500ms cubic-bezier(0.23, 1, 0.32, 1)', // iOS-like easing
                willChange: 'transform' // Optimize for animations
            }}
            onTouchEnd={handleTouchEnd}>
            <div className="w-full h-[calc(100vh-80px)] max-w-3xl mx-auto flex flex-col glass-effect rounded-t-2xl shadow-2xl overflow-hidden">
                <div className="p-3 text-center text-gray-300 border-b border-gray-700/60 menu-header cursor-grab active:cursor-grabbing">
                    <div className="relative">
                        <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-1 drag-handle"></div>
                        {userLocation && (
                            <div className="absolute left-0 top-0 text-gray-400 text-sm">
                                <img src={locationIcon} alt="Location" className="w-5 h-5 opacity-60 m-1" />
                            </div>
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
                    <span className="text-sm font-semibold block">
                        {searchTerm ? "Search Results" : "Nearby Stations"}
                    </span>
                </div>

                <div className="flex-grow overflow-y-auto overscroll-contain" ref={menuScrollRef}>
                    {isLoading ? (
                        <LoadingScreen />
                    ) : currentCards.length > 0 ? (
                        currentCards.map((stop) => (
                            <StopItem
                                key={stop.uniqueStopPointId}
                                stop={stop}
                                handleStopSelect={() => handleStopSelect(stop)}
                                isSelected={selectedStop && selectedStop.gtfsId === stop.gtfsId}
                                ref={selectedStop && selectedStop.gtfsId === stop.gtfsId ? selectedStopRef : null}
                            />
                        ))
                    ) : (
                        <p className="text-gray-400 text-center p-10">
                            {searchTerm ? 'No stops match your search.' : 'Nearby stops will appear here.'}
                        </p>
                    )}
                </div>

                {totalPages > 1 && isPanelExpanded && (
                    <div className={`flex-shrink-0 border-t border-gray-700/60${isStandalone ? ' pb-8' : ''}`}>
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