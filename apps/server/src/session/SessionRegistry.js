export class SessionRegistry {
    sessions = new Map();
    constructor(records = []) {
        for (const record of records)
            this.sessions.set(record.sessionId, { ...record });
    }
    get(sessionId) {
        const found = this.sessions.get(sessionId);
        return found ? { ...found } : undefined;
    }
    require(sessionId) {
        const found = this.get(sessionId);
        if (!found)
            throw new Error("unknown_session");
        return found;
    }
    upsert(sessionId, playerId) {
        const previous = this.sessions.get(sessionId);
        const record = {
            sessionId,
            playerId,
            connectionEpoch: (previous?.connectionEpoch ?? 0) + 1
        };
        this.sessions.set(sessionId, record);
        return { ...record };
    }
    isCurrent(sessionId, epoch) {
        return this.sessions.get(sessionId)?.connectionEpoch === epoch;
    }
    remove(sessionId) {
        this.sessions.delete(sessionId);
    }
    values() {
        return [...this.sessions.values()].map((record) => ({ ...record }));
    }
}
