// cloudfunctions/improvement/index.js
/**
 * 持续改进云函数
 * 处理改进任务的创建、查询、工作流流转等操作
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
 * 根据学院名称查询学院用户
 */
async function findCollegeUserByCollegeName(collegeName) {
  const normalizedCollegeName = (collegeName || '').trim();
  if (!normalizedCollegeName) return null;

  const byDepartment = await db.collection('users')
    .where({ role: 'college', department: normalizedCollegeName })
    .limit(1)
    .get();

  if (byDepartment.data.length > 0) {
    return byDepartment.data[0];
  }

  const byName = await db.collection('users')
    .where({ role: 'college', name: normalizedCollegeName })
    .limit(1)
    .get();

  return byName.data[0] || null;
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

// 工作流阶段
const STAGES = {
  SUBMITTED: 'submitted',
  REVISING: 'revising',
  COLLEGE_CHECK: 'college_check',
  SUPERVISOR_REVIEW: 'supervisor_review',
  COMPLETED: 'completed'
};

/**
 * 创建改进任务
 */
async function createImprovement(event, context) {
  const {
    supervisorId,
    supervisorName,
    teacherId,
    teacherName,
    collegeId,
    collegeName,
    issueTitle,
    issueDescription,
    issueImages = []
  } = event;

  const normalizedTeacherName = (teacherName || '').trim();
  const normalizedCollegeName = (collegeName || '').trim();
  const normalizedIssueTitle = (issueTitle || '').trim();
  const normalizedIssueDescription = (issueDescription || '').trim();

  // 参数验证
  if (!supervisorId || (!teacherId && !normalizedTeacherName) || (!collegeId && !normalizedCollegeName) || !normalizedIssueTitle) {
    return paramError('请完整填写必填信息');
  }

  try {
    let finalTeacherId = teacherId;
    let finalTeacherName = normalizedTeacherName;
    let finalCollegeId = collegeId;
    let finalCollegeName = normalizedCollegeName;

    if (!finalTeacherId) {
      const teacherUser = await findUserByRoleAndName('teacher', normalizedTeacherName);
      if (!teacherUser) {
        return paramError('未找到该教师，请先确认教师已注册');
      }
      finalTeacherId = teacherUser._id;
      finalTeacherName = teacherUser.name;

      if (!finalCollegeName) {
        finalCollegeName = teacherUser.department || '';
      }
    }

    if (!finalTeacherName) {
      const teacherUser = await findUserById(finalTeacherId);
      finalTeacherName = teacherUser?.name || '';
      if (!finalCollegeName) {
        finalCollegeName = teacherUser?.department || '';
      }
    }

    if (!finalCollegeId) {
      const collegeUser = await findCollegeUserByCollegeName(finalCollegeName);
      if (!collegeUser) {
        return paramError('未找到对应学院账号，请先确认学院已注册');
      }
      finalCollegeId = collegeUser._id;
      finalCollegeName = finalCollegeName || collegeUser.department || collegeUser.name || '';
    }

    if (!finalCollegeName) {
      const collegeUser = await findUserById(finalCollegeId);
      finalCollegeName = collegeUser?.department || collegeUser?.name || '';
    }

    const data = {
      supervisorId,
      supervisorName,
      teacherId: finalTeacherId,
      teacherName: finalTeacherName,
      collegeId: finalCollegeId,
      collegeName: finalCollegeName,
      issueTitle: normalizedIssueTitle,
      issueDescription: normalizedIssueDescription,
      issueImages,
      currentStage: STAGES.SUBMITTED,
      stageHistory: [{
        stage: STAGES.SUBMITTED,
        operatorId: supervisorId,
        operatorName: supervisorName,
        action: 'submit',
        comment: '创建改进任务',
        timestamp: new Date()
      }],
      revisionMaterial: [],
      collegeCheckResult: '',
      collegeCheckImages: [],
      supervisorReviewResult: '',
      supervisorReviewComment: '',
      createTime: new Date(),
      updateTime: new Date()
    };

    const result = await db.collection('improvements').add({ data });
    return success({ _id: result._id, ...data }, '创建成功');

  } catch (err) {
    console.error('创建改进任务失败:', err);
    return error('创建失败，请重试');
  }
}

/**
 * 获取改进任务列表
 */
async function getImprovementList(event, context) {
  const {
    userId,
    userRole,
    filter = 'all', // all/created/todos/college_check/supervisor_review/completed
    limit = 20,
    skip = 0
  } = event;

  try {
    const queryLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const querySkip = Math.max(0, Number(skip) || 0);
    let condition = {};

    // 根据用户角色和过滤条件构建查询条件
    switch (filter) {
      case 'created':
        // 我创建的任务（督导）
        if (userRole !== 'supervisor' && userRole !== 'admin') {
          return forbiddenError('无权限查看我创建的任务');
        }
        condition.supervisorId = userId;
        break;
      case 'todos':
        // 我的待办任务
        if (userRole === 'teacher') {
          condition.teacherId = userId;
          condition.currentStage = STAGES.REVISING;
        } else if (userRole === 'college') {
          condition.collegeId = userId;
          condition.currentStage = STAGES.COLLEGE_CHECK;
        } else if (userRole === 'supervisor') {
          condition.supervisorId = userId;
          condition.currentStage = STAGES.SUPERVISOR_REVIEW;
        } else {
          return forbiddenError('无权限查看待办任务');
        }
        break;
      case 'college_check':
        // 待学院检查
        if (userRole !== 'college' && userRole !== 'admin') {
          return forbiddenError('无权限查看待学院检查任务');
        }
        condition.collegeId = userId;
        condition.currentStage = STAGES.COLLEGE_CHECK;
        break;
      case 'supervisor_review':
        // 待督导审核
        if (userRole !== 'supervisor' && userRole !== 'admin') {
          return forbiddenError('无权限查看待督导审核任务');
        }
        condition.supervisorId = userId;
        condition.currentStage = STAGES.SUPERVISOR_REVIEW;
        break;
      case 'college':
        // 本学院的任务
        if (userRole !== 'college' && userRole !== 'admin') {
          return forbiddenError('无权限查看本院任务');
        }
        condition.collegeId = userId;
        break;
      case 'completed':
        // 已完成的任务
        condition.currentStage = STAGES.COMPLETED;
        if (userRole === 'teacher') {
          condition.teacherId = userId;
        } else if (userRole === 'college') {
          condition.collegeId = userId;
        } else if (userRole === 'supervisor') {
          condition.supervisorId = userId;
        } else if (userRole !== 'admin') {
          return forbiddenError('无权限查看已完成任务');
        }
        break;
      case 'in_progress':
        // 进行中的任务（管理员）
        if (userRole !== 'admin') {
          return forbiddenError('无权限查看进行中任务');
        }
        condition.currentStage = _.neq(STAGES.COMPLETED);
        break;
      case 'all':
        // 所有任务（管理员）
        if (userRole !== 'admin') {
          return forbiddenError('无权限查看所有任务');
        }
        break;
      default:
        return paramError('无效的筛选条件');
    }

    const result = await db.collection('improvements')
      .where(condition)
      .orderBy('createTime', 'desc')
      .limit(queryLimit)
      .skip(querySkip)
      .get();

    // 获取总数
    const countResult = await db.collection('improvements')
      .where(condition)
      .count();

    return success({
      list: result.data,
      total: countResult.total,
      limit: queryLimit,
      skip: querySkip
    }, '获取成功');

  } catch (err) {
    console.error('获取改进任务列表失败:', err);
    return error('获取失败，请重试');
  }
}

/**
 * 获取改进任务详情
 */
async function getImprovementDetail(event, context) {
  const { taskId, userId, userRole } = event;

  if (!taskId) {
    return paramError('任务ID不能为空');
  }

  try {
    const result = await db.collection('improvements').doc(taskId).get();

    if (!result.data) {
      return notFoundError('任务不存在');
    }

    const task = result.data;

    // 权限验证
    const hasPermission =
      task.supervisorId === userId ||
      task.teacherId === userId ||
      task.collegeId === userId ||
      userRole === 'admin';

    if (!hasPermission) {
      return forbiddenError('无权限查看此任务');
    }

    return success(task, '获取成功');

  } catch (err) {
    console.error('获取改进任务详情失败:', err);
    return error('获取失败，请重试');
  }
}

/**
 * 添加阶段历史记录
 */
function addStageHistory(stageHistory, stage, operatorId, operatorName, action, comment) {
  return [
    ...stageHistory,
    {
      stage,
      operatorId,
      operatorName,
      action,
      comment,
      timestamp: new Date()
    }
  ];
}

/**
 * 教师提交修改材料
 */
async function submitRevision(event, context) {
  const { taskId, teacherId, teacherName, revisionMaterial = [], comment = '' } = event;

  if (!taskId || !teacherId || !revisionMaterial.length) {
    return paramError('请上传修改材料');
  }

  try {
    // 获取原任务
    const result = await db.collection('improvements').doc(taskId).get();

    if (!result.data) {
      return notFoundError('任务不存在');
    }

    const task = result.data;

    // 验证权限和状态
    if (task.teacherId !== teacherId) {
      return forbiddenError('只有任务教师可以提交修改');
    }

    if (task.currentStage !== STAGES.REVISING && task.currentStage !== STAGES.SUBMITTED) {
      return error('当前状态不允许提交修改');
    }

    // 更新任务
    const data = {
      currentStage: STAGES.COLLEGE_CHECK,
      revisionMaterial,
      stageHistory: addStageHistory(
        task.stageHistory,
        STAGES.REVISING,
        teacherId,
        teacherName,
        'revise',
        comment || '提交修改材料'
      ),
      updateTime: new Date()
    };

    await db.collection('improvements').doc(taskId).update({ data });

    return success(null, '提交成功，等待学院检查');

  } catch (err) {
    console.error('提交修改材料失败:', err);
    return error('提交失败，请重试');
  }
}

/**
 * 学院检查
 */
async function collegeCheck(event, context) {
  const { taskId, collegeId, collegeName, approved, result: checkResult, images = [], comment = '' } = event;

  if (!taskId || !collegeId || approved === undefined) {
    return paramError('参数不完整');
  }

  try {
    // 获取原任务
    const getResult = await db.collection('improvements').doc(taskId).get();

    if (!getResult.data) {
      return notFoundError('任务不存在');
    }

    const task = getResult.data;

    // 验证权限和状态
    if (task.collegeId !== collegeId) {
      return forbiddenError('只有任务学院可以检查');
    }

    if (task.currentStage !== STAGES.COLLEGE_CHECK) {
      return error('当前状态不允许学院检查');
    }

    // 更新任务
    let data = {
      collegeCheckResult: checkResult || '',
      collegeCheckImages: images,
      stageHistory: addStageHistory(
        task.stageHistory,
        STAGES.COLLEGE_CHECK,
        collegeId,
        collegeName,
        approved ? 'college_check_pass' : 'college_check_return',
        comment || (approved ? '学院检查通过' : '退回教师修改')
      ),
      updateTime: new Date()
    };

    if (approved) {
      // 通过：进入督导审核阶段
      data.currentStage = STAGES.SUPERVISOR_REVIEW;
    } else {
      // 不通过：退回教师修改
      data.currentStage = STAGES.REVISING;
    }

    await db.collection('improvements').doc(taskId).update({ data });

    return success(null, approved ? '检查通过，已提交督导审核' : '已退回教师修改');

  } catch (err) {
    console.error('学院检查失败:', err);
    return error('检查失败，请重试');
  }
}

/**
 * 督导审核
 */
async function supervisorReview(event, context) {
  const { taskId, supervisorId, supervisorName, approved, comment = '' } = event;

  if (!taskId || !supervisorId || approved === undefined) {
    return paramError('参数不完整');
  }

  try {
    // 获取原任务
    const getResult = await db.collection('improvements').doc(taskId).get();

    if (!getResult.data) {
      return notFoundError('任务不存在');
    }

    const task = getResult.data;

    // 验证权限和状态
    if (task.supervisorId !== supervisorId) {
      return forbiddenError('只有任务督导可以审核');
    }

    if (task.currentStage !== STAGES.SUPERVISOR_REVIEW) {
      return error('当前状态不允许督导审核');
    }

    // 更新任务
    const data = {
      supervisorReviewResult: approved ? 'approved' : 'rejected',
      supervisorReviewComment: comment,
      stageHistory: addStageHistory(
        task.stageHistory,
        STAGES.SUPERVISOR_REVIEW,
        supervisorId,
        supervisorName,
        approved ? 'supervisor_approve' : 'supervisor_return',
        comment || (approved ? '督导审核通过' : '退回学院重新检查')
      ),
      updateTime: new Date()
    };

    let updateData = { ...data };

    if (approved) {
      // 通过：任务完成
      updateData.currentStage = STAGES.COMPLETED;
    } else {
      // 不通过：退回学院检查
      updateData.currentStage = STAGES.COLLEGE_CHECK;
    }

    await db.collection('improvements').doc(taskId).update({ data: updateData });

    return success(null, approved ? '审核通过，任务已完成' : '已退回学院重新检查');

  } catch (err) {
    console.error('督导审核失败:', err);
    return error('审核失败，请重试');
  }
}

/**
 * 退回到上一阶段
 */
async function returnToPreviousStage(event, context) {
  const { taskId, userId, userName, userRole, comment = '' } = event;

  if (!taskId) {
    return paramError('任务ID不能为空');
  }

  try {
    // 获取原任务
    const result = await db.collection('improvements').doc(taskId).get();

    if (!result.data) {
      return notFoundError('任务不存在');
    }

    const task = result.data;

    // 根据当前阶段和用户角色确定可以退回到哪个阶段
    let newStage = null;
    let action = '';

    if (task.currentStage === STAGES.COLLEGE_CHECK && task.supervisorId === userId) {
      // 督导可以从学院检查阶段退回教师修改
      newStage = STAGES.REVISING;
      action = 'return_to_teacher';
    } else if (task.currentStage === STAGES.SUPERVISOR_REVIEW && task.collegeId === userId) {
      // 学院可以从督导审核阶段退回学院检查
      newStage = STAGES.COLLEGE_CHECK;
      action = 'return_to_college';
    } else {
      return error('当前状态不允许退回');
    }

    // 更新任务
    const data = {
      currentStage: newStage,
      stageHistory: addStageHistory(
        task.stageHistory,
        task.currentStage,
        userId,
        userName,
        action,
        comment || '退回上一阶段'
      ),
      updateTime: new Date()
    };

    await db.collection('improvements').doc(taskId).update({ data });

    return success(null, '已退回');

  } catch (err) {
    console.error('退回失败:', err);
    return error('退回失败，请重试');
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event;

  switch (action) {
    case 'create':
      return await createImprovement(event, context);
    case 'getList':
      return await getImprovementList(event, context);
    case 'getDetail':
      return await getImprovementDetail(event, context);
    case 'submitRevision':
      return await submitRevision(event, context);
    case 'collegeCheck':
      return await collegeCheck(event, context);
    case 'supervisorReview':
      return await supervisorReview(event, context);
    case 'returnToPrevious':
      return await returnToPreviousStage(event, context);
    default:
      return error('未知操作');
  }
};
