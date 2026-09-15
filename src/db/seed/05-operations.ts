import { eq } from "drizzle-orm";
import { db } from "../index";
import { scheduleEvents, scheduleAssignments, timeEntries, timesheetWeeks } from "../schema";
import type { Ctx } from "./context";
import { atTime, dayOffset, TODAY } from "./context";
import { $, costForMinutesSafe } from "./helpers-time";

/** Monday of the week containing `TODAY`. */
function mondayOffset(): number {
  const dow = TODAY.getDay(); // 0 = Sunday
  return dow === 0 ? -6 : 1 - dow;
}

type EventSpec = {
  job: string;
  title: string;
  dayOffsetFromMonday: number;
  days?: number;
  crew: string[];
  kind?: string;
  notes?: string;
};

export async function seedOperations(ctx: Ctx) {
  const mon = mondayOffset();

  /*
   * Crews are kept apart on purpose, except for one deliberate clash next
   * week (Tyler is on the roof and at TAFE) so the double-booking warning
   * has something real to catch rather than crying wolf all over the grid.
   */
  const events: EventSpec[] = [
    // last week
    { job: "kilby_ext", title: "First floor framing", dayOffsetFromMonday: mon - 7, days: 5, crew: ["jake", "tyler"] },
    { job: "cpg_u3", title: "Strip out and rough in", dayOffsetFromMonday: mon - 7, days: 3, crew: ["marco"] },
    // this week
    { job: "kilby_ext", title: "Roof frame and battens", dayOffsetFromMonday: mon, days: 4, crew: ["jake", "tyler"] },
    { job: "cpg_u3", title: "Waterproofing and tiling", dayOffsetFromMonday: mon + 1, days: 3, crew: ["marco"], notes: "Tiler Dimi on site Wed-Thu. Don't walk on it Thursday." },
    { job: "whitfield_ensuite", title: "Ensuite tile repair", dayOffsetFromMonday: mon + 4, days: 1, crew: ["marco"] },
    { job: "kilby_ext", title: "Engineer inspection — portal beam", dayOffsetFromMonday: mon + 2, days: 1, crew: ["greg"], kind: "inspection" },
    // next week — the clash the schedule screen is meant to catch
    { job: "kilby_ext", title: "Roof sheeting", dayOffsetFromMonday: mon + 7, days: 3, crew: ["jake", "tyler"] },
    { job: "cpg_u3", title: "Fit off and handover", dayOffsetFromMonday: mon + 8, days: 2, crew: ["marco"] },
    { job: "dental_fitout", title: "Joinery delivery", dayOffsetFromMonday: mon + 12, days: 1, crew: ["greg"], kind: "delivery" },
    // the long weekend fitout
    { job: "dental_fitout", title: "Reception fitout — long weekend", dayOffsetFromMonday: mon + 18, days: 4, crew: ["greg", "jake", "marco"], notes: "5pm Friday start. Surgery opens 7am Tuesday no matter what." },
    { job: "nguyen_flat", title: "Site set out (subject to DA)", dayOffsetFromMonday: mon + 28, days: 2, crew: ["greg", "jake"] },
  ];

  for (const spec of events) {
    const [row] = await db
      .insert(scheduleEvents)
      .values({
        jobId: ctx.jobs[spec.job]!,
        title: spec.title,
        kind: spec.kind ?? "work",
        startAt: atTime(spec.dayOffsetFromMonday, 7, 0),
        endAt: atTime(spec.dayOffsetFromMonday + (spec.days ?? 1) - 1, 15, 30),
        allDay: true,
        notes: spec.notes ?? null,
        createdBy: ctx.users.greg,
      })
      .returning({ id: scheduleEvents.id });

    await db.insert(scheduleAssignments).values(
      spec.crew.map((who) => ({ eventId: row!.id, userId: ctx.users[who]! })),
    );
  }

  // Tyler on leave the Friday of next week — overlaps the fit-off above.
  const [leave] = await db
    .insert(scheduleEvents)
    .values({
      jobId: null,
      title: "Tyler — TAFE block",
      kind: "leave",
      startAt: atTime(mon + 8, 7, 0),
      endAt: atTime(mon + 9, 15, 30),
      allDay: true,
      notes: "Booked in months ago. He's also down for the roof sheeting those days — one of them has to give.",
      colour: "#64748b",
      createdBy: ctx.users.donna,
    })
    .returning({ id: scheduleEvents.id });
  await db.insert(scheduleAssignments).values({ eventId: leave!.id, userId: ctx.users.tyler! });

  await seedTime(ctx, mon);
}

/* -------------------------------- timesheets ------------------------------- */

const RATES: Record<string, { cost: number; charge: number }> = {
  greg: { cost: 78, charge: 125 },
  jake: { cost: 62, charge: 98 },
  marco: { cost: 64, charge: 98 },
  tyler: { cost: 28, charge: 55 },
  wes: { cost: 110, charge: 132 },
  sam: { cost: 115, charge: 138 },
};

type ShiftPlan = { who: string; job: string; start: number; end: number; breakMin: number; note: string };

async function seedTime(ctx: Ctx, mon: number) {
  const plans: Array<{ weekOffset: number; status: "approved" | "submitted" | "draft"; shifts: ShiftPlan[] }> = [];

  // Three weeks of history on the big job, all approved.
  for (let w = 3; w >= 2; w--) {
    const shifts: ShiftPlan[] = [];
    for (let d = 0; d < 5; d++) {
      const day = mon - w * 7 + d;
      shifts.push(
        { who: "jake", job: "kilby_ext", start: day, end: day, breakMin: 30, note: "Framing" },
        { who: "marco", job: "kilby_ext", start: day, end: day, breakMin: 30, note: "Framing" },
        { who: "tyler", job: "kilby_ext", start: day, end: day, breakMin: 30, note: "Labouring and clean up" },
      );
      if (d < 3) shifts.push({ who: "greg", job: "kilby_ext", start: day, end: day, breakMin: 0, note: "Supervision" });
    }
    plans.push({ weekOffset: -w * 7, status: "approved", shifts });
  }

  // Last week — submitted, sitting with Greg to approve.
  {
    const shifts: ShiftPlan[] = [];
    for (let d = 0; d < 5; d++) {
      const day = mon - 7 + d;
      shifts.push(
        { who: "jake", job: "kilby_ext", start: day, end: day, breakMin: 30, note: "First floor framing" },
        { who: "marco", job: d < 3 ? "cpg_u3" : "kilby_ext", start: day, end: day, breakMin: 30, note: d < 3 ? "Strip out and rough in" : "Framing" },
        { who: "tyler", job: "kilby_ext", start: day, end: day, breakMin: 30, note: "Labouring" },
      );
    }
    shifts.push({ who: "greg", job: "kilby_ext", start: mon - 5, end: mon - 5, breakMin: 0, note: "Engineer walk-through" });
    plans.push({ weekOffset: -7, status: "submitted", shifts });
  }

  // This week so far — draft.
  {
    const shifts: ShiftPlan[] = [];
    const elapsed = Math.max(0, Math.min(4, -mon));
    for (let d = 0; d < elapsed; d++) {
      const day = mon + d;
      shifts.push(
        { who: "jake", job: "kilby_ext", start: day, end: day, breakMin: 30, note: "Roof frame" },
        { who: "marco", job: "cpg_u3", start: day, end: day, breakMin: 30, note: "Waterproofing and tiling" },
        { who: "tyler", job: "kilby_ext", start: day, end: day, breakMin: 30, note: "Labouring" },
      );
    }
    if (shifts.length) plans.push({ weekOffset: 0, status: "draft", shifts });
  }

  for (const plan of plans) {
    const byWorker = new Map<string, ShiftPlan[]>();
    for (const shift of plan.shifts) {
      const list = byWorker.get(shift.who) ?? [];
      list.push(shift);
      byWorker.set(shift.who, list);
    }

    for (const [who, shifts] of byWorker) {
      const rate = RATES[who]!;
      const [week] = await db
        .insert(timesheetWeeks)
        .values({
          userId: ctx.users[who]!,
          weekStart: dayOffset(mon + plan.weekOffset),
          status: plan.status,
          submittedAt: plan.status === "draft" ? null : atTime(mon + plan.weekOffset + 5, 17, 0),
          approvedBy: plan.status === "approved" ? ctx.users.greg : null,
          approvedAt: plan.status === "approved" ? atTime(mon + plan.weekOffset + 6, 19, 30) : null,
        })
        .returning({ id: timesheetWeeks.id });

      let totalMinutes = 0;
      let totalCost = 0;
      let totalCharge = 0;

      for (const shift of shifts) {
        const startHour = who === "greg" ? 9 : 7;
        const hours = who === "greg" ? 4 : who === "tyler" ? 8 : 8.5;
        const minutes = Math.round(hours * 60) - shift.breakMin;
        const cost = costForMinutesSafe(minutes, $(rate.cost));
        const charge = costForMinutesSafe(minutes, $(rate.charge));

        await db.insert(timeEntries).values({
          userId: ctx.users[who]!,
          jobId: ctx.jobs[shift.job]!,
          workDate: dayOffset(shift.start),
          startedAt: atTime(shift.start, startHour, 0),
          endedAt: atTime(shift.start, startHour + Math.floor(hours), (hours % 1) * 60),
          breakMinutes: shift.breakMin,
          minutes,
          description: shift.note,
          status: plan.status,
          source: "clock",
          costRateCents: $(rate.cost),
          chargeRateCents: $(rate.charge),
          costCents: cost,
          chargeCents: charge,
          timesheetWeekId: week!.id,
          approvedBy: plan.status === "approved" ? ctx.users.greg : null,
          approvedAt: plan.status === "approved" ? atTime(mon + plan.weekOffset + 6, 19, 30) : null,
          createdBy: ctx.users[who]!,
        });

        totalMinutes += minutes;
        totalCost += cost;
        totalCharge += charge;
      }

      await db
        .update(timesheetWeeks)
        .set({ totalMinutes, totalCostCents: totalCost, totalChargeCents: totalCharge })
        .where(eq(timesheetWeeks.id, week!.id));
    }
  }

  /* Historic labour on the finished jobs, so their actuals aren't empty. */
  const historic: Array<[string, string, number, number, number]> = [
    // [who, job, dayOffset, days, hoursPerDay]
    // Kilby extension, before the weekly plans above pick it up at -22.
    ["jake", "kilby_ext", -36, 14, 8.5],
    ["marco", "kilby_ext", -36, 14, 8.5],
    ["tyler", "kilby_ext", -36, 14, 8],
    ["greg", "kilby_ext", -36, 14, 4],
    ["jake", "whitfield_kitchen", -94, 30, 8],
    ["marco", "whitfield_kitchen", -94, 24, 8],
    ["tyler", "whitfield_kitchen", -92, 22, 8],
    ["jake", "raman_deck", -43, 24, 8.5],
    ["tyler", "raman_deck", -43, 22, 8],
    ["jake", "kilby_carport", -139, 11, 8.5],
    ["tyler", "kilby_carport", -139, 11, 8],
    ["marco", "whitfield_ensuite", -4, 1, 5],
    ["marco", "cpg_u3", -8, 4, 8],
    ["tyler", "cpg_u3", -6, 3, 8],
  ];

  for (const [who, job, from, days, hoursPerDay] of historic) {
    const rate = RATES[who]!;
    for (let i = 0; i < days; i++) {
      const day = from + i;
      // Skip weekends.
      const d = new Date(TODAY);
      d.setDate(d.getDate() + day);
      if (d.getDay() === 0 || d.getDay() === 6) continue;

      const minutes = hoursPerDay * 60 - 30;
      await db.insert(timeEntries).values({
        userId: ctx.users[who]!,
        jobId: ctx.jobs[job]!,
        workDate: dayOffset(day),
        startedAt: atTime(day, 7, 0),
        endedAt: atTime(day, 7 + hoursPerDay, 0),
        breakMinutes: 30,
        minutes,
        description: "On site",
        status: "approved",
        source: "clock",
        costRateCents: $(rate.cost),
        chargeRateCents: $(rate.charge),
        costCents: costForMinutesSafe(minutes, $(rate.cost)),
        chargeCents: costForMinutesSafe(minutes, $(rate.charge)),
        approvedBy: ctx.users.greg,
        approvedAt: atTime(day + 3, 19, 0),
        createdBy: ctx.users[who]!,
      });
    }
  }

  /* One person clocked on right now, so the dashboard has something live. */
  await db.insert(timeEntries).values({
    userId: ctx.users.jake!,
    jobId: ctx.jobs.kilby_ext!,
    workDate: dayOffset(0),
    startedAt: atTime(0, 7, 5),
    endedAt: null,
    breakMinutes: 0,
    minutes: 0,
    description: "Roof frame",
    status: "open",
    source: "clock",
    costRateCents: $(RATES.jake!.cost),
    chargeRateCents: $(RATES.jake!.charge),
    startLatitude: "-27.4436",
    startLongitude: "152.9930",
    createdBy: ctx.users.jake!,
  });
}
