import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/globals.css'

try {
    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error("Root element not found");

    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>,
    )
    console.log("React app mounted successfully");
} catch (error) {
    console.error("Failed to mount React app:", error);
    document.body.innerHTML = `<div style="color:red; padding:20px; background:#1a1a1a; height:100vh; color:white;">
        <h1>Fatal Startup Error</h1>
        <pre>${error}</pre>
    </div>`;
}
