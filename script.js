"use strict";
const { createApp, watch, ref, computed, onMounted } = Vue;

function formatCurrency(x, currency) {
  const f = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  });
  return f.format(x);
}

createApp({
  setup() {
    const currency = ref("USD");
    const params = ref({
      startingCapital: 0,
      incomeMonthly: 5589,
      expensesMonthly: 4000,
      incomeGrowthPct: 10,
      returnPct: 15,
      inflationPct: 5,
      years: 30,
      contributionInterestFactor: 1,
    });

    const rows = computed(() => buildRows(params.value));

    // ----- Google Charts state -----
    const showPoints = ref(true);
    const fillArea = ref(true);
    const chartDraws = ref(0);
    const googleReady = ref(false);
    let chart = null;

    const metricOptions = [
      { value: "capitalEnd", label: "Final capital" },
      { value: "contribution", label: "Annual contributions" },
      { value: "interestTotal", label: "Total interest (start+contrib)" },
      { value: "interestOnStart", label: "Interest on last year's capital" },
      { value: "interestOnContribution", label: "Interest on contributions" },
    ];
    const metric = ref("capitalEnd");
    const metricLabel = computed(
      () =>
        metricOptions.find((o) => o.value === metric.value)?.label || "Value"
    );

    const values = computed(() => {
      const r = rows.value;
      switch (metric.value) {
        case "contribution":
          return r.map((x) => x.contribution);
        case "interestTotal":
          return r.map((x) => x.interestOnStart + x.interestOnContribution);
        case "interestOnStart":
          return r.map((x) => x.interestOnStart);
        case "interestOnContribution":
          return r.map((x) => x.interestOnContribution);
        case "capitalEnd":
        default:
          return r.map((x) => x.capitalEnd);
      }
    });

    function drawChart() {
      try {
        if (
          !(window.google && window.google.visualization) ||
          !googleReady.value
        )
          return;
        const arr = [["Year", metricLabel.value]];
        rows.value.forEach((r) => {
          let v;
          switch (metric.value) {
            case "contribution":
              v = r.contribution;
              break;
            case "interestTotal":
              v = r.interestOnStart + r.interestOnContribution;
              break;
            case "interestOnStart":
              v = r.interestOnStart;
              break;
            case "interestOnContribution":
              v = r.interestOnContribution;
              break;
            case "capitalEnd":
            default:
              v = r.capitalEnd;
              break;
          }
          arr.push([r.year, v]);
        });
        const data = google.visualization.arrayToDataTable(arr);
        const options = {
          backgroundColor: "transparent",
          legend: { position: "none" },
          hAxis: {
            title: "Year",
            textStyle: { color: "#94a3b8" },
            gridlines: { color: "#22314b" },
          },
          vAxis: {
            title: metricLabel.value,
            textStyle: { color: "#94a3b8" },
            gridlines: { color: "#22314b" },
          },
          chartArea: { left: 56, top: 16, right: 16, bottom: 40 },
          pointSize: showPoints.value ? 3 : 0,
          series: {
            0: { color: "#22c55e", areaOpacity: fillArea.value ? 0.25 : 0 },
          },
          tooltip: { isHtml: false },
        };
        const el = document.getElementById("gchart");
        if (!el) return;
        const Ctor = fillArea.value
          ? google.visualization.AreaChart
          : google.visualization.LineChart;
        if (!chart || !(chart instanceof Ctor)) chart = new Ctor(el);
        chart.draw(data, options);
        chartDraws.value++;
        // Reflect the current draw count into the DOM attribute for tests
        try {
          const el2 = document.getElementById("gchart");
          if (el2) {
            el2.setAttribute("data-draws", String(chartDraws.value));
          }
        } catch (_) {}
      } catch (e) {
        console.error("Chart draw error", e);
      }
    }

    onMounted(() => {
      // Load Google Charts and draw when ready; run tests only after first draw
      google.charts.load("current", { packages: ["corechart"] });
      google.charts.setOnLoadCallback(() => {
        googleReady.value = true;
        drawChart();
        const results = runTests();
        renderTestResults(results);
        if (console && console.table)
          console.table(
            results.map((r) => ({
              name: r.name,
              pass: r.pass,
              message: r.message,
            }))
          );
      });
      window.addEventListener("resize", drawChart);
    });

    watch([rows, metric, showPoints, fillArea], () => drawChart());

    function resetToDefaults() {
      params.value = {
        startingCapital: 0,
        incomeMonthly: 5589,
        expensesMonthly: 4000,
        incomeGrowthPct: 10,
        returnPct: 15,
        inflationPct: 5,
        years: 30,
        contributionInterestFactor: 1,
      };
    }

    function fmt(n) {
      return formatCurrency(n, currency.value);
    }

    function downloadCSV() {
      const header = [
        "Year",
        "Monthly Income",
        "Monthly Expenses",
        "Delta (monthly)",
        "Contribution (annual)",
        "Capital last year",
        "% on last year capital",
        "% on current-year contributions",
        "Final capital",
      ];
      const lines = [header.join(",")].concat(
        rows.value.map((r) =>
          [
            r.year,
            r.incomeMonthly,
            r.expensesMonthly,
            r.deltaMonthly,
            r.contribution,
            r.capitalStart,
            r.interestOnStart,
            r.interestOnContribution,
            r.capitalEnd,
          ].join(",")
        )
      );
      const blob = new Blob([lines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "investment_projection.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    return {
      params,
      rows,
      resetToDefaults,
      fmt,
      currency,
      downloadCSV,
      metric,
      metricOptions,
      metricLabel,
      showPoints,
      fillArea,
      chartDraws,
    };
  },
}).mount("#app");

// ------------------ math & helpers ------------------
function buildRows(p) {
  const rows = [];
  const toFinite = (v, fb = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const toPct = (v) => toFinite(v) / 100;

  let capitalStart = toFinite(p.startingCapital, 0);
  let incomeMonthly = toFinite(p.incomeMonthly, 0);
  let expensesMonthly = toFinite(p.expensesMonthly, 0);
  const gIncome = toPct(p.incomeGrowthPct);
  const r = toPct(p.returnPct);
  const infl = toPct(p.inflationPct);
  const years = Math.max(1, Math.min(60, Math.floor(toFinite(p.years, 1))));
  const k =
    p.contributionInterestFactor == null || p.contributionInterestFactor === ""
      ? 1
      : toFinite(p.contributionInterestFactor, 0);

  for (let y = 1; y <= years; y++) {
    const deltaMonthly = incomeMonthly - expensesMonthly; // monthly
    const contribution = deltaMonthly * 12; // annual inflow (can be negative)

    const interestOnStart = capitalStart * r;
    const interestOnContribution = contribution * r * k;

    let capitalEnd =
      capitalStart + contribution + interestOnStart + interestOnContribution;
    if (capitalEnd < 0) capitalEnd = 0; // floor at 0

    rows.push({
      year: y,
      incomeMonthly: round2(incomeMonthly),
      expensesMonthly: round2(expensesMonthly),
      deltaMonthly: round2(deltaMonthly),
      contribution: round2(contribution),
      capitalStart: round2(capitalStart),
      interestOnStart: round2(interestOnStart),
      interestOnContribution: round2(interestOnContribution),
      capitalEnd: round2(capitalEnd),
    });

    capitalStart = capitalEnd;
    incomeMonthly = incomeMonthly * (1 + gIncome);
    expensesMonthly = expensesMonthly * (1 + infl);
  }
  return rows;
}

function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// ------------------ Tests ------------------
function runTests() {
  const tests = [];

  tests.push(
    assert("Year 1 basic math (defaults)", () => {
      const r = buildRows({
        startingCapital: 0,
        incomeMonthly: 5589,
        expensesMonthly: 4000,
        incomeGrowthPct: 10,
        returnPct: 15,
        inflationPct: 5,
        years: 1,
        contributionInterestFactor: 0.5,
      });
      const y1 = r[0];
      const expectDelta = 1589; // 5589-4000
      const expectContribution = 1589 * 12; // 19068
      const expectInterestOnStart = 0;
      const expectInterestOnContribution = 19068 * 0.15 * 0.5; // 1430.1
      const expectCapitalEnd = 0 + 19068 + 0 + 1430.1; // 20498.1
      near(y1.deltaMonthly, expectDelta);
      near(y1.contribution, expectContribution);
      near(y1.interestOnStart, expectInterestOnStart);
      near(y1.interestOnContribution, expectInterestOnContribution);
      near(y1.capitalEnd, expectCapitalEnd);
    })
  );

  tests.push(
    assert("Negative delta withdraws from capital (floored at 0)", () => {
      const r = buildRows({
        startingCapital: 5000,
        incomeMonthly: 1000,
        expensesMonthly: 2000,
        incomeGrowthPct: 0,
        returnPct: 10,
        inflationPct: 0,
        years: 1,
        contributionInterestFactor: 0.5,
      });
      const y1 = r[0];
      if (y1.capitalEnd < 0)
        throw new Error("Capital went below zero despite floor");
    })
  );

  tests.push(
    assert("Year 2 growth/inflation application", () => {
      const r = buildRows({
        startingCapital: 0,
        incomeMonthly: 5589,
        expensesMonthly: 4000,
        incomeGrowthPct: 10,
        returnPct: 0,
        inflationPct: 5,
        years: 2,
        contributionInterestFactor: 0,
      });
      const y2 = r[1];
      near(y2.incomeMonthly, 5589 * 1.1);
      near(y2.expensesMonthly, 4000 * 1.05);
    })
  );

  tests.push(
    assert("CSV newline separator correctness", () => {
      const header = ["a", "b"];
      const lines = [header.join(",")].concat(["1,2"]);
      const csv = lines.join("\n");
      if (csv.split("\n").length !== 2)
        throw new Error("CSV does not contain expected line break");
    })
  );

  tests.push(
    assert("buildRows length matches years", () => {
      const r = buildRows({
        startingCapital: 0,
        incomeMonthly: 1000,
        expensesMonthly: 500,
        incomeGrowthPct: 0,
        returnPct: 0,
        inflationPct: 0,
        years: 5,
        contributionInterestFactor: 0,
      });
      if (r.length !== 5) throw new Error(`Expected 5 years, got ${r.length}`);
    })
  );

  tests.push(
    assert("0× factor yields zero interest on contribution", () => {
      const r = buildRows({
        startingCapital: 0,
        incomeMonthly: 2000,
        expensesMonthly: 1000,
        incomeGrowthPct: 0,
        returnPct: 10,
        inflationPct: 0,
        years: 1,
        contributionInterestFactor: 0,
      });
      const y1 = r[0];
      near(y1.interestOnContribution, 0);
    })
  );

  tests.push(
    assert("Vue mounts and renders interpolation", () => {
      const pill = document.querySelector(".header .pill");
      if (!pill) throw new Error("Pill not found");
      if (pill.textContent.includes("{{"))
        throw new Error("Interpolation not processed");
      if (!pill.textContent.includes("USD"))
        throw new Error("Currency not rendered");
    })
  );

  // Google chart tests (replace old SVG tests)
  tests.push(
    assert("Google Charts container exists", () => {
      const el = document.getElementById("gchart");
      if (!el) throw new Error("gchart div missing");
    })
  );

  tests.push(
    assert("Google chart draws at least once on load", () => {
      const el = document.getElementById("gchart");
      const draws = Number(el.getAttribute("data-draws") || "0");
      if (!(draws > 0)) throw new Error("draw count did not increment");
    })
  );

  tests.push(
    assert("Metric selector exists and triggers redraw", () => {
      const el = document.getElementById("gchart");
      const before = Number(el.getAttribute("data-draws") || "0");
      const sel = document.getElementById("metric");
      if (!sel) throw new Error("Metric selector missing");
      sel.value = "contribution";
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      const after = Number(el.getAttribute("data-draws") || "0");
      if (!(after > before))
        throw new Error("draw count did not increase after metric change");
    })
  );

  tests.push(
    assert("Default contribution factor is 1× when undefined", () => {
      const r = buildRows({
        startingCapital: 0,
        incomeMonthly: 2000,
        expensesMonthly: 1000,
        incomeGrowthPct: 0,
        returnPct: 10,
        inflationPct: 0,
        years: 1,
      });
      const y1 = r[0];
      near(y1.interestOnContribution, 1200);
    })
  );

  tests.push(
    assert("Rows contain only finite numbers", () => {
      const r = buildRows({
        startingCapital: 0,
        incomeMonthly: 5589,
        expensesMonthly: 4000,
        incomeGrowthPct: 10,
        returnPct: 15,
        inflationPct: 5,
        years: 3,
        contributionInterestFactor: 1,
      });
      r.forEach((row) => {
        const vals = [
          row.incomeMonthly,
          row.expensesMonthly,
          row.deltaMonthly,
          row.contribution,
          row.capitalStart,
          row.interestOnStart,
          row.interestOnContribution,
          row.capitalEnd,
        ];
        vals.forEach((v) => {
          if (!Number.isFinite(v)) throw new Error("Found non-finite value");
        });
      });
    })
  );

  tests.push(
    assert("Coerces NaN/blank inputs to finite numbers", () => {
      const r = buildRows({
        startingCapital: NaN,
        incomeMonthly: "",
        expensesMonthly: undefined,
        incomeGrowthPct: "",
        returnPct: "",
        inflationPct: null,
        years: "",
        contributionInterestFactor: "",
      });
      if (r.length < 1) throw new Error("No rows produced");
      const y1 = r[0];
      [
        y1.incomeMonthly,
        y1.expensesMonthly,
        y1.deltaMonthly,
        y1.contribution,
        y1.capitalStart,
        y1.interestOnStart,
        y1.interestOnContribution,
        y1.capitalEnd,
      ].forEach((v) => {
        if (!Number.isFinite(v))
          throw new Error("Found non-finite after coercion");
      });
    })
  );

  tests.push(
    assert("Help sections present and quick start is foldable", () => {
      const ids = [
        "#help-starting-capital",
        "#help-income-monthly",
        "#help-expenses-monthly",
        "#help-income-growth",
        "#help-return",
        "#help-inflation",
        "#help-years",
        "#help-contrib-factor",
      ];
      ids.forEach((sel) => {
        if (!document.querySelector(sel))
          throw new Error(`Missing help section: ${sel}`);
      });
      const det = document.getElementById("how-to-use");
      if (!det || det.tagName.toLowerCase() !== "details")
        throw new Error("Quick start is not a <details>");
      const sum = det.querySelector("summary");
      if (!sum) throw new Error("Quick start has no <summary>");
    })
  );

  tests.push(
    assert("Changing contribution assumption does not change metric", () => {
      const metricEl = document.getElementById("metric");
      if (!metricEl) throw new Error("Metric selector missing");
      const beforeMetric = metricEl.value;
      const contribSel = Array.from(document.querySelectorAll("select")).find(
        (s) => s !== metricEl
      );
      if (!contribSel) throw new Error("Contribution factor select not found");
      const prev = Number(
        document.getElementById("gchart").getAttribute("data-draws") || "0"
      );
      contribSel.value = "0.5";
      contribSel.dispatchEvent(new Event("change", { bubbles: true }));
      const afterMetric = metricEl.value;
      if (afterMetric !== beforeMetric)
        throw new Error("Metric changed when contribution factor changed");
      const afterDraws = Number(
        document.getElementById("gchart").getAttribute("data-draws") || "0"
      );
      if (!(afterDraws > prev))
        throw new Error(
          "Chart did not redraw after contribution factor change"
        );
    })
  );

  return tests;
}

function renderTestResults(results) {
  const ul = document.getElementById("test-results");
  if (!ul) return;
  ul.innerHTML = "";
  results.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = `${r.pass ? "✔" : "✖"} ${r.name} ${
      r.pass ? "" : "- " + r.message
    }`;
    li.className = r.pass ? "test-pass" : "test-fail";
    ul.appendChild(li);
  });
}

function assert(name, fn) {
  try {
    fn();
    return { name, pass: true, message: "" };
  } catch (e) {
    return { name, pass: false, message: e.message || String(e) };
  }
}

function near(actual, expected, eps = 1e-6) {
  if (Math.abs(actual - expected) > eps)
    throw new Error(`Expected ${expected}, got ${actual}`);
}

// Show any runtime error in the test list for visibility
window.addEventListener("error", (e) => {
  try {
    const ul = document.getElementById("test-results");
    if (!ul) return;
    const li = document.createElement("li");
    li.textContent = `✖ Runtime error: ${e.message}`;
    li.className = "test-fail";
    ul.prepend(li);
  } catch (_) {}
});
// ------------------ End of script.js ------------------