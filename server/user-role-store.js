const { query } = require('./db');
const { normalizeRoles } = require('./utils');

let userRolesTablePromise = null;

async function hasUserRolesTable() {
    if (!userRolesTablePromise) {
        userRolesTablePromise = query("SHOW TABLES LIKE 'user_roles'")
            .then(rows => rows.length > 0)
            .catch(err => {
                userRolesTablePromise = null;
                throw err;
            });
    }

    return userRolesTablePromise;
}

async function loadUserRoles(userId, fallbackRole = '') {
    const roleList = [];

    if (userId && await hasUserRolesTable()) {
        const rows = await query(
            `SELECT role
             FROM user_roles
             WHERE user_id = ?
             ORDER BY FIELD(role, 'admin', 'college', 'supervisor', 'department_leader', 'teacher')`,
            [userId]
        );
        rows.forEach(item => {
            roleList.push(item.role);
        });
    }

    return normalizeRoles(roleList, fallbackRole);
}

async function attachUserRoles(user) {
    if (!user || !user.id) {
        return user || null;
    }

    return {
        ...user,
        roles: await loadUserRoles(user.id, user.role)
    };
}

async function getUserByIdWithRoles(userId) {
    const rows = await query('SELECT id, name, role, department FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
        return null;
    }
    return attachUserRoles(rows[0]);
}

async function findUserByNameWithRole(name, role) {
    if (await hasUserRolesTable()) {
        const rows = await query(
            `SELECT DISTINCT u.id, u.name, u.role, u.department
             FROM users u
             LEFT JOIN user_roles ur ON ur.user_id = u.id
             WHERE u.name = ?
               AND (u.role = ? OR ur.role = ?)
             LIMIT 1`,
            [name, role, role]
        );
        if (rows.length > 0) {
            return attachUserRoles(rows[0]);
        }
        return null;
    }

    const rows = await query(
        'SELECT id, name, role, department FROM users WHERE role = ? AND name = ? LIMIT 1',
        [role, name]
    );
    if (rows.length === 0) {
        return null;
    }
    return attachUserRoles(rows[0]);
}

async function getUserIdsByDepartmentRole(department, role) {
    if (!department) {
        return [];
    }

    if (await hasUserRolesTable()) {
        const rows = await query(
            `SELECT DISTINCT u.id
             FROM users u
             LEFT JOIN user_roles ur ON ur.user_id = u.id
             WHERE u.department = ?
               AND (u.role = ? OR ur.role = ?)
             ORDER BY u.id ASC`,
            [department, role, role]
        );
        return rows.map(item => Number(item.id));
    }

    const rows = await query(
        'SELECT id FROM users WHERE role = ? AND department = ? ORDER BY id ASC',
        [role, department]
    );
    return rows.map(item => Number(item.id));
}

async function listUsersByRole(role, department = '') {
    if (await hasUserRolesTable()) {
        const params = [role, role];
        let sql = `SELECT DISTINCT u.id, u.name, u.department
                   FROM users u
                   LEFT JOIN user_roles ur ON ur.user_id = u.id
                   WHERE (u.role = ? OR ur.role = ?)`;

        if (department) {
            sql += ' AND u.department = ?';
            params.push(department);
        }

        sql += ' ORDER BY u.name ASC';
        return query(sql, params);
    }

    const params = [role];
    let sql = 'SELECT id, name, department FROM users WHERE role = ?';
    if (department) {
        sql += ' AND department = ?';
        params.push(department);
    }
    sql += ' ORDER BY name ASC';
    return query(sql, params);
}

module.exports = {
    hasUserRolesTable,
    loadUserRoles,
    attachUserRoles,
    getUserByIdWithRoles,
    findUserByNameWithRole,
    getUserIdsByDepartmentRole,
    listUsersByRole
};
