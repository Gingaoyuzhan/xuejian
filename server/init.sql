-- =============================================
-- 教学监督反馈改进系统 - MySQL 数据库初始化脚本
-- =============================================

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS `jiaoxuejiandu` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `jiaoxuejiandu`;

-- =============================================
-- 1. 用户表
-- =============================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `openid` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '微信 openid',
  `unionid` VARCHAR(128) DEFAULT NULL COMMENT '微信 unionid',
  `role` ENUM('supervisor','teacher','admin','college','department_leader') NOT NULL COMMENT '角色：督导/教师/管理员/高教中心/二级学院领导',
  `name` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '姓名',
  `phone` VARCHAR(20) NOT NULL DEFAULT '' COMMENT '手机号',
  `department` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '所属部门/学院',
  `avatar` VARCHAR(512) DEFAULT '' COMMENT '头像URL',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY `uk_openid` (`openid`),
  INDEX `idx_role` (`role`),
  INDEX `idx_department` (`department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- =============================================
-- 2. 用户角色表（可选，多身份支持）
-- =============================================
CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL COMMENT '用户ID',
  `role` ENUM('supervisor','teacher','admin','college','department_leader') NOT NULL COMMENT '角色类型',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY `uk_user_role` (`user_id`, `role`),
  INDEX `idx_role` (`role`),
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户多角色映射表';

-- =============================================
-- 3. 课程表
-- =============================================
CREATE TABLE IF NOT EXISTS `courses` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '课程名称',
  `teacher_id` INT UNSIGNED DEFAULT NULL COMMENT '授课教师ID',
  `department` VARCHAR(100) DEFAULT '' COMMENT '所属院系',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`),
  INDEX `idx_department` (`department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程表';

-- =============================================
-- 4. 听课记录表
-- =============================================
CREATE TABLE IF NOT EXISTS `observations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `supervisor_id` INT UNSIGNED NOT NULL COMMENT '督导ID',
  `supervisor_name` VARCHAR(50) DEFAULT '' COMMENT '督导姓名（冗余）',
  `teacher_id` INT UNSIGNED NOT NULL COMMENT '被听课教师ID',
  `teacher_name` VARCHAR(50) DEFAULT '' COMMENT '教师姓名（冗余）',
  `course_id` INT UNSIGNED DEFAULT NULL COMMENT '课程ID',
  `course_name` VARCHAR(200) DEFAULT '' COMMENT '课程名称（冗余）',
  `class_info` VARCHAR(200) DEFAULT '' COMMENT '班级信息',
  `observation_date` DATE NOT NULL COMMENT '听课日期',
  `location` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '听课地点',
  `teaching_content` TEXT COMMENT '教学内容摘要',
  `opinion` TEXT COMMENT '听课意见与建议',
  `form_data` JSON DEFAULT NULL COMMENT '听课评课结构化表单数据(JSON对象)',
  `images` JSON DEFAULT NULL COMMENT '附件图片URL列表(JSON数组)',
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT '审核状态',
  `reviewer_id` INT UNSIGNED DEFAULT NULL COMMENT '审核人ID',
  `reviewer_name` VARCHAR(50) DEFAULT '' COMMENT '审核人姓名',
  `review_comment` TEXT COMMENT '审核意见',
  `review_time` DATETIME DEFAULT NULL COMMENT '审核时间',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_supervisor` (`supervisor_id`),
  INDEX `idx_teacher` (`teacher_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='听课记录表';

-- =============================================
-- 5. 持续改进表
-- =============================================
CREATE TABLE IF NOT EXISTS `improvements` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `observation_id` INT UNSIGNED DEFAULT NULL COMMENT '关联的听课记录ID',
  `teacher_id` INT UNSIGNED NOT NULL COMMENT '教师ID',
  `teacher_name` VARCHAR(50) DEFAULT '' COMMENT '教师姓名（冗余）',
  `title` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '改进标题',
  `description` TEXT COMMENT '改进描述',
  `stage` ENUM('submitted','revising','college_check','supervisor_review','completed') NOT NULL DEFAULT 'submitted' COMMENT '当前阶段',
  `images` JSON DEFAULT NULL COMMENT '附件图片(JSON数组)',
  `history` JSON DEFAULT NULL COMMENT '流转历史记录(JSON数组)',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_teacher` (`teacher_id`),
  INDEX `idx_stage` (`stage`),
  INDEX `idx_observation` (`observation_id`),
  INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='持续改进表';

-- =============================================
-- 6. 通知表
-- =============================================
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NOT NULL COMMENT '接收用户ID',
  `title` VARCHAR(200) NOT NULL DEFAULT '' COMMENT '通知标题',
  `content` TEXT COMMENT '通知内容',
  `type` VARCHAR(50) DEFAULT 'system' COMMENT '通知类型',
  `related_id` INT UNSIGNED DEFAULT NULL COMMENT '关联业务ID',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读 0=未读 1=已读',
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_user` (`user_id`),
  INDEX `idx_read` (`is_read`),
  INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知表';
