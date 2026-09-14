import { oppositeTeam } from "../../../../packages/shared/src/team.js";
import { spawnTransform } from "../../../../packages/world/src/alphaWorld.js";
export class TeamService {
    players;
    constructor(players) {
        this.players = players;
    }
    chooseBalancedTeam() {
        const connected = this.players.connectedValues();
        const blue = connected.filter((player) => player.team === "blue").length;
        const red = connected.filter((player) => player.team === "red").length;
        return blue <= red ? "blue" : "red";
    }
    switchTeam(player) {
        const team = oppositeTeam(player.team);
        const lifeId = player.lifeId + 1;
        return {
            ...player,
            team,
            life: "alive",
            lifeId,
            transform: spawnTransform(team, player.id, lifeId),
            movement: {
                velocityX: 0,
                velocityY: 0,
                velocityZ: 0,
                grounded: true,
                crouched: false,
                sprinting: false,
                lastProcessedInputSeq: player.movement.lastProcessedInputSeq
            },
            health: { hp: player.health.maxHp, maxHp: player.health.maxHp },
            respawnAt: null,
            revision: player.revision + 1
        };
    }
}
