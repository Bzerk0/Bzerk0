// The street outside the arcade at night: the arcade building, its neon sign, wet pavement.
// Everything is placed in meters. x = left/right, y = up, z = toward the visitor. The sidewalk starts at z = 0.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { COLORS } from '../constants.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sidewalkTexture, wetAsphaltTexture, glowTexture } from './textures.js';

const BUILDING_Z = -7.4; // the model's center; its front steps end at the back edge of the sidewalk
const CURB_Z = 2.6; // where the sidewalk ends and the street begins
const STREET_Y = -0.12; // the street sits a little lower than the sidewalk

// `lite` = phones: fewer lights and no mirror under the street.
// `flicker` = false turns the sign flicker off (reduced motion).
export async function createExterior({ lite, flicker }) {
  const group = new THREE.Group();
  const add = (mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  // ---- The building: modeled in Blender (blender/arcade-building.blend) ----
  const building = await new GLTFLoader().loadAsync('/models/arcade-building.glb');
  add(building.scene, 0, 0, BUILDING_Z);

  // The doors open by scrubbing the "DoorsOpen" clip that ships inside the model. t: 0 = shut, 1 = open.
  const mixer = new THREE.AnimationMixer(building.scene);
  const doorClip = THREE.AnimationClip.findByName(building.animations, 'DoorsOpen');
  const doorAction = mixer.clipAction(doorClip).play();
  const setDoors = (t) => {
    doorAction.time = t * doorClip.duration * 0.999; // just short of the end, where the clip would loop
    mixer.update(0);
  };
  setDoors(0);

  // Warm light from inside, seen once the doors swing open.
  add(
    new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), new THREE.MeshBasicMaterial({ map: glowTexture(COLORS.amber), color: 0x9a9a9a, fog: false })),
    0,
    2,
    BUILDING_Z + 2.9,
  );

  // ---- The sign's tubes, and the colored light they throw on the wall and street ----
  const neon = [];
  building.scene.getObjectByName('Sign_Neon').traverse((o) => {
    if (o.material) neon.push({ material: o.material, strength: o.material.emissiveIntensity });
  });
  const signLight = add(new THREE.PointLight(0xff5a1e, 0, 24, 2), 0, 4.6, BUILDING_Z + 8);
  const SIGN_LIGHT = 45;
  building.scene.getObjectByName('Porch_Light').traverse((o) => o.isLight && (o.intensity *= 5)); // the model's lamp over the door
  // a little night sky from above, so the roof still reads; the sign stays the main light
  group.add(new THREE.HemisphereLight(0x5a6aa8, 0x000000, 1.1));

  // Dark ground under and around the building, behind the sidewalk.
  const lot = add(new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x15141a, roughness: 0.9 })), 0, -0.005, -15);
  lot.rotation.x = -Math.PI / 2;
  // ...and empty ground out to the horizon, where the fog swallows it.
  const plain = add(new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ color: 0x0d0c11, roughness: 0.9 })), 0, STREET_Y - 0.02, 0);
  plain.rotation.x = -Math.PI / 2;

  // ---- Pixel stars: small square dots on a huge dome around the scene. Never fogged, kept too dim to bloom. ----
  const stars = new THREE.Group();
  group.add(stars);
  const dpr = Math.min(devicePixelRatio, 2);
  // [how many, size in CSS pixels]
  for (const [count, px] of lite ? [[350, 1.5], [60, 2.5]] : [[700, 1.5], [120, 3]]) {
    const position = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const around = Math.random() * Math.PI * 2;
      const up = THREE.MathUtils.degToRad(1 + Math.random() * 75); // above the horizon only
      position.set([Math.cos(around) * Math.cos(up) * 300, Math.sin(up) * 300, Math.sin(around) * Math.cos(up) * 300], i * 3);
      color.fill(0.12 + Math.random() ** 2 * 0.43, i * 3, i * 3 + 3); // mostly faint grey, a few brighter
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    stars.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: px * dpr, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false })));
  }

  // ---- Sidewalk, curb, street ----
  const concrete = sidewalkTexture();
  concrete.repeat.set(60 / 1.3, 2);
  const sidewalk = add(
    new THREE.Mesh(new THREE.PlaneGeometry(60, CURB_Z), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.85 })),
    0,
    0,
    CURB_Z / 2,
  );
  sidewalk.rotation.x = -Math.PI / 2;
  add(
    new THREE.Mesh(new THREE.BoxGeometry(60, 0.14, 0.16), new THREE.MeshStandardMaterial({ color: 0x2c2a31, roughness: 0.8 })),
    0,
    STREET_Y / 2 - 0.01,
    CURB_Z + 0.08,
  );

  const streetGeometry = new THREE.PlaneGeometry(60, 40);
  if (!lite) {
    // A mirror lying on the street. The asphalt on top hides most of it, leaving puddle reflections.
    const mirror = add(
      new Reflector(streetGeometry, { textureWidth: 1024, textureHeight: 1024, color: 0xb0b0b0 }),
      0,
      STREET_Y,
      CURB_Z + 20,
    );
    mirror.rotation.x = -Math.PI / 2;
  }
  const asphalt = add(
    new THREE.Mesh(
      streetGeometry,
      lite
        ? new THREE.MeshStandardMaterial({ color: 0x0d0c11, roughness: 0.6, metalness: 0.2 })
        : new THREE.MeshStandardMaterial({ map: wetAsphaltTexture(), transparent: true, opacity: 0.9, roughness: 0.6 }),
    ),
    0,
    STREET_Y + 0.005,
    CURB_Z + 20,
  );
  asphalt.rotation.x = -Math.PI / 2;

  // ---- Flicker ----
  // Every 5-12 seconds the sign dips twice, quickly. That is at most 2 flashes in any one second,
  // under the 3-per-second limit that keeps flashing content safe for people with photosensitive epilepsy.
  let nextFlicker = 6;
  function flickerAmount(time) {
    if (!flicker) return 1;
    const since = time - nextFlicker;
    if (since > 0.5) nextFlicker = time + 5 + Math.random() * 7;
    const dipping = (since > 0 && since < 0.07) || (since > 0.2 && since < 0.3);
    return dipping ? 0.4 : 1;
  }

  // Called every frame. `power` goes from 0 (sign off) to 1 (sign on).
  function update(time, power) {
    const brightness = power * flickerAmount(time);
    for (const tube of neon) tube.material.emissiveIntensity = tube.strength * (0.03 + brightness);
    signLight.intensity = SIGN_LIGHT * brightness;
    if (flicker) stars.rotation.y = time * 0.003; // a very slow drift (off with reduced motion)
  }

  return { group, setDoors, update };
}
