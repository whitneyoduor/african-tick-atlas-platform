import html2canvas from "html2canvas";

/** Snapshots an element (chart or map) to PNG and downloads it.
 *  Maps implemented with maplibre-gl have a native getCanvas() — pass a
 *  function `capture` instead of a DOM node to serialize those directly. */
export async function downloadFigurePng(
  nodeOrCapture: HTMLElement | (() => HTMLCanvasElement),
  filename: string
): Promise<void> {
  let blob: Blob | null = null;

  if (typeof nodeOrCapture === "function") {
    const canvas = nodeOrCapture();
    if (!canvas) return;
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
  } else {
    // render the SVG / DOM element to a canvas
    let width = nodeOrCapture.offsetWidth;
    let height = nodeOrCapture.offsetHeight;
    if (!width || !height) {
      const rect = nodeOrCapture.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }
    const canvas = await html2canvas(nodeOrCapture, {
      scale: window.devicePixelRatio > 1 ? 2 : 1.5,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
    });
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
  }

  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
