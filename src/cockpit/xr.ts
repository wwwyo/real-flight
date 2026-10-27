import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";

/**
 * Horizontal field of view of the drone's camera, in degrees: Tello's 82.6° diagonal on a 4:3 picture.
 * The screen covers the same angle, so the view is neither stretched nor shrunk and speed looks right.
 */
const CAMERA_HFOV = 70;
/**
 * Distances from the eyes, in meters. The camera is monocular, so depth comes only from the readouts
 * floating in front of the video. The sight is drawn on the video plane, not here: a reticle nearer
 * than the target would be seen double while the eyes converge on the target.
 */
const VIDEO_DISTANCE = 6;
const INSTRUMENTS_DISTANCE = 2;

/**
 * Shows the cockpit in WebXR as screens standing in the room where the pilot's head faced on entering,
 * like a cockpit canopy: turning the head looks around the screen instead of carrying it along, which
 * is what makes a head-locked picture feel flat and glued to the face. The drone's camera still does
 * not follow the head. Holding the Meta button recenters the screens in front of the pilot.
 */
export class XrCockpit {
  private renderer: THREE.WebGLRenderer;
  private textures: THREE.CanvasTexture[];
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();

  constructor(
    sight: HTMLCanvasElement,
    instruments: HTMLCanvasElement,
    onFrame: (sources: XRInputSourceArray) => void,
    onEnd: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.xr.enabled = true;
    // "local" puts the origin at the head on entering, and the Meta button's recenter moves it.
    this.renderer.xr.setReferenceSpaceType("local");
    const [video, videoTexture] = screenAt(sight, VIDEO_DISTANCE, false);
    const [readouts, readoutsTexture] = screenAt(instruments, INSTRUMENTS_DISTANCE, true);
    readouts.renderOrder = 1;
    this.textures = [videoTexture, readoutsTexture];
    this.scene.add(video, readouts);

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

  /** Marks the canvases as changed so the next XR frame uploads them. */
  invalidate(): void {
    for (const texture of this.textures) texture.needsUpdate = true;
  }

  /** The "Enter VR" button; three.js shows "VR not supported" when WebXR is unavailable. */
  button(): HTMLElement {
    return VRButton.createButton(this.renderer);
  }
}

/** A flat screen `distance` meters ahead of where the head faced on entering, covering the camera's field of view. */
function screenAt(canvas: HTMLCanvasElement, distance: number, transparent: boolean): [THREE.Mesh, THREE.CanvasTexture] {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const width = 2 * distance * Math.tan(THREE.MathUtils.degToRad(CAMERA_HFOV / 2));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * (canvas.height / canvas.width)),
    new THREE.MeshBasicMaterial({ map: texture, transparent, depthWrite: !transparent }),
  );
  screen.position.z = -distance;
  return [screen, texture];
}
