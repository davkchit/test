const { PORT } = require('./config');
const { createApp } = require('./app');

const { app, hasFrontendBuild } = createApp();

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`ANTI_VUZ server running at http://localhost:${PORT}`);
        console.log(`Schedule:  http://localhost:${PORT}/`);
        console.log(`Admin:     http://localhost:${PORT}/admin`);
        console.log(`Dashboard: http://localhost:${PORT}/admin/dashboard`);
        console.log(`Frontend source: ${hasFrontendBuild ? 'dist build' : 'not built yet'}`);
    });
}

module.exports = { app };
