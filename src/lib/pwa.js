const SERVICE_WORKER_URL = '/service-worker.js';

export function registerServiceWorker() {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
        return;
    }

    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((error) => {
        console.error('Service worker registration failed', error);
    });
}
