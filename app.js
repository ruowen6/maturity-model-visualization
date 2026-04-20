const pastelPalette = [
  "#a0cbe8",
  "#ffbe7d",
  "#8cd17d",
  "#ff9d9a",
  "#9cddda",
  "#f1ce63",
  "#d4a6c8",
  "#fabfd2",
];

const VIEW_SCALE = 1.16;
const SPLIT_LAYOUT_BREAKPOINT = 1320;
const OVERVIEW_BASE_SIZE = 320;
const OVERVIEW_PADDING = 26;
const OVERVIEW_LABEL_FONT_SIZE = 10;
const OVERVIEW_LABEL_LINE_HEIGHT = 12;
const DEFAULT_CAMERA = {
  yaw: -0.72,
  pitch: 0.96,
  zoom: 1,
};

const state = {
  dimensions: [],
  subcategoriesByDimension: {},
  movingSubcategoryId: null,
  overviewCollapsed: false,
  panelWidth: 435,
  camera: { ...DEFAULT_CAMERA },
  drag: {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originYaw: DEFAULT_CAMERA.yaw,
    originPitch: DEFAULT_CAMERA.pitch,
  },
  relocateDrag: {
    active: false,
  },
};

const dom = {
  dimensionCount: document.getElementById("dimension-count"),
  dimensionTableWrapper: document.getElementById("dimension-table-wrapper"),
  subcategoryStatus: document.getElementById("subcategory-status"),
  subcategoryGroups: document.getElementById("subcategory-groups"),
  ioStatus: document.getElementById("io-status"),
  exportJson: document.getElementById("export-json"),
  importJsonTrigger: document.getElementById("import-json-trigger"),
  importJsonInput: document.getElementById("import-json-input"),
  exportOverview: document.getElementById("export-overview"),
  exportOverviewPng: document.getElementById("export-overview-png"),
  overviewCard: document.getElementById("overview-card"),
  overviewContent: document.getElementById("overview-content"),
  overviewToggle: document.getElementById("overview-toggle"),
  panelResizer: document.getElementById("panel-resizer"),
  appShell: document.querySelector(".app-shell"),
  overviewSvg: document.getElementById("overview-svg"),
  svg: document.getElementById("viz-svg"),
  tooltip: document.getElementById("tooltip"),
  interactionHint: document.getElementById("interaction-hint"),
  regeneratePositions: document.getElementById("regenerate-positions"),
  yawControl: document.getElementById("yaw-control"),
  pitchControl: document.getElementById("pitch-control"),
  zoomControl: document.getElementById("zoom-control"),
};

init();

function init() {
  createDefaultDimensions(3);
  state.dimensions.forEach((dimension, index) => {
    updateSubcategoryCount(dimension.id, index === 0 ? 3 : 2);
  });
  applyPanelWidth();
  bindEvents();
  syncOverviewCard();
  renderAll();
}

function bindEvents() {
  dom.dimensionCount.addEventListener("change", (event) => {
    const count = clamp(Number(event.target.value) || 2, 2, 8);
    createDefaultDimensions(count);
    renderAll();
  });

  dom.regeneratePositions.addEventListener("click", () => {
    randomizeAllSubcategoryPositions();
    renderVisualization();
  });

  dom.exportJson.addEventListener("click", exportModelAsJson);
  dom.exportOverview.addEventListener("click", exportOverviewAsSvg);
  dom.exportOverviewPng.addEventListener("click", exportOverviewAsPng);
  dom.overviewToggle.addEventListener("click", toggleOverviewCard);
  dom.importJsonTrigger.addEventListener("click", () => {
    dom.importJsonInput.click();
  });
  dom.importJsonInput.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;

    try {
      const content = await file.text();
      const payload = JSON.parse(content);
      importModelFromJson(payload);
      dom.ioStatus.textContent = `Imported configuration from ${file.name}.`;
    } catch (error) {
      dom.ioStatus.textContent =
        "Import failed. Please choose a valid maturity model JSON file.";
    } finally {
      dom.importJsonInput.value = "";
    }
  });

  dom.panelResizer.addEventListener("mousedown", (event) => {
    if (window.innerWidth <= SPLIT_LAYOUT_BREAKPOINT) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.panelWidth;
    dom.panelResizer.classList.add("is-dragging");

    const handleMove = (moveEvent) => {
      const nextWidth = clamp(startWidth + (moveEvent.clientX - startX), 320, 760);
      state.panelWidth = nextWidth;
      applyPanelWidth();
    };

    const handleUp = () => {
      dom.panelResizer.classList.remove("is-dragging");
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  });

  dom.yawControl.addEventListener("input", (event) => {
    state.camera.yaw = degreesToRadians(Number(event.target.value));
    renderVisualization();
  });

  dom.pitchControl.addEventListener("input", (event) => {
    state.camera.pitch = degreesToRadians(Number(event.target.value));
    renderVisualization();
  });

  dom.zoomControl.addEventListener("input", (event) => {
    state.camera.zoom = clamp(Number(event.target.value) / 100, 0.7, 1.75);
    renderVisualization();
  });

  dom.svg.addEventListener("mousemove", (event) => {
    positionTooltip(event);
  });
  dom.svg.addEventListener("mouseleave", hideTooltip);
  dom.svg.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  dom.svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const nextZoom = clamp(state.camera.zoom - event.deltaY * 0.0012, 0.7, 1.75);
      state.camera.zoom = nextZoom;
      renderVisualization();
    },
    { passive: false }
  );

  dom.svg.addEventListener("mousedown", (event) => {
    if (event.button !== 2) return;
    event.preventDefault();
    state.drag.active = true;
    state.drag.moved = false;
    state.drag.startX = event.clientX;
    state.drag.startY = event.clientY;
    state.drag.originYaw = state.camera.yaw;
    state.drag.originPitch = state.camera.pitch;
    dom.svg.classList.add("is-rotating");
    hideTooltip();
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.drag.active) return;
    const dx = event.clientX - state.drag.startX;
    const dy = event.clientY - state.drag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      state.drag.moved = true;
    }
    state.camera.yaw = state.drag.originYaw + dx * 0.0085;
    state.camera.pitch = clamp(state.drag.originPitch + dy * 0.006, 0.32, 1.42);
    renderVisualization();
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button !== 2) return;
    state.drag.active = false;
    state.drag.moved = false;
    dom.svg.classList.remove("is-rotating");
  });

  dom.svg.addEventListener("dblclick", (event) => {
    const target = event.target.closest("[data-column-id]");
    if (!target) return;
    state.movingSubcategoryId = target.dataset.columnId;
    state.relocateDrag.active = false;
    renderVisualization();
  });

  dom.svg.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || !state.movingSubcategoryId) return;
    const subcategory = findSubcategoryById(state.movingSubcategoryId);
    if (!subcategory) return;

    const screenPoint = getSvgPoint(event);
    const projectedRegion = getProjectedRegionPolygon(subcategory.dimensionIndex);
    if (!isPointInPolygon(screenPoint, projectedRegion)) return;

    state.relocateDrag.active = true;
    event.preventDefault();
    hideTooltip();
    updateRelocation(event);
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.relocateDrag.active || !state.movingSubcategoryId) return;
    updateRelocation(event);
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button !== 0 || !state.relocateDrag.active) return;
    state.relocateDrag.active = false;
    state.movingSubcategoryId = null;
    renderVisualization();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.movingSubcategoryId || state.relocateDrag.active) {
        state.movingSubcategoryId = null;
        state.relocateDrag.active = false;
        renderVisualization();
      }
      return;
    }

    if (event.key.toLowerCase() === "r") {
      state.camera = { ...DEFAULT_CAMERA };
      renderVisualization();
    }
  });

  window.addEventListener("resize", () => {
    applyPanelWidth();
  });
}

function applyPanelWidth() {
  if (window.innerWidth <= SPLIT_LAYOUT_BREAKPOINT) {
    dom.appShell.style.gridTemplateColumns = "1fr";
    return;
  }
  dom.appShell.style.gridTemplateColumns = `${state.panelWidth}px 12px minmax(0, 1fr)`;
}

function updateRelocation(event) {
  const subcategory = findSubcategoryById(state.movingSubcategoryId);
  if (!subcategory) return;

  const screenPoint = getSvgPoint(event);
  const projectedRegion = getProjectedRegionPolygon(subcategory.dimensionIndex);
  if (!isPointInPolygon(screenPoint, projectedRegion)) return;

  const worldPoint = screenToWorld(event);
  const region = getRegionGeometry()[subcategory.dimensionIndex];
  if (!isPointInPolygon(worldPoint, region.polygon)) return;

  subcategory.position = worldPoint;
  renderVisualization();
}

function exportModelAsJson() {
  const payload = serializeState();
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  link.href = url;
  link.download = `maturity-model-${timestamp}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  dom.ioStatus.textContent = `Exported configuration as ${link.download}.`;
}

function exportOverviewAsSvg() {
  const markup = buildOverviewSvgMarkup(true);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  link.href = url;
  link.download = `maturity-model-overview-${timestamp}.svg`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  dom.ioStatus.textContent = `Exported top view snapshot as ${link.download}.`;
}

function exportOverviewAsPng() {
  const overview = buildOverviewSvgData();
  const markup = buildOverviewSvgMarkup(true, overview);
  const svgBlob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();

  image.onload = () => {
    const aspectRatio = overview.width / overview.height || 1;
    const longestEdge = 1600;
    const canvas = document.createElement("canvas");
    if (aspectRatio >= 1) {
      canvas.width = longestEdge;
      canvas.height = Math.max(1, Math.round(longestEdge / aspectRatio));
    } else {
      canvas.height = longestEdge;
      canvas.width = Math.max(1, Math.round(longestEdge * aspectRatio));
    }
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(svgUrl);
      dom.ioStatus.textContent = "PNG export failed. Canvas rendering is unavailable.";
      return;
    }
    context.imageSmoothingEnabled = true;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(svgUrl);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
      link.href = pngUrl;
      link.download = `maturity-model-overview-${timestamp}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(pngUrl);
      dom.ioStatus.textContent = `Exported top view snapshot as ${link.download}.`;
    }, "image/png");
  };

  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    dom.ioStatus.textContent = "PNG export failed. Please try again.";
  };

  image.src = svgUrl;
}

function importModelFromJson(payload) {
  const normalized = normalizeImportedState(payload);
  state.dimensions = normalized.dimensions;
  state.subcategoriesByDimension = normalized.subcategoriesByDimension;
  state.camera = normalized.camera;
  state.movingSubcategoryId = null;
  state.relocateDrag.active = false;
  state.drag.active = false;
  state.drag.moved = false;
  renderAll();
}

function serializeState() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    camera: {
      yaw: Number(state.camera.yaw.toFixed(6)),
      pitch: Number(state.camera.pitch.toFixed(6)),
      zoom: Number(state.camera.zoom.toFixed(4)),
    },
    dimensions: state.dimensions.map((dimension, index) => ({
      id: dimension.id,
      name: dimension.name,
      color: dimension.color,
      subcategories: getDimensionSubcategories(dimension.id).map((item) => ({
        id: item.id,
        name: item.name,
        score: item.score,
        diameter: item.diameter,
        position: {
          x: Number(item.position.x.toFixed(3)),
          y: Number(item.position.y.toFixed(3)),
        },
        dimensionIndex: index,
      })),
    })),
  };
}

function normalizeImportedState(payload) {
  if (!payload || !Array.isArray(payload.dimensions) || payload.dimensions.length < 2) {
    throw new Error("Invalid payload");
  }

  const importedDimensions = payload.dimensions.slice(0, 8).map((dimension, index) => ({
    id: sanitizeId(dimension.id || `dimension-${index + 1}`),
    name:
      typeof dimension.name === "string" && dimension.name.trim()
        ? dimension.name.trim()
        : `Dimension ${index + 1}`,
    color: isHexColor(dimension.color)
      ? dimension.color
      : pastelPalette[index % pastelPalette.length],
  }));

  const subcategoriesByDimension = {};
  importedDimensions.forEach((dimension, index) => {
    const rawSubcategories = Array.isArray(payload.dimensions[index]?.subcategories)
      ? payload.dimensions[index].subcategories
      : [];
    const region = getRegionGeometryForDimensions(importedDimensions)[index];
    subcategoriesByDimension[dimension.id] = rawSubcategories.slice(0, 12).map((item, itemIndex) => {
      const fallbackPosition = randomPointInPolygon(region.polygon);
      const importedPosition = item?.position;
      const position =
        importedPosition &&
        Number.isFinite(importedPosition.x) &&
        Number.isFinite(importedPosition.y) &&
        isPointInPolygon(importedPosition, region.polygon)
          ? { x: importedPosition.x, y: importedPosition.y }
          : fallbackPosition;

      return {
        id: sanitizeId(item?.id || `${dimension.id}-subcategory-${itemIndex + 1}`),
        name:
          typeof item?.name === "string" && item.name.trim()
            ? item.name.trim()
            : `Subcategory ${itemIndex + 1}`,
        score: clamp(Number(item?.score) || 0, 0, 100),
        diameter: clamp(Number(item?.diameter) || 10, 10, 48),
        dimensionId: dimension.id,
        dimensionIndex: index,
        position,
      };
    });
  });

  const importedCamera = payload.camera || {};
  const camera = {
    yaw: Number.isFinite(importedCamera.yaw) ? importedCamera.yaw : DEFAULT_CAMERA.yaw,
    pitch: clamp(
      Number.isFinite(importedCamera.pitch) ? importedCamera.pitch : DEFAULT_CAMERA.pitch,
      0.32,
      1.42
    ),
    zoom: clamp(
      Number.isFinite(importedCamera.zoom) ? importedCamera.zoom : DEFAULT_CAMERA.zoom,
      0.7,
      1.75
    ),
  };

  return {
    dimensions: importedDimensions,
    subcategoriesByDimension,
    camera,
  };
}

function createDefaultDimensions(count) {
  const existing = state.dimensions;
  state.dimensions = Array.from({ length: count }, (_, index) => {
    const current = existing[index];
    const color = current?.color || pastelPalette[index % pastelPalette.length];
    return {
      id: `dimension-${index + 1}`,
      name: current?.name || `Dimension ${index + 1}`,
      color,
    };
  });

  const nextSubcategories = {};
  state.dimensions.forEach((dimension, index) => {
    const existingList =
      state.subcategoriesByDimension[dimension.id] ||
      state.subcategoriesByDimension[`dimension-${index + 1}`] ||
      [];
    nextSubcategories[dimension.id] = existingList.map((item, itemIndex) => ({
      ...item,
      id: item.id || `${dimension.id}-subcategory-${itemIndex + 1}`,
      dimensionId: dimension.id,
      dimensionIndex: index,
      position: item.position || randomPointInPolygon(getRegionGeometry()[index].polygon),
    }));
  });

  state.subcategoriesByDimension = nextSubcategories;
  state.movingSubcategoryId = null;
}

function renderAll() {
  dom.dimensionCount.value = String(state.dimensions.length);
  renderDimensionTable();
  renderSubcategoryControls();
  renderVisualization();
}

function renderDimensionTable() {
  const rows = state.dimensions
    .map(
      (dimension, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>
            <input
              type="text"
              data-dimension-name="${dimension.id}"
              value="${escapeAttribute(dimension.name)}"
            />
          </td>
          <td>
            <input
              type="color"
              data-dimension-color="${dimension.id}"
              value="${dimension.color}"
            />
          </td>
        </tr>
      `
    )
    .join("");

  dom.dimensionTableWrapper.innerHTML = `
    <p class="dimension-help">
      Choose at least 2 dimensions. With 3 dimensions, the base becomes an
      equilateral triangle. With more dimensions, it becomes a regular polygon.
    </p>
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Dimension Name</th>
          <th>Region Color</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  dom.dimensionTableWrapper
    .querySelectorAll("[data-dimension-name]")
    .forEach((input) => {
      input.addEventListener("input", (event) => {
        const id = event.target.dataset.dimensionName;
        const dimension = state.dimensions.find((item) => item.id === id);
        if (!dimension) return;
        dimension.name = event.target.value || "Unnamed Dimension";
        renderSubcategoryControls();
        renderVisualization();
      });
    });

  dom.dimensionTableWrapper
    .querySelectorAll("[data-dimension-color]")
    .forEach((input) => {
      input.addEventListener("input", (event) => {
        const id = event.target.dataset.dimensionColor;
        const dimension = state.dimensions.find((item) => item.id === id);
        if (!dimension) return;
        dimension.color = event.target.value;
        renderSubcategoryControls();
        renderVisualization();
      });
    });
}

function renderSubcategoryControls() {
  const ready = state.dimensions.length >= 2;
  dom.regeneratePositions.disabled = !ready;

  if (!ready) {
    dom.subcategoryStatus.textContent =
      "Add at least two dimensions before configuring subcategories.";
    dom.subcategoryGroups.innerHTML =
      '<div class="empty-state">Subcategory inputs are locked until the dimension setup is ready.</div>';
    return;
  }

  dom.subcategoryStatus.textContent =
    "Each group inherits the region color. Double-click a column to enter relocate mode, then drag it with the left mouse button. Right-drag rotates the 3D view, and R resets the camera.";

  dom.subcategoryGroups.innerHTML = state.dimensions
    .map((dimension) => {
      const items = getDimensionSubcategories(dimension.id);
      const darkColor = darkenColor(dimension.color, 0.38);
      return `
        <section class="subcategory-group">
          <div class="group-header" style="background:${hexToRgba(
            dimension.color,
            0.35
          )}">
            <div>
              <h3>${escapeHtml(dimension.name)}</h3>
              <p>${items.length} subcategories configured</p>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="group-color-chip" style="background:${darkColor}"></span>
              <label class="count-control">
                <span>Items</span>
                <input
                  type="number"
                  min="0"
                  max="12"
                  step="1"
                  data-subcategory-count="${dimension.id}"
                  value="${items.length}"
                />
              </label>
            </div>
          </div>
          ${
            items.length
              ? `<table class="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Score</th>
                      <th>Level</th>
                      <th>Diameter</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items
                      .map(
                        (item) => `
                          <tr>
                            <td>
                              <input
                                type="text"
                                data-subcategory-name="${item.id}"
                                value="${escapeAttribute(item.name)}"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                data-subcategory-score="${item.id}"
                                value="${item.score}"
                              />
                            </td>
                            <td>
                              <div class="level-pill" data-level-display="${item.id}">
                                ${getLevelFromScore(item.score)}
                              </div>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="10"
                                max="48"
                                step="1"
                                data-subcategory-size="${item.id}"
                                value="${item.diameter}"
                              />
                            </td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>`
              : '<div class="empty-state">No subcategories in this dimension yet.</div>'
          }
        </section>
      `;
    })
    .join("");

  dom.subcategoryGroups
    .querySelectorAll("[data-subcategory-count]")
    .forEach((input) => {
      input.addEventListener("change", (event) => {
        const dimensionId = event.target.dataset.subcategoryCount;
        const count = clamp(Number(event.target.value) || 0, 0, 12);
        updateSubcategoryCount(dimensionId, count);
        renderSubcategoryControls();
        renderVisualization();
      });
    });

  dom.subcategoryGroups
    .querySelectorAll("[data-subcategory-name]")
    .forEach((input) => {
      input.addEventListener("input", (event) => {
        const item = findSubcategoryById(event.target.dataset.subcategoryName);
        if (!item) return;
        item.name = event.target.value || "Unnamed Subcategory";
        renderVisualization();
      });
    });

  dom.subcategoryGroups
    .querySelectorAll("[data-subcategory-score]")
    .forEach((input) => {
      input.addEventListener("input", (event) => {
        const item = findSubcategoryById(event.target.dataset.subcategoryScore);
        if (!item) return;
        item.score = clamp(Number(event.target.value) || 0, 0, 100);
        const levelDisplay = dom.subcategoryGroups.querySelector(
          `[data-level-display="${item.id}"]`
        );
        if (levelDisplay) {
          levelDisplay.textContent = `${getLevelFromScore(item.score)}`;
        }
        renderVisualization();
      });
    });

  dom.subcategoryGroups
    .querySelectorAll("[data-subcategory-size]")
    .forEach((input) => {
      input.addEventListener("input", (event) => {
        const item = findSubcategoryById(event.target.dataset.subcategorySize);
        if (!item) return;
        item.diameter = clamp(Number(event.target.value) || 10, 10, 48);
        renderVisualization();
      });
    });

}

function updateSubcategoryCount(dimensionId, count) {
  const dimensionIndex = state.dimensions.findIndex((item) => item.id === dimensionId);
  if (dimensionIndex < 0) return;

  const list = getDimensionSubcategories(dimensionId);
  if (list.length > count) {
    state.subcategoriesByDimension[dimensionId] = list.slice(0, count);
    if (
      state.movingSubcategoryId &&
      !state.subcategoriesByDimension[dimensionId].some(
        (item) => item.id === state.movingSubcategoryId
      )
    ) {
      state.movingSubcategoryId = null;
    }
    return;
  }

  const additions = [];
  for (let i = list.length; i < count; i += 1) {
    additions.push(createSubcategory(dimensionId, dimensionIndex, i));
  }
  state.subcategoriesByDimension[dimensionId] = [...list, ...additions];
}

function createSubcategory(dimensionId, dimensionIndex, index) {
  return {
    id: `${dimensionId}-subcategory-${index + 1}`,
    name: `Subcategory ${index + 1}`,
    score: 20 + ((index * 13) % 55),
    diameter: 10,
    dimensionId,
    dimensionIndex,
    position: randomPointInPolygon(getRegionGeometry()[dimensionIndex].polygon),
  };
}

function getDimensionSubcategories(dimensionId) {
  if (!state.subcategoriesByDimension[dimensionId]) {
    state.subcategoriesByDimension[dimensionId] = [];
  }
  return state.subcategoriesByDimension[dimensionId];
}

function randomizeAllSubcategoryPositions() {
  const geometries = getRegionGeometry();
  state.dimensions.forEach((dimension, index) => {
    const geometry = geometries[index];
    getDimensionSubcategories(dimension.id).forEach((item) => {
      item.position = randomPointInPolygon(geometry.polygon);
    });
  });
  state.movingSubcategoryId = null;
  state.relocateDrag.active = false;
  renderSubcategoryControls();
}

function renderVisualization() {
  syncCameraControls();
  const scene = getSceneGeometry();
  const regions = getRegionGeometry();
  const allSubcategories = state.dimensions.flatMap((dimension) =>
    getDimensionSubcategories(dimension.id)
  );

  const projectedRegions = regions.map((region, index) => ({
    index,
    ...region,
    projected: region.polygon.map((point) => projectPoint({ ...point, z: 0 })),
    dimension: state.dimensions[index],
  }));

  const regionMarkup = projectedRegions
    .slice()
    .sort(
      (a, b) =>
        centroid(b.projected).y - centroid(a.projected).y ||
        centroid(a.projected).x - centroid(b.projected).x
    )
    .map((region) => {
      const items = getDimensionSubcategories(region.dimension.id);
      const labelPlacement = getMainDimensionLabelPlacement(scene, region.index);
      const tooltip = [
        `<strong>${escapeHtml(region.dimension.name)}</strong>`,
        `Subcategories: ${items.length}`,
        items.length
          ? `Items: ${items.map((item) => escapeHtml(item.name)).join(", ")}`
          : "Items: none yet",
      ].join("<br/>");

      return `
        <g class="region-group">
          <polygon
            class="region-shape"
            data-region-index="${region.index}"
            data-tooltip="${escapeAttribute(tooltip)}"
            points="${pointsToString(region.projected)}"
            fill="${region.dimension.color}"
          />
          <text
            class="region-label"
            x="${labelPlacement.x}"
            y="${labelPlacement.y}"
            transform="rotate(${labelPlacement.angle} ${labelPlacement.x} ${labelPlacement.y})"
          >
            ${escapeHtml(region.dimension.name)}
          </text>
        </g>
      `;
    })
    .join("");

  const centerLines =
    state.dimensions.length === 2
      ? (() => {
          const top = projectPoint({ x: 0, y: scene.bounds.top, z: 0 });
          const bottom = projectPoint({ x: 0, y: scene.bounds.bottom, z: 0 });
          return `<line class="center-line" x1="${top.x}" y1="${top.y}" x2="${bottom.x}" y2="${bottom.y}" />`;
        })()
      : scene.vertices
          .map((vertex) => {
            const from = projectPoint({ x: 0, y: 0, z: 0 });
            const to = projectPoint({ ...vertex, z: 0 });
            return `
              <line
                class="center-line"
                x1="${from.x}"
                y1="${from.y}"
                x2="${to.x}"
                y2="${to.y}"
              />
            `;
          })
          .join("");

  const columnsMarkup = allSubcategories
    .map((item) => renderColumn(item))
    .sort((a, b) => b.depth - a.depth)
    .map((entry) => entry.markup)
    .join("");

  const moveIndicator = state.movingSubcategoryId
    ? renderMoveIndicator(findSubcategoryById(state.movingSubcategoryId))
    : "";

  dom.svg.innerHTML = `
    <defs>
      <linearGradient id="floor-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fffdfa" />
        <stop offset="100%" stop-color="#ece4d8" />
      </linearGradient>
    </defs>

    <rect x="28" y="28" width="924" height="704" rx="28" class="helper-banner" fill="url(#floor-gradient)" />

    <g>
      <polygon class="axis-line floor-outline" points="${pointsToString(
        scene.vertices.map((vertex) => projectPoint({ ...vertex, z: 0 }))
      )}" fill="rgba(255,255,255,0.08)" />
      ${centerLines}
      ${regionMarkup}
      ${moveIndicator}
      ${columnsMarkup}
    </g>
  `;

  attachVisualizationEvents();
  updateInteractionHint();
  renderOverviewMap();
}

function attachVisualizationEvents() {
  dom.svg.querySelectorAll("[data-tooltip]").forEach((element) => {
    element.addEventListener("mouseenter", (event) => {
      showTooltip(event.currentTarget.dataset.tooltip);
    });
    element.addEventListener("mousemove", positionTooltip);
    element.addEventListener("mouseleave", hideTooltip);
  });
}

function renderColumn(item) {
  const dimension = state.dimensions[item.dimensionIndex];
  const bodyColor = darkenColor(dimension.color, 0.38);
  const sideColor = darkenColor(dimension.color, 0.5);
  const topColor = darkenColor(dimension.color, 0.16);
  const glassStroke = darkenColor(dimension.color, 0.28);
  const glassFill = hexToRgba(dimension.color, 0.1);
  const liquidFill = hexToRgba(bodyColor, 0.76);
  const liquidSideFill = hexToRgba(sideColor, 0.84);
  const radius = item.diameter * 0.72;
  const maxHeight = 40 + 100 * 1.85;
  const fillHeight = (item.score / 100) * maxHeight;
  const samples = 18;
  const level = getLevelFromScore(item.score);

  const bottomPoints = [];
  const topPoints = [];
  const liquidTopPoints = [];
  const glassPanels = [];
  const liquidPanels = [];
  const guideRings = [];

  for (let i = 0; i < samples; i += 1) {
    const angle = (Math.PI * 2 * i) / samples;
    const offsetX = Math.cos(angle) * radius;
    const offsetY = Math.sin(angle) * radius;
    const baseWorld = {
      x: item.position.x + offsetX,
      y: item.position.y + offsetY,
      z: 0,
    };
    const topWorld = {
      x: item.position.x + offsetX,
      y: item.position.y + offsetY,
      z: maxHeight,
    };
    const liquidTopWorld = {
      x: item.position.x + offsetX,
      y: item.position.y + offsetY,
      z: fillHeight,
    };
    bottomPoints.push(projectPoint(baseWorld));
    topPoints.push(projectPoint(topWorld));
    liquidTopPoints.push(projectPoint(liquidTopWorld));
  }

  for (let i = 0; i < samples; i += 1) {
    const next = (i + 1) % samples;
    const glassDepth =
      (bottomPoints[i].depth +
        bottomPoints[next].depth +
        topPoints[i].depth +
        topPoints[next].depth) /
      4;
    glassPanels.push({
      depth: glassDepth,
      markup: `
        <polygon
          class="column-shell"
          points="${pointsToString([
            bottomPoints[i],
            bottomPoints[next],
            topPoints[next],
            topPoints[i],
          ])}"
          fill="${glassFill}"
          stroke="${hexToRgba(glassStroke, 0.32)}"
          stroke-width="1"
        />
      `,
    });

    if (fillHeight > 0.0001) {
      const liquidDepth =
        (bottomPoints[i].depth +
          bottomPoints[next].depth +
          liquidTopPoints[i].depth +
          liquidTopPoints[next].depth) /
        4;
      liquidPanels.push({
        depth: liquidDepth,
        markup: `
          <polygon
            class="column-body"
            points="${pointsToString([
              bottomPoints[i],
              bottomPoints[next],
              liquidTopPoints[next],
              liquidTopPoints[i],
            ])}"
            fill="${i < samples / 2 ? liquidFill : liquidSideFill}"
          />
        `,
      });
    }
  }

  for (let guide = 1; guide <= 5; guide += 1) {
    const guideHeight = (guide / 5) * maxHeight;
    const guidePoints = [];
    for (let i = 0; i < samples; i += 1) {
      const angle = (Math.PI * 2 * i) / samples;
      guidePoints.push(
        projectPoint({
          x: item.position.x + Math.cos(angle) * radius,
          y: item.position.y + Math.sin(angle) * radius,
          z: guideHeight,
        })
      );
    }
    const guideCenter = projectPoint({
      x: item.position.x,
      y: item.position.y,
      z: guideHeight,
    });
    guideRings.push({
      depth: guideCenter.depth,
      markup: `
        <polygon
          class="level-guide"
          points="${pointsToString(guidePoints)}"
        />
      `,
    });
  }

  const topCenter = projectPoint({
    x: item.position.x,
    y: item.position.y,
    z: maxHeight,
  });
  const liquidTopCenter = projectPoint({
    x: item.position.x,
    y: item.position.y,
    z: fillHeight,
  });
  const baseCenter = projectPoint({
    x: item.position.x,
    y: item.position.y,
    z: 0,
  });

  const tooltip = [
    `<strong>${escapeHtml(item.name)}</strong>`,
    `Dimension: ${escapeHtml(dimension.name)}`,
    `Score: ${item.score}`,
    `Level: ${level}`,
    `Diameter: ${item.diameter}`,
  ].join("<br/>");

  const selectedClass =
    state.movingSubcategoryId === item.id ? "column-selected" : "";

  return {
    depth: baseCenter.depth,
    markup: `
      <g
        class="${selectedClass}"
        data-column-id="${item.id}"
        data-tooltip="${escapeAttribute(tooltip)}"
        style="cursor:${state.movingSubcategoryId === item.id ? "grabbing" : "pointer"};"
      >
        ${glassPanels
          .sort((a, b) => b.depth - a.depth)
          .map((panel) => panel.markup)
          .join("")}
        ${guideRings
          .sort((a, b) => b.depth - a.depth)
          .map((ring) => ring.markup)
          .join("")}
        ${liquidPanels
          .sort((a, b) => b.depth - a.depth)
          .map((panel) => panel.markup)
          .join("")}
        <polygon class="column-base" points="${pointsToString(bottomPoints)}" fill="${hexToRgba(
          darkenColor(topColor, 0.12),
          0.38
        )}" />
        ${
          fillHeight > 0.0001
            ? `<polygon class="column-liquid-top" points="${pointsToString(liquidTopPoints)}" fill="${topColor}" />`
            : ""
        }
        <polygon
          class="column-top column-rim"
          points="${pointsToString(topPoints)}"
          fill="${hexToRgba(topColor, 0.12)}"
          stroke="${hexToRgba(glassStroke, 0.6)}"
          stroke-width="1.2"
        />
        <text class="column-label" x="${topCenter.x}" y="${topCenter.y - 14}">
          ${escapeHtml(item.name)}
        </text>
        <text class="column-level-label" x="${liquidTopCenter.x}" y="${liquidTopCenter.y - 6}">
          L${level}
        </text>
      </g>
    `,
  };
}

function renderMoveIndicator(subcategory) {
  if (!subcategory) return "";
  const region = getRegionGeometry()[subcategory.dimensionIndex];
  const projected = region.polygon.map((point) => projectPoint({ ...point, z: 0 }));
  const label = projectPoint({ ...centroid(region.polygon), z: 0 });
  return `
    <g>
      <polygon class="move-indicator" points="${pointsToString(projected)}" />
      <text class="legend-note" x="${label.x}" y="${label.y + 24}">
        Double-click ${escapeHtml(subcategory.name)} and drag it inside this region
      </text>
    </g>
  `;
}

function updateInteractionHint() {
  const moving = state.movingSubcategoryId
    ? findSubcategoryById(state.movingSubcategoryId)
    : null;
  dom.interactionHint.textContent = moving
    ? `Relocate mode: left-drag ${moving.name} inside ${state.dimensions[moving.dimensionIndex].name}. Right-drag or the sliders still control the camera.`
    : "Right-drag or use the control sliders to rotate the view. Use the mouse wheel or zoom slider to move nearer or farther.";
}

function renderOverviewMap() {
  const overview = buildOverviewSvgData();
  dom.overviewSvg.setAttribute("viewBox", overview.viewBox);
  dom.overviewSvg.innerHTML = overview.markup;
}

function buildOverviewSvgMarkup(includeXmlns = false, overview = buildOverviewSvgData()) {
  const xmlns = includeXmlns ? ' xmlns="http://www.w3.org/2000/svg"' : "";
  return `<svg${xmlns} viewBox="${overview.viewBox}" width="${overview.width}" height="${overview.height}" aria-label="Top view state map">
${overview.markup}
</svg>\n`;
}

function buildOverviewSvgData() {
  const width = OVERVIEW_BASE_SIZE;
  const height = OVERVIEW_BASE_SIZE;
  const padding = OVERVIEW_PADDING;
  const sourceScene = getSceneGeometryForDimensions(state.dimensions);
  const sourceRegions = getRegionGeometryForDimensions(state.dimensions);
  const targetScene = getSceneGeometryForDimensions(state.dimensions);
  const targetRegions = getRegionGeometryForDimensions(state.dimensions);
  const allSubcategories = state.dimensions.flatMap((dimension) =>
    getDimensionSubcategories(dimension.id)
  );
  const regionOrder = getOverviewDimensionOrder();
  const regionSlotByActual = new Map(regionOrder.map((actualIndex, slotIndex) => [actualIndex, slotIndex]));
  const rawPoints = [
    ...targetScene.vertices,
    ...targetRegions.flatMap((region) => region.polygon),
    ...allSubcategories.map((item) => {
      const slotIndex = regionSlotByActual.get(item.dimensionIndex) ?? item.dimensionIndex;
      return mapPointToOverviewRegion(
        item.position,
        sourceRegions[item.dimensionIndex],
        targetRegions[slotIndex]
      );
    }),
  ];
  const bounds = rawPoints.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((width - padding * 2) / worldWidth, (height - padding * 2) / worldHeight);
  const offsetX = (width - worldWidth * scale) / 2 - bounds.minX * scale;
  const offsetY = (height - worldHeight * scale) / 2 - bounds.minY * scale;
  const outlinePoints = targetScene.vertices.map((point) =>
    worldToOverviewPoint(point, scale, offsetX, offsetY)
  );
  const center = centroid(outlinePoints);
  const outerRadius = Math.max(
    ...outlinePoints.map((point) => Math.hypot(point.x - center.x, point.y - center.y))
  );
  const labelBoxes = [];
  const contentBounds = createBounds();

  outlinePoints.forEach((point) => expandBoundsWithPoint(contentBounds, point));

  const regionMarkup = regionOrder
    .map((actualIndex, slotIndex) => {
      const dimension = state.dimensions[actualIndex];
      const projected = targetRegions[slotIndex].polygon.map((point) =>
        worldToOverviewPoint(point, scale, offsetX, offsetY)
      );
      projected.forEach((point) => expandBoundsWithPoint(contentBounds, point));
      const labelPlacement = getOverviewDimensionLabelPlacement(
        targetScene,
        slotIndex,
        state.dimensions.length,
        scale,
        offsetX,
        offsetY
      );
      return `
        <g>
          <polygon
            class="overview-region"
            points="${pointsToString(projected)}"
            fill="${hexToRgba(dimension.color, 0.45)}"
          />
          <text
            class="overview-dimension-label"
            x="${labelPlacement.x}"
            y="${labelPlacement.y}"
            transform="rotate(${labelPlacement.angle} ${labelPlacement.x} ${labelPlacement.y})"
          >
            ${escapeHtml(dimension.name)}
          </text>
        </g>
      `;
    })
    .join("");

  const pointsMarkup = allSubcategories
    .map((item) => {
      const dimension = state.dimensions[item.dimensionIndex];
      const slotIndex = regionSlotByActual.get(item.dimensionIndex) ?? item.dimensionIndex;
      const mappedPoint = mapPointToOverviewRegion(
        item.position,
        sourceRegions[item.dimensionIndex],
        targetRegions[slotIndex]
      );
      const point = worldToOverviewPoint(mappedPoint, scale, offsetX, offsetY);
      const pointRadius = Math.max(4, item.diameter * 0.45);
      expandBoundsWithCircle(contentBounds, point, pointRadius);
      const label = placeOverviewLabel(
        item.name,
        point,
        pointRadius,
        center,
        outerRadius,
        labelBoxes
      );
      expandBoundsWithBox(contentBounds, label.box);
      if (label.withLeader) {
        expandBoundsWithLine(contentBounds, label.lineStart, label.lineEnd, 2);
      }
      return `
        <g>
          <circle
            class="overview-point"
            cx="${point.x}"
            cy="${point.y}"
            r="${pointRadius}"
            fill="${darkenColor(dimension.color, 0.34)}"
          />
          ${
            label.withLeader
              ? `<line
                  class="overview-leader"
                  x1="${label.lineStart.x}"
                  y1="${label.lineStart.y}"
                  x2="${label.lineEnd.x}"
                  y2="${label.lineEnd.y}"
                />`
              : ""
          }
          ${renderOverviewLabelText(label)}
        </g>
      `;
    })
    .join("");

  const finalBounds = finalizeBounds(contentBounds, {
    minX: 0,
    minY: 0,
    maxX: width,
    maxY: height,
  });
  const paddingAroundContent = 16;
  const minX = Math.min(0, finalBounds.minX - paddingAroundContent);
  const minY = Math.min(0, finalBounds.minY - paddingAroundContent);
  const maxX = Math.max(width, finalBounds.maxX + paddingAroundContent);
  const maxY = Math.max(height, finalBounds.maxY + paddingAroundContent);

  return {
    viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`,
    width: maxX - minX,
    height: maxY - minY,
    markup: `
    <style>
      svg { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
      .overview-region { stroke: rgba(67, 57, 48, 0.22); stroke-width: 1.2; }
      .overview-outline { fill: none; stroke: rgba(52, 43, 37, 0.32); stroke-width: 1.4; }
      .overview-point { fill-opacity: 0.88; stroke: rgba(36, 31, 27, 0.46); stroke-width: 1.1; }
      .overview-dimension-label { fill: rgba(58, 58, 58, 0.72); font-size: 15px; font-weight: 800; text-anchor: middle; dominant-baseline: middle; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
      .overview-name { fill: rgba(20, 20, 20, 0.96); font-size: 10px; font-weight: 400; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
      .overview-leader { stroke: rgba(67, 57, 48, 0.44); stroke-width: 1; }
    </style>
    <rect
      x="${minX}"
      y="${minY}"
      width="${maxX - minX}"
      height="${maxY - minY}"
      rx="16"
      fill="rgba(255,255,255,0.96)"
    />
    <polygon class="overview-outline" points="${pointsToString(outlinePoints)}" />
    ${regionMarkup}
    ${pointsMarkup}
  `,
  };
}

function toggleOverviewCard() {
  state.overviewCollapsed = !state.overviewCollapsed;
  syncOverviewCard();
}

function syncOverviewCard() {
  dom.overviewCard.classList.toggle("is-collapsed", state.overviewCollapsed);
  dom.overviewContent.hidden = state.overviewCollapsed;
  dom.overviewToggle.setAttribute("aria-expanded", String(!state.overviewCollapsed));
  dom.overviewToggle.textContent = state.overviewCollapsed ? "Show Map" : "Collapse";
}

function worldToOverviewPoint(point, scale, offsetX, offsetY) {
  return {
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  };
}

function placeOverviewLabel(text, point, radius, center, outerRadius, boxes) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const norm = Math.hypot(dx, dy) || 1;
  const ux = dx / norm;
  const uy = dy / norm;
  const tangent = { x: -uy, y: ux };
  const layouts = buildOverviewLabelLayouts(text);
  const candidates = [];

  layouts.forEach((layout, layoutIndex) => {
    if (layout.width <= 108 || layout.lines.length > 1) {
      const directTop = point.y - radius - layout.height - 6;
      candidates.push(
        createOverviewLabelCandidate({
          layout,
          withLeader: false,
          textX: point.x,
          textY: directTop + OVERVIEW_LABEL_FONT_SIZE,
          anchor: "middle",
          priority: layoutIndex,
        })
      );
    }

    [16, 30, 46, 62].forEach((distance, distanceIndex) => {
      [0, 14, -14, 28, -28].forEach((shift, shiftIndex) => {
        const lineEnd = {
          x: center.x + ux * (outerRadius + distance) + tangent.x * shift,
          y: center.y + uy * (outerRadius + distance) + tangent.y * shift,
        };
        candidates.push(
          createOverviewLabelCandidate({
            layout,
            withLeader: true,
            lineStart: {
              x: point.x + ux * (radius + 2),
              y: point.y + uy * (radius + 2),
            },
            lineEnd,
            textX: lineEnd.x + ux * 12,
            textY: lineEnd.y - layout.height / 2 + OVERVIEW_LABEL_FONT_SIZE,
            anchor: ux >= 0 ? "start" : "end",
            priority: 10 + layoutIndex * 20 + distanceIndex * 5 + shiftIndex,
          })
        );
      });
    });
  });

  let bestCandidate = candidates[0];
  let bestScore = Infinity;

  candidates.forEach((candidate) => {
    const overlapCount = boxes.reduce(
      (count, box) => count + (boxesOverlap(box, candidate.box) ? 1 : 0),
      0
    );
    const score = overlapCount * 1000 + candidate.priority;
    if (score < bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  });

  boxes.push(bestCandidate.box);
  return bestCandidate;
}

function buildOverviewLabelLayouts(text) {
  const normalized = text.trim().replace(/\s+/g, " ");
  const layouts = [];
  const seen = new Set();

  const addLayout = (lines) => {
    const layout = createOverviewTextLayout(lines);
    if (!layout.lines.length) return;
    const key = layout.lines.join("|");
    if (seen.has(key)) return;
    seen.add(key);
    layouts.push(layout);
  };

  addLayout([normalized]);

  if (normalized.length > 24) {
    addLayout(wrapOverviewText(normalized, 24, 2));
  }
  if (normalized.length > 34) {
    addLayout(wrapOverviewText(normalized, 20, 3));
  }
  if (normalized.length > 48) {
    addLayout(wrapOverviewText(normalized, 17, 4));
  }

  return layouts;
}

function wrapOverviewText(text, targetLength, maxLines) {
  const words = text.split(" ");
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const tentative = current ? `${current} ${word}` : word;
    if (!current || tentative.length <= targetLength || lines.length + 1 >= maxLines) {
      current = tentative;
      return;
    }
    lines.push(current);
    current = word;
  });

  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")];
}

function createOverviewTextLayout(lines) {
  const normalizedLines = lines.map((line) => line.trim()).filter(Boolean);
  return {
    lines: normalizedLines,
    width: Math.max(34, ...normalizedLines.map(estimateOverviewTextWidth)),
    height: Math.max(
      OVERVIEW_LABEL_LINE_HEIGHT,
      normalizedLines.length * OVERVIEW_LABEL_LINE_HEIGHT
    ),
  };
}

function estimateOverviewTextWidth(text) {
  return text.length * 5.7 + 6;
}

function createOverviewLabelCandidate({
  layout,
  withLeader,
  textX,
  textY,
  anchor,
  lineStart = null,
  lineEnd = null,
  priority,
}) {
  return {
    layout,
    withLeader,
    textX,
    textY,
    anchor,
    lineStart,
    lineEnd,
    priority,
    box: getOverviewTextBox(layout, textX, textY, anchor),
  };
}

function getOverviewTextBox(layout, textX, textY, anchor) {
  const left =
    anchor === "middle"
      ? textX - layout.width / 2
      : anchor === "start"
        ? textX
        : textX - layout.width;
  return {
    x: left,
    y: textY - OVERVIEW_LABEL_FONT_SIZE,
    width: layout.width,
    height: layout.height,
  };
}

function renderOverviewLabelText(label) {
  if (label.layout.lines.length === 1) {
    return `
      <text
        class="overview-name"
        x="${label.textX}"
        y="${label.textY}"
        text-anchor="${label.anchor}"
      >
        ${escapeHtml(label.layout.lines[0])}
      </text>
    `;
  }

  return `
    <text
      class="overview-name"
      x="${label.textX}"
      y="${label.textY}"
      text-anchor="${label.anchor}"
    >
      ${label.layout.lines
        .map((line, index) =>
          index === 0
            ? `<tspan x="${label.textX}" y="${label.textY}">${escapeHtml(line)}</tspan>`
            : `<tspan x="${label.textX}" dy="${OVERVIEW_LABEL_LINE_HEIGHT}">${escapeHtml(line)}</tspan>`
        )
        .join("")}
    </text>
  `;
}

function createBounds() {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
}

function finalizeBounds(bounds, fallback) {
  if (Number.isFinite(bounds.minX)) {
    return bounds;
  }
  return fallback;
}

function expandBoundsWithPoint(bounds, point) {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function expandBoundsWithCircle(bounds, point, radius) {
  expandBoundsWithPoint(bounds, { x: point.x - radius, y: point.y - radius });
  expandBoundsWithPoint(bounds, { x: point.x + radius, y: point.y + radius });
}

function expandBoundsWithBox(bounds, box) {
  expandBoundsWithPoint(bounds, { x: box.x, y: box.y });
  expandBoundsWithPoint(bounds, { x: box.x + box.width, y: box.y + box.height });
}

function expandBoundsWithLine(bounds, start, end, padding = 0) {
  expandBoundsWithPoint(bounds, {
    x: Math.min(start.x, end.x) - padding,
    y: Math.min(start.y, end.y) - padding,
  });
  expandBoundsWithPoint(bounds, {
    x: Math.max(start.x, end.x) + padding,
    y: Math.max(start.y, end.y) + padding,
  });
}

function boxesOverlap(a, b) {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

function getOverviewDimensionOrder() {
  if (state.dimensions.length === 2) {
    const leftRegion = projectPoint({ ...centroid(getRegionGeometry()[0].polygon), z: 0 }).x;
    const rightRegion = projectPoint({ ...centroid(getRegionGeometry()[1].polygon), z: 0 }).x;
    return leftRegion <= rightRegion ? [0, 1] : [1, 0];
  }

  const projectedCenters = getRegionGeometry().map((region, index) => ({
    index,
    point: projectPoint({ ...centroid(region.polygon), z: 0 }),
  }));
  const center = centroid(projectedCenters.map((entry) => entry.point));
  return projectedCenters
    .map((entry) => ({
      index: entry.index,
      angle: normalizeClockwiseAngle(Math.atan2(entry.point.y - center.y, entry.point.x - center.x)),
    }))
    .sort((a, b) => a.angle - b.angle)
    .map((entry) => entry.index);
}

function getOverviewDimensionLabelPlacement(scene, slotIndex, totalSlots, scale, offsetX, offsetY) {
  if (totalSlots === 2) {
    const left = worldToOverviewPoint({ x: scene.bounds.left, y: 0 }, scale, offsetX, offsetY);
    const right = worldToOverviewPoint({ x: scene.bounds.right, y: 0 }, scale, offsetX, offsetY);
    return slotIndex === 0
      ? { x: left.x - 18, y: left.y, angle: -90 }
      : { x: right.x + 18, y: right.y, angle: 90 };
  }

  const start = scene.vertices[slotIndex];
  const end = scene.vertices[(slotIndex + 1) % scene.vertices.length];
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const polygonCenter = centroid(scene.vertices);
  const edgeVector = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  let normal = {
    x: edgeVector.y,
    y: -edgeVector.x,
  };
  const toCenter = {
    x: polygonCenter.x - midpoint.x,
    y: polygonCenter.y - midpoint.y,
  };
  if (normal.x * toCenter.x + normal.y * toCenter.y > 0) {
    normal = { x: -normal.x, y: -normal.y };
  }
  const normalLength = Math.hypot(normal.x, normal.y) || 1;
  const normalUnit = {
    x: normal.x / normalLength,
    y: normal.y / normalLength,
  };
  const offsetDistance = 24;
  const labelPoint = {
    x: midpoint.x + normalUnit.x * offsetDistance,
    y: midpoint.y + normalUnit.y * offsetDistance,
  };
  const projectedPoint = worldToOverviewPoint(labelPoint, scale, offsetX, offsetY);
  let angle = (Math.atan2(edgeVector.y, edgeVector.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return {
    x: projectedPoint.x,
    y: projectedPoint.y,
    angle,
  };
}

function getMainDimensionLabelPlacement(scene, slotIndex) {
  if (state.dimensions.length === 2) {
    const left = projectPoint({ x: scene.bounds.left, y: 0, z: 0 });
    const right = projectPoint({ x: scene.bounds.right, y: 0, z: 0 });
    return slotIndex === 0
      ? { x: left.x - 22, y: left.y, angle: -90 }
      : { x: right.x + 22, y: right.y, angle: 90 };
  }

  const projectedVertices = scene.vertices.map((vertex) => projectPoint({ ...vertex, z: 0 }));
  const start = projectedVertices[slotIndex];
  const end = projectedVertices[(slotIndex + 1) % projectedVertices.length];
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const polygonCenter = centroid(projectedVertices);
  const edgeVector = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  let normal = {
    x: edgeVector.y,
    y: -edgeVector.x,
  };
  const toCenter = {
    x: polygonCenter.x - midpoint.x,
    y: polygonCenter.y - midpoint.y,
  };
  if (normal.x * toCenter.x + normal.y * toCenter.y > 0) {
    normal = { x: -normal.x, y: -normal.y };
  }
  const normalLength = Math.hypot(normal.x, normal.y) || 1;
  const offsetDistance = 28;
  const x = midpoint.x + (normal.x / normalLength) * offsetDistance;
  const y = midpoint.y + (normal.y / normalLength) * offsetDistance;
  let angle = (Math.atan2(edgeVector.y, edgeVector.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return { x, y, angle };
}

function mapPointToOverviewRegion(point, sourceRegion, targetRegion) {
  if (sourceRegion.polygon.length === 3 && targetRegion.polygon.length === 3) {
    const weights = barycentricWeights(point, sourceRegion.polygon);
    return weightedPoint(
      [targetRegion.polygon[0], targetRegion.polygon[2], targetRegion.polygon[1]],
      weights
    );
  }

  const sourceBounds = polygonBounds(sourceRegion.polygon);
  const targetBounds = polygonBounds(targetRegion.polygon);
  const tx =
    sourceBounds.maxX === sourceBounds.minX
      ? 0.5
      : (point.x - sourceBounds.minX) / (sourceBounds.maxX - sourceBounds.minX);
  const ty =
    sourceBounds.maxY === sourceBounds.minY
      ? 0.5
      : (point.y - sourceBounds.minY) / (sourceBounds.maxY - sourceBounds.minY);
  return {
    x: targetBounds.minX + tx * (targetBounds.maxX - targetBounds.minX),
    y: targetBounds.minY + ty * (targetBounds.maxY - targetBounds.minY),
  };
}

function barycentricWeights(point, triangle) {
  const [a, b, c] = triangle;
  const denominator =
    (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 1e-9) {
    return [1 / 3, 1 / 3, 1 / 3];
  }
  const w1 =
    ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
  const w2 =
    ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
  const w3 = 1 - w1 - w2;
  return [w1, w2, w3];
}

function weightedPoint(points, weights) {
  return points.reduce(
    (acc, point, index) => ({
      x: acc.x + point.x * weights[index],
      y: acc.y + point.y * weights[index],
    }),
    { x: 0, y: 0 }
  );
}

function polygonBounds(points) {
  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
}

function normalizeClockwiseAngle(angle) {
  const normalized = angle + Math.PI / 2;
  return normalized >= 0 ? normalized : normalized + Math.PI * 2;
}

function getSceneGeometry() {
  if (state.dimensions.length === 2) {
    return {
      bounds: {
        left: -240,
        right: 240,
        top: -190,
        bottom: 190,
      },
      vertices: [
        { x: -240, y: -190 },
        { x: 240, y: -190 },
        { x: 240, y: 190 },
        { x: -240, y: 190 },
      ],
    };
  }

  const radius = 230;
  const startAngle = -Math.PI / 2;
  return {
    radius,
    vertices: state.dimensions.map((_, index) => {
      const angle = startAngle + (Math.PI * 2 * index) / state.dimensions.length;
      return {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      };
    }),
  };
}

function getRegionGeometry() {
  const scene = getSceneGeometry();

  if (state.dimensions.length === 2) {
    return [
      {
        polygon: [
          { x: scene.bounds.left, y: scene.bounds.top },
          { x: 0, y: scene.bounds.top },
          { x: 0, y: scene.bounds.bottom },
          { x: scene.bounds.left, y: scene.bounds.bottom },
        ],
      },
      {
        polygon: [
          { x: 0, y: scene.bounds.top },
          { x: scene.bounds.right, y: scene.bounds.top },
          { x: scene.bounds.right, y: scene.bounds.bottom },
          { x: 0, y: scene.bounds.bottom },
        ],
      },
    ];
  }

  return scene.vertices.map((vertex, index) => {
    const nextVertex = scene.vertices[(index + 1) % scene.vertices.length];
    return {
      polygon: [
        { x: 0, y: 0 },
        { x: vertex.x, y: vertex.y },
        { x: nextVertex.x, y: nextVertex.y },
      ],
    };
  });
}

function getRegionGeometryForDimensions(dimensions) {
  const scene = getSceneGeometryForDimensions(dimensions);

  if (dimensions.length === 2) {
    return [
      {
        polygon: [
          { x: scene.bounds.left, y: scene.bounds.top },
          { x: 0, y: scene.bounds.top },
          { x: 0, y: scene.bounds.bottom },
          { x: scene.bounds.left, y: scene.bounds.bottom },
        ],
      },
      {
        polygon: [
          { x: 0, y: scene.bounds.top },
          { x: scene.bounds.right, y: scene.bounds.top },
          { x: scene.bounds.right, y: scene.bounds.bottom },
          { x: 0, y: scene.bounds.bottom },
        ],
      },
    ];
  }

  return scene.vertices.map((vertex, index) => {
    const nextVertex = scene.vertices[(index + 1) % scene.vertices.length];
    return {
      polygon: [
        { x: 0, y: 0 },
        { x: vertex.x, y: vertex.y },
        { x: nextVertex.x, y: nextVertex.y },
      ],
    };
  });
}

function getSceneGeometryForDimensions(dimensions) {
  if (dimensions.length === 2) {
    return {
      bounds: {
        left: -240,
        right: 240,
        top: -190,
        bottom: 190,
      },
      vertices: [
        { x: -240, y: -190 },
        { x: 240, y: -190 },
        { x: 240, y: 190 },
        { x: -240, y: 190 },
      ],
    };
  }

  const radius = 230;
  const startAngle = -Math.PI / 2;
  return {
    radius,
    vertices: dimensions.map((_, index) => {
      const angle = startAngle + (Math.PI * 2 * index) / dimensions.length;
      return {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      };
    }),
  };
}

function projectPoint(point3d) {
  const scaledView = VIEW_SCALE * state.camera.zoom;
  const cosYaw = Math.cos(state.camera.yaw);
  const sinYaw = Math.sin(state.camera.yaw);
  const cosPitch = Math.cos(state.camera.pitch);
  const sinPitch = Math.sin(state.camera.pitch);

  const x1 = point3d.x * cosYaw - point3d.y * sinYaw;
  const y1 = point3d.x * sinYaw + point3d.y * cosYaw;
  const z1 = point3d.z;

  const screenDepth = y1 * cosPitch - z1 * sinPitch;
  const screenVertical = y1 * sinPitch + z1 * cosPitch;

  return {
    x: 490 + x1 * scaledView,
    y: 430 - screenVertical * scaledView,
    depth: screenDepth,
  };
}

function screenToWorld(event) {
  const point = getSvgPoint(event);
  const scaledView = VIEW_SCALE * state.camera.zoom;
  const screenX = (point.x - 490) / scaledView;
  const screenY = (430 - point.y) / scaledView;
  const sinPitch = Math.sin(state.camera.pitch);
  const cosYaw = Math.cos(state.camera.yaw);
  const sinYaw = Math.sin(state.camera.yaw);
  const safeSinPitch = Math.abs(sinPitch) < 0.0001 ? 0.0001 : sinPitch;

  const x1 = screenX;
  const y1 = screenY / safeSinPitch;

  return {
    x: x1 * cosYaw + y1 * sinYaw,
    y: -x1 * sinYaw + y1 * cosYaw,
  };
}

function getProjectedRegionPolygon(regionIndex) {
  const region = getRegionGeometry()[regionIndex];
  return region.polygon.map((point) => projectPoint({ ...point, z: 0 }));
}

function syncCameraControls() {
  dom.yawControl.value = String(Math.round(normalizeDegrees(radiansToDegrees(state.camera.yaw))));
  dom.pitchControl.value = String(Math.round(radiansToDegrees(state.camera.pitch)));
  dom.zoomControl.value = String(Math.round(state.camera.zoom * 100));
}

function getLevelFromScore(score) {
  return Math.min(4, Math.floor(clamp(score, 0, 100) / 20));
}


function findSubcategoryById(id) {
  return Object.values(state.subcategoriesByDimension)
    .flat()
    .find((item) => item.id === id);
}

function getSvgPoint(event) {
  const point = dom.svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(dom.svg.getScreenCTM().inverse());
}

function showTooltip(content) {
  dom.tooltip.innerHTML = content;
  dom.tooltip.classList.remove("hidden");
}

function hideTooltip() {
  dom.tooltip.classList.add("hidden");
}

function positionTooltip(event) {
  if (dom.tooltip.classList.contains("hidden")) return;
  const bounds = dom.svg.getBoundingClientRect();
  dom.tooltip.style.left = `${event.clientX - bounds.left + 12}px`;
  dom.tooltip.style.top = `${event.clientY - bounds.top + 12}px`;
}

function randomPointInPolygon(polygon) {
  const bounds = polygon.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );

  for (let i = 0; i < 400; i += 1) {
    const candidate = {
      x: randomBetween(bounds.minX + 18, bounds.maxX - 18),
      y: randomBetween(bounds.minY + 18, bounds.maxY - 18),
    };
    if (isPointInPolygon(candidate, polygon)) return candidate;
  }

  return centroid(polygon);
}

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function centroid(polygon) {
  const sum = polygon.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}

function darkenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    Math.round(r * (1 - amount)),
    Math.round(g * (1 - amount)),
    Math.round(b * (1 - amount))
  );
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function pointsToString(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function radiansToDegrees(value) {
  return (value * 180) / Math.PI;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function normalizeDegrees(value) {
  let normalized = value;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function isHexColor(value) {
  return typeof value === "string" && /^#([0-9a-f]{6})$/i.test(value);
}

function sanitizeId(value) {
  return String(value)
    .trim()
    .replaceAll(/[^a-zA-Z0-9_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "") || `id-${Math.random().toString(36).slice(2, 8)}`;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
