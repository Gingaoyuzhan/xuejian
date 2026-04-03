/**
 * 权限验证工具函数
 * 云函数公共模块
 */

/**
 * 验证用户是否有权限访问某资源
 * @param {Object} resource - 资源对象
 * @param {string} userId - 当前用户ID
 * @param {string} userRole - 当前用户角色
 * @param {Array<string>} allowedRoles - 允许访问的角色列表
 * @param {Object} idFields - 资源中用户ID字段映射
 * @returns {{hasPermission: boolean, reason?: string}}
 */
function verifyPermission(resource, userId, userRole, allowedRoles = [], idFields = {}) {
  // 管理员拥有所有权限
  if (userRole === 'admin') {
    return { hasPermission: true };
  }

  // 检查角色权限
  if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    return { hasPermission: false, reason: '角色无权限' };
  }

  // 检查用户ID权限（资源所有者）
  for (const [field, role] of Object.entries(idFields)) {
    if (resource[field] === userId && (!role || userRole === role)) {
      return { hasPermission: true };
    }
  }

  return { hasPermission: false, reason: '无权限访问' };
}

/**
 * 获取文档并验证权限
 * @param {Database} db - 数据库实例
 * @param {string} collectionName - 集合名称
 * @param {string} docId - 文档ID
 * @param {string} userId - 当前用户ID
 * @param {string} userRole - 当前用户角色
 * @param {Object} options - 配置选项
 * @param {Array<string>} options.allowedRoles - 允许访问的角色
 * @param {Object} options.idFields - 用户ID字段映射
 * @returns {Promise<{data?: Object, error?: Object}>}
 */
async function getDocWithPermission(db, collectionName, docId, userId, userRole, options = {}) {
  const { allowedRoles = [], idFields = {} } = options;

  try {
    const result = await db.collection(collectionName).doc(docId).get();

    if (!result.data) {
      return { error: { code: 404, message: '资源不存在' } };
    }

    const resource = result.data;

    // 验证权限
    const { hasPermission, reason } = verifyPermission(resource, userId, userRole, allowedRoles, idFields);

    if (!hasPermission) {
      return { error: { code: 403, message: reason || '无权限访问' } };
    }

    return { data: resource };
  } catch (err) {
    console.error('获取文档失败:', err);
    return { error: { code: 500, message: '获取文档失败' } };
  }
}

/**
 * 通用权限检查配置
 */
const PERMISSION_CONFIG = {
  // 听课记录权限
  observation: {
    getDetail: {
      allowedRoles: ['admin', 'college'],
      idFields: {
        supervisorId: 'supervisor',
        teacherId: 'teacher'
      }
    },
    update: {
      allowedRoles: [],
      idFields: {
        supervisorId: 'supervisor'
      }
    },
    audit: {
      allowedRoles: ['admin'],
      idFields: {}
    }
  },
  // 改进任务权限
  improvement: {
    getDetail: {
      allowedRoles: ['admin'],
      idFields: {
        supervisorId: 'supervisor',
        teacherId: 'teacher',
        collegeId: 'college'
      }
    },
    revise: {
      allowedRoles: [],
      idFields: {
        teacherId: 'teacher'
      }
    },
    collegeCheck: {
      allowedRoles: [],
      idFields: {
        collegeId: 'college'
      }
    },
    supervisorReview: {
      allowedRoles: [],
      idFields: {
        supervisorId: 'supervisor'
      }
    }
  }
};

module.exports = {
  verifyPermission,
  getDocWithPermission,
  PERMISSION_CONFIG
};
