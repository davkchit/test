import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    publicDir: 'client-public',
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000'
        }
    }
});
