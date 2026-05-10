/**
 * Parse Bruker TopSpin peaklist.xml.
 *
 * The file contains one or more <PeakList1D> sections, each holding
 * <Peak1D F1="..." intensity="..."/> elements.  F1 is the chemical
 * shift in ppm; intensity is an arbitrary-scale peak height.
 *
 * @param {string} xmlText - Raw XML text.
 * @returns {Array<Array<{f1: number, intensity: number}>>}
 *   Array of sections; each section is an array of peak objects.
 * @throws {Error} If the XML cannot be parsed.
 */
export function parseBrukerXML(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error('Invalid XML: ' + err.textContent.slice(0, 120));

    const sections = [];
    doc.querySelectorAll('PeakList1D').forEach(sec => {
        const peaks = [];
        sec.querySelectorAll('Peak1D').forEach(p => {
            const f1        = parseFloat(p.getAttribute('F1'));
            const intensity = parseFloat(p.getAttribute('intensity'));
            if (!isNaN(f1)) peaks.push({ f1, intensity });
        });
        if (peaks.length) sections.push(peaks);
    });
    return sections;
}
