import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    publicDir: 'client-public',
    server: {
        host: '127.0.0.1',
        port: 5173,
        allowedHosts: true,
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
});
