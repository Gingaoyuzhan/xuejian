// pages/improvement/college-check/college-check.js
/**
 * 高教中心复查页
 */

import { getImprovementDetail, advanceImprovement } from '../../../utils/request.js';
import { showToast, showConfirm, previewImage } from '../../../utils/util.js';
import { USER_ROLE, hasRole } from '../../../utils/constants.js';

const app = getApp();

Page({
  data: {
    taskId: '',
    operatorRole: USER_ROLE.COLLEGE,
    task: null,
    formData: {
      reviewStatus: '',
      images: []
    }
  },

  onLoad(options) {
    if (!this.checkLogin()) return;

    wx.setNavigationBarTitle({
      title: '高教中心复查'
    });

    const { id } = options;
    if (!id) {
      showToast('参数错误', 'none');
      return wx.navigateBack();
    }

    this.setData({
      taskId: id,
      operatorRole: options.role || USER_ROLE.COLLEGE
    });
    this.loadTask();
  },

  checkLogin() {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/login/login' });
      return false;
    }

    if (!hasRole(app.globalData.userInfo, USER_ROLE.COLLEGE)) {
      showToast('只有高教中心可以执行复查', 'none');
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

  onStatusInput(e) {
    this.setData({
      'formData.reviewStatus': e.detail.value
    });
  },

  onImageChange(e) {
    this.setData({
      'formData.images': e.detail.value
    });
  },

  previewImage(e) {
    const { urls, index } = e.currentTarget.dataset;
    if (urls && urls.length > 0) {
      previewImage(urls, index);
    }
  },

  async handleApprove() {
    if (!this.data.formData.reviewStatus.trim()) {
      showToast('请填写复查情况', 'none');
      return;
    }

    const confirmed = await showConfirm('确认提交学校督导复核吗？', '确认提交');
    if (!confirmed) return;

    await this.submitCheck(true);
  },

  async handleReturn() {
    if (!this.data.formData.reviewStatus.trim()) {
      showToast('请填写退回原因', 'none');
      return;
    }

    const confirmed = await showConfirm('确认退回二级处理吗？', '确认退回');
    if (!confirmed) return;

    await this.submitCheck(false);
  },

  async submitCheck(approved) {
    try {
      await advanceImprovement({
        recordId: this.data.taskId,
        action: approved ? 'college_check_pass' : 'college_check_return',
        operatorId: app.globalData.userInfo.id,
        operatorName: app.globalData.userInfo.name,
        operatorRole: this.data.operatorRole,
        reviewStatus: this.data.formData.reviewStatus,
        comment: this.data.formData.reviewStatus,
        images: this.data.formData.images
      });

      showToast(approved ? '已提交学校督导复核' : '已退回', 'success');
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      console.error('提交失败:', err);
    }
  }
});
