// pages/improvement/detail/detail.js
/**
 * 持续改进任务详情页
 */

import { getImprovementDetail, deleteImprovement } from '../../../utils/request.js';
import { showToast, showConfirm, formatDate, previewImage } from '../../../utils/util.js';
import { IMPROVEMENT_STAGE, USER_ROLE, IMPROVEMENT_STAGE_TEXT, hasRole, hasAnyRole } from '../../../utils/constants.js';

const app = getApp();

Page({
  data: {
    taskId: '',
    task: null,
    currentStageText: '',
    actionButtons: []
  },

  onLoad(options) {
    if (!this.checkLogin()) return;

    const { id } = options;
    if (!id) {
      showToast('参数错误', 'none');
      wx.navigateBack();
      return;
    }

    this.setData({ taskId: id });
    this.loadDetail();
  },

  checkLogin() {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return false;
    }
    return true;
  },

  async loadDetail() {
    try {
      const { taskId } = this.data;
      const userInfo = app.globalData.userInfo;
      const res = await getImprovementDetail(taskId);

      const task = {
        ...res,
        createTimeFormatted: formatDate(res.createTime),
        stageHistory: (res.stageHistory || []).map(item => ({
          ...item,
          timeText: formatDate(item.time || item.timestamp),
          actionLabel: item.actionText || item.action,
          operatorLabel: [item.roleText, item.operatorName].filter(Boolean).join(' · ')
        }))
      };

      this.setData({
        task,
        currentStageText: IMPROVEMENT_STAGE_TEXT[res.currentStage] || res.currentStage,
        actionButtons: this.calculatePermissions(task, userInfo)
      });
    } catch (err) {
      console.error('加载详情失败:', err);
    }
  },

  calculatePermissions(task, userInfo) {
    const buttons = [];
    const uid = userInfo.id || userInfo._id;
    const sameTeacher = hasRole(userInfo, USER_ROLE.TEACHER) && Number(uid) === Number(task.teacherId);
    const sameDepartmentLeader = hasRole(userInfo, USER_ROLE.DEPARTMENT_LEADER)
      && userInfo.department
      && userInfo.department === task.collegeName;

    if ((sameTeacher || sameDepartmentLeader) && [IMPROVEMENT_STAGE.SUBMITTED, IMPROVEMENT_STAGE.REVISING].includes(task.currentStage)) {
      buttons.push({
        text: '填写改进情况',
        action: 'revise',
        operatorRole: sameTeacher ? USER_ROLE.TEACHER : USER_ROLE.DEPARTMENT_LEADER
      });
    }

    if (hasRole(userInfo, USER_ROLE.COLLEGE) && task.currentStage === IMPROVEMENT_STAGE.COLLEGE_CHECK) {
      buttons.push({
        text: '填写复查情况',
        action: 'collegeCheck',
        operatorRole: USER_ROLE.COLLEGE
      });
    }

    if (hasRole(userInfo, USER_ROLE.SUPERVISOR) && task.currentStage === IMPROVEMENT_STAGE.SUPERVISOR_REVIEW) {
      buttons.push({
        text: '填写复核意见',
        action: 'review',
        operatorRole: USER_ROLE.SUPERVISOR
      });
    }

    // 删除权限：发起人（从history中判断）或管理员可以删除。已闭环的非管理员不能删
    const submitEntry = (task.stageHistory || []).find(item => item.action === 'submit');
    const isCreator = submitEntry && Number(submitEntry.operatorId) === Number(uid);
    const isAdmin = hasAnyRole(userInfo, [USER_ROLE.ADMIN]);
    const isCompleted = task.currentStage === IMPROVEMENT_STAGE.COMPLETED;

    if (isAdmin || (isCreator && !isCompleted)) {
      buttons.push({
        text: '删除记录',
        action: 'delete',
        class: 'danger'
      });
    }

    return buttons;
  },

  previewImage(e) {
    const { urls, index } = e.currentTarget.dataset;
    if (urls && urls.length > 0) {
      previewImage(urls, index);
    }
  },

  handleActionTap(e) {
    const { action, operatorRole } = e.currentTarget.dataset;

    switch (action) {
      case 'revise':
        wx.navigateTo({
          url: `/pages/improvement/revise/revise?id=${this.data.taskId}&role=${operatorRole || ''}`
        });
        break;
      case 'collegeCheck':
        wx.navigateTo({
          url: `/pages/improvement/college-check/college-check?id=${this.data.taskId}&role=${operatorRole || ''}`
        });
        break;
      case 'review':
        wx.navigateTo({
          url: `/pages/improvement/supervisor-review/supervisor-review?id=${this.data.taskId}&role=${operatorRole || ''}`
        });
        break;
      case 'delete':
        this.handleDeleteTask();
        break;
    }
  },

  async handleDeleteTask() {
    const confirmed = await showConfirm('删除后无法恢复，确认删除该改进记录吗？', '确认删除');
    if (!confirmed) return;

    try {
      await deleteImprovement(this.data.taskId);
      showToast('删除成功', 'success');
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      console.error('删除失败:', err);
    }
  }
});
