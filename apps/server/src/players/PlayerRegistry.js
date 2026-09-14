import { clonePlayer } from "../../../../packages/shared/src/player.js";
export class PlayerRegistry {
    players = new Map();
    constructor(players = []) {
        for (const player of players)
            this.players.set(player.id, clonePlayer(player));
    }
    get(id) {
        const found = this.players.get(id);
        return found ? clonePlayer(found) : undefined;
    }
    require(id) {
        const found = this.get(id);
        if (!found)
            throw new Error(`Unknown player ${id}`);
        return found;
    }
    set(player) {
        this.players.set(player.id, clonePlayer(player));
    }
    remove(id) {
        this.players.delete(id);
    }
    values() {
        return [...this.players.values()].map(clonePlayer);
    }
    connectedValues() {
        return this.values().filter((player) => player.connected);
    }
    size() {
        return this.players.size;
    }
}
