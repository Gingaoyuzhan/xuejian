/**
 * 持续改进 API 路由
 * 替代原 cloudfunctions/improvement
 */
const express = require('express');
const router = express.Router();
const { query, insert } = require('../db');
const { toCamelCase, parseJsonFields, normalizeRoles, hasRole, hasAnyRole, getPrimaryRole } = require('../utils');
const { getUserByIdWithRoles, findUserByNameWithRole, getUserIdsByDepartmentRole } = require('../user-role-store');

const ROLE_LABEL = {
    supervisor: '学校督导',
    teacher: '教师',
    college: '高教中心',
    department_leader: '校领导',
    admin: '管理员'
};

const ACTION_LABEL = {
    submit: '一级发起',
    revise: '二级处理',
    college_check_pass: '高教中心复查通过',
    college_check_return: '高教中心退回',
    supervisor_approve: '学校督导复核通过',
    supervisor_return: '学校督导退回'
};

const IMPROVEMENT_CREATOR_ROLES = Object.keys(ROLE_LABEL);

function getActor(req) {
    if (!req.user || !req.user.id || !req.user.role) {
        return null;
    }

    const roles = normalizeRoles(req.user, req.user.role);
    return {
        id: Number(req.user.id),
        role: getPrimaryRole(roles, req.user.role),
        roles,
        openid: req.user.openid
    };
}

function unauthorized(res) {
    return res.json({ code: 401, message: '登录已失效，请重新登录', data: null });
}

function normalizeText(value) {
    return String(value || '').trim();
}

function resolveOperationRole(actor, allowedRoles = [], preferredRole = '') {
    const actorRoles = normalizeRoles(actor, actor?.role);
    const normalizedPreferredRole = normalizeText(preferredRole);

    if (normalizedPreferredRole) {
        if (allowedRoles.includes(normalizedPreferredRole) && actorRoles.includes(normalizedPreferredRole)) {
            return normalizedPreferredRole;
        }
        return '';
    }

    return allowedRoles.find(role => actorRoles.includes(role)) || '';
}

function safeArray(value) {
    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (err) {
            return [];
        }
    }

    return [];
}

async function getUserById(userId) {
    return getUserByIdWithRoles(userId);
}

async function findSupervisorByName(name) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
        return null;
    }

    return findUserByNameWithRole(normalizedName, 'supervisor');
}

async function getDepartmentTeacherIds(userId) {
    const user = await getUserById(userId);
    if (!user || !user.department) {
        return [];
    }

    return getUserIdsByDepartmentRole(user.department, 'teacher');
}

async function findTeacherByName(name) {
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
        return null;
    }

    return findUserByNameWithRole(normalizedName, 'teacher');
}

function parseHistory(historyValue) {
    if (Array.isArray(historyValue)) {
        return historyValue.filter(item => item && typeof item === 'object');
    }
    if (typeof historyValue === 'string') {
        try {
            const parsed = JSON.parse(historyValue);
            return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : [];
        } catch (err) {
            return [];
        }
    }
    return [];
}

function getEntryData(entry) {
    if (!entry || !entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data)) {
        return {};
    }
    return entry.data;
}

function getLatestHistoryEntry(history, actions) {
    const actionList = Array.isArray(actions) ? actions : [actions];
    for (let i = history.length - 1; i >= 0; i -= 1) {
        if (actionList.includes(history[i].action)) {
            return history[i];
        }
    }
    return null;
}

function getActionSummary(entry, fallbackText = '') {
    if (!entry) {
        return '';
    }

    const data = getEntryData(entry);
    if (normalizeText(data.reviewStatus)) {
        return normalizeText(data.reviewStatus);
    }
    if (normalizeText(data.improvementStatus)) {
        return normalizeText(data.improvementStatus);
    }
    if (normalizeText(entry.comment)) {
        return normalizeText(entry.comment);
    }
    return fallbackText;
}

function getIssueTitle(inspectionIssues, title) {
    const normalizedTitle = normalizeText(title);
    if (normalizedTitle) {
        return normalizedTitle;
    }

    const normalizedIssues = normalizeText(inspectionIssues);
    if (!normalizedIssues) {
        return '持续改进事项';
    }

    return normalizedIssues.length > 24
        ? `${normalizedIssues.slice(0, 24)}...`
        : normalizedIssues;
}

function getStageText(stage) {
    const map = {
        submitted: '一级发起',
        revising: '二级处理',
        college_check: '高教中心复查',
        supervisor_review: '学校督导复核',
        completed: '闭环完成'
    };
    return map[stage] || stage;
}

function getWorkflowChain(currentStage) {
    const stageOrder = ['submitted', 'revising', 'college_check', 'supervisor_review', 'completed'];
    const currentIndex = stageOrder.indexOf(currentStage);
    return [
        { key: 'submitted', title: '一级发起', actorText: '学校督导 / 高教中心', status: currentIndex > 0 ? 'completed' : (currentStage === 'submitted' ? 'active' : 'pending') },
        { key: 'revising', title: '二级处理', actorText: '校领导 / 教师', status: currentIndex > 1 ? 'completed' : (currentStage === 'revising' ? 'active' : 'pending') },
        { key: 'college_check', title: '高教中心复查', actorText: '高教中心', status: currentIndex > 2 ? 'completed' : (currentStage === 'college_check' ? 'active' : 'pending') },
        { key: 'supervisor_review', title: '学校督导复核', actorText: '学校督导', status: currentIndex > 3 ? 'completed' : (currentStage === 'supervisor_review' ? 'active' : 'pending') },
        { key: 'completed', title: '闭环完成', actorText: '流程结束', status: currentStage === 'completed' ? 'active' : 'pending' }
    ];
}

function buildImprovementSnapshot(record) {
    const history = parseHistory(record.history);
    const submitEntry = history.find(item => item.action === 'submit') || null;
    const latestReviseEntry = getLatestHistoryEntry(history, 'revise');
    const latestCollegeReviewEntry = getLatestHistoryEntry(history, ['college_check_pass', 'college_check_return']);
    const latestSupervisorReviewEntry = getLatestHistoryEntry(history, ['supervisor_approve', 'supervisor_return']);
    const submitData = getEntryData(submitEntry);
    const reviseData = getEntryData(latestReviseEntry);

    const issueImages = safeArray(submitEntry?.images || submitData.issueImages || record.images);
    const improvementImages = safeArray(latestReviseEntry?.images || reviseData.improvementImages);
    const collegeReviewImages = safeArray(latestCollegeReviewEntry?.images || getEntryData(latestCollegeReviewEntry).reviewImages);
    const supervisorReviewImages = safeArray(latestSupervisorReviewEntry?.images || getEntryData(latestSupervisorReviewEntry).reviewImages);

    const reviewSummaryLines = [];
    const collegeReviewStatus = getActionSummary(
        latestCollegeReviewEntry,
        latestCollegeReviewEntry
            ? (latestCollegeReviewEntry.action === 'college_check_pass' ? '复查通过' : '退回二级处理')
            : ''
    );
    const supervisorReviewStatus = getActionSummary(
        latestSupervisorReviewEntry,
        latestSupervisorReviewEntry
            ? (latestSupervisorReviewEntry.action === 'supervisor_approve' ? '复核通过' : '退回二级处理')
            : ''
    );

    if (collegeReviewStatus) {
        reviewSummaryLines.push(`高教中心：${collegeReviewStatus}`);
    }
    if (supervisorReviewStatus) {
        reviewSummaryLines.push(`学校督导：${supervisorReviewStatus}`);
    }

    const inspectionIssues = normalizeText(submitData.inspectionIssues || record.description);
    const issueTitle = getIssueTitle(inspectionIssues, record.title);

    return {
        history: history.map(item => ({
            ...item,
            actionText: ACTION_LABEL[item.action] || item.action,
            roleText: ROLE_LABEL[item.operator] || item.operator || ''
        })),
        issueTitle,
        inspectionDate: normalizeText(submitData.inspectionDate),
        inspectionIssues,
        collegeName: normalizeText(submitData.collegeName || record.department),
        issueImages,
        improvementStatus: getActionSummary(latestReviseEntry),
        improvementImages,
        collegeReviewStatus,
        collegeReviewImages,
        supervisorReviewStatus,
        supervisorReviewImages,
        reviewStatus: reviewSummaryLines.join('\n'),
        workflowChain: getWorkflowChain(record.stage)
    };
}

async function getSupervisorIdForRecord(record) {
    const history = parseHistory(record.history);
    const submitEntry = history.find(item => item.action === 'submit');
    if (submitEntry?.operator === 'supervisor' && submitEntry?.operatorId) {
        return Number(submitEntry.operatorId);
    }

    if (submitEntry?.operator === 'supervisor' && submitEntry?.operatorName) {
        const supervisor = await findSupervisorByName(submitEntry.operatorName);
        if (supervisor) {
            return Number(supervisor.id);
        }
    }

    if (record.observation_id) {
        const rows = await query('SELECT supervisor_id FROM observations WHERE id = ?', [record.observation_id]);
        if (rows.length > 0) {
            return Number(rows[0].supervisor_id);
        }
    }

    return 0;
}

async function filterRecordsForSupervisor(records, supervisorId) {
    const observationIds = records
        .filter(item => item.observation_id)
        .map(item => item.observation_id);

    const observationSupervisorMap = new Map();
    if (observationIds.length > 0) {
        const uniqueObservationIds = [...new Set(observationIds)];
        const rows = await query(
            `SELECT id, supervisor_id FROM observations WHERE id IN (${uniqueObservationIds.map(() => '?').join(',')})`,
            uniqueObservationIds
        );
        rows.forEach(row => {
            observationSupervisorMap.set(Number(row.id), Number(row.supervisor_id));
        });
    }

    const supervisor = await getUserById(supervisorId);

    const visibilityChecks = await Promise.all(records.map(async (record) => {
        const history = parseHistory(record.history);
        const submitEntry = history.find(item => item.action === 'submit');
        if (submitEntry?.operator === 'supervisor' && submitEntry?.operatorId && Number(submitEntry.operatorId) === Number(supervisorId)) {
            return record;
        }

        if (submitEntry?.operator === 'supervisor' && submitEntry?.operatorName && supervisor?.name && submitEntry.operatorName === supervisor.name) {
            return record;
        }

        if (record.observation_id && observationSupervisorMap.get(Number(record.observation_id)) === Number(supervisorId)) {
            return record;
        }

        return null;
    }));

    return visibilityChecks.filter(Boolean);
}

function normalizeImprovementRecord(record) {
    parseJsonFields(record, ['images', 'history']);

    const snapshot = buildImprovementSnapshot(record);
    record.current_stage = record.stage;
    record.stage_history = snapshot.history;
    record.issue_title = snapshot.issueTitle;
    record.issue_description = snapshot.inspectionIssues;
    record.issue_images = snapshot.issueImages;
    record.revision_material = snapshot.improvementImages;
    record.college_check_result = snapshot.collegeReviewStatus;
    record.college_check_images = snapshot.collegeReviewImages;
    record.supervisor_review_result = snapshot.supervisorReviewStatus
        ? (snapshot.supervisorReviewStatus.includes('退回') ? 'returned' : 'approved')
        : '';
    record.supervisor_review_comment = snapshot.supervisorReviewStatus;
    record.college_name = snapshot.collegeName || record.department || '';
    record.form_data = {
        inspectionDate: snapshot.inspectionDate,
        inspectionIssues: snapshot.inspectionIssues,
        improvementStatus: snapshot.improvementStatus,
        reviewStatus: snapshot.reviewStatus,
        issueImages: snapshot.issueImages,
        improvementImages: snapshot.improvementImages,
        reviewImages: [...snapshot.collegeReviewImages, ...snapshot.supervisorReviewImages]
    };
    record.workflow_chain = snapshot.workflowChain;
    record.images = snapshot.issueImages;

    return toCamelCase(record);
}

/**
 * POST /api/improvement/create
 * 创建持续改进任务
 */
router.post('/create', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const {
            observationId,
            teacherId,
            teacherName,
            collegeName,
            inspectionDate,
            inspectionIssues,
            images,
            operatorRole
        } = req.body;

        const createRole = resolveOperationRole(actor, IMPROVEMENT_CREATOR_ROLES, operatorRole) || actor.role;
        if (!createRole) {
            return res.json({ code: 403, message: '当前账号无权发起持续改进事项', data: null });
        }

        if (!normalizeText(teacherName)) {
            return res.json({ code: 400, message: '请填写教师姓名', data: null });
        }
        if (!normalizeText(inspectionDate)) {
            return res.json({ code: 400, message: '请填写检查日期', data: null });
        }
        if (!normalizeText(inspectionIssues)) {
            return res.json({ code: 400, message: '请填写检查学院存在问题', data: null });
        }

        const operator = await getUserById(actor.id);
        if (!operator) {
            return res.json({ code: 403, message: '当前账号无权发起持续改进事项', data: null });
        }

        let finalTeacherId = Number(teacherId) || 0;
        let finalTeacherName = normalizeText(teacherName);
        let teacherDepartment = normalizeText(collegeName);

        if (finalTeacherId) {
            const teacher = await getUserById(finalTeacherId);
            if (teacher && hasRole(teacher, 'teacher')) {
                finalTeacherId = teacher.id;
                finalTeacherName = teacher.name;
                teacherDepartment = teacher.department || teacherDepartment;
            }
        }

        if (!finalTeacherId && finalTeacherName) {
            const teacher = await findTeacherByName(finalTeacherName);
            if (teacher) {
                finalTeacherId = teacher.id;
                finalTeacherName = teacher.name;
                teacherDepartment = teacher.department || teacherDepartment;
            }
        }

        if (!finalTeacherId) {
            return res.json({ code: 400, message: '未找到该教师，请先确认教师已注册', data: null });
        }

        const issueImages = safeArray(images);
        const historyEntry = [{
            action: 'submit',
            operator: createRole,
            operatorId: actor.id,
            operatorName: operator.name || '',
            time: new Date().toISOString(),
            comment: `${ROLE_LABEL[createRole]}发起持续改进事项`,
            images: issueImages,
            data: {
                inspectionDate: normalizeText(inspectionDate),
                inspectionIssues: normalizeText(inspectionIssues),
                collegeName: teacherDepartment || normalizeText(collegeName),
                teacherName: finalTeacherName,
                issueImages
            }
        }];

        const id = await insert(
            `INSERT INTO improvements (observation_id, teacher_id, teacher_name, title, description, stage, images, history)
       VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)`,
            [
                observationId || null,
                finalTeacherId,
                finalTeacherName,
                getIssueTitle(inspectionIssues, ''),
                normalizeText(inspectionIssues),
                JSON.stringify(issueImages),
                JSON.stringify(historyEntry)
            ]
        );

        res.json({ code: 0, message: '创建成功', data: { id, teacherDepartment } });
    } catch (err) {
        console.error('创建持续改进失败:', err);
        res.json({ code: -1, message: '创建失败，请重试', data: null });
    }
});

/**
 * GET /api/improvement/list
 * 获取持续改进列表
 */
router.get('/list', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const {
            filter = 'all',
            limit = 20,
            skip = 0
        } = req.query;
        const userId = actor.id;

        const queryLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
        const querySkip = Math.max(0, Number(skip) || 0);

        let whereClauses = [];
        let params = [];

        switch (filter) {
            case 'my':
            case 'todos': {
                if (!hasRole(actor, 'teacher')) {
                    return res.json({ code: 403, message: '只有教师可以查看自己的持续改进事项', data: null });
                }
                whereClauses.push('teacher_id = ?');
                params.push(userId);
                break;
            }
            case 'created': {
                whereClauses.push("CAST(JSON_UNQUOTE(JSON_EXTRACT(history, '$[0].operatorId')) AS UNSIGNED) = ?");
                params.push(userId);
                break;
            }
            case 'pending':
            case 'in_progress': {
                if (hasRole(actor, 'department_leader') && !hasAnyRole(actor, ['college', 'supervisor', 'admin'])) {
                    whereClauses.push("stage IN ('submitted','revising')");
                    const teacherIds = await getDepartmentTeacherIds(userId);
                    if (teacherIds.length === 0) {
                        return res.json({ code: 0, message: '获取成功', data: { list: [], total: 0, limit: queryLimit, skip: querySkip } });
                    }
                    whereClauses.push(`teacher_id IN (${teacherIds.map(() => '?').join(',')})`);
                    params.push(...teacherIds);
                } else {
                    whereClauses.push("stage IN ('submitted','college_check','supervisor_review','revising')");
                }

                if (!hasAnyRole(actor, ['college', 'supervisor', 'admin', 'department_leader'])) {
                    return res.json({ code: 403, message: '无权限查看持续改进事项', data: null });
                }
                break;
            }
            case 'college_check': {
                if (!hasRole(actor, 'college')) {
                    return res.json({ code: 403, message: '只有高教中心可以查看待复查事项', data: null });
                }
                whereClauses.push("stage = 'college_check'");
                break;
            }
            case 'supervisor_review': {
                if (!hasRole(actor, 'supervisor')) {
                    return res.json({ code: 403, message: '只有学校督导可以查看待复核事项', data: null });
                }
                whereClauses.push("stage = 'supervisor_review'");
                break;
            }
            case 'completed': {
                if (hasRole(actor, 'department_leader') && !hasAnyRole(actor, ['college', 'supervisor', 'admin'])) {
                    const teacherIds = await getDepartmentTeacherIds(userId);
                    if (teacherIds.length === 0) {
                        return res.json({ code: 0, message: '获取成功', data: { list: [], total: 0, limit: queryLimit, skip: querySkip } });
                    }
                    whereClauses.push(`teacher_id IN (${teacherIds.map(() => '?').join(',')})`);
                    params.push(...teacherIds);
                } else if (!hasAnyRole(actor, ['teacher', 'college', 'supervisor', 'admin'])) {
                    return res.json({ code: 403, message: '无权限查看持续改进事项', data: null });
                }
                whereClauses.push("stage = 'completed'");
                break;
            }
            case 'college': {
                if (hasRole(actor, 'college')) {
                    const currentUser = await getUserById(userId);
                    if (currentUser?.department) {
                        const teacherIds = await getUserIdsByDepartmentRole(currentUser.department, 'teacher');
                        if (teacherIds.length === 0) {
                            return res.json({ code: 0, message: '获取成功', data: { list: [], total: 0, limit: queryLimit, skip: querySkip } });
                        }
                        whereClauses.push(`teacher_id IN (${teacherIds.map(() => '?').join(',')})`);
                        params.push(...teacherIds);
                    } else {
                        return res.json({ code: 0, message: '获取成功', data: { list: [], total: 0, limit: queryLimit, skip: querySkip } });
                    }
                } else {
                    return res.json({ code: 403, message: '只有高教中心可以按学院查看事项', data: null });
                }
                break;
            }
            case 'department': {
                if (!hasRole(actor, 'department_leader')) {
                    return res.json({ code: 403, message: '只有校领导可以查看本院事项', data: null });
                }
                const teacherIds = await getDepartmentTeacherIds(userId);
                if (teacherIds.length === 0) {
                    return res.json({ code: 0, message: '获取成功', data: { list: [], total: 0, limit: queryLimit, skip: querySkip } });
                }
                whereClauses.push(`teacher_id IN (${teacherIds.map(() => '?').join(',')})`);
                params.push(...teacherIds);
                break;
            }
            case 'all': {
                if (hasAnyRole(actor, ['supervisor', 'college', 'admin'])) {
                    break;
                }
                if (hasRole(actor, 'teacher')) {
                    whereClauses.push('teacher_id = ?');
                    params.push(userId);
                } else if (hasRole(actor, 'department_leader')) {
                    const departmentTeacherIds = await getDepartmentTeacherIds(userId);
                    if (departmentTeacherIds.length === 0) {
                        return res.json({ code: 0, message: '获取成功', data: { list: [], total: 0, limit: queryLimit, skip: querySkip } });
                    }
                    whereClauses.push(`teacher_id IN (${departmentTeacherIds.map(() => '?').join(',')})`);
                    params.push(...departmentTeacherIds);
                } else {
                    return res.json({ code: 403, message: '无权限查看持续改进事项', data: null });
                }
                break;
            }
            default:
                return res.json({ code: 400, message: '无效的筛选条件', data: null });
        }

        const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
        const qualifiedWhereSQL = whereSQL.replace(/teacher_id/g, 'i.teacher_id').replace(/stage/g, 'i.stage');
        const listSql = `SELECT i.*, u.department
               FROM improvements i
               LEFT JOIN users u ON u.id = i.teacher_id
               ${qualifiedWhereSQL}
               ORDER BY i.create_time DESC
               LIMIT ${queryLimit} OFFSET ${querySkip}`;

        const list = await query(listSql, params);
        const countResult = await query(
            `SELECT COUNT(*) as total
                 FROM improvements i
                 LEFT JOIN users u ON u.id = i.teacher_id
                 ${qualifiedWhereSQL}`,
            params
        );
        const total = countResult[0].total;

        const camelList = list.map(normalizeImprovementRecord);

        res.json({
            code: 0,
            message: '获取成功',
            data: { list: camelList, total, limit: queryLimit, skip: querySkip }
        });
    } catch (err) {
        console.error('获取持续改进列表失败:', err);
        res.json({ code: -1, message: '获取失败，请重试', data: null });
    }
});

/**
 * GET /api/improvement/detail/:id
 */
router.get('/detail/:id', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const rows = await query(
            `SELECT i.*, u.department
             FROM improvements i
             LEFT JOIN users u ON u.id = i.teacher_id
             WHERE i.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) {
            return res.json({ code: 404, message: '记录不存在', data: null });
        }

        const record = rows[0];
        const sameTeacher = Number(record.teacher_id) === Number(actor.id);
        const sameDepartmentLeader = hasRole(actor, 'department_leader') && record.department
            ? (await query('SELECT department FROM users WHERE id = ?', [actor.id]))[0]?.department === record.department
            : false;
        const canView = sameTeacher || sameDepartmentLeader || hasAnyRole(actor, ['college', 'supervisor', 'admin']);

        if (!canView) {
            return res.json({ code: 403, message: '该持续改进事项仅学校督导、高教中心、校领导及相关教师可见', data: null });
        }

        const normalizedRecord = normalizeImprovementRecord(record);
        const canViewHistory = hasAnyRole(actor, ['admin']);

        if (!canViewHistory) {
            normalizedRecord.stageHistory = [];
        }

        normalizedRecord.canViewHistory = canViewHistory;

        res.json({ code: 0, message: '获取成功', data: normalizedRecord });
    } catch (err) {
        console.error('获取持续改进详情失败:', err);
        res.json({ code: -1, message: '获取失败，请重试', data: null });
    }
});

/**
 * POST /api/improvement/advance
 * 推进改进阶段
 */
router.post('/advance', async (req, res) => {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const {
            recordId,
            action,
            operatorName,
            operatorRole,
            comment,
            images,
            improvementStatus,
            reviewStatus
        } = req.body;

        if (!recordId || !action) {
            return res.json({ code: 400, message: '参数不完整', data: null });
        }

        const rows = await query('SELECT * FROM improvements WHERE id = ?', [recordId]);
        if (rows.length === 0) {
            return res.json({ code: 404, message: '记录不存在', data: null });
        }

        const record = rows[0];
        if (!hasAnyRole(actor, ['teacher', 'college', 'supervisor', 'department_leader'])) {
            return res.json({ code: 403, message: '无权限操作持续改进流程', data: null });
        }

        let currentHistory = parseHistory(record.history);
        const transitions = {
            revise: { to: 'college_check', validStages: ['submitted', 'revising'] },
            college_check_pass: { to: 'supervisor_review', validStages: ['college_check'] },
            college_check_return: { to: 'revising', validStages: ['college_check'] },
            supervisor_approve: { to: 'completed', validStages: ['supervisor_review'] },
            supervisor_return: { to: 'revising', validStages: ['supervisor_review'] },
            submit: { to: 'college_check', validStages: ['submitted', 'revising'] }
        };

        const transition = transitions[action];
        if (!transition) {
            return res.json({ code: 400, message: '无效的操作', data: null });
        }

        if (!transition.validStages.includes(record.stage)) {
            return res.json({ code: 400, message: '当前阶段不能执行该操作', data: null });
        }

        const actionRoleMap = {
            revise: ['teacher', 'department_leader'],
            submit: ['teacher', 'department_leader'],
            college_check_pass: ['college'],
            college_check_return: ['college'],
            supervisor_approve: ['supervisor'],
            supervisor_return: ['supervisor']
        };

        const actionRole = resolveOperationRole(actor, actionRoleMap[action] || [], operatorRole);
        if (!actionRole) {
            return res.json({ code: 403, message: '当前身份无权执行该操作', data: null });
        }

        if (['revise', 'submit'].includes(action) && !['teacher', 'department_leader'].includes(actionRole)) {
            return res.json({ code: 403, message: '只有教师或校领导可以填写改进情况', data: null });
        }
        if ((action === 'college_check_pass' || action === 'college_check_return') && actionRole !== 'college') {
            return res.json({ code: 403, message: '只有高教中心可以执行复查', data: null });
        }
        if ((action === 'supervisor_approve' || action === 'supervisor_return') && actionRole !== 'supervisor') {
            return res.json({ code: 403, message: '只有学校督导可以执行复核', data: null });
        }

        if (actionRole === 'teacher' && Number(record.teacher_id) !== Number(actor.id)) {
            return res.json({ code: 403, message: '只能处理自己的持续改进事项', data: null });
        }

        if (actionRole === 'department_leader') {
            const leaderUser = await getUserById(actor.id);
            const teacherUser = await getUserById(record.teacher_id);
            if (!leaderUser || !teacherUser || !leaderUser.department || leaderUser.department !== teacherUser.department) {
                return res.json({ code: 403, message: '只能处理本部门教师的持续改进事项', data: null });
            }
        }

        if (actionRole === 'supervisor') {
            const supervisorId = await getSupervisorIdForRecord(record);
            if (supervisorId && Number(supervisorId) !== Number(actor.id)) {
                return res.json({ code: 403, message: '只能复核自己关联的持续改进事项', data: null });
            }
        }

        if (['revise', 'submit'].includes(action) && !normalizeText(improvementStatus) && !normalizeText(comment)) {
            return res.json({ code: 400, message: '请填写改进情况', data: null });
        }

        if ((action === 'college_check_return' || action === 'supervisor_return') && !normalizeText(reviewStatus) && !normalizeText(comment)) {
            return res.json({ code: 400, message: '请填写退回原因', data: null });
        }

        const operator = await getUserById(actor.id);
        const entryImages = safeArray(images);
        const entryData = {};

        if (['revise', 'submit'].includes(action)) {
            entryData.improvementStatus = normalizeText(improvementStatus || comment);
            entryData.improvementImages = entryImages;
        }

        if (['college_check_pass', 'college_check_return', 'supervisor_approve', 'supervisor_return'].includes(action)) {
            entryData.reviewStatus = normalizeText(reviewStatus || comment);
            entryData.reviewImages = entryImages;
        }

        currentHistory.push({
            action,
            operator: actionRole,
            operatorId: actor.id,
            operatorName: operator?.name || operatorName || '',
            time: new Date().toISOString(),
            comment: normalizeText(comment),
            images: entryImages,
            data: entryData
        });

        const updateFields = ['stage = ?', 'history = ?'];
        const updateParams = [transition.to, JSON.stringify(currentHistory)];

        if (images !== undefined) {
            updateFields.push('images = ?');
            updateParams.push(JSON.stringify(entryImages));
        }

        updateParams.push(recordId);
        await query(`UPDATE improvements SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);

        res.json({ code: 0, message: '操作成功', data: { stage: transition.to } });
    } catch (err) {
        console.error('推进改进阶段失败:', err);
        res.json({ code: -1, message: '操作失败，请重试', data: null });
    }
});

async function handleDeleteImprovement(req, res) {
    try {
        const actor = getActor(req);
        if (!actor) {
            return unauthorized(res);
        }

        const recordId = req.params.id;
        const rows = await query('SELECT * FROM improvements WHERE id = ?', [recordId]);
        if (rows.length === 0) {
            return res.json({ code: 404, message: '记录不存在', data: null });
        }

        const record = rows[0];
        const isAdmin = hasAnyRole(actor, ['admin']);

        // 查找发起人
        const history = parseHistory(record.history);
        const submitEntry = history.find(item => item.action === 'submit');
        const isCreator = submitEntry && Number(submitEntry.operatorId) === Number(actor.id);

        if (!isCreator && !isAdmin) {
            return res.json({ code: 403, message: '只有发起人或管理员可以删除', data: null });
        }

        // 已闭环的非管理员不可删
        if (record.stage === 'completed' && !isAdmin) {
            return res.json({ code: -1, message: '已闭环的记录不能删除，请联系管理员', data: null });
        }

        await query('DELETE FROM improvements WHERE id = ?', [recordId]);

        res.json({ code: 0, message: '删除成功', data: null });
    } catch (err) {
        console.error('删除持续改进失败:', err);
        res.json({ code: -1, message: '删除失败，请重试', data: null });
    }
}

/**
 * DELETE /api/improvement/delete/:id
 * 删除持续改进记录（发起人或管理员可删除）
 */
router.delete('/delete/:id', handleDeleteImprovement);

/**
 * POST /api/improvement/delete/:id
 * 删除持续改进兼容入口，避免代理层或旧环境对 DELETE 支持不一致
 */
router.post('/delete/:id', handleDeleteImprovement);

module.exports = router;
