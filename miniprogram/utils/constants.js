/**
 * 常量定义
 * 集中管理所有常量，避免魔法值
 */

// 用户角色
export const USER_ROLE = {
  SUPERVISOR: 'supervisor',    // 督导
  TEACHER: 'teacher',          // 教师
  ADMIN: 'admin',              // 管理员
  COLLEGE: 'college',          // 高教中心
  DEPARTMENT_LEADER: 'department_leader' // 二级学院领导
};

// 用户角色显示名称
export const USER_ROLE_NAME = {
  [USER_ROLE.SUPERVISOR]: '学校督导',
  [USER_ROLE.TEACHER]: '教师',
  [USER_ROLE.ADMIN]: '管理员',
  [USER_ROLE.COLLEGE]: '高教中心',
  [USER_ROLE.DEPARTMENT_LEADER]: '校领导'
};

export const USER_ROLE_VALUES = Object.values(USER_ROLE);

export const USER_ROLE_PRIORITY = [
  USER_ROLE.ADMIN,
  USER_ROLE.COLLEGE,
  USER_ROLE.SUPERVISOR,
  USER_ROLE.DEPARTMENT_LEADER,
  USER_ROLE.TEACHER
];

export const OBSERVATION_CREATOR_ROLES = [
  USER_ROLE.SUPERVISOR,
  USER_ROLE.DEPARTMENT_LEADER
];

export const OBSERVATION_MANAGER_ROLES = [
  USER_ROLE.COLLEGE,
  USER_ROLE.ADMIN
];

export function normalizeRoles(source) {
  let roles = [];

  if (Array.isArray(source)) {
    roles = source;
  } else if (typeof source === 'string') {
    roles = [source];
  } else if (source && typeof source === 'object') {
    roles = []
      .concat(Array.isArray(source.roles) ? source.roles : [])
      .concat(source.role ? [source.role] : []);
  }

  return [...new Set(
    roles
      .map(item => String(item || '').trim())
      .filter(item => USER_ROLE_VALUES.includes(item))
  )];
}

export function hasRole(source, role) {
  return normalizeRoles(source).includes(role);
}

export function hasAnyRole(source, roles = []) {
  const ownedRoles = normalizeRoles(source);
  return roles.some(role => ownedRoles.includes(role));
}

export function hasObservationCreatorRole(source) {
  return hasAnyRole(source, OBSERVATION_CREATOR_ROLES);
}

export function hasObservationManagerRole(source) {
  return hasAnyRole(source, OBSERVATION_MANAGER_ROLES);
}

export function canAccessObservationModule(source) {
  return hasObservationCreatorRole(source) || hasObservationManagerRole(source);
}

export function getPrimaryRole(source) {
  const roles = normalizeRoles(source);
  return USER_ROLE_PRIORITY.find(role => roles.includes(role)) || roles[0] || '';
}

export function pickRole(source, candidates = []) {
  const roles = normalizeRoles(source);
  return USER_ROLE_PRIORITY.find(role => candidates.includes(role) && roles.includes(role))
    || candidates.find(role => roles.includes(role))
    || '';
}

export function getRoleText(source) {
  const roles = normalizeRoles(source);
  return roles.map(role => USER_ROLE_NAME[role] || role).join(' / ');
}

// 听课记录状态
export const OBSERVATION_STATUS = {
  PENDING: 'pending',      // 待审核
  APPROVED: 'approved',    // 已通过
  REJECTED: 'rejected'     // 已驳回
};

// 听课记录状态显示
export const OBSERVATION_STATUS_TEXT = {
  [OBSERVATION_STATUS.PENDING]: '待审核',
  [OBSERVATION_STATUS.APPROVED]: '已通过',
  [OBSERVATION_STATUS.REJECTED]: '已驳回'
};

// 持续改进阶段
export const IMPROVEMENT_STAGE = {
  SUBMITTED: 'submitted',           // 已提交
  REVISING: 'revising',             // 修改中
  COLLEGE_CHECK: 'college_check',   // 高教中心检查
  SUPERVISOR_REVIEW: 'supervisor_review', // 督导审核
  COMPLETED: 'completed'            // 已完成
};

// 持续改进阶段显示
export const IMPROVEMENT_STAGE_TEXT = {
  [IMPROVEMENT_STAGE.SUBMITTED]: '一级发起',
  [IMPROVEMENT_STAGE.REVISING]: '二级处理',
  [IMPROVEMENT_STAGE.COLLEGE_CHECK]: '高教中心复查',
  [IMPROVEMENT_STAGE.SUPERVISOR_REVIEW]: '学校督导复核',
  [IMPROVEMENT_STAGE.COMPLETED]: '闭环完成'
};

// 持续改进阶段颜色
export const IMPROVEMENT_STAGE_COLOR = {
  [IMPROVEMENT_STAGE.SUBMITTED]: '#1890ff',
  [IMPROVEMENT_STAGE.REVISING]: '#faad14',
  [IMPROVEMENT_STAGE.COLLEGE_CHECK]: '#0f766e',
  [IMPROVEMENT_STAGE.SUPERVISOR_REVIEW]: '#2563eb',
  [IMPROVEMENT_STAGE.COMPLETED]: '#52c41a'
};

// 工作流操作类型
export const STAGE_ACTION = {
  SUBMIT: 'submit',           // 提交
  REVISE: 'revise',           // 修改
  COLLEGE_CHECK_PASS: 'college_check_pass',     // 高教中心检查通过
  COLLEGE_CHECK_RETURN: 'college_check_return', // 高教中心检查退回
  SUPERVISOR_APPROVE: 'supervisor_approve',     // 督导审核通过
  SUPERVISOR_RETURN: 'supervisor_return'        // 督导审核退回
};

// 工作流流转规则
export const WORKFLOW_TRANSITIONS = {
  // 教师修改 → 高教中心检查
  [IMPROVEMENT_STAGE.REVISING]: IMPROVEMENT_STAGE.COLLEGE_CHECK,
  // 高教中心检查 → 督导审核
  [IMPROVEMENT_STAGE.COLLEGE_CHECK]: IMPROVEMENT_STAGE.SUPERVISOR_REVIEW,
  // 督导审核 → 完成
  [IMPROVEMENT_STAGE.SUPERVISOR_REVIEW]: IMPROVEMENT_STAGE.COMPLETED,
  // 退回规则
  RETURN_TO_TEACHER: IMPROVEMENT_STAGE.REVISING,
  RETURN_TO_COLLEGE: IMPROVEMENT_STAGE.COLLEGE_CHECK
};

// 图片上传配置
export const IMAGE_UPLOAD_CONFIG = {
  MAX_COUNT: 9,              // 最大上传数量
  MAX_SIZE: 10 * 1024 * 1024, // 最大10MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg']
};

// 分页配置
export const PAGINATION_CONFIG = {
  PAGE_SIZE: 20,             // 每页数量
  MAX_PAGE_SIZE: 100         // 最大每页数量
};

// 数据库集合名称
export const COLLECTIONS = {
  USERS: 'users',
  COURSES: 'courses',
  OBSERVATIONS: 'observations',
  IMPROVEMENTS: 'improvements',
  NOTIFICATIONS: 'notifications'
};

// 云函数名称
export const CLOUD_FUNCTIONS = {
  // 用户相关
  LOGIN: 'login',
  GET_USER_INFO: 'getUserInfo',
  UPDATE_USER_INFO: 'updateUserInfo',

  // 听课评课相关
  CREATE_OBSERVATION: 'createObservation',
  GET_OBSERVATION_LIST: 'getObservationList',
  GET_OBSERVATION_DETAIL: 'getObservationDetail',
  UPDATE_OBSERVATION: 'updateObservation',
  AUDIT_OBSERVATION: 'auditObservation',

  // 持续改进相关
  CREATE_IMPROVEMENT: 'createImprovement',
  GET_IMPROVEMENT_LIST: 'getImprovementList',
  GET_IMPROVEMENT_DETAIL: 'getImprovementDetail',
  SUBMIT_REVISION: 'submitRevision',
  COLLEGE_CHECK: 'collegeCheck',
  SUPERVISOR_REVIEW: 'supervisorReview',
  RETURN_TO_PREVIOUS_STAGE: 'returnToPreviousStage',

  // 通知相关
  GET_NOTIFICATION_LIST: 'getNotificationList',
  MARK_AS_READ: 'markAsRead',

  // 辅助函数
  UPLOAD_IMAGE: 'uploadImage',
  GET_TEACHER_LIST: 'getTeacherList',
  GET_COURSE_LIST: 'getCourseList'
};
