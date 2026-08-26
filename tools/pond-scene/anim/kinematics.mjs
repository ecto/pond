/* SHARED — do not edit from a character module.

   Planar leg IK. Both the Go2 and T1 legs are exact two-link planar chains in
   the sagittal plane (verified against the URDFs): with hip angle a and knee
   angle k,

     foot = L1*u(a) + L2*u(a+k),   u(x) = (-sin x, -cos x)

   in (x forward, z up) relative to the hip. Two unit vectors at a and a+k sum
   to 2cos(k/2) in the direction a+k/2, which makes the inverse exact and three
   lines long. `kneeSign` picks the branch: the Go2's knee folds back (-1),
   T1's folds forward (+1).

   Driving the feet by IK rather than keyframing joint angles is what keeps a
   walk from skating: during stance the foot is commanded to travel backward at
   exactly the body's forward speed, so "not skating" is a property of the
   construction rather than something to tune. */

export function legIK(fx, fz, L1, L2, kneeSign) {
  const r = Math.hypot(fx, fz);
  const lo = Math.abs(L1 - L2) + 1e-4, hi = L1 + L2 - 1e-4;
  const rc = r < lo ? lo : r > hi ? hi : r;
  let c = (rc * rc - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  c = c < -1 ? -1 : c > 1 ? 1 : c;
  const knee = kneeSign * Math.acos(c);
  const alpha = Math.atan2(-fx, -fz);
  const delta = Math.atan2(L2 * Math.sin(knee), L1 + L2 * Math.cos(knee));
  return { hip: alpha - delta, knee };
}

/**
 * CANTED HIPS.
 *
 * The two-link solve above assumes the hip and knee turn about the same
 * sagittal axis. On the Unitree H2 they do not: the hip-pitch joint's origin
 * carries a 30 degree roll (-0.5236 on the left, +0.5236 on the right), so its
 * axis is (0, 0.866, -0.5) and driving it alone swings the leg diagonally
 * outward instead of forward. The hip-roll joint's origin then rolls the same
 * 30 degrees back, so with both at zero the leg hangs straight and the cant is
 * invisible — which is exactly why it is so easy to miss. Fitting the planar
 * model to the H2's real kinematics leaves 70mm of residual, and driving the
 * gait through it put 20% of foot slip into the walk.
 *
 * The fix is to stop treating hip-pitch as the sagittal joint and instead ask
 * the whole three-joint hip for a pure sagittal rotation of `theta`. With the
 * origin roll `cant` (the URDF's rpy[0] on the pitch joint), the chain from the
 * pelvis to the thigh is
 *
 *     Rx(cant) . Ry(pitch) . Rx(-cant) . Rx(roll) . Rz(yaw)
 *
 * and setting that equal to Ry(theta) is a Y-X-Z Euler decomposition of
 * Rx(-cant).Ry(theta), which is closed form. The leg then behaves exactly like
 * an uncanted one and the planar model above becomes exact again.
 *
 * Returns the three joint values to write. `roll` and `yaw` come back nonzero
 * for any nonzero theta — that is the point, and they are what a naive gait
 * leaves on the table.
 */
export function cantedHip(theta, cant) {
  const C = -cant;
  const sC = Math.sin(C), cC = Math.cos(C);
  const sT = Math.sin(theta), cT = Math.cos(theta);
  const beta = Math.asin(Math.max(-1, Math.min(1, sC * cT)));
  return {
    pitch: Math.atan2(sT, cC * cT),
    roll: beta - C,
    yaw: Math.atan2(sC * sT, cC),
  };
}

/**
 * One stance/swing foot trajectory, in the hip frame, in the robot's metres.
 *   phase   0..1 within this leg's own cycle
 *   duty    fraction of the cycle the foot is planted
 *   stance  ground covered per stance
 *   stand   hip height above the planted foot
 *   lift    swing apex above the deck
 * During stance the foot travels backward at exactly body speed; during swing
 * it lifts, carries forward and plants.
 */
export function footPath(phase, { duty, stance, stand, lift }) {
  const q = ((phase % 1) + 1) % 1;
  if (q < duty) return { fx: stance * (0.5 - q / duty), fz: -stand };
  const b = (q - duty) / (1 - duty);
  return { fx: stance * (-0.5 + b), fz: -stand + lift * Math.sin(b * Math.PI) };
}
