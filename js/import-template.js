function downloadExcelTemplate() {
  const fileName = `进度导入模板-${currentProjectName()}-${localDateText(today)}.xlsx`;
  const scope = currentProjectScope();
  const usedNames = new Set();
  const sheets = [templateInstructionSheet()];
  scope.units.forEach((unit) => {
    const headers = ["楼栋", "楼层", "专业", "施工内容", "计划开始时间", "计划完成时间", "实际完成情况", "备注"];
    const rows = buildUnitTemplateRows(unit, scope);
    sheets.push({
      name: uniqueSheetName(unit.name, usedNames),
      rows: [headers, ...rows],
      widths: [12, 10, 12, 24, 16, 16, 18, 20]
    });
  });
  exportTemplateWorkbook(sheets, fileName);
}

function templateInstructionSheet() {
  return {
    name: "填报说明",
    rows: [
      ["填报说明", ""],
      ["1. 每个施工单位只填写自己对应的工作表。", ""],
      ["2. 表头不要删除或改名，导入时会按表头识别字段。", ""],
      [`3. 施工部位建议使用项目范围中的楼栋名称，如 ${templateBuildingHint()}。`, ""],
      ["4. 楼层填写如 3层、地下1层；完成率填写 0-100。", ""],
      ["5. 完成率填写 0-100，已完成可填写 100% 或“已完成”。", ""],
      ["6. 地下室部位进度统一按完成百分比填写。", ""],
      ["当前项目", currentProjectName()],
      ["导出日期", localDateText(today)]
    ],
    widths: [16, 88]
  };
}

function templateBuildingHint() {
  const scope = currentProjectScope();
  const first = scope.buildings?.[0];
  const basement = scope.basement || "地下室一层";
  return first ? `${first.name}（${Number(first.floors || 1)}层）或${basement}` : basement;
}

function buildUnitTemplateRows(unit, scope) {
  const systems = unit.systems?.length ? unit.systems : ["施工内容"];
  const buildings = scope.buildings.length
    ? scope.buildings.map((building) => ({ label: building.name, floors: Number(building.floors || 1) }))
    : [{ label: "楼栋名称", floors: 1 }];
  const rows = [];
  buildings.forEach((building) => {
    for (let floorIndex = 1; floorIndex <= Math.max(1, building.floors); floorIndex += 1) {
      systems.forEach((system) => {
        rows.push([
          building.label,
          `${floorIndex}层`,
          unit.name.replace("单位", "") || unit.code || "专业",
          system,
          "",
          "",
          "未开始",
          ""
        ]);
      });
    }
  });
  if (scope.basement) {
    systems
      .filter((system) => shouldIncludeBasementSystem(unit, system))
      .forEach((system) => {
      rows.push([
        scope.basement,
        "地下1层",
        unit.name.replace("单位", "") || unit.code || "专业",
        system,
        "",
        "",
        "未开始",
        ""
      ]);
    });
  }
  return rows;
}

function shouldIncludeBasementSystem(unit, system) {
  if (String(unit.name || "").includes("机电") && system === "热水系统") return false;
  return true;
}

function exportTemplateWorkbook(sheets, fileName) {
  const entries = buildTemplateWorkbookEntries(sheets);
  const blob = new Blob([zipEntries(entries)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function buildTemplateWorkbookEntries(sheets) {
  const sheetOverrides = sheets
    .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  const workbookSheets = sheets
    .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const workbookRels = sheets
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join("");

  return [
    {
      name: "[Content_Types].xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`
    },
    {
      name: "_rels/.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: "xl/workbook.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
  <calcPr calcId="0" fullCalcOnLoad="1"/>
</workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      name: "xl/styles.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      text: buildWorksheetXml(sheet)
    }))
  ];
}

function buildWorksheetXml(sheet) {
  const maxColumn = Math.max(...sheet.rows.map((row) => row.length), 1);
  const maxRow = Math.max(sheet.rows.length, 1);
  const dimension = `A1:${columnName(maxColumn)}${maxRow}`;
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ` s="1"` : "";
      if (value && typeof value === "object" && value.formula) {
        return `<c r="${ref}"><f>${xmlEscape(value.formula)}</f><v>0</v></c>`;
      }
      if (typeof value === "number") {
        return `<c r="${ref}"${style}><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const validation = "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  ${cols}
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>${rows}</sheetData>
  ${validation}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function columnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function zipEntries(entries) {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => {
    const data = encoder.encode(entry.text);
    return { name: entry.name, data, crc: crc32(data) };
  });
  const chunks = [];
  const central = [];
  let offset = 0;
  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const local = zipLocalHeader(file, nameBytes);
    chunks.push(local, nameBytes, file.data);
    central.push({ file, nameBytes, offset });
    offset += local.length + nameBytes.length + file.data.length;
  });
  const centralStart = offset;
  central.forEach((item) => {
    const header = zipCentralHeader(item.file, item.nameBytes, item.offset);
    chunks.push(header, item.nameBytes);
    offset += header.length + item.nameBytes.length;
  });
  chunks.push(zipEndRecord(central.length, offset - centralStart, centralStart));
  return new Blob(chunks);
}

function zipLocalHeader(file, nameBytes) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  writeZipDateTime(view, 10);
  view.setUint32(14, file.crc, true);
  view.setUint32(18, file.data.length, true);
  view.setUint32(22, file.data.length, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function zipCentralHeader(file, nameBytes, offset) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  writeZipDateTime(view, 12);
  view.setUint32(16, file.crc, true);
  view.setUint32(20, file.data.length, true);
  view.setUint32(24, file.data.length, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return header;
}

function zipEndRecord(count, centralSize, centralOffset) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return header;
}

function writeZipDateTime(view, offset) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  view.setUint16(offset, time, true);
  view.setUint16(offset + 2, date, true);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function uniqueSheetName(name, usedNames) {
  const base = sanitizeSheetName(name || "施工单位").slice(0, 28) || "施工单位";
  let sheetName = base;
  let index = 2;
  while (usedNames.has(sheetName)) {
    sheetName = `${base.slice(0, 28 - String(index).length)}${index}`;
    index += 1;
  }
  usedNames.add(sheetName);
  return sheetName;
}

function sanitizeSheetName(name) {
  return String(name).replace(/[\\/?*\[\]:]/g, "").trim();
}


function exportImportErrors() {
  if (!pendingImport?.validation?.invalidRows?.length) {
    showToast("当前没有可导出的导入错误行", "warn");
    return;
  }
  const rows = pendingImport.validation.invalidRows.map((item) => ({
    工作表: item.sheetName || "",
    行号: item.rowNumber,
    问题: item.problems.join("、"),
    楼栋: item.normalized?.building || "",
    楼层: item.normalized?.floor || "",
    专业: item.normalized?.discipline || "",
    责任单位: item.normalized?.owner || "",
    施工内容: item.normalized?.system || item.normalized?.name || "",
    计划开始: item.normalized?.plannedStart || "",
    计划完成: item.normalized?.planned || "",
    完成率: item.normalized?.progress ?? ""
  }));
  exportProjectCsv("导入错误行", "csv", rows);
  exportProjectCsv("导入错误修正模板", "csv", buildImportCorrectionRows(rows));
  showToast("错误行已导出");
}

function buildImportCorrectionRows(rows) {
  return rows.map((row) => ({
    项目: currentProjectName(),
    楼栋: row.楼栋,
    楼层: row.楼层,
    专业: row.专业,
    责任单位: row.责任单位,
    施工内容: row.施工内容,
    计划开始时间: row.计划开始,
    计划完成时间: row.计划完成,
    实际完成情况: row.完成率 ? `${clampProgress(row.完成率)}%` : "未开始",
    备注: row.问题
  }));
}

function importPastedTable() {
  if (!els.pasteImportText) return;
  const text = els.pasteImportText.value.trim();
  if (!text) {
    showToast("请先粘贴表格内容", "warn");
    return;
  }
  const rows = parsePastedTableRows(text);
  pendingImport = buildPendingImport("粘贴数据", rows);
  els.importResult.textContent = `已解析粘贴数据 ${rows.length} 行`;
  renderImportValidation(pendingImport.validation);
  renderImportPreview(pendingImport);
}

function parsePastedTableRows(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const cells = lines.map((line) => line.split(/\t|,/).map((cell) => cell.trim()));
  const headers = cells.shift() || [];
  return cells.map((values) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}
