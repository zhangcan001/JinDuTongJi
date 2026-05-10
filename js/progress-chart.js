function drawChart(tasks) {
  const ctx = els.chart.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = els.chart.width = els.chart.clientWidth * ratio;
  const height = els.chart.height = 220 * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, els.chart.clientWidth, 220);

  const chartWidth = els.chart.clientWidth;
  const points = tasks.length
    ? tasks
        .slice()
        .sort((a, b) => a.planned.localeCompare(b.planned))
        .map((task, index, arr) => ({
          label: task.planned.slice(5),
          plan: Math.round(((index + 1) / arr.length) * 100),
          actual: Number(task.progress || 0)
        }))
    : [
        { label: "05-01", plan: 25, actual: 20 },
        { label: "05-08", plan: 50, actual: 38 },
        { label: "05-15", plan: 75, actual: 62 },
        { label: "05-22", plan: 100, actual: 80 }
      ];

  ctx.strokeStyle = "rgba(139, 235, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.font = "12px Microsoft YaHei";
  ctx.fillStyle = "#83a4b7";
  for (let i = 0; i <= 4; i += 1) {
    const y = 20 + i * 42;
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(chartWidth - 18, y);
    ctx.stroke();
    ctx.fillText(`${100 - i * 25}%`, 6, y + 4);
  }

  plotLine(ctx, points, "plan", "#78a8ff", chartWidth);
  plotLine(ctx, points, "actual", "#7dffcb", chartWidth);

  ctx.fillStyle = "#78a8ff";
  ctx.fillRect(44, 194, 12, 3);
  ctx.fillText("计划", 62, 198);
  ctx.fillStyle = "#7dffcb";
  ctx.fillRect(108, 194, 12, 3);
  ctx.fillText("实际", 126, 198);
}

function plotLine(ctx, points, key, color, chartWidth) {
  const left = 48;
  const right = chartWidth - 24;
  const top = 20;
  const bottom = 188;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = points.length === 1 ? left : left + ((right - left) * index) / (points.length - 1);
    const y = bottom - ((bottom - top) * point[key]) / 100;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.forEach((point, index) => {
    const x = points.length === 1 ? left : left + ((right - left) * index) / (points.length - 1);
    const y = bottom - ((bottom - top) * point[key]) / 100;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (key === "actual") {
      ctx.fillStyle = "#83a4b7";
      ctx.fillText(point.label, x - 14, 214);
      ctx.fillStyle = color;
    }
  });
}
