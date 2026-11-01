import { haversineMeters } from './routeGeometry';
import { LonLat, RouteFeatureCollection, RouteStepPin } from '../types/route';

export type DirectionManeuver = 'straight' | 'left' | 'right' | 'uturn';

export interface DirectionMarker {
  readonly id: string;
  readonly position: LonLat;
  readonly maneuver: DirectionManeuver;
  readonly stepPin?: RouteStepPin;
}

const SAMPLE_DISTANCE_METERS = 14;
const MIN_TURN_ANGLE_DEGREES = 38;
const MIN_MARKER_SPACING_METERS = 32;

function bearingDegrees(from: LonLat, to: LonLat): number {
  const meanLatitude = ((from[1] + to[1]) / 2) * Math.PI / 180;
  const east = (to[0] - from[0]) * Math.cos(meanLatitude);
  const north = to[1] - from[1];
  return Math.atan2(east, north) * 180 / Math.PI;
}

function maneuverFromAngle(angle: number): DirectionManeuver {
  const normalized = ((angle + 540) % 360) - 180;
  if (Math.abs(normalized) >= 145) return 'uturn';
  return normalized > 0 ? 'right' : 'left';
}

function instructionManeuver(instruction: string): DirectionManeuver | null {
  if (/유턴|되돌아|회차|u-?turn/i.test(instruction)) return 'uturn';
  if (/좌회전|왼쪽|좌측|left/i.test(instruction)) return 'left';
  if (/우회전|오른쪽|우측|right/i.test(instruction)) return 'right';
  if (/직진|straight/i.test(instruction)) return 'straight';
  return null;
}

function coordinatesByLine(route: RouteFeatureCollection): LonLat[][] {
  const lines: LonLat[][] = [];
  for (const feature of route.features) {
    const coordinates = [...feature.geometry.coordinates];
    if (coordinates.length < 2) continue;

    const previousLine = lines[lines.length - 1];
    if (previousLine && haversineMeters(previousLine[previousLine.length - 1], coordinates[0]) <= 2) {
      previousLine.push(...coordinates.slice(1));
    } else {
      lines.push(coordinates);
    }
  }
  return lines;
}

function samplePoint(
  coordinates: readonly LonLat[],
  startIndex: number,
  direction: -1 | 1,
): LonLat | null {
  let distance = 0;
  let index = startIndex;
  while (index + direction >= 0 && index + direction < coordinates.length) {
    const nextIndex = index + direction;
    distance += haversineMeters(coordinates[index], coordinates[nextIndex]);
    index = nextIndex;
    if (distance >= SAMPLE_DISTANCE_METERS) return coordinates[index];
  }
  return null;
}

function detectRouteTurns(route: RouteFeatureCollection): DirectionMarker[] {
  const turns: DirectionMarker[] = [];
  coordinatesByLine(route).forEach((coordinates, lineIndex) => {
    coordinates.forEach((position, index) => {
      const before = samplePoint(coordinates, index, -1);
      const after = samplePoint(coordinates, index, 1);
      if (!before || !after) return;

      const incoming = bearingDegrees(before, position);
      const outgoing = bearingDegrees(position, after);
      const angle = ((outgoing - incoming + 540) % 360) - 180;
      if (Math.abs(angle) < MIN_TURN_ANGLE_DEGREES) return;

      turns.push({
        id: `route-turn-${lineIndex}-${index}`,
        position,
        maneuver: maneuverFromAngle(angle),
      });
    });
  });
  return turns;
}

export function getDirectionMarkers(
  route: RouteFeatureCollection,
  stepPins: readonly RouteStepPin[],
): DirectionMarker[] {
  const detectedTurns = detectRouteTurns(route);
  const explicitPins = stepPins.filter((pin) => pin.kind === 'turn');
  const markers: DirectionMarker[] = explicitPins.map((pin) => {
    const nearbyTurn = detectedTurns.find(
      (turn) => haversineMeters(turn.position, pin.position) <= MIN_MARKER_SPACING_METERS,
    );
    return {
      id: pin.id,
      position: pin.position,
      maneuver: instructionManeuver(pin.instruction) ?? nearbyTurn?.maneuver ?? 'straight',
      stepPin: pin,
    };
  });

  for (const turn of detectedTurns) {
    const tooClose = markers.some(
      (marker) => haversineMeters(marker.position, turn.position) < MIN_MARKER_SPACING_METERS,
    );
    if (!tooClose) markers.push(turn);
  }

  return markers;
}
