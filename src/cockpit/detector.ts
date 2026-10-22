import { AR } from "js-aruco2";
import { MARKER_DICTIONARY } from "../shared/targets";

export type DetectedMarker = {
  id: number;
  /** Corners and center in the source canvas' pixels. */
  corners: { x: number; y: number }[];
  center: { x: number; y: number };
};

/** Finds ArUco markers on a downscaled copy of the view; full resolution is too slow per frame. */
export class MarkerDetector {
  private detector = new AR.Detector({ dictionaryName: MARKER_DICTIONARY });
  private scratch: OffscreenCanvasRenderingContext2D;
  lastMs = 0;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly scale = 0.5,
  ) {
    const canvas = new OffscreenCanvas(Math.round(width * scale), Math.round(height * scale));
    this.scratch = canvas.getContext("2d", { willReadFrequently: true })!;
  }

  detect(source: CanvasImageSource): DetectedMarker[] {
    const started = performance.now();
    const { canvas } = this.scratch;
    this.scratch.drawImage(source, 0, 0, this.width, this.height, 0, 0, canvas.width, canvas.height);
    const image = this.scratch.getImageData(0, 0, canvas.width, canvas.height);
    const markers = this.detector.detect(image).map((marker) => {
      const corners = marker.corners.map(({ x, y }) => ({ x: x / this.scale, y: y / this.scale }));
      const center = {
        x: corners.reduce((sum, c) => sum + c.x, 0) / corners.length,
        y: corners.reduce((sum, c) => sum + c.y, 0) / corners.length,
      };
      return { id: marker.id, corners, center };
    });
    this.lastMs = performance.now() - started;
    return markers;
  }
}
