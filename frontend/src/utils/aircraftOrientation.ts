/**
 * Aircraft Orientation Utilities for CesiumJS
 *
 * Provides functions to:
 *   1. Auto-compute a full 3D orientation (heading + pitch + roll) from a
 *      position + velocity vector so an entity aligns with its flight path.
 *   2. Compose that base orientation with arbitrary local-axis overrides
 *      (extra roll, pitch, yaw) expressed in the aircraft's own body frame.
 */

import * as Cesium from 'cesium';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocalAxisOverride {
  /** Extra roll  around the aircraft's forward (X) axis, in radians */
  rollRad?: number;
  /** Extra pitch around the aircraft's right  (Y) axis, in radians */
  pitchRad?: number;
  /** Extra yaw   around the aircraft's up     (Z) axis, in radians */
  yawRad?: number;
}

export interface AircraftOrientation {
  /** World-frame quaternion – assign directly to entity.orientation */
  quaternion: Cesium.Quaternion;
  /** Heading in radians (0 = north, clockwise) – use for billboard rotation */
  headingRad: number;
  /** Pitch in radians (positive = nose up) */
  pitchRad: number;
  /** Roll in radians */
  rollRad: number;
}

// ─── Core math helpers ────────────────────────────────────────────────────────

const SCRATCH_CURRENT_CARTO  = new Cesium.Cartographic();
const SCRATCH_VEL_CARTESIAN  = new Cesium.Cartesian3();
const SCRATCH_LOCAL_VEL      = new Cesium.Cartesian3();
const SCRATCH_ENU_MATRIX     = new Cesium.Matrix4();
const SCRATCH_ENU_INV        = new Cesium.Matrix4();
const SCRATCH_HPR            = new Cesium.HeadingPitchRoll();
const SCRATCH_QUAT_BASE      = new Cesium.Quaternion();
const SCRATCH_QUAT_OVERRIDE  = new Cesium.Quaternion();
const SCRATCH_QUAT_ROLL      = new Cesium.Quaternion();
const SCRATCH_QUAT_PITCH     = new Cesium.Quaternion();
const SCRATCH_QUAT_YAW       = new Cesium.Quaternion();
const SCRATCH_AXIS           = new Cesium.Cartesian3();

/**
 * Given two consecutive world-frame positions (Cartesian3), compute the full
 * 3D aircraft orientation so the entity's +X axis points along the velocity
 * vector, with +Z pointing away from the Earth's centre (body-up).
 *
 * @param currentPos  – entity position at time T
 * @param nextPos     – entity position at time T+dt (used as velocity direction)
 * @param override    – optional additional rotations in aircraft body frame
 * @returns AircraftOrientation with world quaternion and component angles
 */
export function computeOrientationFromVelocity(
  currentPos: Cesium.Cartesian3,
  nextPos: Cesium.Cartesian3,
  override: LocalAxisOverride = {}
): AircraftOrientation {

  // 1. Build the East-North-Up reference frame at the current position
  Cesium.Transforms.eastNorthUpToFixedFrame(currentPos, undefined, SCRATCH_ENU_MATRIX);
  Cesium.Matrix4.inverseTransformation(SCRATCH_ENU_MATRIX, SCRATCH_ENU_INV);

  // 2. Compute velocity vector in world frame (simple finite difference)
  Cesium.Cartesian3.subtract(nextPos, currentPos, SCRATCH_VEL_CARTESIAN);

  // 3. Transform velocity into the ENU local frame
  Cesium.Matrix4.multiplyByPointAsVector(
    SCRATCH_ENU_INV,
    SCRATCH_VEL_CARTESIAN,
    SCRATCH_LOCAL_VEL
  );

  const east  = SCRATCH_LOCAL_VEL.x; // positive = eastward
  const north = SCRATCH_LOCAL_VEL.y; // positive = northward
  const up    = SCRATCH_LOCAL_VEL.z; // positive = upward

  // 4. Derive heading and pitch from the local velocity components
  //    heading: angle from north, clockwise (Cesium convention)
  const heading = Math.atan2(east, north);

  //    pitch: angle above/below horizontal
  const horizontalMag = Math.sqrt(east * east + north * north);
  const pitch = Math.atan2(up, horizontalMag);

  // 5. Build base HeadingPitchRoll (no base roll – wings kept level)
  SCRATCH_HPR.heading = heading;
  SCRATCH_HPR.pitch   = pitch;
  SCRATCH_HPR.roll    = 0;

  // 6. Convert HPR to world-frame quaternion at this position
  Cesium.Transforms.headingPitchRollQuaternion(
    currentPos,
    SCRATCH_HPR,
    undefined,
    undefined,
    SCRATCH_QUAT_BASE
  );

  // 7. Apply optional local-axis overrides (body-frame rotations)
  //    Compose: Q_final = Q_base ⊗ Q_roll ⊗ Q_pitch ⊗ Q_yaw
  let finalQuat = Cesium.Quaternion.clone(SCRATCH_QUAT_BASE, SCRATCH_QUAT_OVERRIDE);

  if (override.rollRad) {
    Cesium.Cartesian3.fromElements(1, 0, 0, SCRATCH_AXIS); // body +X = forward
    Cesium.Quaternion.fromAxisAngle(SCRATCH_AXIS, override.rollRad, SCRATCH_QUAT_ROLL);
    Cesium.Quaternion.multiply(finalQuat, SCRATCH_QUAT_ROLL, finalQuat);
  }

  if (override.pitchRad) {
    Cesium.Cartesian3.fromElements(0, 1, 0, SCRATCH_AXIS); // body +Y = right wing
    Cesium.Quaternion.fromAxisAngle(SCRATCH_AXIS, override.pitchRad, SCRATCH_QUAT_PITCH);
    Cesium.Quaternion.multiply(finalQuat, SCRATCH_QUAT_PITCH, finalQuat);
  }

  if (override.yawRad) {
    Cesium.Cartesian3.fromElements(0, 0, 1, SCRATCH_AXIS); // body +Z = up
    Cesium.Quaternion.fromAxisAngle(SCRATCH_AXIS, override.yawRad, SCRATCH_QUAT_YAW);
    Cesium.Quaternion.multiply(finalQuat, SCRATCH_QUAT_YAW, finalQuat);
  }

  return {
    quaternion:  Cesium.Quaternion.clone(finalQuat),
    headingRad:  heading,
    pitchRad:    pitch,
    rollRad:     override.rollRad ?? 0,
  };
}

/**
 * Simpler overload: compute orientation from API-provided heading (degrees,
 * 0 = north, CW) and vertical rate / speed so you don't need a next-position.
 *
 * @param position       - current world-frame position (Cartesian3)
 * @param headingDeg     - true track in degrees (0 = north, clockwise)
 * @param verticalRate   - metres per second (positive = climb)
 * @param horizontalSpeed - metres per second ground speed
 * @param override       - optional body-frame overrides
 */
export function computeOrientationFromApiData(
  position: Cesium.Cartesian3,
  headingDeg: number,
  verticalRate: number    = 0,
  horizontalSpeed: number = 0,
  override: LocalAxisOverride = {}
): AircraftOrientation {

  const headingRad = Cesium.Math.toRadians(headingDeg);
  const pitchRad   = horizontalSpeed > 0
    ? Math.atan2(verticalRate, horizontalSpeed)
    : 0;

  SCRATCH_HPR.heading = headingRad;
  SCRATCH_HPR.pitch   = pitchRad;
  SCRATCH_HPR.roll    = 0;

  Cesium.Transforms.headingPitchRollQuaternion(
    position,
    SCRATCH_HPR,
    undefined,
    undefined,
    SCRATCH_QUAT_BASE
  );

  let finalQuat = Cesium.Quaternion.clone(SCRATCH_QUAT_BASE, SCRATCH_QUAT_OVERRIDE);

  if (override.rollRad) {
    Cesium.Cartesian3.fromElements(1, 0, 0, SCRATCH_AXIS);
    Cesium.Quaternion.fromAxisAngle(SCRATCH_AXIS, override.rollRad, SCRATCH_QUAT_ROLL);
    Cesium.Quaternion.multiply(finalQuat, SCRATCH_QUAT_ROLL, finalQuat);
  }
  if (override.pitchRad) {
    Cesium.Cartesian3.fromElements(0, 1, 0, SCRATCH_AXIS);
    Cesium.Quaternion.fromAxisAngle(SCRATCH_AXIS, override.pitchRad, SCRATCH_QUAT_PITCH);
    Cesium.Quaternion.multiply(finalQuat, SCRATCH_QUAT_PITCH, finalQuat);
  }
  if (override.yawRad) {
    Cesium.Cartesian3.fromElements(0, 0, 1, SCRATCH_AXIS);
    Cesium.Quaternion.fromAxisAngle(SCRATCH_AXIS, override.yawRad, SCRATCH_QUAT_YAW);
    Cesium.Quaternion.multiply(finalQuat, SCRATCH_QUAT_YAW, finalQuat);
  }

  return {
    quaternion:  Cesium.Quaternion.clone(finalQuat),
    headingRad,
    pitchRad,
    rollRad:     override.rollRad ?? 0,
  };
}

/**
 * Billboard-rotation scalar for a PNG icon aligned to world North.
 * Use this as the `rotation` value when `alignedAxis = Cartesian3.UNIT_Z`.
 *
 * CesiumJS billboard rotation is counter-clockwise from screen-up,
 * but headings are clockwise from north, so we negate.
 */
export function billboardRotationFromHeading(headingRad: number): number {
  return -headingRad; // equivalent to CesiumMath.TWO_PI - heading (mod 2π)
}
