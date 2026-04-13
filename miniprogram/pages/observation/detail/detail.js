// pages/observation/detail/detail.js
/**
 * 听课记录详情页
 */

import { getObservationDetail, deleteObservation } from '../../../utils/request.js';
import { showToast, showConfirm, formatDate, previewImage } from '../../../utils/util.js';
import { OBSERVATION_STATUS, USER_ROLE, hasAnyRole } from '../../../utils/constants.js';

const app = getApp();

function getWeekdayLabel(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return '';

  const weekdayMap = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return weekdayMap[new Date(year, month - 1, day).getDay()];
}

function normalizeFormData(record = {}) {
  const formData = record.formData || {};
  const observationDate = (formData.observationDate || record.observationDate || '').slice(0, 10);

  return {
    teacherName: formData.teacherName || record.teacherName || '',
    teacherTitle: formData.teacherTitle || '',
    unitName: formData.unitName || '',
    courseName: formData.courseName || record.courseName || '',
    location: formData.location || record.location || '',
    classInfo: formData.classInfo || record.classInfo || '',
    observationDate,
    weekday: formData.weekday || getWeekdayLabel(observationDate),
    lessonNumber: formData.lessonNumber || '',
    teachingProcess: formData.teachingProcess || record.teachingContent || '',
    teachingEffect: formData.teachingEffect || '',
    improvementSuggestions: formData.improvementSuggestions || record.opinion || '',
    images: formData.images || record.images || []
  };
}

function formatObservationDate(formData) {
  if (!formData.observationDate) {
    return '-';
  }

  const [year, month, day] = formData.observationDate.split('-');
  return `${year}年${month}月${day}日 ${formData.weekday || ''}`.trim();
}

Page({
  /**
   * 页面数据
   */
  data: {
    recordId: '',
    record: null,
    statusText: '',
    canEdit: false,
    canDelete: false,
    canAudit: false
  },

  /**
   * 生命周期
   */
  onLoad(options) {
    if (!this.checkLogin()) return;

    const { id } = options;
    if (!id) {
      showToast('参数错误', 'none');
      wx.navigateBack();
      return;
    }

    this.setData({ recordId: id });
    this.loadDetail();
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return false;
    }
    return true;
  },

  /**
   * 加载详情
   */
  async loadDetail() {
    try {
      const { recordId } = this.data;
      const userInfo = app.globalData.userInfo;
      const res = await getObservationDetail(recordId);
      const formData = normalizeFormData(res);

      const record = {
        ...res,
        formData,
        observationDateText: formatObservationDate(formData),
        createTimeFormatted: formatDate(res.createTime),
        reviewTimeFormatted: res.reviewTime ? formatDate(res.reviewTime) : ''
      };

      const isOwner = Number(res.supervisorId) === Number(userInfo.id);
      const isAdmin = hasAnyRole(userInfo, [USER_ROLE.ADMIN]);

      // 待审核和被驳回状态下创建者可编辑；管理员始终可编辑（已通过除外）
      const canEdit = (isOwner && res.status !== OBSERVATION_STATUS.APPROVED)
        || (isAdmin && res.status !== OBSERVATION_STATUS.APPROVED);

      // 创建者可删除待审核/被驳回的记录；管理员可删除任何记录
      const canDelete = (isOwner && res.status !== OBSERVATION_STATUS.APPROVED)
        || isAdmin;

      const canAudit = hasAnyRole(userInfo, [USER_ROLE.COLLEGE, USER_ROLE.ADMIN])
        && res.status === OBSERVATION_STATUS.PENDING;

      this.setData({
        record,
        statusText: this.getStatusText(res.status),
        canEdit,
        canDelete,
        canAudit
      });
    } catch (err) {
      console.error('加载详情失败:', err);
    }
  },

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    const map = {
      [OBSERVATION_STATUS.PENDING]: '待审核',
      [OBSERVATION_STATUS.APPROVED]: '已通过',
      [OBSERVATION_STATUS.REJECTED]: '已驳回'
    };
    return map[status] || status;
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const { urls, index } = e.currentTarget.dataset;
    if (urls && urls.length > 0) {
      previewImage(urls, index);
    }
  },

  /**
   * 编辑记录
   */
  handleEdit() {
    wx.navigateTo({
      url: `/pages/observation/create/create?id=${this.data.recordId}`
    });
  },

  /**
   * 删除记录
   */
  async handleDelete() {
    const confirmed = await showConfirm('删除后无法恢复，确认删除该听课记录吗？', '确认删除');
    if (!confirmed) return;

    try {
      await deleteObservation(this.data.recordId);
      showToast('删除成功', 'success');
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      console.error('删除失败:', err);
    }
  },

  /**
   * 审核记录
   */
  handleAudit() {
    wx.navigateTo({
      url: `/pages/observation/audit-detail/audit-detail?id=${this.data.recordId}`
    });
  }
});
