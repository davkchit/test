import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import './styles/base.css';

const savedTheme = localStorage.getItem('anti_vuz_theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
    <BrowserRouter>
        <App />
    </BrowserRouter>
);
