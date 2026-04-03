// cloudfunctions/login/index.js
/**
 * 登录云函数
 * 处理用户登录，创建或更新用户信息
 * 安全修复：角色只能在首次登录时设置，后续不可修改
 */

const cloud = require('wx-server-sdk');
const { success, error, paramError, forbiddenError } = require('../common/response-utils');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 登录处理函数
 */
exports.main = async (event, context) => {
  const { userInfo, role, phone, name, department } = event;

  // 参数验证
  if (!phone || !name || !department) {
    return paramError('请完整填写必填信息');
  }

  try {
    // 获取微信用户信息
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const unionid = wxContext.UNIONID;

    if (!openid) {
      return error('获取用户信息失败');
    }

    // 查询用户是否已存在
    const { data: existingUsers } = await db.collection('users').where({
      openid
    }).get();

    let userData;

    if (existingUsers.length > 0) {
      // 用户已存在，更新基本信息（不可修改角色）
      const existingUser = existingUsers[0];
      const updateData = {
        phone,
        name,
        department,
        avatar: userInfo?.avatarUrl || existingUser.avatar,
        updateTime: new Date()
      };

      // 如果前端传了角色参数，检查是否与现有角色一致
      if (role && role !== existingUser.role) {
        console.warn(`用户 ${existingUser.name} 尝试从 ${existingUser.role} 修改为 ${role}，已拒绝`);
        return forbiddenError('角色不可修改，如需更改请联系管理员');
      }

      await db.collection('users').doc(existingUser._id).update({
        data: updateData
      });

      userData = {
        _id: existingUser._id,
        openid,
        unionid,
        role: existingUser.role, // 使用现有角色
        ...updateData
      };
    } else {
      // 新用户，创建用户记录（首次登录可设置角色）
      if (!role) {
        return paramError('首次登录需要选择角色');
      }

      // 验证角色是否合法
      const validRoles = ['supervisor', 'teacher', 'admin', 'college'];
      if (!validRoles.includes(role)) {
        return paramError('无效的角色类型');
      }

      const createData = {
        openid,
        unionid,
        role,
        phone,
        name,
        department,
        avatar: userInfo?.avatarUrl || '',
        createTime: new Date(),
        updateTime: new Date()
      };

      const createResult = await db.collection('users').add({
        data: createData
      });

      userData = {
        _id: createResult._id,
        ...createData
      };
    }

    return success(userData, '登录成功');

  } catch (err) {
    console.error('登录失败:', err);
    return error('登录失败，请重试');
  }
};
