/**
 * useAircraftOrientation
 *
 * React hook that builds a live CesiumJS `orientation` CallbackProperty for a
 * single aircraft entity.  The orientation is derived every frame from the
 * entity's interpolated position + its next-predicted position (velocity
 * vector), so it automatically aligns with the flight path in full 3D.
 *
 * Optional `override` lets you layer extra body-frame rotations (roll, pitch,
 * yaw) on top of the auto-computed base, enabling manual animation effects
 * (banking during a turn, nose-up climb attitude, etc.).
 *
 * Usage:
 *   const orientationProp = useAircraftOrientation(viewerRef, icao24, motionDataRef, override);
 *   // attach to entity:  entity.orientation = orientationProp as any;
 */

import { useRef, useEffect } from 'react';
import * as Cesium from 'cesium';
import {
  computeOrientationFromVelocity,
  computeOrientationFromApiData,
  type LocalAxisOverride,
} from '../utils/aircraftOrientation';

// Shape of the per-aircraft motion data stored in CesiumViewer
export interface MotionData {
  prevPos:        Cesium.Cartesian3;
  currentPos:     Cesium.Cartesian3;
  prevUpdateTime: Cesium.JulianDate;
  updateTime:     Cesium.JulianDate;
  heading:        number;   // degrees, 0 = north CW
  altitude:       number;   // metres
  velocity:       number;   // m/s horizontal
  verticalRate:   number;   // m/s positive = climb
  lastSampleTime: number;   // unix seconds
}

/**
 * Returns a stable `Cesium.CallbackProperty` that evaluates the correct
 * world-frame quaternion whenever Cesium requests it (once per render frame).
 *
 * @param viewerRef    - ref to the Resium Viewer wrapper
 * @param icao24       - entity ID (also the aircraft's ICAO24 hex code)
 * @param motionMapRef - ref to the Map<string, MotionData> maintained by CesiumViewer
 * @param override     - optional reactive local-axis body-frame overrides
 */
export function useAircraftOrientation(
  viewerRef:    React.RefObject<any>,
  icao24:       string,
  motionMapRef: React.RefObject<Map<string, MotionData>>,
  override:     LocalAxisOverride = {}
): Cesium.CallbackProperty {

  // Keep a stable ref to the override so the callback closure always reads
  // the latest value without needing to recreate the CallbackProperty.
  const overrideRef = useRef<LocalAxisOverride>(override);
  useEffect(() => { overrideRef.current = override; }, [override]);

  // Scratch objects – reused every frame to avoid GC pressure
  const scratchPos  = useRef(new Cesium.Cartesian3());
  const scratchNext = useRef(new Cesium.Cartesian3());
  const scratchQuat = useRef(new Cesium.Quaternion());

  // Build once, reuse forever
  const callbackRef = useRef<Cesium.CallbackProperty | null>(null);

  if (!callbackRef.current) {
    callbackRef.current = new Cesium.CallbackProperty((_time: Cesium.JulianDate | undefined, result: Cesium.Quaternion) => {
      const viewer  = viewerRef.current?.cesiumElement;
      const motionData = motionMapRef.current?.get(icao24);

      if (!viewer || !motionData) {
        // Return identity if data not ready yet
        return Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY, result ?? scratchQuat.current);
      }

      const entity = viewer.entities.getById(icao24);
      if (!entity?.position) {
        return Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY, result ?? scratchQuat.current);
      }

      // Read the entity's interpolated current position
      const now = Cesium.JulianDate.now();
      const currentPos = entity.position.getValue(now, scratchPos.current);
      if (!currentPos) {
        return Cesium.Quaternion.clone(Cesium.Quaternion.IDENTITY, result ?? scratchQuat.current);
      }

      // Predict the next position using velocity so we get a meaningful
      // direction vector even between API update intervals.
      // next ≈ current + velocity_vector * small_dt
      const DT = 0.5; // seconds to look ahead
      if (motionData.velocity > 0) {
        const headingRad = Cesium.Math.toRadians(motionData.heading);
        const speed      = motionData.velocity; // m/s ground speed
        const vEast  = speed * Math.sin(headingRad);
        const vNorth = speed * Math.cos(headingRad);
        const vUp    = motionData.verticalRate;

        // ENU frame at current pos
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(currentPos);
        const localVel  = new Cesium.Cartesian3(vEast * DT, vNorth * DT, vUp * DT);
        const worldDelta = Cesium.Matrix4.multiplyByPointAsVector(
          enuMatrix, localVel, scratchNext.current
        );
        Cesium.Cartesian3.add(currentPos, worldDelta, scratchNext.current);

        const { quaternion } = computeOrientationFromVelocity(
          currentPos,
          scratchNext.current,
          overrideRef.current
        );
        return Cesium.Quaternion.clone(quaternion, result ?? scratchQuat.current);
      }

      // Fallback: use API-provided heading + vertical-rate
      const { quaternion } = computeOrientationFromApiData(
        currentPos,
        motionData.heading,
        motionData.verticalRate,
        motionData.velocity,
        overrideRef.current
      );
      return Cesium.Quaternion.clone(quaternion, result ?? scratchQuat.current);

    }, false); // isConstant = false → re-evaluated every frame
  }

  return callbackRef.current;
}
