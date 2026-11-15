// The two big camera moves, built as GSAP timelines:
//   enterTransition  street -> through the doors -> inside
//   openTransition   zoom into a cabinet's screen before its project page loads
// `rig` holds where the camera is (rig.pos) and what it looks at (rig.look).
// `flash` is a full-screen <div> used for the glow that covers the cut between scenes.
// With `reduced` (prefers-reduced-motion) both become a simple fade with no camera movement.
import gsap from 'gsap';

export function enterTransition({ rig, setDoors, flash, reduced, swap, inside }) {
  const tl = gsap.timeline();
  const doors = { open: 0 };
  if (reduced) {
    flash.style.background = 'var(--bg)';
    return tl.to(flash, { opacity: 1, duration: 0.3 }).add(swap).to(flash, { opacity: 0, duration: 0.3 });
  }
  flash.style.background = 'radial-gradient(circle, #fff 0%, #ffc4f3 40%, #ff2bd6 100%)';
  return (
    tl
      // 1. the long walk up the street to the doors (0 - 2.6s)
      // (up the three steps to the mouth of the entry tunnel; the door floor is 0.45 m above the sidewalk)
      .to(rig.pos, { x: 0, y: 2, z: -1, duration: 2.6, ease: 'power2.inOut' }, 0)
      .to(rig.look, { x: 0, y: 1.95, z: -6, duration: 2.6, ease: 'power2.inOut' }, 0)
      .to(doors, { open: 1, duration: 1.2, ease: 'none', onUpdate: () => setDoors(doors.open) }, 1.3) // the clip has its own easing
      // 2. the neon glow washes over the screen (2.1 - 2.6s)
      .to(flash, { opacity: 1, duration: 0.5, ease: 'power2.in' }, 2.1)
      // 3. behind the glow: swap the street for the interior, a step back from the first cabinet
      .add(swap, 2.6)
      .set(rig.pos, { ...inside.pos, z: inside.pos.z + 1.6 }, 2.6)
      .set(rig.look, inside.look, 2.6)
      // 4. the glow clears while the camera settles in front of the cabinet (2.6 - 3.5s)
      .to(rig.pos, { z: inside.pos.z, duration: 0.9, ease: 'power3.out' }, 2.6)
      .to(flash, { opacity: 0, duration: 0.8, ease: 'power2.out' }, 2.65)
  );
}

export function openTransition({ rig, flash, reduced, screen, accent, done }) {
  const tl = gsap.timeline({ onComplete: done });
  flash.style.background = reduced ? 'var(--bg)' : `radial-gradient(circle, #fff 0%, ${accent} 100%)`;
  if (reduced) return tl.to(flash, { opacity: 1, duration: 0.3 });
  return tl
    .to(rig.pos, { ...screen.pos, duration: 0.9, ease: 'power2.inOut' }, 0)
    .to(rig.look, { ...screen.look, duration: 0.9, ease: 'power2.inOut' }, 0)
    .to(flash, { opacity: 1, duration: 0.45, ease: 'power2.in' }, 0.5);
}
