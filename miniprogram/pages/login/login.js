// pages/login/login.js
/**
 * 登录页面
 * 获取用户信息并进行角色选择
 */

import { login as loginApi, getLoginPrefill } from '../../utils/request.js';
import { showToast } from '../../utils/util.js';
import { USER_ROLE, USER_ROLE_NAME, normalizeRoles, getPrimaryRole } from '../../utils/constants.js';

const app = getApp();
const ROLE_TEXT_OVERRIDES = {};

function getDisplayRoleName(role) {
  return ROLE_TEXT_OVERRIDES[role] || USER_ROLE_NAME[role] || role;
}

function getPrivilegedRoles(roles = []) {
  return normalizeRoles(roles).filter(role => role !== USER_ROLE.TEACHER);
}

Page({
  /**
   * 页面数据
   */
  data: {
    // 用户信息
    userInfo: {
      avatarUrl: '',
      nickName: ''
    },
    // 是否授权中
    authorizing: false,
    // 是否显示角色选择
    showRoleSelect: true,
    // 可选角色列表
    roleList: [
      { value: USER_ROLE.SUPERVISOR, label: getDisplayRoleName(USER_ROLE.SUPERVISOR), icon: '🧭' },
      { value: USER_ROLE.TEACHER, label: getDisplayRoleName(USER_ROLE.TEACHER), icon: '👨‍🏫' },
      { value: USER_ROLE.COLLEGE, label: getDisplayRoleName(USER_ROLE.COLLEGE), icon: '🏢' },
      { value: USER_ROLE.DEPARTMENT_LEADER, label: getDisplayRoleName(USER_ROLE.DEPARTMENT_LEADER), icon: '📊' },
      { value: USER_ROLE.ADMIN, label: getDisplayRoleName(USER_ROLE.ADMIN), icon: '🔐' }
    ],
    // 选中的角色
    selectedRoles: [],
    selectedRoleText: '',
    // 手机号
    phone: '',
    // 姓名
    name: '',
    // 所属部门/单位
    department: '',
    // 管理员密码
    password: '',
    // 管理员预开通身份自动填充
    prefillLocked: false,
    prefillMatched: false,
    prefillLoading: false,
    prefillMessage: '',
    // 是否同意协议
    agreed: false
  },

  /**
   * 生命周期
   */
  onLoad() {
    this.prefillRequestId = 0;
    // 检查是否已登录
    if (app.globalData.isLoggedIn) {
      this.redirectToHome();
      return;
    }
  },

  getSelectedRoleText(roles = []) {
    return roles.map(role => getDisplayRoleName(role)).join(' / ');
  },

  /**
   * 获取微信用户信息（新版API，无需授权或降级处理）
   */
  async getUserProfile() {
    this.setData({ authorizing: true });

    try {
      // 尝试获取用户信息
      const profileRes = await wx.getUserProfile({
        desc: '用于完善用户资料'
      });

      this.setData({
        userInfo: profileRes.userInfo,
        authorizing: false
      });
    } catch (err) {
      console.warn('获取用户信息失败/降级:', err);
      // 头像昵称授权不是登录前置条件，失败后仍可直接填写资料登录
      if (err.errMsg && !err.errMsg.includes('cancel')) {
        showToast('获取微信头像昵称失败，可直接填写登录信息', 'none');
      }

      this.setData({
        userInfo: {
          ...(this.data.userInfo || {}),
          avatarUrl: this.data.userInfo?.avatarUrl || '',
          nickName: this.data.userInfo?.nickName || ''
        },
        authorizing: false
      });
    }
  },

  /**
   * 选择角色
   */
  selectRole(e) {
    const { role } = e.currentTarget.dataset;
    const selectedRoles = new Set(this.data.selectedRoles);
    if (selectedRoles.has(role)) {
      selectedRoles.delete(role);
    } else {
      selectedRoles.add(role);
    }

    this.setData({
      selectedRoles: [...selectedRoles],
      selectedRoleText: this.getSelectedRoleText([...selectedRoles])
    }, () => {
      this.syncPrefill();
    });
  },

  /**
   * 手机号输入
   */
  onPhoneInput(e) {
    this.setData({
      phone: e.detail.value
    }, () => {
      this.syncPrefill();
    });
  },

  /**
   * 姓名输入
   */
  onNameInput(e) {
    if (this.data.prefillLocked) return;
    this.setData({
      name: e.detail.value
    });
  },

  /**
   * 部门输入
   */
  onDepartmentInput(e) {
    if (this.data.prefillLocked) return;
    this.setData({
      department: e.detail.value
    });
  },

  async syncPrefill() {
    const phone = String(this.data.phone || '').trim();
    const privilegedRoles = getPrivilegedRoles(this.data.selectedRoles);

    if (!/^1[3-9]\d{9}$/.test(phone) || privilegedRoles.length === 0) {
      this.prefillRequestId += 1;
      this.setData({
        prefillLocked: false,
        prefillMatched: false,
        prefillLoading: false,
        prefillMessage: ''
      });
      return;
    }

    const requestId = (this.prefillRequestId || 0) + 1;
    this.prefillRequestId = requestId;
    this.setData({
      prefillLoading: true,
      prefillMessage: '正在匹配管理员预开通身份...'
    });

    try {
      const res = await getLoginPrefill(phone, privilegedRoles);
      if (this.prefillRequestId !== requestId) return;

      if (res.exists) {
        this.setData({
          name: res.name || this.data.name,
          department: res.department || this.data.department,
          prefillLocked: Boolean(res.locked),
          prefillMatched: true,
          prefillLoading: false,
          prefillMessage: '已匹配管理员预开通身份，姓名和单位已自动填充'
        });
        return;
      }

      this.setData({
        prefillLocked: false,
        prefillMatched: false,
        prefillLoading: false,
        prefillMessage: '未匹配到管理员预开通身份，提交时系统会按开通状态校验'
      });
    } catch (err) {
      if (this.prefillRequestId !== requestId) return;
      console.warn('获取登录预填充失败:', err);
      this.setData({
        prefillLocked: false,
        prefillMatched: false,
        prefillLoading: false,
        prefillMessage: ''
      });
    }
  },

  /**
   * 密码输入
   */
  onPasswordInput(e) {
    this.setData({
      password: e.detail.value
    });
  },

  /**
   * 切换协议同意状态
   */
  toggleAgreement() {
    this.setData({
      agreed: !this.data.agreed
    });
  },

  /**
   * 查看用户服务协议
   */
  openServiceAgreement() {
    wx.navigateTo({
      url: '/pages/agreement/service'
    });
  },

  /**
   * 查看隐私政策
   */
  openPrivacyPolicy() {
    wx.navigateTo({
      url: '/pages/agreement/privacy'
    });
  },

  /**
   * 提交登录
   */
  async handleLogin() {
    const { userInfo, selectedRoles, phone, name, department, password } = this.data;
    const normalizedRoles = normalizeRoles(selectedRoles);

    // 验证
    if (normalizedRoles.length === 0) {
      showToast('请至少选择一个身份', 'none');
      return;
    }

    if (!name || !name.trim()) {
      showToast('请输入您的姓名', 'none');
      return;
    }

    if (!phone || !phone.trim()) {
      showToast('请输入手机号', 'none');
      return;
    }

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      showToast('请输入正确的手机号', 'none');
      return;
    }

    if (!department || !department.trim()) {
      showToast('请输入所属部门/单位', 'none');
      return;
    }

    // 检查协议勾选
    if (!this.data.agreed) {
      showToast('请先阅读并同意用户服务协议和隐私政策', 'none');
      return;
    }

    if (normalizedRoles.includes(USER_ROLE.ADMIN) && (!password || !password.trim())) {
      showToast('请输入管理员授权码', 'none');
      return;
    }

    try {
      wx.showLoading({
        title: '登录中...',
        mask: true
      });

      const code = await this.getLoginCode();
      const res = await loginApi({
        code,
        userInfo,
        role: getPrimaryRole(normalizedRoles),
        roles: normalizedRoles,
        phone: phone.trim(),
        name: name.trim(),
        department: department.trim(),
        password: password.trim()
      });

      // 保存用户信息
      app.setUserInfo(res);

      wx.hideLoading();
      showToast('登录成功', 'success');

      // 跳转首页
      setTimeout(() => {
        this.redirectToHome();
      }, 1000);

    } catch (err) {
      wx.hideLoading();
      console.error('登录失败:', {
        apiBaseUrl: app.globalData.apiBaseUrl,
        error: err
      });
      if ((err.message || '').includes('缺少 openid')) {
        showToast('后端仍是旧版登录接口，请先部署最新服务端', 'none');
        return;
      }
      showToast(err.message || '登录失败，请重试', 'none');
    }
  },

  getLoginCode() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            resolve(res.code);
            return;
          }
          reject(new Error('获取微信登录凭证失败，请重试'));
        },
        fail: () => {
          reject(new Error('获取微信登录凭证失败，请检查微信登录状态'));
        }
      });
    });
  },

  /**
   * 登录成功后返回
   * 优先返回上一页（用户原先浏览的页面），没有上一页时跳转首页
   */
  redirectToHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      // 有上一页，返回上一页（游客模式下来自某个Tab页）
      wx.navigateBack();
    } else {
      // 没有上一页（直接打开登录页的场景），跳转首页
      wx.switchTab({
        url: '/pages/index/index'
      });
    }
  }
});
