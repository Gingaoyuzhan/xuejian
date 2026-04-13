/**
 * HTTP 请求封装
 * 统一处理后端 API 调用、错误处理、加载状态
 * 替代原来的云函数调用方式
 */

import { showLoading, hideLoading, showToast } from './util.js';

// ========== 配置 ==========
const BASE_URL = 'https://jxjd.gaoyuzhan.top/api';

function buildNetworkErrorMessage(baseUrl) {
  return `网络请求失败：${baseUrl || BASE_URL}`;
}

function getOriginFromBaseUrl(baseUrl) {
  const matched = String(baseUrl || BASE_URL).match(/^(https?:\/\/[^/]+)/);
  return matched ? matched[1] : (baseUrl || BASE_URL);
}

function buildUploadStatusMessage(statusCode, baseUrl) {
  if (statusCode === 413) {
    return '上传失败：图片过大，线上网关已拦截，请压缩后重试';
  }
  if (statusCode === 401) {
    return '登录已失效，请重新登录后再上传';
  }
  if (statusCode >= 500) {
    return '上传失败：服务器暂时不可用，请稍后重试';
  }
  return `上传失败：服务返回异常(${statusCode})`;
}

function buildUploadFailMessage(err, baseUrl) {
  const errMsg = String(err?.errMsg || '');
  const uploadOrigin = getOriginFromBaseUrl(baseUrl);

  if (errMsg.includes('url not in domain list')) {
    return `上传失败：请在小程序后台配置 uploadFile 合法域名 ${uploadOrigin}`;
  }

  if (errMsg.includes('ssl hand shake error') || errMsg.includes('certificate')) {
    return '上传失败：证书校验异常，请检查 HTTPS 证书配置';
  }

  if (errMsg.includes('timeout')) {
    return '上传超时，请稍后重试';
  }

  return buildNetworkErrorMessage(baseUrl);
}

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
    const baseUrl = BASE_URL;
    wx.request({
      url: `${baseUrl}${url}`,
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
        console.error(`请求失败 ${method} ${baseUrl}${url}:`, err);
        const errorMsg = buildNetworkErrorMessage(baseUrl);
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

/**
 * DELETE 请求
 */
export function del(url, data = {}, options = {}) {
  return request(url, 'DELETE', data, options);
}

// ========== 业务 API 封装 ==========

/**
 * 登录
 */
export function login(data) {
  return post('/auth/login', data, { loadingText: '登录中...' });
}

/**
 * 获取登录自动填充信息
 */
export function getLoginPrefill(phone, roles = []) {
  return get('/auth/prefill', {
    phone,
    role: Array.isArray(roles) && roles.length > 0 ? roles[0] : '',
    roles: JSON.stringify(Array.isArray(roles) ? roles : [])
  }, { loading: false, showError: false });
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
 * 删除听课记录
 */
export function deleteObservation(id) {
  return post(`/observation/delete/${id}`, {}, { loadingText: '删除中...' });
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

/**
 * 删除持续改进记录
 */
export function deleteImprovement(id) {
  return post(`/improvement/delete/${id}`, {}, { loadingText: '删除中...' });
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
    const baseUrl = BASE_URL;
    wx.uploadFile({
      url: `${baseUrl}/upload`,
      filePath,
      name: 'file',
      header: {
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (loading) {
          hideLoading();
        }
        if (res.statusCode !== 200) {
          const errorMsg = buildUploadStatusMessage(res.statusCode, baseUrl);
          if (showError) {
            showToast(errorMsg, 'none');
          }
          reject(new Error(errorMsg));
          return;
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
        const errorMsg = buildUploadFailMessage(err, baseUrl);
        if (showError) {
          showToast(errorMsg, 'none');
        }
        reject(new Error(errorMsg));
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
