'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const Organization = sequelize.define('Organization', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  shortName: { type: DataTypes.STRING(64), field: 'short_name' },
  regulator: { type: DataTypes.STRING(128), defaultValue: 'RBI / Registrar of Co-operative Societies, Kerala' },
  address: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('ACTIVE', 'INACTIVE'), allowNull: false, defaultValue: 'ACTIVE' },
  // Kerala UCB licensing class — one of the 6 classes in the KSR pay-scale
  // annexure. Required at organisation-creation time, and can be changed
  // at any time afterwards (see services/orgFields.js /
  // services/payScaleLibrary.js). Drives which reference pay-scale/post
  // library is auto-provisioned for this bank; changing it only ADDS the
  // new class's posts/scales (namespaced by class) if not already present
  // — it never edits or removes anything already there. NULL only for
  // organisations created before this field existed.
  bankClass: {
    type: DataTypes.ENUM('SPECIAL_GRADE', 'CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV', 'CLASS_V'),
    allowNull: true,
    field: 'bank_class',
  },
  // Optional "license" expiry — like status, but time-boxed instead of a
  // manual flip. NULL means no expiry (perpetual). Enforced in
  // services/orgAccess.js, checked at login and on every authenticated
  // request, not just at login time.
  licenseExpiresAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'license_expires_at' },
  // License plan & limits. licenseStartsAt: access is refused before this
  // date (NULL = effective immediately). maxUsers / maxEmployees: NULL means
  // unlimited; counted over ACTIVE rows only, enforced when a user/employee
  // is created or reactivated (services/license.js).
  licensePlan: { type: DataTypes.STRING(32), allowNull: true, field: 'license_plan' },
  licenseStartsAt: { type: DataTypes.DATEONLY, allowNull: true, field: 'license_starts_at' },
  maxUsers: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'max_users' },
  maxEmployees: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'max_employees' },
  licenseNotes: { type: DataTypes.STRING(500), allowNull: true, field: 'license_notes' },
  // Contact details the bank maintains itself from its Settings page.
  contactEmail: { type: DataTypes.STRING(255), allowNull: true, field: 'contact_email' },
  contactPhone: { type: DataTypes.STRING(64), allowNull: true, field: 'contact_phone' },
  website: { type: DataTypes.STRING(255), allowNull: true },
  // Which optional Employee fields this organisation requires at create/
  // update time — { fieldKey: true|false }. Missing keys default to
  // required (see services/orgFields.js MANDATORY_FIELD_KEYS for the full
  // list and each field's default). Per-organisation, not platform-wide —
  // set by that organisation's own Org Admin, one bank's policy never
  // affects another's. NULL = every field still at its default.
  mandatoryEmployeeFields: { type: DataTypes.JSON, allowNull: true, field: 'mandatory_employee_fields' },

  // ---- Organisation Profile (Org Admin -> Organisation Profile) — the
  // bank's own statutory/registration details, separate from the licence
  // fields above (which only a Super Admin controls). `address` above
  // already serves as the Head Office address — see document headers/
  // footers (services/documentHeader.js), which print it as such. ----
  establishedYear: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'established_year' },
  registrationNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'registration_number' },
  rbiLicenseNumber: { type: DataTypes.STRING(128), allowNull: true, field: 'rbi_license_number' },
  rbiLicenseDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'rbi_license_date' },
  gstn: { type: DataTypes.STRING(32), allowNull: true },
  panNumber: { type: DataTypes.STRING(16), allowNull: true, field: 'pan_number' },
}, {
  tableName: 'organization',
});

module.exports = Organization;
