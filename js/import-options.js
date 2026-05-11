const IMPORT_PREVIEW_PAGE_SIZE = 12;
const IMPORT_EDIT_PAGE_SIZE = 50;
const IMPORT_FIELD_DEFINITIONS = [
  ["projectName", "项目", ["项目", "项目名称", "工程名称", "标段"]],
  ["building", "楼栋", ["施工部位", "部位", "楼栋", "楼号", "单体", "栋号"]],
  ["floor", "楼层", ["楼层", "层数", "施工楼层", "部位层"]],
  ["discipline", "专业", ["专业", "专业/分部", "分部", "单位类型", "工种"]],
  ["owner", "责任单位", ["责任单位", "施工单位", "单位", "参建单位", "分包单位"]],
  ["system", "施工内容", ["施工内容", "系统", "系统名称", "工作内容", "任务内容"]],
  ["name", "节点名称", ["节点名称", "节点", "任务名称", "进度节点"]],
  ["planned", "计划完成", ["计划完成", "计划完成时间", "计划完成日期", "计划日期", "计划时间"]],
  ["actual", "实际完成", ["实际完成", "实际完成日期", "实际日期", "完成日期"]],
  ["progress", "完成率", ["完成率", "进度", "实际进度", "完成百分比"]],
  ["completionStatus", "实际完成情况", ["实际完成情况", "完成情况", "施工状态", "状态"]],
  ["note", "监理意见", ["监理意见", "备注", "说明", "偏差原因"]],
  ["plannedProgress", "计划完成率", ["计划完成率", "计划进度"]]
];

function importOptions() {
  const elements = typeof els === "undefined" ? {} : els;
  return {
    mode: elements.importModeSelect?.value || "upsert",
    scope: elements.importScopeSelect?.value || "current",
    updatePolicy: elements.importUpdatePolicySelect?.value || "all",
    duplicatePolicy: elements.importDuplicatePolicySelect?.value || "last"
  };
}
