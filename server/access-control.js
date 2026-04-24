function ensureAdminAccessAllowed(req, res, next) {
    if (isAdminIpAllowed(req.ip)) {
        return next();
    }

    const payload = {
        error: 'Доступ к админке с этого IP-адреса запрещён'
    };

    if (req.originalUrl.startsWith('/api/')) {
        return res.status(403).json(payload);
    }

    return res.status(403).type('text/plain; charset=utf-8').send(payload.error);
}

function isAdminIpAllowed(ipAddress) {
    const allowedIps = parseAllowedIpEntries();

    if (!allowedIps.length) {
        return true;
    }

    const normalizedIp = normalizeIpAddress(ipAddress);

    return expandAllowedEntries(allowedIps).has(normalizedIp);
}

function expandAllowedEntries(entries) {
    const expanded = new Set();

    for (const entry of entries) {
        const normalized = normalizeIpAddress(entry);

        if (!normalized) {
            continue;
        }

        expanded.add(normalized);

        if (normalized === '127.0.0.1') {
            expanded.add('::1');
        }

        if (normalized === '::1') {
            expanded.add('127.0.0.1');
        }
    }

    return expanded;
}

function normalizeIpAddress(value) {
    if (!value) {
        return '';
    }

    const normalized = String(value).trim().toLowerCase();

    if (!normalized) {
        return '';
    }

    if (normalized === 'localhost') {
        return '127.0.0.1';
    }

    if (normalized.startsWith('::ffff:')) {
        return normalized.slice(7);
    }

    return normalized;
}

function parseAllowedIpEntries() {
    const rawValue = process.env.ADMIN_ALLOWED_IPS;

    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return [];
    }

    return String(rawValue)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

module.exports = {
    ensureAdminAccessAllowed,
    normalizeIpAddress
};
