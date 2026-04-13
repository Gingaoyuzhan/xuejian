/**
 * 通用工具函数
 */
import { normalizeRoles } from './constants.js';

/**
 * 格式化日期时间
 * @param {Date|string|number} date - 日期对象、日期字符串或时间戳
 * @param {string} format - 格式化模板，默认 'YYYY-MM-DD HH:mm:ss'
 * @returns {string} 格式化后的日期字符串
 */
export function formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 格式化日期（不含时间）
 * @param {Date|string|number} date - 日期
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date) {
  return formatDateTime(date, 'YYYY-MM-DD');
}

/**
 * 格式化时间（不含日期）
 * @param {Date|string|number} date - 日期
 * @returns {string} 格式化后的时间字符串
 */
export function formatTime(date) {
  return formatDateTime(date, 'HH:mm:ss');
}

/**
 * 获取相对时间描述
 * @param {Date|string|number} date - 日期
 * @returns {string} 相对时间描述（如"刚刚"、"5分钟前"）
 */
export function getRelativeTime(date) {
  if (!date) return '';

  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return formatDate(date);
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, delay = 300) {
  let timer = null;
  return function (...args) {
    if (timer) return;
    timer = setTimeout(() => {
      func.apply(this, args);
      timer = null;
    }, delay);
  };
}

/**
 * 深拷贝对象
 * @param {*} obj - 要拷贝的对象
 * @returns {*} 拷贝后的新对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));

  const clonedObj = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  return clonedObj;
}

/**
 * 判断是否为空值
 * @param {*} value - 要判断的值
 * @returns {boolean} 是否为空
 */
export function isEmpty(value) {
  // null 或 undefined
  if (value === null || value === undefined) return true;

  // 空字符串
  if (typeof value === 'string') return value.trim() === '';

  // 空数组
  if (Array.isArray(value)) return value.length === 0;

  // 空对象
  if (typeof value === 'object') return Object.keys(value).length === 0;

  // 数字 0 和 false 不认为是空
  // 如果需要将 0 视为空，可以取消下面的注释
  // if (typeof value === 'number') return value === 0;
  // if (typeof value === 'boolean') return !value;

  return false;
}

/**
 * 手机号脱敏
 * @param {string} phone - 手机号
 * @returns {string} 脱敏后的手机号
 */
export function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone;
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

/**
 * 姓名脱敏
 * @param {string} name - 姓名
 * @returns {string} 脱敏后的姓名
 */
export function maskName(name) {
  if (!name) return name;
  if (name.length === 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

/**
 * 显示提示消息
 * @param {string} title - 提示内容
 * @param {string} icon - 图标类型 success/error/loading/none
 * @param {number} duration - 持续时间
 */
export function showToast(title, icon = 'none', duration = 2000) {
  wx.showToast({
    title,
    icon,
    duration
  });
}

/**
 * 显示加载提示
 * @param {string} title - 加载提示内容
 */
export function showLoading(title = '加载中...') {
  wx.showLoading({
    title,
    mask: true
  });
}

/**
 * 隐藏加载提示
 */
export function hideLoading() {
  wx.hideLoading();
}

/**
 * 显示确认对话框
 * @param {string} content - 对话框内容
 * @param {string} title - 对话框标题
 * @returns {Promise<boolean>} 用户是否确认
 */
export function showConfirm(content, title = '提示') {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (res) => {
        resolve(res.confirm);
      },
      fail: () => resolve(false)
    });
  });
}

/**
 * 图片预览
 * @param {string[]} urls - 图片链接列表
 * @param {number} current - 当前显示图片的索引
 */
export function previewImage(urls, current = 0) {
  if (!urls || urls.length === 0) return;
  wx.previewImage({
    urls,
    current: typeof current === 'number' ? urls[current] : current
  });
}

/**
 * 获取用户角色权限判断
 * @param {string} role - 用户角色
 * @returns {Object} 权限对象
 */
export function getRolePermissions(role) {
  const permissions = {
    // 督导权限
    supervisor: {
      canCreateObservation: true,
      canEditOwnObservation: true,
      canCreateImprovement: true,
      canReviewImprovement: true
    },
    // 教师权限
    teacher: {
      canReviseImprovement: true
    },
    // 管理员权限
    admin: {
      canAuditObservation: true,
      canViewAllObservations: true,
      canViewAllImprovements: true
    },
    // 高教中心权限
    college: {
      canCreateImprovement: true,
      canCheckCollegeImprovement: true,
      canViewCollegeObservations: true
    },
    // 二级学院领导权限
    department_leader: {
      canCreateObservation: true,
      canEditOwnObservation: true,
      canViewDepartmentImprovements: true,
      canReviseImprovement: true
    }
  };

  const roleList = normalizeRoles(role);
  return roleList.reduce((result, currentRole) => ({
    ...result,
    ...(permissions[currentRole] || {})
  }), {});
}
