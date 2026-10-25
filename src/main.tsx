import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';
import { startThumbnailRenderer } from './thumbnails/thumbnailRenderer';

// The same bundle runs in a hidden window that only draws 3D thumbnails for the main process.
if (window.location.hash === '#thumbnail-renderer') {
    startThumbnailRenderer();
} else {
    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error('Root element not found');

    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>,
    );
}
