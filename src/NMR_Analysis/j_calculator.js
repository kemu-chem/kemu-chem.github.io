/**
 * Compute J coupling constants from grouped NMR peaks.
 *
 * For each multiplet group, every adjacent pair (sorted high→low ppm)
 * yields one J value:
 *
 *   J (Hz) = |ΔF1 (ppm)| × spectrometer frequency (MHz)
 *
 * This assumes first-order multiplets where the line spacing equals J.
 * The result is filtered to J < thresholdHz.
 *
 * @param {Array<{gid, peaks, isMultiplet, color}>} groupsFlat
 *   Output of buildGroupsFlat.
 * @param {number} freqMHz - Spectrometer frequency in MHz.
 * @param {number} thresholdHz - Upper limit; only J < threshold are returned.
 * @returns {Array<{group, center, peakA, peakB, deltaPpm, jHz}>}
 */
export function computeJ(groupsFlat, freqMHz, thresholdHz) {
    const results = [];
    groupsFlat.forEach(g => {
        if (!g.isMultiplet) return;
        const center = g.peaks.reduce((s, p) => s + p.f1, 0) / g.peaks.length;
        for (let i = 0; i < g.peaks.length - 1; i++) {
            const deltaPpm = g.peaks[i].f1 - g.peaks[i + 1].f1; // always ≥ 0
            const jHz      = deltaPpm * freqMHz;
            if (jHz < thresholdHz) {
                results.push({
                    group:    g.gid,
                    center:   +center.toFixed(4),
                    peakA:    +g.peaks[i].f1.toFixed(6),
                    peakB:    +g.peaks[i + 1].f1.toFixed(6),
                    deltaPpm: +deltaPpm.toFixed(6),
                    jHz:      +jHz.toFixed(2),
                });
            }
        }
    });
    return results;
}
