declare module "js-aruco2" {
  type Corner = { x: number; y: number };

  export namespace AR {
    class Marker {
      id: number;
      corners: Corner[];
      hammingDistance: number;
    }

    class Dictionary {
      constructor(dictionaryName: string);
      /** One "0"/"1" string per id, row-major, without the black border. */
      codeList: string[];
      /** Marker side in cells, including the black border. */
      markSize: number;
      generateSVG(id: number): string;
    }

    class Detector {
      constructor(config?: { dictionaryName?: string; maxHammingDistance?: number });
      detect(image: { width: number; height: number; data: Uint8ClampedArray }): Marker[];
    }
  }
}
