'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const ROLES = [
  'SUPER_ADMIN', 'ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER',
  'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY',
  'DEPARTMENT_HEAD', 'EMPLOYEE',
];

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  organizationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'organization_id' }, // NULL only for SUPER_ADMIN
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
  name: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM(...ROLES), allowNull: false },
  employeeId: { type: DataTypes.INTEGER.UNSIGNED, field: 'employee_id' },
  mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'must_change_password' },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  lastLoginAt: { type: DataTypes.DATE, field: 'last_login_at' },
  // MFA (TOTP) — optional, off by default, the account holder turns it on
  // for themselves from My account. mfaSecret is AES-256-GCM encrypted at
  // rest (see services/authService.js), never stored or returned in plain
  // form once enrolled.
  mfaEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'mfa_enabled' },
  mfaSecret: { type: DataTypes.STRING(255), allowNull: true, field: 'mfa_secret' },
  mfaEnrolledAt: { type: DataTypes.DATE, allowNull: true, field: 'mfa_enrolled_at' },
}, {
  tableName: 'users',
  validate: {
    superAdminHasNoOrg() {
      if (this.role === 'SUPER_ADMIN' && this.organizationId != null) {
        throw new Error('SUPER_ADMIN users must not belong to an organization');
      }
      if (this.role !== 'SUPER_ADMIN' && this.organizationId == null) {
        throw new Error('Non-SUPER_ADMIN users must belong to an organization');
      }
    },
  },
});

User.ROLES = ROLES;

module.exports = User;
