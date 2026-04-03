// pages/profile/profile.js
/**
 * 个人中心页面
 */

import { USER_ROLE, hasRole, getRoleText } from '../../utils/constants.js';
import { showConfirm, showToast } from '../../utils/util.js';

const app = getApp();

Page({
  /**
   * 页面数据
   */
  data: {
    userInfo: null,
    roleText: '',
    isLoggedIn: false,
    // 菜单列表
    menuList: []
  },

  /**
   * 生命周期
   */
  onLoad() {
    // 不再强制跳转登录
  },

  onShow() {
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      this.loadUserInfo();
    }
  },

  /**
   * 跳转登录页
   */
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    const userInfo = app.globalData.userInfo;
    const roleText = getRoleText(userInfo);

    // 根据角色生成不同的菜单
    const menuList = this.getMenuList(userInfo);

    this.setData({
      userInfo,
      roleText,
      menuList
    });
  },

  /**
   * 根据角色获取菜单列表
   */
  getMenuList(userInfo) {
    const commonMenus = [
      {
        id: 'notifications',
        title: '消息通知',
        icon: '🔔',
        url: '/pages/notifications/notifications'
      }
    ];

    const roleMenus = {
      [USER_ROLE.SUPERVISOR]: [
        {
          id: 'my-observations',
          title: '我的听课记录',
          icon: '📋',
          url: '/pages/observation/list/list?filter=my'
        },
        {
          id: 'my-improvements',
          title: '持续改进事项',
          icon: '🔍',
          url: '/pages/improvement/list/list?filter=all'
        }
      ],
      [USER_ROLE.TEACHER]: [
        {
          id: 'about-me',
          title: '关于我的听课记录',
          icon: '📋',
          url: '/pages/observation/list/list?filter=about'
        },
        {
          id: 'my-tasks',
          title: '我的改进任务',
          icon: '📝',
          url: '/pages/improvement/list/list?filter=todos'
        }
      ],
      [USER_ROLE.ADMIN]: [
        {
          id: 'all-observations',
          title: '所有听课记录',
          icon: '📊',
          url: '/pages/observation/list/list?filter=all'
        },
        {
          id: 'audit-records',
          title: '审核记录',
          icon: '✅',
          url: '/pages/observation/audit/audit'
        }
      ],
      [USER_ROLE.COLLEGE]: [
        {
          id: 'college-observations',
          title: '听课记录审核',
          icon: '📋',
          url: '/pages/observation/audit/audit'
        },
        {
          id: 'college-improvements',
          title: '持续改进事项',
          icon: '🔍',
          url: '/pages/improvement/list/list?filter=all'
        }
      ],
      [USER_ROLE.DEPARTMENT_LEADER]: [
        {
          id: 'department-improvements',
          title: '本院持续改进',
          icon: '🏫',
          url: '/pages/improvement/list/list?filter=department'
        }
      ]
    };

    const settingsMenus = [
      {
        id: 'help',
        title: '帮助与反馈',
        icon: '❓',
        url: '/pages/help/help'
      },
      {
        id: 'about',
        title: '关于',
        icon: 'ℹ️',
        url: '/pages/about/about'
      }
    ];

    const menus = [...commonMenus];
    Object.keys(roleMenus).forEach(role => {
      if (hasRole(userInfo, role)) {
        roleMenus[role].forEach(menu => {
          if (!menus.some(item => item.id === menu.id)) {
            menus.push(menu);
          }
        });
      }
    });

    return [...menus, ...settingsMenus];
  },

  /**
   * 点击菜单
   */
  handleMenuTap(e) {
    const { url } = e.currentTarget.dataset;
    if (url) {
      if (url.startsWith('/pages/notifications') ||
        url.startsWith('/pages/help') ||
        url.startsWith('/pages/about')) {
        // 这些页面还没创建，提示用户
        showToast('功能开发中', 'none');
        return;
      }
      wx.navigateTo({ url });
    }
  },

  /**
   * 退出登录
   */
  async handleLogout() {
    const confirmed = await showConfirm('确定要退出登录吗？', '提示');
    if (!confirmed) return;

    // 清除用户信息
    app.clearUserInfo();

    showToast('已退出登录', 'success');

    // 跳转回首页
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index'
      });
    }, 1000);
  }
});
