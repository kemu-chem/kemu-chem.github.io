/** Color palette for multiplet groups. Cycled by group ID. */
export const GROUP_COLORS = [
    '#3b82f6', '#22c55e', '#f97316', '#a855f7', '#06b6d4',
    '#f43f5e', '#eab308', '#14b8a6', '#8b5cf6', '#ec4899',
    '#84cc16', '#fb923c', '#38bdf8', '#4ade80', '#c084fc',
];

/** Returns the color string for a given 1-based group ID. */
export const groupColor = gid => GROUP_COLORS[(gid - 1) % GROUP_COLORS.length];
