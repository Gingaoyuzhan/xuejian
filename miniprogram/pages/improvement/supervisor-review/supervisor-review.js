// pages/improvement/supervisor-review/supervisor-review.js
/**
 * 督导复核页
 */

import { getImprovementDetail, advanceImprovement } from '../../../utils/request.js';
import { showToast, showConfirm, previewImage } from '../../../utils/util.js';
import { USER_ROLE, hasRole } from '../../../utils/constants.js';

const app = getApp();

Page({
  data: {
    taskId: '',
    operatorRole: USER_ROLE.SUPERVISOR,
    task: null,
    formData: {
      reviewStatus: '',
      images: []
    }
  },

  onLoad(options) {
    if (!this.checkLogin()) return;

    wx.setNavigationBarTitle({
      title: '学校督导复核'
    });

    const { id } = options;
    if (!id) {
      showToast('参数错误', 'none');
      return wx.navigateBack();
    }

    this.setData({
      taskId: id,
      operatorRole: options.role || USER_ROLE.SUPERVISOR
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

    if (!hasRole(app.globalData.userInfo, USER_ROLE.SUPERVISOR)) {
      showToast('只有学校督导可以执行复核', 'none');
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
      showToast('请填写复核情况', 'none');
      return;
    }

    const confirmed = await showConfirm('确认复核通过并闭环吗？', '确认通过');
    if (!confirmed) return;

    await this.submitReview(true);
  },

  async handleReturn() {
    if (!this.data.formData.reviewStatus.trim()) {
      showToast('请填写退回原因', 'none');
      return;
    }

    const confirmed = await showConfirm('确认退回二级处理吗？', '确认退回');
    if (!confirmed) return;

    await this.submitReview(false);
  },

  async submitReview(approved) {
    try {
      await advanceImprovement({
        recordId: this.data.taskId,
        action: approved ? 'supervisor_approve' : 'supervisor_return',
        operatorId: app.globalData.userInfo.id,
        operatorName: app.globalData.userInfo.name,
        operatorRole: this.data.operatorRole,
        reviewStatus: this.data.formData.reviewStatus,
        comment: this.data.formData.reviewStatus,
        images: this.data.formData.images
      });

      showToast(approved ? '已闭环完成' : '已退回', 'success');
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      console.error('提交失败:', err);
    }
  }
});
