function safeStringifyDetails(details) {
    if (!details) {
        return null;
    }

    return JSON.stringify(details);
}

function writeAuditLog(db, { adminId = null, action, entityType, entityId = null, ipAddress = null, details = null }) {
    db.prepare(`
        INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, ip_address, details)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        adminId,
        action,
        entityType,
        entityId === null || entityId === undefined ? null : String(entityId),
        ipAddress,
        safeStringifyDetails(details)
    );
}

module.exports = {
    writeAuditLog
};
