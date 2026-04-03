// cloudfunctions/observation/index.js
/**
 * 听课评课云函数
 * 处理听课记录的创建、查询、更新、审核等操作
 */

const cloud = require('wx-server-sdk');
const { success, error, paramError, forbiddenError, notFoundError } = require('../common/response-utils');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 根据角色与姓名查询用户
 */
async function findUserByRoleAndName(role, name) {
  const normalizedName = (name || '').trim();
  if (!normalizedName) return null;

  const result = await db.collection('users')
    .where({ role, name: normalizedName })
    .limit(1)
    .get();

  return result.data[0] || null;
}

/**
 * 根据用户ID查询用户
 */
async function findUserById(userId) {
  if (!userId) return null;

  try {
    const result = await db.collection('users').doc(userId).get();
    return result.data || null;
  } catch (err) {
    return null;
  }
}

/**
 * 创建听课记录
 */
async function createObservation(event, context) {
  const {
    supervisorId,
    supervisorName,
    teacherId,
    teacherName,
    courseId,
    courseName,
    classInfo,
    observationDate,
    location,
    teachingContent,
    opinion,
    images = []
  } = event;

  const normalizedTeacherName = (teacherName || '').trim();
  const normalizedCourseName = (courseName || '').trim();
  const normalizedLocation = (location || '').trim();

  // 参数验证
  if (!supervisorId || (!teacherId && !normalizedTeacherName) || !normalizedCourseName || !observationDate || !normalizedLocation) {
    return paramError('请完整填写必填信息');
  }

  try {
    let finalTeacherId = teacherId;
    let finalTeacherName = normalizedTeacherName;

    if (!finalTeacherId) {
      const teacherUser = await findUserByRoleAndName('teacher', normalizedTeacherName);
      if (!teacherUser) {
        return paramError('未找到该教师，请先确认教师已注册');
      }
      finalTeacherId = teacherUser._id;
      finalTeacherName = teacherUser.name;
    }

    if (!finalTeacherName) {
      const teacherUser = await findUserById(finalTeacherId);
      finalTeacherName = teacherUser?.name || '';
    }

    const data = {
      supervisorId,
      supervisorName,
      teacherId: finalTeacherId,
      teacherName: finalTeacherName,
      courseId,
      courseName: normalizedCourseName,
      classInfo,
      observationDate: new Date(observationDate),
      location: normalizedLocation,
      teachingContent,
      opinion,
      images,
      status: 'pending', // 待审核
      createTime: new Date(),
      updateTime: new Date()
    };

    const result = await db.collection('observations').add({ data });
    return success({ _id: result._id, ...data }, '创建成功');

  } catch (err) {
    console.error('创建听课记录失败:', err);
    return error('创建失败，请重试');
  }
}

/**
 * 获取听课记录列表
 */
async function getObservationList(event, context) {
  const {
    userId,
    userRole,
    filter = 'all', // all/my/pending/about/audit/college
    limit = 20,
    skip = 0
  } = event;

  try {
    const queryLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const querySkip = Math.max(0, Number(skip) || 0);
    let condition = {};

    // 根据用户角色和过滤条件构建查询条件
    switch (filter) {
      case 'my':
        // 我创建的记录（督导）
        if (userRole !== 'supervisor' && userRole !== 'admin') {
          return forbiddenError('无权限查看我创建的记录');
        }
        condition.supervisorId = userId;
        break;
      case 'about':
        // 关于我的记录（教师）
        if (userRole !== 'teacher' && userRole !== 'admin') {
          return forbiddenError('无权限查看关于我的记录');
        }
        condition.teacherId = userId;
        break;
      case 'pending':
        // 待审核的记录（管理员）
        if (userRole !== 'admin') {
          return forbiddenError('无权限查看待审核记录');
        }
        condition.status = 'pending';
        break;
      case 'audit':
        // 我审核过的记录（管理员）
        if (userRole !== 'admin') {
          return forbiddenError('无权限查看审核记录');
        }
        condition.reviewerId = userId;
        break;
      case 'college':
        // 本学院的记录（学院）
        if (userRole !== 'college' && userRole !== 'admin') {
          return forbiddenError('无权限查看本院记录');
        }

        if (userRole === 'college') {
          const collegeUser = await findUserById(userId);
          if (!collegeUser || !collegeUser.department) {
            return success({
              list: [],
              total: 0,
              limit: queryLimit,
              skip: querySkip
            }, '获取成功');
          }

          const teacherResult = await db.collection('users')
            .where({
              role: 'teacher',
              department: collegeUser.department
            })
            .field({ _id: true })
            .get();

          const teacherIds = teacherResult.data.map(item => item._id);
          if (teacherIds.length === 0) {
            return success({
              list: [],
              total: 0,
              limit: queryLimit,
              skip: querySkip
            }, '获取成功');
          }

          condition.teacherId = _.in(teacherIds);
        }
        break;
      case 'all':
        // 所有记录（管理员）
        if (userRole !== 'admin') {
          return forbiddenError('无权限查看所有记录');
        }
        break;
      default:
        return paramError('无效的筛选条件');
    }

    const result = await db.collection('observations')
      .where(condition)
      .orderBy('createTime', 'desc')
      .limit(queryLimit)
      .skip(querySkip)
      .get();

    // 获取总数
    const countResult = await db.collection('observations')
      .where(condition)
      .count();

    return success({
      list: result.data,
      total: countResult.total,
      limit: queryLimit,
      skip: querySkip
    }, '获取成功');

  } catch (err) {
    console.error('获取听课记录列表失败:', err);
    return error('获取失败，请重试');
  }
}

/**
 * 获取听课记录详情
 */
async function getObservationDetail(event, context) {
  const { recordId, userId, userRole } = event;

  if (!recordId) {
    return paramError('记录ID不能为空');
  }

  try {
    const result = await db.collection('observations').doc(recordId).get();

    if (!result.data) {
      return notFoundError('记录不存在');
    }

    const record = result.data;

    // 权限验证
    const hasPermission =
      record.supervisorId === userId ||
      record.teacherId === userId ||
      userRole === 'admin' ||
      userRole === 'college';

    if (!hasPermission) {
      return forbiddenError('无权限查看此记录');
    }

    return success(record, '获取成功');

  } catch (err) {
    console.error('获取听课记录详情失败:', err);
    return error('获取失败，请重试');
  }
}

/**
 * 更新听课记录（驳回后修改）
 */
async function updateObservation(event, context) {
  const { recordId, userId, updateData } = event;

  if (!recordId) {
    return paramError('记录ID不能为空');
  }

  try {
    // 获取原记录
    const result = await db.collection('observations').doc(recordId).get();

    if (!result.data) {
      return notFoundError('记录不存在');
    }

    const record = result.data;

    // 只有创建者可以修改
    if (record.supervisorId !== userId) {
      return forbiddenError('只有创建者可以修改');
    }

    // 只有驳回状态可以修改
    if (record.status !== 'rejected') {
      return error('只有驳回状态的记录可以修改');
    }

    // 更新数据
    const data = {
      ...updateData,
      status: 'pending', // 重新提交后变为待审核
      updateTime: new Date()
    };

    await db.collection('observations').doc(recordId).update({ data });

    return success(null, '更新成功');

  } catch (err) {
    console.error('更新听课记录失败:', err);
    return error('更新失败，请重试');
  }
}

/**
 * 审核听课记录
 */
async function auditObservation(event, context) {
  const { recordId, reviewerId, reviewerName, approved, comment } = event;

  if (!recordId || !reviewerId || approved === undefined) {
    return paramError('参数不完整');
  }

  try {
    // 获取原记录
    const result = await db.collection('observations').doc(recordId).get();

    if (!result.data) {
      return notFoundError('记录不存在');
    }

    const record = result.data;

    // 只有待审核状态可以审核
    if (record.status !== 'pending') {
      return error('该记录已审核');
    }

    // 更新审核结果
    const data = {
      status: approved ? 'approved' : 'rejected',
      reviewerId,
      reviewerName,
      reviewComment: comment || '',
      reviewTime: new Date(),
      updateTime: new Date()
    };

    await db.collection('observations').doc(recordId).update({ data });

    return success(null, approved ? '审核通过' : '已驳回');

  } catch (err) {
    console.error('审核听课记录失败:', err);
    return error('审核失败，请重试');
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event;

  switch (action) {
    case 'create':
      return await createObservation(event, context);
    case 'getList':
      return await getObservationList(event, context);
    case 'getDetail':
      return await getObservationDetail(event, context);
    case 'update':
      return await updateObservation(event, context);
    case 'audit':
      return await auditObservation(event, context);
    default:
      return error('未知操作');
  }
};
