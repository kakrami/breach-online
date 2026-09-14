export const TEAMS = ["blue", "red"];
export function isTeam(value) {
    return value === "blue" || value === "red";
}
export function oppositeTeam(team) {
    return team === "blue" ? "red" : "blue";
}
export const TEAM_COLORS = {
    blue: "#2f7dff",
    red: "#ff414d"
};
