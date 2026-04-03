// pages/improvement/revise/revise.js
/**
 * 二级处理页
 */

import { getImprovementDetail, advanceImprovement } from '../../../utils/request.js';
import { showToast, showConfirm } from '../../../utils/util.js';
import { USER_ROLE, hasAnyRole, pickRole } from '../../../utils/constants.js';

const app = getApp();

Page({
  data: {
    taskId: '',
    operatorRole: '',
    task: null,
    formData: {
      improvementStatus: '',
      revisionMaterial: []
    }
  },

  onLoad(options) {
    if (!this.checkLogin()) return;

    wx.setNavigationBarTitle({
      title: '填写改进情况'
    });

    const { id } = options;
    if (!id) {
      showToast('参数错误', 'none');
      return wx.navigateBack();
    }

    this.setData({
      taskId: id,
      operatorRole: options.role || pickRole(app.globalData.userInfo, [USER_ROLE.TEACHER, USER_ROLE.DEPARTMENT_LEADER])
    });
    this.loadTask();
  },

  checkLogin() {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return false;
    }

    if (!hasAnyRole(app.globalData.userInfo, [USER_ROLE.TEACHER, USER_ROLE.DEPARTMENT_LEADER])) {
      showToast('只有教师或二级学院领导可以填写改进情况', 'none');
      wx.navigateBack();
      return false;
    }

    return true;
  },

  async loadTask() {
    try {
      const res = await getImprovementDetail(this.data.taskId);
      this.setData({ task: res });
    } catch (err) {
      console.error('加载任务失败:', err);
    }
  },

  onImageChange(e) {
    this.setData({
      'formData.revisionMaterial': e.detail.value
    });
  },

  onStatusInput(e) {
    this.setData({
      'formData.improvementStatus': e.detail.value
    });
  },

  async handleSubmit() {
    const { improvementStatus } = this.data.formData;
    if (!improvementStatus.trim()) {
      showToast('请填写改进情况', 'none');
      return;
    }

    const confirmed = await showConfirm('确认提交改进情况吗？', '确认提交');
    if (!confirmed) return;

    try {
      await advanceImprovement({
        recordId: this.data.taskId,
        action: 'revise',
        operatorId: app.globalData.userInfo.id,
        operatorName: app.globalData.userInfo.name,
        operatorRole: this.data.operatorRole,
        improvementStatus: this.data.formData.improvementStatus,
        comment: this.data.formData.improvementStatus,
        images: this.data.formData.revisionMaterial
      });

      showToast('提交成功', 'success');
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      console.error('提交失败:', err);
    }
  }
});
