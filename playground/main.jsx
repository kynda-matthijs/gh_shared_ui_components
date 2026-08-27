import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Reference styling only — never imported by admin_client/mini_site, which each keep
// their own copy (see src/styles.css's own header for why those two aren't unified).
import '../src/styles.css';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
