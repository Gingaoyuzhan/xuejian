// pages/observation/create/create.js
/**
 * 创建听课记录页
 */

import { getObservationDetail, createObservation, updateObservation } from '../../../utils/request.js';
import { showToast, showConfirm } from '../../../utils/util.js';
import { hasObservationCreatorRole } from '../../../utils/constants.js';

const app = getApp();

function getDefaultFormData() {
  return {
    teacherId: '',
    teacherName: '',
    teacherTitle: '',
    unitName: '',
    courseId: '',
    courseName: '',
    classInfo: '',
    observationDate: '',
    weekday: '',
    lessonNumber: '',
    location: '',
    teachingProcess: '',
    teachingEffect: '',
    improvementSuggestions: '',
    images: []
  };
}

function getWeekdayLabel(dateString) {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return '';

  const weekdayMap = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return weekdayMap[new Date(year, month - 1, day).getDay()];
}

function getDateDisplay(dateString) {
  if (!dateString) {
    return {
      year: '20__',
      month: '__',
      day: '__',
      weekday: '星期_',
      text: '请选择听课日期'
    };
  }

  const [year, month, day] = dateString.split('-');
  return {
    year,
    month,
    day,
    weekday: getWeekdayLabel(dateString),
    text: `${year}年${month}月${day}日`
  };
}

function normalizeLoadedFormData(record = {}) {
  const formData = record.formData || {};
  const observationDate = (formData.observationDate || record.observationDate || '').slice(0, 10);

  return {
    teacherId: formData.teacherId || record.teacherId || '',
    teacherName: formData.teacherName || record.teacherName || '',
    teacherTitle: formData.teacherTitle || '',
    unitName: formData.unitName || '',
    courseId: formData.courseId || record.courseId || '',
    courseName: formData.courseName || record.courseName || '',
    classInfo: formData.classInfo || record.classInfo || '',
    observationDate,
    weekday: formData.weekday || getWeekdayLabel(observationDate),
    lessonNumber: formData.lessonNumber || '',
    location: formData.location || record.location || '',
    teachingProcess: formData.teachingProcess || record.teachingContent || '',
    teachingEffect: formData.teachingEffect || '',
    improvementSuggestions: formData.improvementSuggestions || record.opinion || '',
    images: formData.images || record.images || []
  };
}

Page({
  /**
   * 页面数据
   */
  data: {
    recordId: '',
    dateDisplay: getDateDisplay(''),
    formData: getDefaultFormData()
  },

  /**
   * 生命周期
   */
  onLoad(options) {
    const { id } = options;
    if (!this.checkLogin(id)) return;

    wx.setNavigationBarTitle({
      title: id ? '修改听课记录' : '创建听课记录'
    });

    if (id) {
      this.setData({ recordId: id });
      this.loadRecord(id);
    }
  },

  /**
   * 检查登录状态
   */
  checkLogin(recordId = '') {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({
        url: '/pages/login/login'
      });
      return false;
    }

    if (!hasObservationCreatorRole(app.globalData.userInfo)) {
      showToast('只有校领导或学校督导可以填写听课记录', 'none');
      wx.navigateBack();
      return false;
    }

    return true;
  },

  /**
   * 加载记录（修改模式）
   */
  async loadRecord(id) {
    try {
      const res = await getObservationDetail(id);
      const formData = normalizeLoadedFormData(res);

      this.setData({
        formData,
        dateDisplay: getDateDisplay(formData.observationDate)
      });
    } catch (err) {
      console.error('加载记录失败:', err);
      wx.navigateBack();
    }
  },

  /**
   * 文本输入
   */
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

  /**
   * 日期变化
   */
  onDateChange(e) {
    const observationDate = e.detail.value;
    this.setData({
      'formData.observationDate': observationDate,
      'formData.weekday': getWeekdayLabel(observationDate),
      dateDisplay: getDateDisplay(observationDate)
    });
  },

  /**
   * 图片变化
   */
  onImageChange(e) {
    this.setData({
      'formData.images': e.detail.value
    });
  },

  /**
   * 验证表单
   */
  validateForm() {
    const { formData } = this.data;
    const requiredFields = [
      ['teacherName', '请输入授课教师姓名'],
      ['teacherTitle', '请输入授课教师职称'],
      ['unitName', '请输入单位'],
      ['courseName', '请输入课程名称'],
      ['observationDate', '请选择听课日期'],
      ['lessonNumber', '请输入节次'],
      ['location', '请输入授课地点'],
      ['classInfo', '请输入授课班级'],
      ['teachingProcess', '请填写教学过程'],
      ['teachingEffect', '请填写教学效果'],
      ['improvementSuggestions', '请填写评析及改进建议']
    ];

    for (const [field, message] of requiredFields) {
      if (!String(formData[field] || '').trim()) {
        showToast(message, 'none');
        return false;
      }
    }

    return true;
  },

  /**
   * 提交表单
   */
  async handleSubmit() {
    if (!this.validateForm()) return;

    const confirmed = await showConfirm(
      this.data.recordId ? '确认修改听课记录吗？' : '确认创建听课记录吗？',
      this.data.recordId ? '确认修改' : '确认创建'
    );

    if (!confirmed) return;

    try {
      const { recordId, formData } = this.data;
      const userInfo = app.globalData.userInfo;
      const submitData = {
        ...formData,
        weekday: getWeekdayLabel(formData.observationDate)
      };

      if (recordId) {
        await updateObservation(recordId, {
          userId: userInfo.id,
          ...submitData
        });

        showToast('修改成功', 'success');
      } else {
        await createObservation({
          ...submitData,
          supervisorId: userInfo.id,
          supervisorName: userInfo.name
        });

        showToast('创建成功', 'success');
      }

      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (err) {
      console.error('提交失败:', err);
    }
  }
});
