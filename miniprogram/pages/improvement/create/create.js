// pages/improvement/create/create.js
/**
 * 发起持续改进页
 */

import { createImprovement } from '../../../utils/request.js';
import { showToast, showConfirm } from '../../../utils/util.js';
import { USER_ROLE, hasAnyRole, pickRole } from '../../../utils/constants.js';

const app = getApp();

function getDateDisplay(dateString) {
  if (!dateString) {
    return {
      year: '20__',
      month: '__',
      day: '__'
    };
  }

  const [year, month, day] = dateString.split('-');
  return { year, month, day };
}

Page({
  data: {
    dateDisplay: getDateDisplay(''),
    formData: {
      teacherId: '',
      teacherName: '',
      collegeName: '',
      inspectionDate: '',
      inspectionIssues: '',
      issueImages: []
    }
  },

  onLoad() {
    if (!this.checkLogin()) return;

    wx.setNavigationBarTitle({
      title: '发起持续改进'
    });

    const department = app.globalData.userInfo?.department || '';
    if (department) {
      this.setData({
        'formData.collegeName': department
      });
    }
  },

  checkLogin() {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/login/login' });
      return false;
    }

    if (!hasAnyRole(app.globalData.userInfo, [USER_ROLE.SUPERVISOR, USER_ROLE.COLLEGE])) {
      showToast('只有督导或高教中心可以发起持续改进', 'none');
      wx.navigateBack();
      return false;
    }

    return true;
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    const updates = {
      [`formData.${field}`]: value
    };

    if (field === 'teacherName') {
      updates['formData.teacherId'] = '';
    }

    this.setData(updates);
  },

  onDateChange(e) {
    const inspectionDate = e.detail.value;
    this.setData({
      'formData.inspectionDate': inspectionDate,
      dateDisplay: getDateDisplay(inspectionDate)
    });
  },

  onImageChange(e) {
    this.setData({
      'formData.issueImages': e.detail.value
    });
  },

  validateForm() {
    const { formData } = this.data;

    if (!formData.teacherName?.trim()) {
      showToast('请输入教师姓名', 'none');
      return false;
    }
    if (!formData.collegeName?.trim()) {
      showToast('请输入所属学院', 'none');
      return false;
    }
    if (!formData.inspectionDate) {
      showToast('请选择检查日期', 'none');
      return false;
    }
    if (!formData.inspectionIssues?.trim()) {
      showToast('请填写检查学院存在问题', 'none');
      return false;
    }

    return true;
  },

  async handleSubmit() {
    if (!this.validateForm()) return;

    const confirmed = await showConfirm('确认发起持续改进事项吗？', '确认发起');
    if (!confirmed) return;

    try {
      const { formData } = this.data;

      await createImprovement({
        teacherId: formData.teacherId,
        teacherName: formData.teacherName,
        collegeName: formData.collegeName,
        inspectionDate: formData.inspectionDate,
        inspectionIssues: formData.inspectionIssues,
        images: formData.issueImages,
        operatorRole: pickRole(app.globalData.userInfo, [USER_ROLE.COLLEGE, USER_ROLE.SUPERVISOR])
      });

      showToast('创建成功', 'success');
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      console.error('创建失败:', err);
    }
  }
});
