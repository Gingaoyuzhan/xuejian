# 教学监督反馈改进 - 微信小程序

基于微信云开发的教学质量监督与持续改进管理小程序。

## 项目概述

本项目是一个教学监督反馈改进系统，主要功能包括：

1. **听课评课板块**：督导听课记录、上级审核、教师查看
2. **持续改进板块**：支持多级退回的工作流（督导→教师→学院→督导）

## 技术栈

- **前端**：原生微信小程序
- **后端**：微信云开发
  - 云数据库（存储数据）
  - 云函数（业务逻辑）
  - 云存储（图片文件）

## 项目结构

```
jiaoxuejiandu/
├── miniprogram/           # 小程序前端代码
│   ├── pages/            # 页面文件
│   │   ├── index/        # 首页
│   │   ├── login/        # 登录页
│   │   ├── profile/      # 个人中心
│   │   ├── observation/  # 听课评课模块
│   │   └── improvement/  # 持续改进模块
│   ├── components/       # 公共组件
│   ├── utils/           # 工具函数
│   ├── styles/          # 全局样式
│   ├── app.js           # 小程序入口
│   ├── app.json         # 小程序配置
│   └── app.wxss         # 全局样式
│
└── cloudfunctions/       # 云函数
    ├── common/           # 公共模块
    ├── login/            # 登录云函数
    ├── observation/      # 听课评课云函数
    └── improvement/      # 持续改进云函数
```

## 数据库设计

### users（用户表）
- openid: 微信openid
- name: 姓名
- role: 角色（supervisor/teacher/admin/college）
- phone: 手机号
- department: 所属部门/学院

### observations（听课记录表）
- supervisorId: 督导ID
- teacherId: 被听课教师ID
- courseName: 课程名称
- observationDate: 听课时间
- location: 听课地点
- opinion: 督导意见
- images: 现场图片
- status: 审核状态（pending/approved/rejected）

### improvements（持续改进记录表）
- supervisorId: 督导ID
- teacherId: 教师ID
- collegeId: 学院ID
- issueTitle: 问题标题
- issueDescription: 问题描述
- currentStage: 当前阶段（submitted/revising/college_check/supervisor_review/completed）
- stageHistory: 阶段历史记录
- revisionMaterial: 教师修改材料
- collegeCheckResult: 学院检查结果
- supervisorReviewResult: 督导审核结果

## 用户角色

| 角色 | 代码 | 权限 |
|-----|------|-----|
| 督导 | supervisor | 创建听课记录、创建改进任务、审核改进任务 |
| 教师 | teacher | 查看听课记录、提交修改材料 |
| 管理员 | admin | 审核听课记录、查看所有记录 |
| 学院 | college | 检查改进任务、查看本院记录 |

## 持续改进工作流

```
督导创建问题
    ↓
已提交（submitted）
    ↓
教师修改材料（revising）
    ↓ [学院检查不通过可退回]
学院检查（college_check）
    ↓ [督导审核不通过可退回]
督导审核（supervisor_review）
    ↓
已完成（completed）
```

## 开发指南

### 环境配置

1. 打开微信开发者工具
2. 导入项目，选择 `miniprogram` 目录
3. 在微信开发者工具中开通云开发
4. 修改 `app.js` 中的云开发环境ID
5. 创建数据库集合
6. 上传云函数并部署

### 数据库集合创建

在云开发控制台创建以下集合：
- users
- observations
- improvements
- notifications

### 云函数部署

右键云函数文件夹，选择"上传并部署：云端安装依赖"

## 开发规范

- 所有颜色、字号、间距使用全局变量，禁止硬编码
- 组件遵循单一职责原则
- 所有接口返回统一格式
- 使用 TodoWrite 工具跟踪任务进度

## 待完成功能

- [ ] 通知功能
- [ ] 教师列表选择组件
- [ ] 消息推送
- [ ] 数据统计报表
- [ ] 图表可视化

## 注意事项

1. 使用前需要配置微信云开发环境
2. 需要在云开发控制台创建数据库集合
3. 需要上传并部署所有云函数
4. 小程序需要配置合法域名

## 许可证

MIT
