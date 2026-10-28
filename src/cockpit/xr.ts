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
 * `?layers=0` keeps the screens as meshes in three's projection layer, the path from before quad layers,
 * so the pilot can switch the new path off at the field without a code change.
 */
const QUAD_LAYERS = new URLSearchParams(location.search).get("layers") !== "0";

/** A canvas standing in the room, drawn either as a mesh or, when the headset can, as a quad layer. */
interface Screen {
  canvas: HTMLCanvasElement;
  distance: number;
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
  layer: XRQuadLayer | null;
  dirty: boolean;
}

/**
 * Shows the cockpit in WebXR as screens standing in the room where the pilot's head faced on entering,
 * like a cockpit canopy: turning the head looks around the screen instead of carrying it along, which
 * is what makes a head-locked picture feel flat and glued to the face. The drone's camera still does
 * not follow the head. Holding the Meta button recenters the screens in front of the pilot.
 */
export class XrCockpit {
  private renderer: THREE.WebGLRenderer;
  private screens: Screen[];
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
    const video = screenAt(sight, VIDEO_DISTANCE, false);
    const readouts = screenAt(instruments, INSTRUMENTS_DISTANCE, true);
    readouts.mesh.renderOrder = 1;
    this.screens = [video, readouts];
    this.scene.add(video.mesh, readouts.mesh);

    this.renderer.xr.addEventListener("sessionstart", () => {
      if (QUAD_LAYERS) this.showAsLayers();
    });
    this.renderer.xr.addEventListener("sessionend", () => {
      this.showAsMeshes();
      onEnd();
    });
    this.renderer.setAnimationLoop((_time, frame) => {
      const session = this.renderer.xr.getSession();
      if (!session) return;
      onFrame(session.inputSources);
      if (frame) this.uploadLayers(frame);
      this.renderer.render(this.scene, this.camera);
    });
  }

  get presenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  /** Marks the canvases as changed so the next XR frame uploads them. */
  invalidate(): void {
    for (const screen of this.screens) {
      screen.texture.needsUpdate = true;
      screen.dirty = true;
    }
  }

  /** The "Enter VR" button; three.js shows "VR not supported" when WebXR is unavailable. */
  button(): HTMLElement {
    return VRButton.createButton(this.renderer);
  }

  /**
   * Hands the screens to the compositor as quad layers, which sample the canvas once instead of after
   * three's projection layer has already resampled it; text and video stay sharp. VRButton already asks
   * for the "layers" feature. Anything missing leaves the meshes in place, which is the old view.
   */
  private showAsLayers(): void {
    const session = this.renderer.xr.getSession();
    const space = this.renderer.xr.getReferenceSpace();
    // three's own layer; renderState.layers may not show it yet, since render state changes apply on the next frame.
    const projection = this.renderer.xr.getBaseLayer();
    const hasProjectionLayer = typeof XRProjectionLayer !== "undefined" && projection instanceof XRProjectionLayer;
    if (!session?.enabledFeatures?.includes("layers") || !space || !hasProjectionLayer) return;
    try {
      const binding = this.renderer.xr.getBinding();
      for (const screen of this.screens) {
        const width = screenWidth(screen.distance);
        screen.layer = binding.createQuadLayer({
          space,
          layout: "mono",
          viewPixelWidth: screen.canvas.width,
          viewPixelHeight: screen.canvas.height,
          width,
          height: width * (screen.canvas.height / screen.canvas.width),
          transform: new XRRigidTransform({ z: -screen.distance }),
        });
      }
      // Later layers are composited on top: the video over the empty projection layer, the readouts over the video.
      session.updateRenderState({ layers: [projection, ...this.screens.map((screen) => screen.layer!)] });
    } catch (error) {
      this.fallBackToMeshes(error);
      return;
    }
    for (const screen of this.screens) {
      screen.mesh.visible = false;
      screen.dirty = true;
    }
  }

  private showAsMeshes(): void {
    for (const screen of this.screens) {
      screen.layer?.destroy();
      screen.layer = null;
      screen.mesh.visible = true;
    }
  }

  /** Puts three's projection layer back on its own, so a layer failure mid-sortie leaves the old view, not a frozen one. */
  private fallBackToMeshes(error: unknown): void {
    console.warn("quad layers failed, showing the screens as meshes", error);
    const projection = this.renderer.xr.getBaseLayer();
    if (typeof XRProjectionLayer !== "undefined" && projection instanceof XRProjectionLayer) {
      this.renderer.xr.getSession()?.updateRenderState({ layers: [projection] });
    }
    this.showAsMeshes();
  }

  /** Copies each changed canvas into its layer; needsRedraw means the compositor lost what it had. */
  private uploadLayers(frame: XRFrame): void {
    const gl = this.renderer.getContext();
    const state = this.renderer.state;
    try {
      for (const screen of this.screens) {
        if (!screen.layer || !(screen.dirty || screen.layer.needsRedraw)) continue;
        const subImage = this.renderer.xr.getBinding().getSubImage(screen.layer, frame);
        state.bindTexture(gl.TEXTURE_2D, subImage.colorTexture);
        // Layer textures start at the bottom row, and the compositor blends them as premultiplied alpha.
        state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, screen.canvas);
        screen.dirty = false;
      }
    } catch (error) {
      this.fallBackToMeshes(error);
    }
  }
}

/** The width that covers the camera's field of view at `distance` meters. */
function screenWidth(distance: number): number {
  return 2 * distance * Math.tan(THREE.MathUtils.degToRad(CAMERA_HFOV / 2));
}

/** A flat screen `distance` meters ahead of where the head faced on entering, covering the camera's field of view. */
function screenAt(canvas: HTMLCanvasElement, distance: number, transparent: boolean): Screen {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const width = screenWidth(distance);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * (canvas.height / canvas.width)),
    new THREE.MeshBasicMaterial({ map: texture, transparent, depthWrite: !transparent }),
  );
  mesh.position.z = -distance;
  return { canvas, distance, mesh, texture, layer: null, dirty: true };
}
