import { db } from "../index";
import { users, workerProfiles } from "../schema";
import { hashPassword } from "../../lib/password";
import type { Ctx } from "./context";
import { $ } from "./helpers";

export const DEMO_PASSWORD = "buildit2026";

type Person = {
  key: string;
  email: string;
  fullName: string;
  phone: string;
  role: "owner" | "office" | "field";
  profile?: {
    employmentType: "employee" | "subcontractor";
    cost: number;
    charge: number;
    trade: string;
    abn?: string;
    hours?: number;
    start: string;
  };
};

export const PEOPLE: Person[] = [
  {
    key: "greg", email: "greg@ghandsons.com.au", fullName: "Greg Hand",
    phone: "0412 776 431", role: "owner",
    profile: { employmentType: "employee", cost: 78, charge: 125, trade: "Builder / supervisor", hours: 45, start: "2009-03-02" },
  },
  {
    key: "donna", email: "donna@ghandsons.com.au", fullName: "Donna Hand",
    phone: "0417 220 884", role: "office",
    profile: { employmentType: "employee", cost: 44, charge: 0, trade: "Office manager", hours: 24, start: "2011-07-18" },
  },
  {
    key: "jake", email: "jake@ghandsons.com.au", fullName: "Jake Hand",
    phone: "0429 118 305", role: "field",
    profile: { employmentType: "employee", cost: 62, charge: 98, trade: "Carpenter", hours: 38, start: "2016-01-25" },
  },
  {
    key: "marco", email: "marco@ghandsons.com.au", fullName: "Marco Ferraro",
    phone: "0438 907 552", role: "field",
    profile: { employmentType: "employee", cost: 64, charge: 98, trade: "Carpenter / leading hand", hours: 38, start: "2018-09-03" },
  },
  {
    key: "tyler", email: "tyler@ghandsons.com.au", fullName: "Tyler Nguyen",
    phone: "0451 663 209", role: "field",
    profile: { employmentType: "employee", cost: 28, charge: 55, trade: "3rd year apprentice", hours: 38, start: "2023-02-06" },
  },
  {
    key: "wes", email: "wes@kellyelectrical.com.au", fullName: "Wes Kelly",
    phone: "0407 551 928", role: "field",
    profile: { employmentType: "subcontractor", cost: 110, charge: 132, trade: "Electrician", abn: "71 604 338 210", start: "2019-05-14" },
  },
  {
    key: "sam", email: "sam@northsideplumbing.com.au", fullName: "Sam Okafor",
    phone: "0433 812 447", role: "field",
    profile: { employmentType: "subcontractor", cost: 115, charge: 138, trade: "Plumber", abn: "88 155 902 771", start: "2020-11-09" },
  },
];

export async function seedPeople(ctx: Ctx) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const rows = await db
    .insert(users)
    .values(
      PEOPLE.map((p) => ({
        email: p.email,
        passwordHash,
        fullName: p.fullName,
        phone: p.phone,
        role: p.role,
        isActive: true,
        mustChangePassword: false,
        lastLoginAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
      })),
    )
    .returning({ id: users.id, email: users.email });

  for (const p of PEOPLE) {
    ctx.users[p.key] = rows.find((r) => r.email === p.email)!.id;
  }

  await db.insert(workerProfiles).values(
    PEOPLE.filter((p) => p.profile).map((p) => ({
      userId: ctx.users[p.key]!,
      employmentType: p.profile!.employmentType,
      costRateCents: $(p.profile!.cost),
      chargeRateCents: $(p.profile!.charge),
      standardHoursPerWeek: p.profile!.hours ?? 38,
      trade: p.profile!.trade,
      abn: p.profile!.abn ?? null,
      startDate: p.profile!.start,
      emergencyContactName: p.key === "greg" ? "Donna Hand" : "Greg Hand",
      emergencyContactPhone: p.key === "greg" ? "0417 220 884" : "0412 776 431",
    })),
  );
}
