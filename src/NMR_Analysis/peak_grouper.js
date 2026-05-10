/**
 * Sort peaks high→low ppm and split into multiplet groups.
 *
 * Two adjacent peaks belong to the same group when their ppm gap is
 * smaller than gapPpm.  This exploits the fact that lines within a
 * multiplet are far closer together than lines from different signals.
 *
 * @param {Array<{f1: number, intensity: number}>} peaks
 * @param {number} gapPpm - Maximum within-group spacing (ppm).
 * @returns {Array<Array<{f1: number, intensity: number}>>}
 *   Each inner array is a sorted (high→low ppm) group of peaks.
 */
export function groupPeaks(peaks, gapPpm) {
    const sorted = [...peaks].sort((a, b) => b.f1 - a.f1);
    const groups = [];
    let cur = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        if (cur[cur.length - 1].f1 - sorted[i].f1 > gapPpm) {
            groups.push(cur);
            cur = [];
        }
        cur.push(sorted[i]);
    }
    groups.push(cur);
    return groups;
}

/**
 * Build a flat list of groups with sequential IDs across all sections.
 *
 * @param {Array<Array<{f1: number, intensity: number}>>} sections
 *   Output of a parser (e.g. parseBrukerXML).
 * @param {number} gapPpm - Passed to groupPeaks.
 * @param {function(number): string} colorFn - Maps gid → CSS color string.
 * @returns {Array<{gid: number, peaks: Array, isMultiplet: boolean, color: string}>}
 */
export function buildGroupsFlat(sections, gapPpm, colorFn) {
    let gid = 0;
    const groupsFlat = [];
    sections.forEach(peaks => {
        groupPeaks(peaks, gapPpm).forEach(group => {
            gid++;
            groupsFlat.push({
                gid,
                peaks: group,            // sorted high→low ppm
                isMultiplet: group.length >= 2,
                color: colorFn(gid),
            });
        });
    });
    return groupsFlat;
}
