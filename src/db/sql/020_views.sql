-- =============================================================================
-- Derived money. Actual cost is NEVER stored on a job -- it is computed here
-- so it can't drift from the time entries and expenses it comes from.
-- =============================================================================

-- Labour actuals: approved time only. Draft/submitted hours are shown
-- separately in the UI as "pending" so the owner knows what is still coming.
CREATE OR REPLACE VIEW job_labour_actuals AS
SELECT
  te.job_id,
  COALESCE(SUM(te.minutes) FILTER (WHERE te.status = 'approved'), 0)::bigint          AS approved_minutes,
  COALESCE(SUM(te.cost_cents) FILTER (WHERE te.status = 'approved'), 0)::bigint       AS approved_cost_cents,
  COALESCE(SUM(te.charge_cents) FILTER (WHERE te.status = 'approved'), 0)::bigint     AS approved_charge_cents,
  COALESCE(SUM(te.minutes) FILTER (WHERE te.status IN ('draft','submitted','open')), 0)::bigint AS pending_minutes,
  COALESCE(SUM(te.cost_cents) FILTER (WHERE te.status IN ('draft','submitted','open')), 0)::bigint AS pending_cost_cents
FROM time_entries te
WHERE te.deleted_at IS NULL AND te.job_id IS NOT NULL
GROUP BY te.job_id;

-- Non-labour actuals, split by the category's kind so they line up with the
-- budget columns on the job.
CREATE OR REPLACE VIEW job_expense_actuals AS
SELECT
  e.job_id,
  COALESCE(SUM(e.subtotal_cents) FILTER (WHERE ec.kind = 'material'), 0)::bigint      AS material_cents,
  COALESCE(SUM(e.subtotal_cents) FILTER (WHERE ec.kind = 'subcontractor'), 0)::bigint AS subcontractor_cents,
  COALESCE(SUM(e.subtotal_cents) FILTER (WHERE ec.kind = 'plant'), 0)::bigint         AS plant_cents,
  COALESCE(SUM(e.subtotal_cents) FILTER (WHERE ec.kind = 'labour'), 0)::bigint        AS labour_expense_cents,
  COALESCE(SUM(e.subtotal_cents) FILTER (WHERE ec.kind = 'other' OR ec.kind IS NULL), 0)::bigint AS other_cents,
  COALESCE(SUM(e.subtotal_cents), 0)::bigint                                          AS total_ex_tax_cents,
  COALESCE(SUM(e.tax_cents), 0)::bigint                                               AS tax_cents,
  COALESCE(SUM(e.subtotal_cents) FILTER (WHERE e.is_billable AND e.billed_invoice_line_id IS NULL), 0)::bigint
                                                                                      AS unbilled_billable_cents,
  COUNT(*)::bigint                                                                    AS expense_count
FROM expenses e
LEFT JOIN expense_categories ec ON ec.id = e.category_id
WHERE e.deleted_at IS NULL AND e.job_id IS NOT NULL
GROUP BY e.job_id;

-- What has been billed and banked against each job.
CREATE OR REPLACE VIEW job_invoice_totals AS
SELECT
  i.job_id,
  COALESCE(SUM(i.subtotal_cents) FILTER (WHERE i.status <> 'void'), 0)::bigint   AS invoiced_ex_tax_cents,
  COALESCE(SUM(i.total_cents)    FILTER (WHERE i.status <> 'void'), 0)::bigint   AS invoiced_inc_tax_cents,
  COALESCE(SUM(i.amount_paid_cents), 0)::bigint                                  AS paid_cents,
  COALESCE(SUM(i.balance_cents)  FILTER (WHERE i.status <> 'void'), 0)::bigint   AS outstanding_cents,
  COUNT(*) FILTER (WHERE i.status <> 'void' AND i.status <> 'draft')::bigint     AS issued_count
FROM invoices i
WHERE i.deleted_at IS NULL AND i.job_id IS NOT NULL
GROUP BY i.job_id;

-- Approved variations add to what we can charge.
CREATE OR REPLACE VIEW job_variation_totals AS
SELECT
  v.job_id,
  COALESCE(SUM(v.subtotal_cents) FILTER (WHERE v.status IN ('approved','invoiced')), 0)::bigint AS approved_ex_tax_cents,
  COALESCE(SUM(v.cost_cents)     FILTER (WHERE v.status IN ('approved','invoiced')), 0)::bigint AS approved_cost_cents,
  COALESCE(SUM(v.subtotal_cents) FILTER (WHERE v.status IN ('draft','submitted')), 0)::bigint   AS pending_ex_tax_cents,
  COUNT(*) FILTER (WHERE v.status = 'submitted')::bigint                                        AS awaiting_approval_count
FROM variations v
WHERE v.deleted_at IS NULL
GROUP BY v.job_id;

-- Committed-but-not-yet-spent: POs sent and not fully invoiced.
CREATE OR REPLACE VIEW job_committed_costs AS
SELECT
  po.job_id,
  COALESCE(SUM(po.subtotal_cents) FILTER (WHERE po.status IN ('sent','part_received','received')), 0)::bigint AS committed_cents
FROM purchase_orders po
WHERE po.deleted_at IS NULL AND po.job_id IS NOT NULL
GROUP BY po.job_id;

-- ---------------------------------------------------------------------------
-- The one the app actually reads: budget vs actual vs invoiced, per job.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW job_financials AS
SELECT
  j.id                                                       AS job_id,
  j.job_number,
  j.title,
  j.status,
  j.client_id,

  j.contract_value_cents::bigint                             AS contract_value_cents,
  COALESCE(vt.approved_ex_tax_cents, 0)                      AS approved_variations_cents,
  (j.contract_value_cents + COALESCE(vt.approved_ex_tax_cents, 0))::bigint AS revised_contract_cents,

  (j.budget_labour_cents + j.budget_material_cents + j.budget_subcontractor_cents
   + j.budget_plant_cents + j.budget_other_cents)::bigint     AS budget_total_cents,
  -- An approved variation lifts what we can charge AND what we are allowed
  -- to spend. Comparing actuals to the original budget alone would flag
  -- every job with a variation as an overrun, which is not what happened.
  ((j.budget_labour_cents + j.budget_material_cents + j.budget_subcontractor_cents
    + j.budget_plant_cents + j.budget_other_cents)
   + COALESCE(vt.approved_cost_cents, 0))::bigint             AS revised_budget_cents,
  COALESCE(vt.approved_cost_cents, 0)                         AS approved_variation_cost_cents,
  j.budget_labour_cents::bigint                              AS budget_labour_cents,
  j.budget_material_cents::bigint                            AS budget_material_cents,
  j.budget_subcontractor_cents::bigint                       AS budget_subcontractor_cents,
  j.budget_plant_cents::bigint                               AS budget_plant_cents,
  j.budget_other_cents::bigint                               AS budget_other_cents,

  COALESCE(la.approved_cost_cents, 0)                        AS actual_labour_cents,
  COALESCE(la.approved_minutes, 0)                           AS actual_labour_minutes,
  COALESCE(la.pending_cost_cents, 0)                         AS pending_labour_cents,
  COALESCE(ea.material_cents, 0)                             AS actual_material_cents,
  COALESCE(ea.subcontractor_cents, 0)                        AS actual_subcontractor_cents,
  COALESCE(ea.plant_cents, 0)                                AS actual_plant_cents,
  COALESCE(ea.other_cents, 0) + COALESCE(ea.labour_expense_cents, 0) AS actual_other_cents,

  (COALESCE(la.approved_cost_cents, 0) + COALESCE(ea.total_ex_tax_cents, 0))::bigint
                                                             AS actual_total_cents,
  COALESCE(cc.committed_cents, 0)                            AS committed_cents,

  COALESCE(it.invoiced_ex_tax_cents, 0)                      AS invoiced_ex_tax_cents,
  COALESCE(it.paid_cents, 0)                                 AS paid_inc_tax_cents,
  COALESCE(it.outstanding_cents, 0)                          AS outstanding_cents,
  COALESCE(ea.unbilled_billable_cents, 0)                    AS unbilled_billable_cents,

  -- Profit against the revised contract, using real costs to date.
  ((j.contract_value_cents + COALESCE(vt.approved_ex_tax_cents, 0))
     - (COALESCE(la.approved_cost_cents, 0) + COALESCE(ea.total_ex_tax_cents, 0)))::bigint
                                                             AS profit_cents,
  -- Over budget in the owner's sense: spent more than we set aside, counting
  -- approved variations. Positive means over.
  ((COALESCE(la.approved_cost_cents, 0) + COALESCE(ea.total_ex_tax_cents, 0))
     - ((j.budget_labour_cents + j.budget_material_cents + j.budget_subcontractor_cents
         + j.budget_plant_cents + j.budget_other_cents)
        + COALESCE(vt.approved_cost_cents, 0)))::bigint        AS budget_variance_cents,
  -- Where it will land if everything already committed also gets spent.
  ((COALESCE(la.approved_cost_cents, 0) + COALESCE(la.pending_cost_cents, 0)
      + COALESCE(ea.total_ex_tax_cents, 0) + COALESCE(cc.committed_cents, 0))
     - ((j.budget_labour_cents + j.budget_material_cents + j.budget_subcontractor_cents
         + j.budget_plant_cents + j.budget_other_cents)
        + COALESCE(vt.approved_cost_cents, 0)))::bigint        AS forecast_variance_cents
FROM jobs j
LEFT JOIN job_labour_actuals   la ON la.job_id = j.id
LEFT JOIN job_expense_actuals  ea ON ea.job_id = j.id
LEFT JOIN job_invoice_totals   it ON it.job_id = j.id
LEFT JOIN job_variation_totals vt ON vt.job_id = j.id
LEFT JOIN job_committed_costs  cc ON cc.job_id = j.id
WHERE j.deleted_at IS NULL;

-- Outstanding money per client, with the oldest unpaid invoice's age.
CREATE OR REPLACE VIEW client_balances AS
SELECT
  c.id AS client_id,
  COALESCE(SUM(i.balance_cents) FILTER (WHERE i.status IN ('sent','part_paid','overdue')), 0)::bigint AS outstanding_cents,
  COALESCE(SUM(i.total_cents)   FILTER (WHERE i.status <> 'void' AND i.status <> 'draft'), 0)::bigint AS lifetime_invoiced_cents,
  COALESCE(SUM(i.amount_paid_cents), 0)::bigint AS lifetime_paid_cents,
  MIN(i.due_date) FILTER (WHERE i.status IN ('sent','part_paid','overdue') AND i.balance_cents > 0) AS oldest_due_date,
  COUNT(*) FILTER (WHERE i.status IN ('sent','part_paid','overdue') AND i.balance_cents > 0)::bigint AS open_invoice_count
FROM clients c
LEFT JOIN invoices i ON i.client_id = c.id AND i.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id;

-- Aged receivables buckets, one row per unpaid invoice.
CREATE OR REPLACE VIEW aged_receivables AS
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.client_id,
  c.name AS client_name,
  i.job_id,
  i.issue_date,
  i.due_date,
  i.total_cents::bigint,
  i.balance_cents::bigint,
  GREATEST(0, (CURRENT_DATE - i.due_date))::int AS days_overdue,
  CASE
    WHEN i.due_date IS NULL OR CURRENT_DATE <= i.due_date              THEN 'current'
    WHEN CURRENT_DATE - i.due_date BETWEEN 1  AND 30                   THEN '1_30'
    WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60                   THEN '31_60'
    WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90                   THEN '61_90'
    ELSE '90_plus'
  END AS bucket
FROM invoices i
JOIN clients c ON c.id = i.client_id
WHERE i.deleted_at IS NULL
  AND i.status IN ('sent','part_paid','overdue')
  AND i.balance_cents > 0;
