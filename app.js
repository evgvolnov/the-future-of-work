const canvas = document.getElementById("graphCanvas");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const stats = document.getElementById("graphStats");
const detailsPanel = document.getElementById("detailsPanel");
const levelFilters = document.getElementById("levelFilters");
const aiImpactFilters = document.getElementById("aiImpactFilters");
const themeFilters = document.getElementById("themeFilters");
const clearFilters = document.getElementById("clearFilters");

const raw = window.GRAPH_DATA;
const themeColors = raw.themes;
const largeGraph = raw.nodes.length > 120;
const levelLabels = {
  operational: "Операционный",
  tactical: "Тактический",
  strategic: "Стратегический"
};
const aiImpactValues = ["AI-first", "AI-supported", "Zero-AI"];
const statusLabels = {
  approved: "Подтверждено",
  candidate: "Кандидат",
  blocked: "Заблокировано",
  rejected: "Отклонено",
  pending: "На проверке"
};
const relationTypeLabels = {
  amplifies: "усиливает",
  causes: "вызывает",
  challenges: "оспаривает",
  clarifies: "уточняет",
  complements: "дополняет",
  constrained_by: "ограничивается",
  constrains: "ограничивает",
  contrasts: "контрастирует с",
  creates_pressure_for: "создает давление на",
  depends_on: "зависит от",
  driver: "является драйвером для",
  drives: "двигает",
  emerges_from: "возникает из",
  enables: "делает возможным",
  explains: "объясняет",
  extends: "расширяет",
  feeds: "подпитывает",
  frames: "задает рамку для",
  impacts: "влияет на",
  informs: "информирует",
  institutionalizes: "институционализирует",
  mitigated_by: "смягчается",
  mitigates: "смягчает",
  moderates: "модерирует",
  operationalizes: "операционализирует",
  part_of: "является частью",
  qualifies: "уточняет",
  refines: "уточняет",
  reframes: "переосмысляет",
  related_to: "связано с",
  requires: "требует",
  responds_to: "отвечает на",
  semantic_support: "семантически поддерживает",
  similar_to: "похоже на",
  specializes: "специализирует",
  structures: "структурирует",
  supports: "поддерживает",
  uses: "использует"
};

const nodes = raw.nodes.map((node, index) => ({
  ...node,
  aliases: raw.aliases?.[node.id] || [],
  aliasesRu: raw.aliasesRu?.[node.id] || [],
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  baseRadius: largeGraph ? 4 + Number(node.importance || 3) * 1.9 : 6 + Number(node.importance || 3) * 2.8,
  radius: 8,
  visible: true,
  selected: false,
  index
}));
const nodeById = new Map(nodes.map((node) => [node.id, node]));
const links = raw.links
  .map(([source, target, type, strength]) => ({
    source,
    target,
    type,
    strength,
    a: nodeById.get(source),
    b: nodeById.get(target)
  }))
  .filter((link) => link.a && link.b && link.source !== link.target);

const neighborMap = new Map(nodes.map((node) => [node.id, new Set()]));
for (const link of links) {
  neighborMap.get(link.source).add(link.target);
  neighborMap.get(link.target).add(link.source);
}

const state = {
  width: 0,
  height: 0,
  pointer: { x: -9999, y: -9999 },
  hovered: null,
  selected: null,
  activeLevels: new Set(["operational", "tactical", "strategic"]),
  activeAiImpacts: new Set(aiImpactValues),
  activeThemes: new Set(Object.keys(themeColors)),
  dust: largeGraph,
  dragging: null
};

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  state.width = Math.max(320, rect.width);
  state.height = Math.max(320, rect.height);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(state.width * dpr);
  canvas.height = Math.floor(state.height * dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fitLayout();
}

function hashNumber(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function fitLayout() {
  const visible = visibleNodes();
  const grouped = new Map();
  visible.forEach((node) => {
    if (!grouped.has(node.theme)) grouped.set(node.theme, []);
    grouped.get(node.theme).push(node);
  });
  visible.forEach((node) => {
    const group = grouped.get(node.theme);
    const groupIndex = group.indexOf(node);
    const target = clusterTarget(node);
    const h = hashNumber(node.id);
    const angle = (groupIndex / Math.max(1, group.length)) * Math.PI * 2 + (h % 80) / 100;
    const ring = state.dust ? 20 + (h % 24) : 28 + (h % 42);
    node.x = target.x + Math.cos(angle) * ring;
    node.y = target.y + Math.sin(angle) * ring;
    node.vx = 0;
    node.vy = 0;
  });
}

function clusterTarget(node) {
  const order = Object.keys(themeColors);
  const index = Math.max(0, order.indexOf(node.theme));
  const columns = state.width < 760 ? 3 : 5;
  const rows = Math.ceil(order.length / columns);
  const safeLeft = 108;
  const safeRight = state.width - 108;
  const safeTop = 136;
  const safeBottom = state.height - 78;
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = safeLeft + (safeRight - safeLeft) * (columns === 1 ? 0.5 : col / (columns - 1));
  const y = safeTop + (safeBottom - safeTop) * (rows === 1 ? 0.5 : row / (rows - 1));
  return { x, y };
}

function visibleNodes() {
  return nodes.filter((node) => node.visible);
}

function sourceCounts() {
  return Object.values(raw.reports || {}).reduce(
    (counts, report) => {
      const type = report.sourceType === "article" ? "articles" : "pdfs";
      counts[type] += 1;
      counts.total += 1;
      return counts;
    },
    { total: 0, pdfs: 0, articles: 0 }
  );
}

function updateVisibility() {
  for (const node of nodes) {
    const aiImpact = node.aiImpact || "AI-supported";
    node.visible =
      state.activeLevels.has(node.level) &&
      state.activeAiImpacts.has(aiImpact) &&
      state.activeThemes.has(node.theme);
  }
  const count = visibleNodes().length;
  const edgeCount = links.filter((link) => link.a.visible && link.b.visible).length;
  const sources = sourceCounts();
  stats.textContent = `${count} баблов, ${edgeCount} семантических связей, ${sources.total} источников: ${sources.pdfs} PDF, ${sources.articles} статей`;
}

function initControls() {
  ["operational", "tactical", "strategic"].forEach((level) => {
    const button = document.createElement("button");
    button.textContent = levelLabels[level] || level;
    button.className = "active";
    button.addEventListener("click", () => {
      if (state.activeLevels.has(level)) state.activeLevels.delete(level);
      else state.activeLevels.add(level);
      button.classList.toggle("active", state.activeLevels.has(level));
      updateVisibility();
    });
    levelFilters.appendChild(button);
  });

  aiImpactValues.forEach((impact) => {
    const button = document.createElement("button");
    button.textContent = impact;
    button.className = "active";
    button.addEventListener("click", () => {
      if (state.activeAiImpacts.has(impact)) state.activeAiImpacts.delete(impact);
      else state.activeAiImpacts.add(impact);
      button.classList.toggle("active", state.activeAiImpacts.has(impact));
      updateVisibility();
    });
    aiImpactFilters.appendChild(button);
  });

  const counts = nodes.reduce((acc, node) => {
    acc[node.theme] = (acc[node.theme] || 0) + 1;
    return acc;
  }, {});

  Object.keys(themeColors).forEach((theme) => {
    const row = document.createElement("button");
    row.className = "theme-row active";
    row.innerHTML = `<span class="swatch" style="--swatch-color:${themeColors[theme]}"></span><span class="theme-name">${theme}</span><span class="theme-count">${counts[theme] || 0}</span>`;
    row.addEventListener("click", () => {
      if (state.activeThemes.has(theme)) state.activeThemes.delete(theme);
      else state.activeThemes.add(theme);
      row.classList.toggle("active", state.activeThemes.has(theme));
      updateVisibility();
    });
    themeFilters.appendChild(row);
  });

  clearFilters.addEventListener("click", () => {
    state.activeLevels = new Set(["operational", "tactical", "strategic"]);
    state.activeAiImpacts = new Set(aiImpactValues);
    state.activeThemes = new Set(Object.keys(themeColors));
    document.querySelectorAll(".chip-grid button, .theme-row").forEach((el) => el.classList.add("active"));
    updateVisibility();
  });

}

function tickPhysics() {
  const visible = visibleNodes();
  const centerX = state.width * 0.46;
  const centerY = state.height * 0.54;
  const safeLeft = 72;
  const safeRight = state.width - 72;
  const safeTop = 112;
  const safeBottom = state.height - 44;

  for (const node of visible) {
    const target = clusterTarget(node);
    const clusterPull = state.dust ? 0.009 : 0.0032;
    const centerPull = state.dust ? 0.00002 : 0.00012;
    node.vx += (target.x - node.x) * clusterPull;
    node.vy += (target.y - node.y) * clusterPull;
    node.vx += (centerX - node.x) * centerPull;
    node.vy += (centerY - node.y) * centerPull;
  }

  for (const link of links) {
    if (!link.a.visible || !link.b.visible) continue;
    const dx = link.b.x - link.a.x;
    const dy = link.b.y - link.a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const target = state.dust ? 36 : 58 + (5 - link.strength) * 5;
    const linkPull = state.dust ? 0.000035 : 0.00016;
    const force = (dist - target) * linkPull * link.strength;
    const fx = dx * force;
    const fy = dy * force;
    link.a.vx += fx;
    link.a.vy += fy;
    link.b.vx -= fx;
    link.b.vy -= fy;
  }

  for (let i = 0; i < visible.length; i += 1) {
    const a = visible[i];
    for (let j = i + 1; j < visible.length; j += 1) {
      const b = visible[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const minDist = (a.radius + b.radius + (state.dust ? 8 : 15));
      if (dist < minDist) {
        const force = (minDist - dist) * 0.006;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
  }

  const activeNeighborhood = state.hovered ? neighborMap.get(state.hovered.id) : null;
  for (const node of visible) {
    const near = state.hovered && (node === state.hovered || activeNeighborhood.has(node.id));
    const selected = state.selected && (node === state.selected || neighborMap.get(state.selected.id).has(node.id));
    const targetRadius = state.dust && !near && !selected ? Math.max(3, node.baseRadius * 0.42) : node.baseRadius * (near ? 1.55 : selected ? 1.22 : 1);
    node.radius += (targetRadius - node.radius) * 0.12;
    if (state.dragging !== node) {
      node.x += node.vx;
      node.y += node.vy;
    }
    node.vx *= 0.82;
    node.vy *= 0.82;
    if (node.x < safeLeft) node.vx += (safeLeft - node.x) * 0.02;
    if (node.x > safeRight) node.vx -= (node.x - safeRight) * 0.02;
    if (node.y < safeTop) node.vy += (safeTop - node.y) * 0.02;
    if (node.y > safeBottom) node.vy -= (node.y - safeBottom) * 0.02;
    node.x = Math.max(safeLeft, Math.min(safeRight, node.x));
    node.y = Math.max(safeTop, Math.min(safeBottom, node.y));
  }
}

function draw() {
  ctx.clearRect(0, 0, state.width, state.height);

  const activeId = state.hovered?.id || state.selected?.id;
  const activeNeighbors = activeId ? neighborMap.get(activeId) : null;

  for (const link of links) {
    if (!link.a.visible || !link.b.visible) continue;
    const active = activeId && (link.source === activeId || link.target === activeId);
    ctx.beginPath();
    ctx.moveTo(link.a.x, link.a.y);
    ctx.lineTo(link.b.x, link.b.y);
    ctx.strokeStyle = active ? "rgba(255,255,255,0.52)" : "rgba(255,255,255,0.08)";
    ctx.lineWidth = active ? 1.7 : 0.7;
    ctx.stroke();
  }

  for (const node of visibleNodes()) {
    const active = activeId && (node.id === activeId || activeNeighbors?.has(node.id));
    const color = themeColors[node.theme] || "#9ca3af";
    ctx.globalAlpha = activeId && !active ? 0.18 : 1;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = node.level === "strategic" ? 2.3 : node.level === "tactical" ? 1.4 : 0.9;
    ctx.strokeStyle = node === state.selected ? "#ffffff" : "rgba(255,255,255,0.46)";
    ctx.stroke();

    if (!state.dust || active || node.radius > 14) {
      const label = node.label;
      const fontSize = active ? 12 : 10.5;
      ctx.font = `600 ${fontSize}px "IBM Plex Sans", system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      wrapLabel(label, node.x, node.y, Math.max(56, node.radius * 4.1), fontSize + 2, active ? 3 : 2);
    }
    ctx.globalAlpha = 1;
  }
}

function wrapLabel(text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines) clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/\s+\S+$/, "")}...`;
  const startY = y - ((clipped.length - 1) * lineHeight) / 2;
  clipped.forEach((entry, i) => ctx.fillText(entry, x, startY + i * lineHeight));
}

function loop() {
  tickPhysics();
  draw();
  requestAnimationFrame(loop);
}

function findNodeAt(x, y) {
  let best = null;
  for (const node of visibleNodes()) {
    const dist = Math.hypot(node.x - x, node.y - y);
    if (dist <= node.radius + 7 && (!best || dist < best.dist)) best = { node, dist };
  }
  return best?.node || null;
}

function nearestNode(x, y, maxDistance = 96) {
  let best = null;
  for (const node of visibleNodes()) {
    const dist = Math.hypot(node.x - x, node.y - y);
    if (dist <= maxDistance && (!best || dist < best.dist)) best = { node, dist };
  }
  return best?.node || null;
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function setHovered(node, event) {
  state.hovered = node;
  if (!node) {
    tooltip.hidden = true;
    return;
  }
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
  tooltip.innerHTML = `
    <strong>${escapeHtml(node.label)}</strong>
    <span>${escapeHtml(node.theme)}</span>
    <span class="tooltip-type">${escapeHtml(levelLabels[node.level] || node.level)}</span>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reportFor(id) {
  return raw.reports?.[id] || null;
}

function reportLabel(report) {
  const type = report.sourceType === "article" ? "статья" : "PDF";
  return `${report.publisher}, ${report.year} (${type})`;
}

function isPublicSourceUrl(url) {
  return /^https?:\/\//.test(String(url || ""));
}

function reportLinkMarkup(report, label) {
  const text = escapeHtml(label);
  if (!isPublicSourceUrl(report?.url)) return text;
  return `<a href="${escapeHtml(report.url)}" target="_blank" rel="noreferrer">${text}</a>`;
}

function statusLabel(status) {
  return statusLabels[status] || status || "Не указан";
}

function relationTypeLabel(type) {
  return relationTypeLabels[type] || type;
}

function conceptEvidence(node) {
  return raw.evidence.filter((item) => item.supports === node.id);
}

function sourceReports(node, evidenceItems) {
  const sources = new Map();
  const direct = reportFor(node.source);
  if (direct) sources.set(node.source, direct);
  for (const item of evidenceItems) {
    const report = reportFor(item.reportId);
    if (report) sources.set(item.reportId, report);
  }
  return [...sources.entries()].map(([id, report]) => ({ id, ...report }));
}

function textRu(primary, fallback = "") {
  return String(primary || fallback || "");
}

function extendedDescription(node, evidenceItems, reports) {
  const description = textRu(node.descriptionRu, node.description);
  const pdfCount = reports.filter((report) => report.sourceType !== "article").length;
  const articleCount = reports.filter((report) => report.sourceType === "article").length;
  const sourceBits = [];
  if (pdfCount) sourceBits.push(`${pdfCount} PDF-источник${pdfCount === 1 ? "ом" : "ами"}`);
  if (articleCount) sourceBits.push(`${articleCount} стать${articleCount === 1 ? "ей" : "ями"}`);
  const reportText = reports.length
    ? `Сейчас оно подтверждено ${sourceBits.join(" и ")} и ${evidenceItems.length} evidence-фрагмент${evidenceItems.length === 1 ? "ом" : "ами"}.`
    : "Сейчас это понятие находится на уровне таксономии и требует дополнительных evidence-фрагментов, привязанных к источникам.";
  return `${description} В графе это понятие относится к уровню ${levelLabels[node.level] || node.level} внутри темы ${node.theme}. Статус: ${statusLabel(node.status)}. ${reportText}`;
}

function aliasList(node) {
  const aliases = [...new Set([...node.aliasesRu, ...node.aliases].filter(Boolean))];
  if (!aliases.length) return "";
  const visibleAliases = aliases.slice(0, 8).map((alias) => `<span class="alias">${escapeHtml(alias)}</span>`).join("");
  const more = aliases.length > 8 ? `<span class="alias muted">+${aliases.length - 8}</span>` : "";
  return `<div class="control-card detail-card"><div class="detail-subhead">Алиасы</div><div class="alias-row">${visibleAliases}${more}</div></div>`;
}

function selectNode(node) {
  state.selected = node;
  if (!node) return;
  const evidenceItems = conceptEvidence(node);
  const reports = sourceReports(node, evidenceItems);
  const related = links
    .filter((link) => link.a === node || link.b === node)
    .slice(0, 8)
    .map((link) => {
      const other = link.a === node ? link.b : link.a;
      const relation = relationTypeLabel(link.type);
      const text = link.a === node ? `${relation}: ${other.label}` : `${other.label}: ${relation}`;
      return `<div class="relation-row">${escapeHtml(text)}</div>`;
    })
    .join("");
  const evidence = evidenceItems
    .slice(0, 4)
    .map((item) => {
      const report = reportFor(item.reportId);
      const pages = String(item.pages || "");
      const pageText = report?.sourceType === "article" || !pages || pages === "url" ? "" : `, страницы: ${escapeHtml(pages)}`;
      const reportLink = report ? reportLinkMarkup(report, item.report) : escapeHtml(item.report);
      return `<div class="evidence-card">${escapeHtml(textRu(item.excerptRu, item.excerpt))}<span>${reportLink}${pageText}</span></div>`;
    })
    .join("");
  const pdfLinks = reports
    .map((report) => {
      const linkText = `${report.title} — ${reportLabel(report)}`;
      if (!isPublicSourceUrl(report.url)) {
        return `<span class="source-link source-link-static"><span>${escapeHtml(linkText)}</span></span>`;
      }
      return `
        <a class="source-link" href="${escapeHtml(report.url)}" target="_blank" rel="noreferrer">
          <span>${escapeHtml(linkText)}</span>
        </a>`;
    })
    .join("");
  detailsPanel.innerHTML = `
    <h2 class="detail-title">${escapeHtml(node.label)}</h2>
    <div class="detail-kicker">${escapeHtml(node.theme)}</div>
    <p class="detail-copy">${escapeHtml(extendedDescription(node, evidenceItems, reports))}</p>
    ${aliasList(node)}
    <div class="control-card detail-card">
      <div class="detail-subhead">Источники</div>
      ${pdfLinks ? `<div class="source-list">${pdfLinks}</div>` : '<div class="empty-state"><p>Источник пока не привязан.</p></div>'}
    </div>
    <div class="control-card detail-card">
      <div class="detail-subhead">Семантические связи</div>
      ${related || '<div class="empty-state"><p>При текущих фильтрах видимых связей нет.</p></div>'}
    </div>
    <div class="control-card detail-card">
      <div class="detail-subhead">Фрагменты подтверждения</div>
      ${evidence || '<div class="empty-state"><p>В прототипных данных пока нет короткого evidence-фрагмента.</p></div>'}
    </div>
  `;
}

window.selectGraphNode = (id) => selectNode(nodeById.get(id));

canvas.addEventListener("mousemove", (event) => {
  const pos = pointerPosition(event);
  state.pointer = pos;
  if (state.dragging) {
    state.dragging.x = pos.x;
    state.dragging.y = pos.y;
    return;
  }
  setHovered(findNodeAt(pos.x, pos.y), event);
});

canvas.addEventListener("mouseleave", () => setHovered(null));
canvas.addEventListener("mousedown", (event) => {
  const pos = pointerPosition(event);
  state.dragging = findNodeAt(pos.x, pos.y);
});
window.addEventListener("mouseup", () => {
  state.dragging = null;
});
canvas.addEventListener("click", (event) => {
  const pos = pointerPosition(event);
  const visible = visibleNodes();
  selectNode(findNodeAt(pos.x, pos.y) || (visible.length === 1 ? visible[0] : nearestNode(pos.x, pos.y)));
});

window.addEventListener("resize", resize);

initControls();
resize();
updateVisibility();
loop();
