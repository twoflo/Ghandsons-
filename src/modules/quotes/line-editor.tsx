"use client";

import { useMemo, useState } from "react";
import { formatMoney, formatBp, centsToInput, parseMoneyToCents } from "@/lib/money";
import { calculateDocument, type LineKind } from "./calc";
import { type EditorLine, newLine, LINE_KINDS } from "./editor-line";
import { LINE_KIND } from "@/lib/status";
import { Button, Input, Select, Badge } from "@/components/ui";
import type { PriceBookEntry } from "./queries";

/**
 * The estimating table.
 *
 * The owner works in COST and margin, because that's how he thinks; the price
 * is derived and shown next to it so he can see what the client will pay
 * without doing sums in his head. Totals recompute on every keystroke using
 * exactly the same function the server uses when it saves.
 */
export type { EditorLine };

export function LineEditor({
  lines,
  onChange,
  globalMarkupBp,
  priceBook,
  taxRates,
  showCost,
}: {
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  globalMarkupBp: number;
  priceBook: PriceBookEntry[];
  taxRates: Array<{ id: string; name: string; rateBp: number }>;
  showCost: boolean;
}) {
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const calculated = useMemo(
    () => calculateDocument(lines, globalMarkupBp),
    [lines, globalMarkupBp],
  );

  function update(key: string, patch: Partial<EditorLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function remove(key: string) {
    onChange(lines.filter((l) => l.key !== key).map((l, i) => ({ ...l, sortOrder: i })));
  }

  function move(key: string, direction: -1 | 1) {
    const index = lines.findIndex((l) => l.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next.map((l, i) => ({ ...l, sortOrder: i })));
  }

  function add(isHeading = false) {
    const defaultRate = taxRates.find((r) => r.rateBp > 0) ?? taxRates[0];
    const line = newLine(lines.length, defaultRate?.id ?? null, defaultRate?.rateBp ?? 0);
    onChange([...lines, { ...line, isHeading, description: isHeading ? "New section" : "" }]);
  }

  function applyPriceBookItem(key: string, item: PriceBookEntry) {
    const rate = taxRates.find((r) => r.id === item.taxRateId) ?? taxRates.find((r) => r.rateBp > 0);
    update(key, {
      description: item.name,
      kind: item.kind as LineKind,
      unit: item.unit,
      unitCostCents: item.unitCostCents,
      markupBp: item.defaultMarkupBp,
      priceBookItemId: item.id,
      taxRateId: rate?.id ?? null,
      taxRateBp: rate?.rateBp ?? 0,
    });
    setPickerFor(null);
    setPickerSearch("");
  }

  const filteredBook = priceBook.filter((item) => {
    if (!pickerSearch.trim()) return true;
    const q = pickerSearch.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="space-y-3">
        {lines.map((line, index) => {
          const calc = calculated.lines[index]!;

          if (line.isHeading) {
            return (
              <div key={line.key} className="flex items-center gap-2 rounded-lg bg-ink-200 p-2">
                <Input
                  value={line.description}
                  onChange={(e) => update(line.key, { description: e.target.value })}
                  className="font-bold"
                  aria-label={`Section heading ${index + 1}`}
                  placeholder="Section heading"
                />
                <RowControls onUp={() => move(line.key, -1)} onDown={() => move(line.key, 1)} onRemove={() => remove(line.key)} />
              </div>
            );
          }

          return (
            <div key={line.key} className="rounded-lg border-2 border-ink-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={line.description}
                      onChange={(e) => update(line.key, { description: e.target.value, priceBookItemId: null })}
                      placeholder="What is it?"
                      aria-label={`Line ${index + 1} description`}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setPickerFor(pickerFor === line.key ? null : line.key)}
                      aria-expanded={pickerFor === line.key}
                      title="Pick from the price book"
                    >
                      📖
                    </Button>
                  </div>

                  {pickerFor === line.key ? (
                    <div className="rounded-lg border-2 border-info-500 bg-info-50 p-2">
                      <Input
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder="Search the price book…"
                        aria-label="Search price book"
                        autoFocus
                      />
                      <ul className="mt-2 max-h-64 overflow-y-auto">
                        {filteredBook.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => applyPriceBookItem(line.key, item)}
                              className="flex w-full min-h-[var(--tap)] items-center justify-between gap-3 rounded px-2 text-left hover:bg-white"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-ink-900">{item.name}</span>
                                <span className="text-xs text-ink-500">
                                  {item.code} · {LINE_KIND[item.kind]?.label} · per {item.unit}
                                </span>
                              </span>
                              <span className="tabular shrink-0 text-sm font-bold">
                                {formatMoney(item.unitCostCents)}
                              </span>
                            </button>
                          </li>
                        ))}
                        {filteredBook.length === 0 ? (
                          <li className="px-2 py-3 text-sm text-ink-600">
                            Nothing matched. Type the line in by hand — you can add it to the price book in Settings later.
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <label className="block">
                      <span className="sr-only">Type</span>
                      <Select
                        value={line.kind}
                        onChange={(e) => update(line.key, { kind: e.target.value as LineKind })}
                        aria-label={`Line ${index + 1} type`}
                      >
                        {LINE_KINDS.map((k) => (
                          <option key={k} value={k}>{LINE_KIND[k]!.label}</option>
                        ))}
                      </Select>
                    </label>

                    <label className="block">
                      <span className="sr-only">Quantity</span>
                      <Input
                        value={line.quantity}
                        onChange={(e) => update(line.key, { quantity: e.target.value })}
                        inputMode="decimal"
                        className="tabular text-right"
                        aria-label={`Line ${index + 1} quantity`}
                      />
                    </label>

                    <label className="block">
                      <span className="sr-only">Unit</span>
                      <Input
                        value={line.unit}
                        onChange={(e) => update(line.key, { unit: e.target.value })}
                        placeholder="ea"
                        aria-label={`Line ${index + 1} unit`}
                      />
                    </label>

                    {showCost ? (
                      <label className="block">
                        <span className="sr-only">Unit cost</span>
                        <Input
                          defaultValue={centsToInput(line.unitCostCents)}
                          onBlur={(e) =>
                            update(line.key, { unitCostCents: parseMoneyToCents(e.target.value) ?? 0 })
                          }
                          inputMode="decimal"
                          className="tabular text-right"
                          aria-label={`Line ${index + 1} unit cost`}
                          title="What it costs us"
                        />
                      </label>
                    ) : null}

                    <label className="block">
                      <span className="sr-only">Markup percent</span>
                      <Input
                        defaultValue={line.markupBp === null ? "" : String(line.markupBp / 100)}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          update(line.key, {
                            markupBp: v === "" ? null : Math.round(Number.parseFloat(v) * 100),
                          });
                        }}
                        inputMode="decimal"
                        placeholder={`${globalMarkupBp / 100}%`}
                        className="tabular text-right"
                        aria-label={`Line ${index + 1} markup percent`}
                        title="Blank uses the quote's markup"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 pt-2 text-sm">
                    <div className="flex flex-wrap items-center gap-3 text-ink-600">
                      {showCost ? (
                        <span>
                          Cost <strong className="tabular">{formatMoney(calc.lineCostCents)}</strong>
                        </span>
                      ) : null}
                      <span>
                        {formatMoney(calc.unitPriceCents)} / {line.unit}
                      </span>
                      {showCost ? <Badge tone="neutral">{formatBp(calc.effectiveMarkupBp)} markup</Badge> : null}
                      <label className="flex items-center gap-1">
                        <span className="sr-only">GST treatment</span>
                        <Select
                          value={line.taxRateId ?? ""}
                          onChange={(e) => {
                            const rate = taxRates.find((r) => r.id === e.target.value);
                            update(line.key, { taxRateId: e.target.value || null, taxRateBp: rate?.rateBp ?? 0 });
                          }}
                          className="!min-h-9 !py-0 text-sm"
                          aria-label={`Line ${index + 1} GST`}
                        >
                          {taxRates.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </Select>
                      </label>
                    </div>
                    <p className="tabular text-base font-bold text-ink-900">
                      {formatMoney(calc.lineSubtotalCents)}
                    </p>
                  </div>
                </div>

                <RowControls onUp={() => move(line.key, -1)} onDown={() => move(line.key, 1)} onRemove={() => remove(line.key)} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => add(false)}>+ Add a line</Button>
        <Button type="button" variant="ghost" onClick={() => add(true)}>+ Section heading</Button>
      </div>

      <dl className="mt-5 ml-auto max-w-sm space-y-1.5 border-t-2 border-ink-300 pt-3">
        {showCost ? (
          <Row label="What it costs us" value={formatMoney(calculated.totals.costTotalCents)} muted />
        ) : null}
        <Row label="Subtotal (ex GST)" value={formatMoney(calculated.totals.subtotalCents)} />
        <Row label="GST" value={formatMoney(calculated.totals.taxCents)} />
        <Row label="Total" value={formatMoney(calculated.totals.totalCents)} strong />
        {showCost ? (
          <div className="mt-2 flex items-baseline justify-between rounded-lg bg-ink-100 px-3 py-2">
            <dt className="text-sm font-bold text-ink-700">Gross profit</dt>
            <dd className="text-right">
              <span className="tabular block font-black text-ink-900">
                {formatMoney(calculated.totals.grossProfitCents)}
              </span>
              <span
                className={`text-sm font-bold ${
                  calculated.totals.marginBp < 1000
                    ? "text-bad-700"
                    : calculated.totals.marginBp < 1800
                      ? "text-warn-700"
                      : "text-good-700"
                }`}
              >
                {formatBp(calculated.totals.marginBp)} margin
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`text-sm ${strong ? "font-bold text-ink-900" : muted ? "text-ink-500" : "font-semibold text-ink-700"}`}>
        {label}
      </dt>
      <dd className={`tabular ${strong ? "text-lg font-black" : muted ? "text-ink-500" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function RowControls({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <button type="button" onClick={onUp} aria-label="Move up"
              className="h-8 w-8 rounded border border-ink-300 text-ink-600 hover:bg-ink-100">↑</button>
      <button type="button" onClick={onDown} aria-label="Move down"
              className="h-8 w-8 rounded border border-ink-300 text-ink-600 hover:bg-ink-100">↓</button>
      <button type="button" onClick={onRemove} aria-label="Remove line"
              className="h-8 w-8 rounded border border-bad-500/50 text-bad-700 hover:bg-bad-50">✕</button>
    </div>
  );
}
