/**
 * HTTP 请求封装
 * 统一处理后端 API 调用、错误处理、加载状态
 * 替代原来的云函数调用方式
 */

import { showLoading, hideLoading, showToast } from './util.js';

// ========== 配置 ==========
// 后端 API 基础地址（开发环境用本地，生产环境替换为服务器地址）
const BASE_URL = 'https://jxjd.gaoyuzhan.top/api';

// ========== 1. 底层请求封装 ==========

/**
 * 通用 HTTP 请求封装
 * @param {string} url - 相对 API 路径（不含 /api 前缀）
 * @param {string} method - HTTP 方法 GET / POST / PUT / DELETE
 * @param {Object} data - 请求体数据(POST / PUT) 或查询参数(GET)
 * @param {Object} options - 配置选项
 * @returns {Promise<any>} 返回 data 字段的内容
 */
export function request(url, method = 'GET', data = {}, options = {}) {
  const {
    loading = true,
    loadingText = '加载中...',
    showError = true
  } = options;

  if (loading) {
    showLoading(loadingText);
  }

  // 从本地存储获取 token
  const token = wx.getStorageSync('token') || '';

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (loading) {
          hideLoading();
        }

        const result = res.data;

        // 检查业务状态码
        if (result && result.code === 0) {
          resolve(result.data);
        } else {
          const errorMsg = (result && result.message) || '操作失败';
          if (showError) {
            showToast(errorMsg, 'none');
          }
          reject(new Error(errorMsg));
        }
      },
      fail: (err) => {
        if (loading) {
          hideLoading();
        }
        console.error(`请求失败 ${method} ${url}:`, err);
        const errorMsg = '网络请求失败，请检查网络连接';
        if (showError) {
          showToast(errorMsg, 'none');
        }
        reject(new Error(errorMsg));
      }
    });
  });
}

// ========== 便捷方法 ==========

/**
 * GET 请求
 */
export function get(url, params = {}, options = {}) {
  return request(url, 'GET', params, options);
}

/**
 * POST 请求
 */
export function post(url, data = {}, options = {}) {
  return request(url, 'POST', data, options);
}

/**
 * PUT 请求
 */
export function put(url, data = {}, options = {}) {
  return request(url, 'PUT', data, options);
}

// ========== 业务 API 封装 ==========

/**
 * 登录
 */
export function login(data) {
  return post('/auth/login', data, { loadingText: '登录中...' });
}

/**
 * 获取用户信息
 */
export function getUserInfo(userId) {
  return get(`/auth/user/${userId}`);
}

/**
 * 获取教师列表
 */
export function getTeacherList(department) {
  return get('/auth/teachers', department ? { department } : {});
}

// ----- 听课评课 -----

/**
 * 创建听课记录
 */
export function createObservation(data) {
  return post('/observation/create', data, { loadingText: '提交中...' });
}

/**
 * 获取听课记录列表
 */
export function getObservationList(params) {
  return get('/observation/list', params);
}

/**
 * 获取听课记录详情
 */
export function getObservationDetail(id) {
  return get(`/observation/detail/${id}`);
}

/**
 * 更新听课记录
 */
export function updateObservation(id, data) {
  return put(`/observation/update/${id}`, data, { loadingText: '提交中...' });
}

/**
 * 审核听课记录
 */
export function auditObservation(data) {
  return post('/observation/audit', data, { loadingText: '提交中...' });
}

/**
 * 获取首页统计数据
 */
export function getStats(params) {
  return get('/observation/stats', params, { loading: false });
}

// ----- 持续改进 -----

/**
 * 创建持续改进
 */
export function createImprovement(data) {
  return post('/improvement/create', data, { loadingText: '提交中...' });
}

/**
 * 获取持续改进列表
 */
export function getImprovementList(params) {
  return get('/improvement/list', params);
}

/**
 * 获取持续改进详情
 */
export function getImprovementDetail(id) {
  return get(`/improvement/detail/${id}`);
}

/**
 * 推进改进阶段
 */
export function advanceImprovement(data) {
  return post('/improvement/advance', data, { loadingText: '提交中...' });
}

// ========== 图片上传（直接上传到后端服务器） ==========

/**
 * 上传图片到后端服务器
 * @param {string} filePath - 本地文件路径
 * @returns {Promise<string>} 图片 URL
 */
export function uploadImage(filePath, options = {}) {
  const {
    loading = true,
    showError = true
  } = options;

  if (loading) {
    showLoading('上传中...');
  }

  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || '';
    wx.uploadFile({
      url: `${BASE_URL}/upload`,
      filePath,
      name: 'file',
      header: {
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (loading) {
          hideLoading();
        }
        try {
          const result = JSON.parse(res.data);
          if (result.code === 0) {
            resolve(result.data.url);
          } else {
            if (showError) {
              showToast(result.message || '上传失败', 'none');
            }
            reject(new Error(result.message));
          }
        } catch (e) {
          if (showError) {
            showToast('上传失败', 'none');
          }
          reject(new Error('解析响应失败'));
        }
      },
      fail: (err) => {
        if (loading) {
          hideLoading();
        }
        if (showError) {
          showToast('上传失败', 'none');
        }
        reject(err);
      }
    });
  });
}

/**
 * 批量上传图片
 */
export async function uploadImages(filePaths, onProgress) {
  const results = [];

  showLoading('上传中...');
  try {
    for (let i = 0; i < filePaths.length; i++) {
      const url = await uploadImage(filePaths[i], { loading: false, showError: false });
      results.push(url);
      if (onProgress) {
        onProgress(i + 1, filePaths.length);
      }
    }
  } catch (err) {
    hideLoading();
    showToast(err.message || '上传失败', 'none');
    throw err;
  }

  hideLoading();
  return results;
}
