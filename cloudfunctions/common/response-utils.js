/**
 * 响应工具函数
 * 统一云函数响应格式
 */

/**
 * 成功响应
 */
function success(data = null, message = '操作成功') {
  return {
    code: 0,
    message,
    data,
    timestamp: Date.now()
  };
}

/**
 * 失败响应
 */
function error(message = '操作失败', code = -1) {
  return {
    code,
    message,
    data: null,
    timestamp: Date.now()
  };
}

/**
 * 参数错误响应
 */
function paramError(message = '参数错误') {
  return error(message, 400);
}

/**
 * 未授权响应
 */
function unauthorizedError(message = '未授权') {
  return error(message, 401);
}

/**
 * 禁止访问响应
 */
function forbiddenError(message = '无权限访问') {
  return error(message, 403);
}

/**
 * 资源不存在响应
 */
function notFoundError(message = '资源不存在') {
  return error(message, 404);
}

/**
 * 业务错误响应
 */
function businessError(message = '业务处理失败', code = 500) {
  return error(message, code);
}

module.exports = {
  success,
  error,
  paramError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  businessError
};
