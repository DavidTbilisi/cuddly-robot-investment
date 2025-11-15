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

const vueApp = createApp({
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

    // ----- Enhanced Charts state -----
    const showPoints = ref(true);
    const chartType = ref('line');
    const showMultipleMetrics = ref(false);
    const activeMetrics = ref(['capitalEnd']);
    const enableZoom = ref(true);
    const showStackedView = ref(false);
    const focusYear = ref(1);
    const showCumulativeView = ref(false);
    const showPercentages = ref(false);
    const performanceMetric = ref('returns');
    const chartDraws = ref(0);
    const googleReady = ref(false);
    let charts = {}; // Store multiple chart instances

    const metricOptions = [
      { value: "capitalEnd", label: "Final Capital", color: "#22c55e" },
      { value: "contribution", label: "Annual Contributions", color: "#3b82f6" },
      { value: "interestTotal", label: "Total Interest", color: "#f59e0b" },
      { value: "interestOnStart", label: "Interest on Capital", color: "#ef4444" },
      { value: "interestOnContribution", label: "Interest on Contributions", color: "#8b5cf6" },
      { value: "incomeMonthly", label: "Monthly Income", color: "#06b6d4" },
      { value: "expensesMonthly", label: "Monthly Expenses", color: "#f97316" },
      { value: "deltaMonthly", label: "Monthly Delta", color: "#84cc16" }
    ];
    const metric = ref("capitalEnd");
    const metricLabel = computed(
      () =>
        metricOptions.find((o) => o.value === metric.value)?.label || "Value"
    );
    
    // Watch focusYear to update when rows change
    watch(rows, (newRows) => {
      if (newRows.length > 0 && !newRows.find(r => r.year === focusYear.value)) {
        focusYear.value = newRows[0].year;
      }
    }, { immediate: true });

    // Enhanced computed data for multiple charts
    const chartData = computed(() => {
      const r = rows.value;
      return {
        main: prepareMainChartData(r),
        breakdown: prepareBreakdownData(r),
        cashflow: prepareCashflowData(r),
        ratios: prepareRatiosData(r),
        performance: preparePerformanceData(r)
      };
    });
    
    function prepareMainChartData(rows) {
      if (showMultipleMetrics.value) {
        const headers = ['Year', ...activeMetrics.value.map(m => 
          metricOptions.find(opt => opt.value === m)?.label || m
        )];
        const data = [headers];
        rows.forEach(row => {
          const rowData = [row.year];
          activeMetrics.value.forEach(metric => {
            rowData.push(getMetricValue(row, metric));
          });
          data.push(rowData);
        });
        return data;
      } else {
        return [['Year', metricLabel.value], ...rows.map(r => 
          [r.year, getMetricValue(r, metric.value)]
        )];
      }
    }
    
    function getMetricValue(row, metric) {
      switch (metric) {
        case 'contribution': return row.contribution;
        case 'interestTotal': return row.interestOnStart + row.interestOnContribution;
        case 'interestOnStart': return row.interestOnStart;
        case 'interestOnContribution': return row.interestOnContribution;
        case 'incomeMonthly': return row.incomeMonthly;
        case 'expensesMonthly': return row.expensesMonthly;
        case 'deltaMonthly': return row.deltaMonthly;
        case 'capitalEnd':
        default: return row.capitalEnd;
      }
    }
    
    function prepareBreakdownData(rows) {
      const headers = ['Year', 'Starting Capital', 'Contributions', 'Interest on Capital', 'Interest on Contributions'];
      const data = [headers];
      rows.forEach(row => {
        data.push([
          row.year,
          row.capitalStart,
          row.contribution,
          row.interestOnStart,
          row.interestOnContribution
        ]);
      });
      return data;
    }
    
    function prepareCashflowData(rows) {
      const headers = ['Year', 'Income', 'Expenses', 'Net Flow'];
      const data = [headers];
      rows.forEach(row => {
        data.push([
          row.year,
          row.incomeMonthly * 12, // Annualized
          row.expensesMonthly * 12, // Annualized
          row.deltaMonthly * 12 // Annualized net flow
        ]);
      });
      return data;
    }
    
    function prepareRatiosData(rows) {
      const headers = ['Year', 'Savings Rate (%)', 'Capital Growth Rate (%)', 'Expense Ratio (%)'];
      const data = [headers];
      rows.forEach(row => {
        const savingsRate = row.incomeMonthly > 0 ? (row.deltaMonthly / row.incomeMonthly) * 100 : 0;
        const growthRate = row.capitalStart > 0 ? 
          ((row.capitalEnd - row.capitalStart) / row.capitalStart) * 100 : 0;
        const expenseRatio = row.incomeMonthly > 0 ? (row.expensesMonthly / row.incomeMonthly) * 100 : 0;
        
        data.push([
          row.year,
          Math.round(savingsRate * 100) / 100,
          Math.round(growthRate * 100) / 100,
          Math.round(expenseRatio * 100) / 100
        ]);
      });
      return data;
    }
    
    function preparePerformanceData(rows) {
      let headers, data;
      
      switch (performanceMetric.value) {
        case 'returns':
          headers = ['Year', 'Total Return', 'Capital Return', 'Contribution Return'];
          data = [headers];
          rows.forEach(row => {
            data.push([
              row.year,
              row.interestOnStart + row.interestOnContribution,
              row.interestOnStart,
              row.interestOnContribution
            ]);
          });
          break;
        case 'growth':
          headers = ['Year', 'Capital Growth', 'Income Growth', 'Expense Growth'];
          data = [headers];
          rows.forEach((row, index) => {
            if (index === 0) {
              data.push([row.year, 0, 0, 0]);
            } else {
              const prevRow = rows[index - 1];
              const capitalGrowth = ((row.capitalEnd - prevRow.capitalEnd) / prevRow.capitalEnd) * 100;
              const incomeGrowth = ((row.incomeMonthly - prevRow.incomeMonthly) / prevRow.incomeMonthly) * 100;
              const expenseGrowth = ((row.expensesMonthly - prevRow.expensesMonthly) / prevRow.expensesMonthly) * 100;
              
              data.push([
                row.year,
                Math.round(capitalGrowth * 100) / 100,
                Math.round(incomeGrowth * 100) / 100,
                Math.round(expenseGrowth * 100) / 100
              ]);
            }
          });
          break;
        case 'efficiency':
          headers = ['Year', 'Capital Efficiency', 'ROI (%)', 'Payback Period'];
          data = [headers];
          rows.forEach(row => {
            const efficiency = row.contribution > 0 ? row.capitalEnd / (row.contribution + row.capitalStart || 1) : 0;
            const roi = row.capitalStart > 0 ? ((row.capitalEnd - row.capitalStart) / row.capitalStart) * 100 : 0;
            const payback = row.deltaMonthly > 0 ? row.capitalStart / (row.deltaMonthly * 12) : 0;
            
            data.push([
              row.year,
              Math.round(efficiency * 100) / 100,
              Math.round(roi * 100) / 100,
              Math.round(payback * 100) / 100
            ]);
          });
          break;
        default:
          return prepareMainChartData(rows);
      }
      
      return data;
    }

    // Comprehensive chart rendering system
    function drawAllCharts() {
      if (!window.google?.visualization || !googleReady.value) return;
      
      try {
        drawMainChart();
        drawBreakdownCharts();
        drawCashflowCharts();
        drawPerformanceChart();
        
        // Increment and update draw count immediately
        chartDraws.value++;
        const mainEl = document.getElementById('main-chart');
        if (mainEl) {
          mainEl.setAttribute('data-draws', String(chartDraws.value));
        }
        
        console.log('Charts drawn, count:', chartDraws.value, 'at', new Date().getTime());
      } catch (e) {
        console.error('Chart rendering error:', e);
      }
    }
    
    function drawMainChart() {
      const element = document.getElementById('main-chart');
      if (!element) return;
      
      const data = google.visualization.arrayToDataTable(chartData.value.main);
      
      const baseOptions = {
        backgroundColor: 'transparent',
        hAxis: {
          title: 'Year',
          textStyle: { color: '#94a3b8' },
          gridlines: { color: '#22314b' },
        },
        vAxis: {
          textStyle: { color: '#94a3b8' },
          gridlines: { color: '#22314b' },
          format: 'currency'
        },
        chartArea: { left: 80, top: 20, right: 40, bottom: 60 },
        tooltip: { 
          isHtml: true,
          trigger: 'both'
        },
        crossfilter: { enabled: enableZoom.value },
        explorer: enableZoom.value ? {
          actions: ['dragToZoom', 'rightClickToReset'],
          axis: 'horizontal',
          keepInBounds: true
        } : undefined
      };
      
      if (showMultipleMetrics.value) {
        baseOptions.legend = { position: 'top', textStyle: { color: '#94a3b8' } };
        baseOptions.series = {};
        activeMetrics.value.forEach((metricValue, index) => {
          const metricConfig = metricOptions.find(opt => opt.value === metricValue);
          baseOptions.series[index] = {
            color: metricConfig?.color || `hsl(${index * 60}, 70%, 50%)`,
            pointSize: showPoints.value ? 4 : 0
          };
        });
      } else {
        baseOptions.legend = { position: 'none' };
        const metricConfig = metricOptions.find(opt => opt.value === metric.value);
        baseOptions.series = {
          0: { 
            color: metricConfig?.color || '#22c55e',
            pointSize: showPoints.value ? 4 : 0
          }
        };
      }
      
      let ChartConstructor;
      switch (chartType.value) {
        case 'area':
          ChartConstructor = google.visualization.AreaChart;
          if (showMultipleMetrics.value) {
            activeMetrics.value.forEach((_, index) => {
              baseOptions.series[index].areaOpacity = 0.3;
            });
          } else {
            baseOptions.series[0].areaOpacity = 0.3;
          }
          break;
        case 'column':
          ChartConstructor = google.visualization.ColumnChart;
          break;
        case 'combo':
          ChartConstructor = google.visualization.ComboChart;
          baseOptions.seriesType = 'line';
          if (showMultipleMetrics.value && activeMetrics.value.length > 1) {
            baseOptions.series[0].type = 'columns';
          }
          break;
        case 'line':
        default:
          ChartConstructor = google.visualization.LineChart;
          break;
      }
      
      if (!charts.main || !(charts.main instanceof ChartConstructor)) {
        charts.main = new ChartConstructor(element);
      }
      
      charts.main.draw(data, baseOptions);
    }
    
    function drawBreakdownCharts() {
      // Stacked area chart for capital growth sources
      const breakdownEl = document.getElementById('breakdown-chart');
      if (breakdownEl) {
        const data = google.visualization.arrayToDataTable(chartData.value.breakdown);
        const options = {
          backgroundColor: 'transparent',
          legend: { position: 'top', textStyle: { color: '#94a3b8' } },
          isStacked: showStackedView.value,
          hAxis: {
            title: 'Year',
            textStyle: { color: '#94a3b8' },
            gridlines: { color: '#22314b' }
          },
          vAxis: {
            textStyle: { color: '#94a3b8' },
            gridlines: { color: '#22314b' },
            format: 'currency'
          },
          chartArea: { left: 60, top: 40, right: 20, bottom: 50 },
          series: {
            0: { color: '#ef4444' }, // Starting Capital
            1: { color: '#3b82f6' }, // Contributions  
            2: { color: '#f59e0b' }, // Interest on Capital
            3: { color: '#8b5cf6' }  // Interest on Contributions
          }
        };
        
        if (!charts.breakdown) {
          charts.breakdown = new google.visualization.AreaChart(breakdownEl);
        }
        charts.breakdown.draw(data, options);
      }
      
      // Pie chart for selected year composition
      const pieEl = document.getElementById('pie-chart');
      if (pieEl && rows.value.length > 0) {
        const focusRow = rows.value.find(r => r.year === focusYear.value) || rows.value[0];
        const pieData = [
          ['Source', 'Amount'],
          ['Starting Capital', focusRow.capitalStart],
          ['Contributions', Math.max(0, focusRow.contribution)],
          ['Interest on Capital', focusRow.interestOnStart],
          ['Interest on Contributions', focusRow.interestOnContribution]
        ].filter(row => row[0] === 'Source' || row[1] > 0);
        
        const data = google.visualization.arrayToDataTable(pieData);
        const options = {
          backgroundColor: 'transparent',
          legend: { position: 'right', textStyle: { color: '#94a3b8' } },
          chartArea: { left: 20, top: 20, right: 100, bottom: 20 },
          colors: ['#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'],
          pieSliceText: 'percentage',
          pieSliceTextStyle: { color: '#ffffff' },
          title: `Year ${focusYear.value} Capital Sources`,
          titleTextStyle: { color: '#e5e7eb' }
        };
        
        if (!charts.pie) {
          charts.pie = new google.visualization.PieChart(pieEl);
        }
        charts.pie.draw(data, options);
      }
    }
    
    function drawCashflowCharts() {
      // Income vs Expenses chart
      const cashflowEl = document.getElementById('cashflow-chart');
      if (cashflowEl) {
        const data = google.visualization.arrayToDataTable(chartData.value.cashflow);
        const options = {
          backgroundColor: 'transparent',
          legend: { position: 'top', textStyle: { color: '#94a3b8' } },
          hAxis: {
            title: 'Year',
            textStyle: { color: '#94a3b8' },
            gridlines: { color: '#22314b' }
          },
          vAxis: {
            title: 'Annual Amount',
            textStyle: { color: '#94a3b8' },
            gridlines: { color: '#22314b' },
            format: 'currency'
          },
          chartArea: { left: 80, top: 40, right: 20, bottom: 50 },
          series: {
            0: { color: '#22c55e', type: 'line' }, // Income
            1: { color: '#ef4444', type: 'line' }, // Expenses
            2: { color: '#3b82f6', type: 'columns' } // Net Flow
          },
          seriesType: 'line'
        };
        
        if (!charts.cashflow) {
          charts.cashflow = new google.visualization.ComboChart(cashflowEl);
        }
        charts.cashflow.draw(data, options);
      }
      
      // Financial ratios chart
      const ratiosEl = document.getElementById('ratios-chart');
      if (ratiosEl) {
        const data = google.visualization.arrayToDataTable(chartData.value.ratios);
        const options = {
          backgroundColor: 'transparent',
          legend: { position: 'top', textStyle: { color: '#94a3b8' } },
          hAxis: {
            title: 'Year',
            textStyle: { color: '#94a3b8' },
            gridlines: { color: '#22314b' }
          },
          vAxis: {
            title: 'Percentage (%)',
            textStyle: { color: '#94a3b8' },
            gridlines: { color: '#22314b' }
          },
          chartArea: { left: 60, top: 40, right: 20, bottom: 50 },
          series: {
            0: { color: '#22c55e' }, // Savings Rate
            1: { color: '#f59e0b' }, // Capital Growth Rate
            2: { color: '#ef4444' }  // Expense Ratio
          }
        };
        
        if (!charts.ratios) {
          charts.ratios = new google.visualization.LineChart(ratiosEl);
        }
        charts.ratios.draw(data, options);
      }
    }
    
    function drawPerformanceChart() {
      const performanceEl = document.getElementById('performance-chart');
      if (performanceEl) {
        const data = google.visualization.arrayToDataTable(chartData.value.performance);
        const options = {
          backgroundColor: 'transparent',
          legend: { position: 'top', textStyle: { color: '#94a3b8' } },
          hAxis: {
            title: 'Year',
            textStyle: { color: '#94a3b8' },
            gridlines: { color: '#22314b' }
          },
          vAxis: {
            textStyle: { color: '#94a3b8' },
            gridlines: { color: '#22314b' }
          },
          chartArea: { left: 80, top: 40, right: 40, bottom: 60 },
          series: {
            0: { color: '#22c55e' },
            1: { color: '#3b82f6' },
            2: { color: '#f59e0b' }
          }
        };
        
        // Adjust format based on performance metric
        if (performanceMetric.value === 'returns') {
          options.vAxis.format = 'currency';
        } else {
          options.vAxis.format = '#\'%\'';
        }
        
        if (!charts.performance) {
          charts.performance = new google.visualization.LineChart(performanceEl);
        }
        charts.performance.draw(data, options);
      }
    }

    onMounted(() => {
      // Load Google Charts with all necessary packages
      google.charts.load('current', { 
        packages: ['corechart', 'controls'] 
      });
      google.charts.setOnLoadCallback(() => {
        googleReady.value = true;
        drawAllCharts();
        
        // Run tests after first draw (with async support)
        runTests().then(results => {
          renderTestResults(results);
          if (console?.table) {
            console.table(
              results.map((r) => ({
                name: r.name,
                pass: r.pass,
                message: r.message,
              }))
            );
          }
        }).catch(console.error);
      });
      
      // Responsive chart redrawing
      window.addEventListener('resize', () => {
        setTimeout(drawAllCharts, 100);
      });
    });

    // Enhanced watchers for all chart options
    watch([
      rows, metric, chartType, showMultipleMetrics, activeMetrics,
      showPoints, enableZoom, showStackedView, focusYear,
      showCumulativeView, showPercentages, performanceMetric
    ], () => {
      if (googleReady.value) {
        drawAllCharts();
      }
    }, { deep: true });

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
      chartType,
      showMultipleMetrics,
      activeMetrics,
      enableZoom,
      showStackedView,
      focusYear,
      showCumulativeView,
      showPercentages,
      performanceMetric,
      chartDraws,
    };
  },
});

// Mount the app and expose it globally for testing
window.vueApp = vueApp.mount("#app");

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
async function runTests() {
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
      const el = document.getElementById("main-chart");
      if (!el) throw new Error("main-chart div missing");
    })
  );

  tests.push(
    assert("Google chart draws at least once on load", () => {
      const el = document.getElementById("main-chart");
      const draws = Number(el.getAttribute("data-draws") || "0");
      if (!(draws > 0)) throw new Error("draw count did not increment");
    })
  );

  tests.push(
    assert("Metric selector exists and triggers redraw", async () => {
      const el = document.getElementById("main-chart");
      const before = Number(el.getAttribute("data-draws") || "0");
      const sel = document.getElementById("metric");
      if (!sel) throw new Error("Metric selector missing");
      
      // Trigger Vue change event properly
      const originalValue = sel.value;
      sel.value = "contribution";
      // Trigger both input and change events to ensure Vue reactivity
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      
      // Also manually trigger Vue reactivity by accessing the Vue instance if possible
      if (window.vueApp && window.vueApp.$data) {
        // Force Vue reactivity update
        window.vueApp.$nextTick && window.vueApp.$nextTick();
      }
      
      // Wait for Vue reactivity and chart redraw
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const after = Number(el.getAttribute("data-draws") || "0");
      if (!(after > before))
        throw new Error(`draw count did not increase: ${before} -> ${after}`);
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
    assert("Changing contribution assumption does not change metric", async () => {
      const metricEl = document.getElementById("metric");
      if (!metricEl) throw new Error("Metric selector missing");
      const beforeMetric = metricEl.value;
      // Find the contribution factor select element specifically
      const contribSel = Array.from(document.querySelectorAll("select")).find(
        (s) => s.querySelector('option[value="0"]') && s.querySelector('option[value="0.5"]') && s.querySelector('option[value="1"]')
      );
      if (!contribSel) throw new Error("Contribution factor select not found");
      const prev = Number(
        document.getElementById("main-chart").getAttribute("data-draws") || "0"
      );
      
      // Trigger the contribution factor change
      contribSel.value = "0.5";
      contribSel.dispatchEvent(new Event("change", { bubbles: true }));
      
      // Wait for Vue reactivity and chart redraw
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const afterMetric = metricEl.value;
      if (afterMetric !== beforeMetric)
        throw new Error("Metric changed when contribution factor changed");
      const afterDraws = Number(
        document.getElementById("main-chart").getAttribute("data-draws") || "0"
      );
      if (!(afterDraws > prev))
        throw new Error(
          `Chart did not redraw after contribution factor change: ${prev} -> ${afterDraws}`
        );
    })
  );

  // Wait for all async tests to complete
  const resolvedTests = await Promise.all(tests);
  return resolvedTests;
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
    const result = fn();
    if (result && typeof result.then === 'function') {
      // Handle async test functions
      return result.then(
        () => ({ name, pass: true, message: "" }),
        (e) => ({ name, pass: false, message: e.message || String(e) })
      );
    } else {
      return { name, pass: true, message: "" };
    }
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