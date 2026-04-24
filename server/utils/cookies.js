function parseCookieHeader(cookieHeader = '') {
    return cookieHeader
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((cookies, cookiePart) => {
            const separatorIndex = cookiePart.indexOf('=');

            if (separatorIndex === -1) {
                return cookies;
            }

            const key = cookiePart.slice(0, separatorIndex).trim();
            const value = cookiePart.slice(separatorIndex + 1).trim();

            cookies[key] = decodeURIComponent(value);
            return cookies;
        }, {});
}

module.exports = { parseCookieHeader };
