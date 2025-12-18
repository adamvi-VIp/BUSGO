import { useEffect } from 'react';
import { CURRENT_VERSION } from '../currentVersion';

const CHECK_INTERVAL = 60 * 1000; // Check every minute

const VersionManager = () => {
    useEffect(() => {
        const checkVersion = async () => {
            try {
                // Fetch the version.json from the server
                // We append a timestamp to prevent caching of the version file itself
                const response = await fetch(`/version.json?t=${Date.now()}`);
                if (!response.ok) return;

                const data = await response.json();
                const serverVersion = data.version;

                if (serverVersion && serverVersion !== CURRENT_VERSION) {
                    console.log(`[VersionManager] Update detected! Client: ${CURRENT_VERSION}, Server: ${serverVersion}`);

                    // Unregister service workers
                    if ('serviceWorker' in navigator) {
                        const registations = await navigator.serviceWorker.getRegistrations();
                        for (const registration of registations) {
                            await registration.unregister();
                        }
                    }

                    // Clear caches
                    if ('caches' in window) {
                        const cacheNames = await caches.keys();
                        await Promise.all(
                            cacheNames.map(cacheName => caches.delete(cacheName))
                        );
                    }

                    // Force reload from server
                    window.location.reload(true);
                }
            } catch (error) {
                console.error('[VersionManager] Failed to check version:', error);
            }
        };

        // Initial check
        checkVersion();

        // Interval check
        const intervalId = setInterval(checkVersion, CHECK_INTERVAL);

        // Check on window focus
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkVersion();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return null; // This component handles logic only, no UI
};

export default VersionManager;
