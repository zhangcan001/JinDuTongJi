const IMPORT_PREVIEW_PAGE_SIZE = 12;
const IMPORT_EDIT_PAGE_SIZE = 50;
const IMPORT_FIELD_DEFINITIONS = [
  ["projectName", "项目", ["项目", "项目名称", "工程名称", "工程项目", "项目工程", "标段", "合同段"]],
  ["building", "楼栋", ["施工部位", "部位", "楼栋", "楼栋号", "楼号", "楼座", "楼宇", "单体", "栋号", "栋座", "施工区域", "区域", "楼栋名称"]],
  ["floor", "楼层", ["楼层", "层数", "施工楼层", "部位层", "所在楼层", "施工层", "层", "楼层/部位"]],
  ["discipline", "专业", ["专业", "专业/分部", "分部", "分项", "单位类型", "工种", "专业类别", "专业名称"]],
  ["owner", "责任单位", ["责任单位", "施工单位", "单位", "参建单位", "分包单位", "责任班组", "班组", "施工班组", "承包单位", "单位名称"]],
  ["system", "施工内容", ["施工内容", "系统", "系统名称", "工作内容", "任务内容", "施工项", "施工项目", "作业内容", "工序", "分项工程", "检查项"]],
  ["name", "节点名称", ["节点名称", "节点", "任务名称", "进度节点", "计划节点", "工作节点", "事项名称"]],
  ["plannedStart", "计划开始", ["计划开始", "计划开始时间", "计划开始日期", "计划开工", "计划开工日期", "计划开工时间", "计划启动", "计划启动时间"]],
  ["planned", "计划完成", ["计划完成", "计划完成时间", "计划完成日期", "计划日期", "计划时间", "计划完工", "计划完工日期", "计划结束", "计划结束日期"]],
  ["progress", "完成率", ["完成率", "进度", "实际进度", "完成百分比", "完成比例", "本周完成", "累计完成", "形象进度", "进度百分比"]],
  ["completionStatus", "实际完成情况", ["实际完成情况", "完成情况", "施工状态", "状态", "进展状态", "完成状态", "当前状态"]],
  ["note", "监理意见", ["监理意见", "备注", "说明", "偏差原因", "存在问题", "问题原因", "情况说明", "监理要求"]],
  ["plannedProgress", "计划完成率", ["计划完成率", "计划进度", "计划完成比例", "计划百分比"]]
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
