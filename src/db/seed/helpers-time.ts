import { costForMinutes } from "../../lib/money";

export { $ } from "./helpers";

/** Same maths the app uses, re-exported so the seed can't drift from it. */
export function costForMinutesSafe(minutes: number, rateCentsPerHour: number): number {
  return costForMinutes(Math.max(0, minutes), Math.max(0, rateCentsPerHour));
}
