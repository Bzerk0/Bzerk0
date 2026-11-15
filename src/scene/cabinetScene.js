// The landing scene: one arcade cabinet alone in the dark, lit only by its own screen.
// Everything is placed in meters. x = left/right, y = up, z = toward the visitor. The cabinet stands at the origin.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCanvas, toTexture } from './textures.js';
import { createDotField } from './dotField.js';

const PIXEL_FONT = '"Press Start 2P"';
const GLOW = 0x5b8cff; // the blue-white light a CRT throws

// The attract screen, painted on a canvas. `prompt` = whether "PRESS START" is showing (it blinks).
function attractScreen(prompt) {
  const [canvas, g] = makeCanvas(640, 506);
  const bg = g.createRadialGradient(320, 253, 40, 320, 253, 420);
  bg.addColorStop(0, '#0d1d52');
  bg.addColorStop(1, '#02040c');
  g.fillStyle = bg;
  g.fillRect(0, 0, 640, 506);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const line = (text, y, size, color) => {
    g.font = `${size}px ${PIXEL_FONT}`;
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(text, 320, y);
    g.shadowBlur = 0;
  };
  line('HUDSON’S', 190, 56, '#7ff3ff');
  line('ARCADE', 262, 34, '#ff7be6');
  if (prompt) line('PRESS START', 380, 24, '#ffffff');
  g.fillStyle = 'rgba(0, 0, 0, 0.28)'; // scanlines
  for (let y = 0; y < 506; y += 4) g.fillRect(0, y, 640, 2);
  const texture = toTexture(canvas);
  texture.flipY = false; // the model's screen uses glTF texture coordinates
  return texture;
}

// `blink` = false keeps "PRESS START" steady (reduced motion).
export async function createCabinetScene({ blink }) {
  const group = new THREE.Group();

  // ---- The cabinet: based on "Defender Arcade" by Delinx, CC BY 4.0 (credited on the page), repainted plain ----
  const gltf = await new GLTFLoader().loadAsync('/models/cabinet.glb');
  group.add(gltf.scene);

  // ---- Its screen: the model has a separate "Screen" piece; we paint our own picture on it ----
  const screenMesh = gltf.scene.getObjectByName('Screen');
  const frames = [attractScreen(true), attractScreen(false)];
  screenMesh.material = new THREE.MeshBasicMaterial({ map: frames[0], fog: false });

  // Where the screen is and which way it faces, measured from the mesh so the camera can fly straight at it.
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(screenMesh);
  const corners = screenMesh.geometry.attributes.position;
  const p = (i) => new THREE.Vector3().fromBufferAttribute(corners, i).applyMatrix4(screenMesh.matrixWorld);
  const normal = new THREE.Vector3().fromBufferAttribute(screenMesh.geometry.attributes.normal, 0).transformDirection(screenMesh.matrixWorld);
  const screen = {
    center: box.getCenter(new THREE.Vector3()),
    normal,
    width: p(0).distanceTo(p(1)),
    height: p(1).distanceTo(p(2)),
  };

  // ---- Light: the glow from the screen, and almost nothing else ----
  const glow = new THREE.PointLight(GLOW, 0, 9, 2);
  glow.position.copy(screen.center).addScaledVector(normal, 0.45);
  group.add(glow);
  const GLOW_STRENGTH = 7;
  group.add(new THREE.HemisphereLight(0x1b2440, 0x000000, 0.12)); // just enough to hint at the silhouette

  // ---- Sky and floor: chunky dithered pixels behind the cabinet (see dotField.js) ----
  const glowOnFloor = screen.center.clone().addScaledVector(normal, 0.9);
  const field = createDotField({ glow: glowOnFloor, footprint: new THREE.Box3().setFromObject(gltf.scene), still: !blink });
  group.add(field.mesh);

  // Called every frame, after the camera has moved. `power` goes from 0 (screen off) to 1 (on).
  // "PRESS START" blinks about once a second, well under the 3-flashes-a-second safety limit.
  function update(time, power, camera, renderer) {
    screenMesh.material.map = frames[blink && Math.floor(time * 1.6) % 2 ? 1 : 0];
    screenMesh.material.color.setScalar(0.04 + power * 1.7); // above 1 is what the bloom picks up
    glow.intensity = GLOW_STRENGTH * power;
    field.update(time, power, camera, renderer);
  }

  return { group, screen, update };
}
