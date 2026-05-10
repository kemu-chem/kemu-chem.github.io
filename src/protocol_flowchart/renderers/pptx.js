export async function exportPPTX(svgString, filename = "protocol_flowchart") {
  if (!window.PptxGenJS) {
    console.error("PptxGenJS is not loaded.");
    return;
  }
  
  const pres = new window.PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  
  const slide = pres.addSlide();
  
  const base64Str = btoa(unescape(encodeURIComponent(svgString)));
  const dataUrl = "data:image/svg+xml;base64," + base64Str;
  
  slide.addImage({ data: dataUrl, x: 0.5, y: 0.5, w: 12, h: 6 });
  
  await pres.writeFile({ fileName: filename + '.pptx' });
}
