import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";

/** Distance of the screen in front of the eyes, in meters. */
const SCREEN_DISTANCE = 1.5;
/** Horizontal field of view the screen covers, in degrees. */
const SCREEN_FOV = 80;

/**
 * Shows the cockpit canvas in WebXR as a screen fixed in front of the pilot's eyes, like FPV
 * goggles. Not world-locked: the drone's camera does not follow the pilot's head.
 */
export class XrCockpit {
  private renderer: THREE.WebGLRenderer;
  private texture: THREE.CanvasTexture;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();

  constructor(canvas: HTMLCanvasElement, onFrame: (sources: XRInputSourceArray) => void, onEnd: () => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.xr.enabled = true;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const width = 2 * SCREEN_DISTANCE * Math.tan(THREE.MathUtils.degToRad(SCREEN_FOV / 2));
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * (canvas.height / canvas.width)),
      new THREE.MeshBasicMaterial({ map: this.texture }),
    );
    screen.position.z = -SCREEN_DISTANCE;
    this.camera.add(screen);
    this.scene.add(this.camera);

    this.renderer.xr.addEventListener("sessionend", onEnd);
    this.renderer.setAnimationLoop(() => {
      const session = this.renderer.xr.getSession();
      if (!session) return;
      onFrame(session.inputSources);
      this.renderer.render(this.scene, this.camera);
    });
  }

  get presenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  /** Marks the canvas as changed so the next XR frame uploads it. */
  invalidate(): void {
    this.texture.needsUpdate = true;
  }

  /** The "Enter VR" button; three.js shows "VR not supported" when WebXR is unavailable. */
  button(): HTMLElement {
    return VRButton.createButton(this.renderer);
  }
}
