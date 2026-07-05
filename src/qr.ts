/* ============================================================================
 * QR rendering helper
 * ----------------------------------------------------------------------------
 * Panels render <img data-qr="<text>"> placeholders as plain HTML strings;
 * after every render pass, hydrateQrImages() finds them and fills in a data
 * URL. QR generation is async, so it cannot happen inline during the
 * innerHTML-string render.
 * ========================================================================= */

import QRCode from "qrcode";

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 5,
    color: { dark: "#1b1205", light: "#f7f0dd" }
  });
}

export function hydrateQrImages(root: ParentNode = document): void {
  root.querySelectorAll<HTMLImageElement>("img[data-qr]").forEach((img) => {
    const text = img.dataset.qr;
    if (!text || img.src.startsWith("data:")) {
      return;
    }
    void qrDataUrl(text).then((url) => {
      // The app re-renders by replacing innerHTML; only assign if this
      // element is still attached to the live document.
      if (img.isConnected) {
        img.src = url;
      }
    });
  });
}
