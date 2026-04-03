// pages/observation/audit-detail/audit-detail.js
/**
 * 听课记录审核详情页（高教中心）
 */

import { getObservationDetail, auditObservation } from '../../../utils/request.js';
import { showToast, showConfirm, formatDate, previewImage } from '../../../utils/util.js';
import { USER_ROLE, hasAnyRole } from '../../../utils/constants.js';

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
  data: {
    recordId: '',
    record: null,
    auditComment: '',
    approving: false,
    rejecting: false
  },

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

  checkLogin() {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/login/login' });
      return false;
    }

    if (!hasAnyRole(app.globalData.userInfo, [USER_ROLE.COLLEGE, USER_ROLE.ADMIN])) {
      showToast('只有高教中心或管理员可以审核', 'none');
      wx.navigateBack();
      return false;
    }

    return true;
  },

  async loadDetail() {
    try {
      const { recordId } = this.data;
      const res = await getObservationDetail(recordId);
      const formData = normalizeFormData(res);

      this.setData({
        record: {
          ...res,
          formData,
          observationDateText: formatObservationDate(formData),
          createTimeFormatted: formatDate(res.createTime)
        },
        auditComment: res.reviewComment || ''
      });
    } catch (err) {
      console.error('加载详情失败:', err);
    }
  },

  onCommentInput(e) {
    this.setData({
      auditComment: e.detail.value
    });
  },

  previewImage(e) {
    const { urls, index } = e.currentTarget.dataset;
    if (urls && urls.length > 0) {
      previewImage(urls, index);
    }
  },

  async handleApprove() {
    const confirmed = await showConfirm('确认通过该听课记录吗？', '确认通过');
    if (!confirmed) return;

    await this.submitAudit(true);
  },

  async handleReject() {
    if (!this.data.auditComment.trim()) {
      showToast('请填写驳回原因', 'none');
      return;
    }

    const confirmed = await showConfirm('确认驳回该听课记录吗？', '确认驳回');
    if (!confirmed) return;

    await this.submitAudit(false);
  },

  async submitAudit(approved) {
    try {
      const { recordId, auditComment } = this.data;
      const userInfo = app.globalData.userInfo;

      await auditObservation({
        recordId,
        reviewerId: userInfo.id,
        reviewerName: userInfo.name,
        approved,
        comment: auditComment
      });

      showToast(approved ? '审核通过' : '已驳回', 'success');

      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (err) {
      console.error('审核失败:', err);
    }
  }
});
