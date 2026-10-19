-- ============================================================================
-- UCB HRMS & Payroll — Framework Schema (First Slice)
-- ============================================================================
-- IMPORTANT: This schema defines STRUCTURE only. It contains NO bank-specific
-- rule values (no hard-coded increment dates, no assumption that KSR 28A or
-- any other government rule applies). All such rules are DATA rows in the
-- policy tables below, configured per organization (per UCB client).
--
-- Chain enforced by the foreign keys in this file:
--   Employee -> Organization -> Applicable Service Rule (rule_reference)
--            -> Increment Policy / Pay Fixation Policy -> Calculation Engine
--            -> Transaction (employee_pay_history / employee_increment_status)
--
-- Target: MySQL 8.x (Hostinger-hosted initially, then own Linux server).
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. ORGANIZATION (tenant) — one row per UCB client
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                VARCHAR(32)  NOT NULL UNIQUE,       -- e.g. 'TUCB', 'BALUSSERY-UCB'
  name                VARCHAR(255) NOT NULL,
  short_name          VARCHAR(64),
  regulator           VARCHAR(128) DEFAULT 'RBI / Registrar of Co-operative Societies, Kerala',
  address             TEXT,
  status              ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  license_expires_at  DATE NULL,                          -- optional "license" expiry; NULL = no expiry. Same effect
                                                            -- as status=INACTIVE once the date passes, but time-boxed
                                                            -- rather than a manual flip. Checked at login AND on every
                                                            -- authenticated request (services/orgAccess.js), not just login.
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 1a. GOVERNMENT_ORDERS — GO register. A GO can be cited by several rules
--     (rule_reference rows) and can itself accumulate amendments over time
--     (rule_amendments). Kept as its own table so one GO isn't re-entered as
--     free text on every rule that cites it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS government_orders (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id     INT UNSIGNED NOT NULL,
  go_number           VARCHAR(64) NOT NULL,
  go_date             DATE NOT NULL,
  issuing_authority   VARCHAR(128),                      -- e.g. Registrar of Co-op Societies, RBI, Bank's Board
  subject             VARCHAR(255),
  document_url        VARCHAR(500),                       -- link/path to the scanned order, if available
  description         TEXT,
  status              ENUM('ACTIVE','SUPERSEDED','DRAFT') NOT NULL DEFAULT 'DRAFT',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_go_org_number (organization_id, go_number),
  CONSTRAINT fk_go_org FOREIGN KEY (organization_id) REFERENCES organization(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. RULE_REFERENCE — the KSR Rule Master / Rule-and-GO register. Every
--    policy row elsewhere must point to the rule/GO/settlement it
--    implements, so nothing in the system is a bare, unsourced assumption.
--    Extended (beyond the first slice) with the KSR-specific fields from
--    the architecture doc: part/chapter/rule number, applicable scoping,
--    machine-readable conditions, and which calculation method handles it.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rule_reference (
  id                        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id           INT UNSIGNED NOT NULL,
  rule_type                 ENUM('INCREMENT','PROMOTION','HIGHER_GRADE','PAY_REVISION','LEAVE','PENSION','SETTLEMENT','GENERAL') NOT NULL,
  title                     VARCHAR(255) NOT NULL,             -- e.g. "Kerala UCB Wage Settlement 2023"
  part                      VARCHAR(32)  NULL,                 -- e.g. "Part I"
  chapter                   VARCHAR(32)  NULL,
  rule_number               VARCHAR(32)  NULL,                 -- e.g. "31"
  applicable_employee_category VARCHAR(64) NULL,
  applicable_post_cadre_id  INT UNSIGNED NULL,                 -- FK added after post_cadre exists, below
  conditions                JSON NULL,                          -- structured eligibility predicate the engine can evaluate
  calculation_method        VARCHAR(128) NULL,                 -- e.g. "INCREMENT_ENGINE:STAGE_ADVANCE"
  government_order_id       INT UNSIGNED NULL,                 -- the GO this rule is sourced from, if registered as its own row
  go_number                 VARCHAR(64),                        -- free-text fallback when the GO isn't in government_orders yet
  go_date                   DATE,
  issuing_authority         VARCHAR(128),
  document_url              VARCHAR(500),
  description               TEXT,
  is_verified                TINYINT(1) NOT NULL DEFAULT 0,     -- must be explicitly verified before use in production policies
  status                     ENUM('ACTIVE','SUPERSEDED','DRAFT') NOT NULL DEFAULT 'DRAFT',
  effective_from             DATE NULL,
  effective_to               DATE NULL,
  created_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rule_reference_org FOREIGN KEY (organization_id) REFERENCES organization(id),
  CONSTRAINT fk_rule_reference_go FOREIGN KEY (government_order_id) REFERENCES government_orders(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2b. RULE_AMENDMENTS — chain of amending GOs against a rule_reference row,
--     so "Rule 31, as amended by GO(P) 45/2021" is structured data, not prose.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rule_amendments (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_reference_id   INT UNSIGNED NOT NULL,
  government_order_id INT UNSIGNED NULL,
  amendment_date       DATE NOT NULL,
  description          TEXT,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_amendment_rule FOREIGN KEY (rule_reference_id) REFERENCES rule_reference(id),
  CONSTRAINT fk_amendment_go FOREIGN KEY (government_order_id) REFERENCES government_orders(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. POST_CADRE — Post / Cadre master (designation ladder), per organization
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_cadre (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id     INT UNSIGNED NOT NULL,
  code                VARCHAR(32)  NOT NULL,
  name                VARCHAR(128) NOT NULL,              -- e.g. "Clerk", "Senior Manager"
  cadre               VARCHAR(64),                        -- e.g. "Clerical", "Officer", "Sub-Staff"
  cadre_level         INT,                                -- ordinal for promotion-ladder ordering
  parent_post_id      INT UNSIGNED NULL,                  -- immediate lower post this is promoted from, if linear
  default_pay_scale_id INT UNSIGNED NULL,                 -- set after pay_scale exists (FK added below)
  status              ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_post_cadre_org_code (organization_id, code),
  CONSTRAINT fk_post_cadre_org FOREIGN KEY (organization_id) REFERENCES organization(id),
  CONSTRAINT fk_post_cadre_parent FOREIGN KEY (parent_post_id) REFERENCES post_cadre(id)
) ENGINE=InnoDB;

ALTER TABLE rule_reference
  ADD CONSTRAINT fk_rule_reference_post_cadre FOREIGN KEY (applicable_post_cadre_id) REFERENCES post_cadre(id);

-- ----------------------------------------------------------------------------
-- 4. PAY_REVISION — a bank-wide wage revision / settlement event
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_revision (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id     INT UNSIGNED NOT NULL,
  name                VARCHAR(128) NOT NULL,              -- e.g. "Wage Revision 2023"
  effective_date      DATE NOT NULL,
  rule_reference_id   INT UNSIGNED NULL,                  -- settlement/GO this revision implements
  description         TEXT,
  status              ENUM('DRAFT','ACTIVE','SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_revision_org FOREIGN KEY (organization_id) REFERENCES organization(id),
  CONSTRAINT fk_pay_revision_rule FOREIGN KEY (rule_reference_id) REFERENCES rule_reference(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. PAY_SCALE — a pay scale (band), e.g. "20200-800-24400-900-30100",
--    belongs to a pay_revision (the revision that introduced/carried it)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_scale (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id     INT UNSIGNED NOT NULL,
  pay_revision_id     INT UNSIGNED NOT NULL,
  code                VARCHAR(64)  NOT NULL,              -- e.g. "SCALE-CLERK-2023"
  name                VARCHAR(128) NOT NULL,
  scale_expression    VARCHAR(255),                       -- human-readable, e.g. "20200-800-24400-900-30100"
  effective_from      DATE NOT NULL,
  effective_to        DATE NULL,
  status              ENUM('ACTIVE','SUPERSEDED') NOT NULL DEFAULT 'ACTIVE',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pay_scale_org_code (organization_id, code),
  CONSTRAINT fk_pay_scale_org FOREIGN KEY (organization_id) REFERENCES organization(id),
  CONSTRAINT fk_pay_scale_revision FOREIGN KEY (pay_revision_id) REFERENCES pay_revision(id)
) ENGINE=InnoDB;

ALTER TABLE post_cadre
  ADD CONSTRAINT fk_post_cadre_default_scale FOREIGN KEY (default_pay_scale_id) REFERENCES pay_scale(id);

-- ----------------------------------------------------------------------------
-- 6. PAY_STAGE — individual stages (steps) within a pay scale
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_stage (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pay_scale_id        INT UNSIGNED NOT NULL,
  stage_no            INT UNSIGNED NOT NULL,              -- 1, 2, 3 ... ordinal within the scale
  amount              DECIMAL(12,2) NOT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pay_stage_scale_no (pay_scale_id, stage_no),
  CONSTRAINT fk_pay_stage_scale FOREIGN KEY (pay_scale_id) REFERENCES pay_scale(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. INCREMENT_POLICY — configurable increment-date rule.
--    date_basis decides how an employee's increment date is derived;
--    NOTHING about the actual date is hard-coded in application code.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS increment_policy (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id         INT UNSIGNED NOT NULL,
  policy_name             VARCHAR(128) NOT NULL,
  date_basis              ENUM(
                             'FIXED_COMMON_DATE',        -- same date for everyone in scope, e.g. 1 July
                             'DOJ_ANNIVERSARY',          -- date of joining anniversary
                             'DOA_ANNIVERSARY',          -- date of appointment (to current post) anniversary
                             'EMPLOYEE_SPECIFIC',        -- explicit per-employee override date
                             'RULE_GRADE_CATEGORY_SPECIFIC' -- resolved from applicable_grade/applicable_category combo
                           ) NOT NULL,
  fixed_common_date       VARCHAR(5) NULL,               -- 'MM-DD', only used when date_basis = FIXED_COMMON_DATE
  applicable_grade        VARCHAR(64) NULL,
  applicable_category     VARCHAR(64) NULL,
  increment_frequency_months INT UNSIGNED NOT NULL DEFAULT 12,
  effective_from          DATE NOT NULL,
  effective_to            DATE NULL,
  rule_reference_id       INT UNSIGNED NULL,
  status                  ENUM('DRAFT','ACTIVE','INACTIVE') NOT NULL DEFAULT 'DRAFT',
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_increment_policy_org FOREIGN KEY (organization_id) REFERENCES organization(id),
  CONSTRAINT fk_increment_policy_rule FOREIGN KEY (rule_reference_id) REFERENCES rule_reference(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. PAY_FIXATION_POLICY — configurable pay-fixation rule (as specified).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_fixation_policy (
  policy_id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  policy_name                  VARCHAR(128) NOT NULL,
  organization_id              INT UNSIGNED NOT NULL,
  effective_from                DATE NOT NULL,
  effective_to                  DATE NULL,
  promotion_method              ENUM(
                                   'NOTIONAL_INCREMENT_THEN_FIX',  -- Option A
                                   'DIRECT_NEXT_HIGHER_STAGE',
                                   'DEFER_TO_NEXT_INCREMENT',      -- Option B
                                   'CUSTOM'
                                 ) NOT NULL,
  notional_increment_enabled    TINYINT(1) NOT NULL DEFAULT 0,
  notional_increment_count      INT UNSIGNED NOT NULL DEFAULT 1,
  fixation_method                VARCHAR(64) NULL,        -- free-form label for CUSTOM engines / documentation
  next_increment_option_enabled TINYINT(1) NOT NULL DEFAULT 0,  -- employee may opt to defer fixation
  option_deadline_days          INT UNSIGNED NULL,        -- days allowed to exercise the option, if enabled
  stage_selection_method        ENUM(
                                   'NEXT_HIGHER_STAGE',
                                   'NEXT_EQUAL_OR_HIGHER',
                                   'CUSTOM_RULE'
                                 ) NOT NULL,
  rounding_method                ENUM('NONE','ROUND_UP','ROUND_DOWN','ROUND_NEAREST') NOT NULL DEFAULT 'NONE',
  applicable_grade               VARCHAR(64) NULL,
  applicable_category            VARCHAR(64) NULL,
  rule_reference_id              INT UNSIGNED NULL,
  go_reference                   VARCHAR(128) NULL,        -- free-text GO/circular number, in addition to rule_reference FK
  status                         ENUM('DRAFT','ACTIVE','INACTIVE') NOT NULL DEFAULT 'DRAFT',
  created_at                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_fixation_policy_org FOREIGN KEY (organization_id) REFERENCES organization(id),
  CONSTRAINT fk_pay_fixation_policy_rule FOREIGN KEY (rule_reference_id) REFERENCES rule_reference(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9. EMPLOYEE — master. Points to the APPLICABLE policies, never to a value.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id         INT UNSIGNED NOT NULL,
  emp_code                VARCHAR(32) NOT NULL,
  name                    VARCHAR(255) NOT NULL,
  dob                     DATE NULL,
  doj                     DATE NOT NULL,                  -- date of joining the bank
  doa                     DATE NULL,                       -- date of appointment to current post (may differ from doj)
  post_cadre_id           INT UNSIGNED NOT NULL,
  grade                   VARCHAR(64) NULL,
  category                VARCHAR(64) NULL,
  current_pay_scale_id    INT UNSIGNED NULL,
  current_stage_id        INT UNSIGNED NULL,
  current_basic_pay       DECIMAL(12,2) NULL,
  increment_policy_id     INT UNSIGNED NULL,              -- applicable increment policy (resolved/overridable)
  pay_fixation_policy_id  INT UNSIGNED NULL,               -- applicable pay fixation policy (resolved/overridable)
  employee_specific_increment_date DATE NULL,              -- used only when increment_policy.date_basis = EMPLOYEE_SPECIFIC
  employment_status       ENUM('ACTIVE','LWA','SUSPENDED','BREAK_IN_SERVICE','RESIGNED','RETIRED','TERMINATED') NOT NULL DEFAULT 'ACTIVE',
  status                  ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employee_org_code (organization_id, emp_code),
  CONSTRAINT fk_employee_org FOREIGN KEY (organization_id) REFERENCES organization(id),
  CONSTRAINT fk_employee_post FOREIGN KEY (post_cadre_id) REFERENCES post_cadre(id),
  CONSTRAINT fk_employee_scale FOREIGN KEY (current_pay_scale_id) REFERENCES pay_scale(id),
  CONSTRAINT fk_employee_stage FOREIGN KEY (current_stage_id) REFERENCES pay_stage(id),
  CONSTRAINT fk_employee_increment_policy FOREIGN KEY (increment_policy_id) REFERENCES increment_policy(id),
  CONSTRAINT fk_employee_fixation_policy FOREIGN KEY (pay_fixation_policy_id) REFERENCES pay_fixation_policy(policy_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 10. EMPLOYEE_SERVICE_EVENT — LWA / suspension / break-in-service / rejoin
--     etc. Feeds the increment-date engine so these can shift the date.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_service_event (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id         INT UNSIGNED NOT NULL,
  event_type          ENUM('LWA','SUSPENSION','BREAK_IN_SERVICE','EXTRAORDINARY_LEAVE','REJOIN','OTHER') NOT NULL,
  start_date          DATE NOT NULL,
  end_date            DATE NULL,
  affects_increment_date TINYINT(1) NOT NULL DEFAULT 1,   -- whether this event pushes the increment date
  days_count          INT UNSIGNED NULL,
  order_ref           VARCHAR(128) NULL,
  remarks             TEXT,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_service_event_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 11. EMPLOYEE_INCREMENT_STATUS — per-employee increment tracking, as
--     specified: current/previous/next increment date, eligibility, the
--     policy applied, effective date and rule/GO reference. Each
--     recalculation inserts a new row so the history is preserved (the
--     latest row per employee is the current status).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_increment_status (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id             INT UNSIGNED NOT NULL,
  current_increment_date  DATE NULL,
  previous_increment_date DATE NULL,
  next_increment_date     DATE NULL,
  eligibility_status       ENUM('ELIGIBLE','NOT_ELIGIBLE','DEFERRED','WITHHELD') NOT NULL DEFAULT 'ELIGIBLE',
  increment_policy_id     INT UNSIGNED NOT NULL,
  effective_date          DATE NOT NULL,
  rule_reference_id       INT UNSIGNED NULL,
  calculation_trace       JSON NULL,                      -- human-readable explanation of how dates were derived
  calculated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_increment_status_employee FOREIGN KEY (employee_id) REFERENCES employee(id),
  CONSTRAINT fk_increment_status_policy FOREIGN KEY (increment_policy_id) REFERENCES increment_policy(id),
  CONSTRAINT fk_increment_status_rule FOREIGN KEY (rule_reference_id) REFERENCES rule_reference(id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 12. EMPLOYEE_PAY_HISTORY — the Service Book ledger. Every increment,
--     promotion, pay revision or manual correction writes one row here.
--     This is the single source of truth for "what pay did this employee
--     draw, from when, and why".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_pay_history (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id             INT UNSIGNED NOT NULL,
  event_type              ENUM('INITIAL_FIXATION','INCREMENT','PROMOTION','PAY_REVISION','CORRECTION') NOT NULL,
  event_date              DATE NOT NULL,

  previous_pay_scale_id   INT UNSIGNED NULL,
  previous_stage_id       INT UNSIGNED NULL,
  previous_basic_pay      DECIMAL(12,2) NULL,

  new_pay_scale_id        INT UNSIGNED NOT NULL,
  new_stage_id            INT UNSIGNED NOT NULL,
  new_basic_pay           DECIMAL(12,2) NOT NULL,

  post_cadre_id           INT UNSIGNED NULL,               -- post at the time of this entry (relevant for PROMOTION)
  pay_revision_id         INT UNSIGNED NULL,                -- set when event_type = PAY_REVISION
  increment_policy_id     INT UNSIGNED NULL,                -- policy applied, when event_type = INCREMENT
  pay_fixation_policy_id  INT UNSIGNED NULL,                -- policy applied, when event_type in (PROMOTION, PAY_REVISION)
  rule_reference_id       INT UNSIGNED NULL,

  order_ref               VARCHAR(128) NULL,                -- office order / GO number authorizing this entry
  remarks                 TEXT,
  calculation_trace       JSON NULL,                        -- step-by-step engine output (see services/*)

  created_by              VARCHAR(128) NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_pay_history_employee FOREIGN KEY (employee_id) REFERENCES employee(id),
  CONSTRAINT fk_pay_history_prev_scale FOREIGN KEY (previous_pay_scale_id) REFERENCES pay_scale(id),
  CONSTRAINT fk_pay_history_prev_stage FOREIGN KEY (previous_stage_id) REFERENCES pay_stage(id),
  CONSTRAINT fk_pay_history_new_scale FOREIGN KEY (new_pay_scale_id) REFERENCES pay_scale(id),
  CONSTRAINT fk_pay_history_new_stage FOREIGN KEY (new_stage_id) REFERENCES pay_stage(id),
  CONSTRAINT fk_pay_history_post FOREIGN KEY (post_cadre_id) REFERENCES post_cadre(id),
  CONSTRAINT fk_pay_history_revision FOREIGN KEY (pay_revision_id) REFERENCES pay_revision(id),
  CONSTRAINT fk_pay_history_increment_policy FOREIGN KEY (increment_policy_id) REFERENCES increment_policy(id),
  CONSTRAINT fk_pay_history_fixation_policy FOREIGN KEY (pay_fixation_policy_id) REFERENCES pay_fixation_policy(policy_id),
  CONSTRAINT fk_pay_history_rule FOREIGN KEY (rule_reference_id) REFERENCES rule_reference(id)
) ENGINE=InnoDB;

CREATE INDEX idx_pay_history_employee_date ON employee_pay_history (employee_id, event_date);
CREATE INDEX idx_increment_status_employee ON employee_increment_status (employee_id, calculated_at);

-- ----------------------------------------------------------------------------
-- 13. EMPLOYEE_SERVICE_HISTORY — the Service Book timeline. Every service
--     event (appointment, probation, confirmation, increment, promotion,
--     transfer, higher grade, suspension, LWA, disciplinary, retirement, ...)
--     gets one row here, in chronological order. This is what the digital
--     Service Book screen renders; detail for pay-affecting events lives in
--     employee_pay_history (linked via pay_history_id) rather than being
--     duplicated onto this row.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_service_history (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id         INT UNSIGNED NOT NULL,
  event_type          ENUM(
                        'APPOINTMENT','PROBATION','CONFIRMATION','INCREMENT','PROMOTION',
                        'TRANSFER','HIGHER_GRADE','PAY_REVISION','SUSPENSION','LWA',
                        'BREAK_IN_SERVICE','DISCIPLINARY','RETIREMENT','OTHER'
                      ) NOT NULL,
  event_date          DATE NOT NULL,
  order_ref           VARCHAR(128) NULL,
  pay_history_id       INT UNSIGNED NULL,                 -- links to the employee_pay_history row, when this event affected pay
  rule_reference_id    INT UNSIGNED NULL,
  government_order_id  INT UNSIGNED NULL,
  remarks              TEXT,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_service_history_employee FOREIGN KEY (employee_id) REFERENCES employee(id),
  CONSTRAINT fk_service_history_pay_history FOREIGN KEY (pay_history_id) REFERENCES employee_pay_history(id),
  CONSTRAINT fk_service_history_rule FOREIGN KEY (rule_reference_id) REFERENCES rule_reference(id),
  CONSTRAINT fk_service_history_go FOREIGN KEY (government_order_id) REFERENCES government_orders(id)
) ENGINE=InnoDB;

CREATE INDEX idx_service_history_employee_date ON employee_service_history (employee_id, event_date);

-- ----------------------------------------------------------------------------
-- 14. USERS — login identities. Multi-tenant: organization_id is NULL only
--     for SUPER_ADMIN (the platform-level role, not scoped to any one UCB
--     client). Every other role belongs to exactly one organization and can
--     only ever see/modify that organization's data (enforced in the
--     application layer, not just by this column — see src/middleware/auth.js).
--
--     Onboarding chain: SUPER_ADMIN creates an `organization` row, then
--     creates that organization's first ORG_ADMIN user. From then on, that
--     ORG_ADMIN can create further users (HR_ADMIN, HR_OFFICER, etc.)
--     scoped to their own organization — they can never create a user in,
--     or see data belonging to, a different organization.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id       INT UNSIGNED NULL,                 -- NULL only for SUPER_ADMIN
  email                 VARCHAR(255) NOT NULL UNIQUE,
  password_hash         VARCHAR(255) NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  role                  ENUM(
                          'SUPER_ADMIN','ORG_ADMIN','HR_ADMIN','HR_OFFICER',
                          'ACCOUNTS_OFFICER','PAYROLL_OFFICER','APPROVING_AUTHORITY',
                          'DEPARTMENT_HEAD','EMPLOYEE'
                        ) NOT NULL,
  employee_id           INT UNSIGNED NULL,                 -- links an EMPLOYEE-role login to their own employee record
  must_change_password  TINYINT(1) NOT NULL DEFAULT 1,      -- forced on first login after being created by an admin
  status                ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  last_login_at         DATETIME NULL,
  mfa_enabled           TINYINT(1) NOT NULL DEFAULT 0,      -- optional TOTP 2FA, off by default; the account holder
                                                             -- turns it on for themselves from My account
  mfa_secret            VARCHAR(255) NULL,                  -- AES-256-GCM encrypted (iv:tag:ciphertext), never plain
  mfa_enrolled_at       DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_org FOREIGN KEY (organization_id) REFERENCES organization(id),
  CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employee(id),
  CONSTRAINT chk_super_admin_no_org CHECK (
    (role = 'SUPER_ADMIN' AND organization_id IS NULL) OR
    (role <> 'SUPER_ADMIN' AND organization_id IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE INDEX idx_users_org ON users (organization_id);

-- ============================================================================
-- 15. Licensing, branding, email, password reset, audit
--     (Slice: platform administration.) Existing deployments get the new
--     organization columns from src/scripts/migrate.js, run by db:init and by
--     /admin/setup/init-db; the new tables are created by sequelize.sync().
-- ============================================================================

-- organization: licence and contact columns
--   license_plan       VARCHAR(32)  NULL   TRIAL | STANDARD | PROFESSIONAL | ENTERPRISE | CUSTOM
--   license_starts_at  DATE         NULL   access refused before this date (NULL = immediately)
--   license_expires_at DATE         NULL   access refused after this date (NULL = no expiry)
--   max_users          INT UNSIGNED NULL   active user seats (NULL = unlimited)
--   max_employees      INT UNSIGNED NULL   active employee records (NULL = unlimited)
--   license_notes      VARCHAR(500) NULL
--   contact_email, contact_phone, website   maintained by the bank's Org Admin

CREATE TABLE IF NOT EXISTS platform_settings (         -- exactly one row, id = 1
  id              INT UNSIGNED PRIMARY KEY DEFAULT 1,
  platform_name   VARCHAR(128) NOT NULL DEFAULT 'UCB HRMS & Payroll',
  company_name    VARCHAR(255) NOT NULL DEFAULT 'Banihal Technologies LLP',
  support_email   VARCHAR(255) NULL,
  support_phone   VARCHAR(64)  NULL,
  app_base_url    VARCHAR(255) NULL,                     -- used in emailed links
  login_message   VARCHAR(500) NULL,                     -- banner on every sign-in page
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Logos live in the DB, not on disk: Hostinger's deploy pipeline replaces the
-- app directory on every deploy. organization_id NULL = platform asset.
CREATE TABLE IF NOT EXISTS brand_asset (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NULL,
  kind            ENUM('LOGO','FAVICON') NOT NULL,      -- FAVICON is platform-only
  mime_type       VARCHAR(64)  NOT NULL,                 -- sniffed from bytes: png/jpeg/webp/x-icon (no SVG)
  data            MEDIUMBLOB   NOT NULL,                 -- ≤ 512 KB logo, ≤ 128 KB favicon
  size_bytes      INT UNSIGNED NOT NULL,
  sha256          CHAR(64)     NOT NULL,                 -- cache-busting version + ETag
  uploaded_by     INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_brand_asset (organization_id, kind)
) ENGINE=InnoDB;

-- organization_id NULL = platform SMTP (also the fallback for banks without their own).
CREATE TABLE IF NOT EXISTS smtp_config (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NULL,
  enabled         TINYINT(1) NOT NULL DEFAULT 0,
  host            VARCHAR(255) NULL,
  port            INT UNSIGNED NULL DEFAULT 587,
  security        ENUM('SSL','STARTTLS','NONE') NOT NULL DEFAULT 'STARTTLS',
  username        VARCHAR(255) NULL,
  password_enc    TEXT NULL,                              -- AES-256-GCM; never returned by the API
  from_name       VARCHAR(255) NULL,
  from_email      VARCHAR(255) NULL,
  reply_to        VARCHAR(255) NULL,
  last_test_at    DATETIME NULL,
  last_test_ok    TINYINT(1) NULL,
  last_test_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_smtp_org (organization_id)
) ENGINE=InnoDB;

-- Emailed reset links: only the SHA-256 of the token is stored. 30 min, single use.
CREATE TABLE IF NOT EXISTS password_reset_token (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  token_hash   CHAR(64) NOT NULL UNIQUE,
  expires_at   DATETIME NOT NULL,
  used_at      DATETIME NULL,
  requested_ip VARCHAR(64) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Append-only; the application never updates or deletes rows.
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NULL,                      -- tenant concerned; NULL = platform
  actor_user_id   INT UNSIGNED NULL,
  actor_email     VARCHAR(255) NULL,
  action          VARCHAR(64) NOT NULL,                   -- e.g. auth.login.failed, org.suspend
  target_type     VARCHAR(64) NULL,
  target_id       VARCHAR(64) NULL,
  details         JSON NULL,
  ip              VARCHAR(64) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_org_time (organization_id, created_at),
  KEY idx_audit_time (created_at)
) ENGINE=InnoDB;

-- 16. Kerala UCB bank class + pay-scale library, part-time contingent employment type
-- ---------------------------------------------------------------------------------
-- organization.bank_class: required at organisation-creation time, and can
-- be changed at any time afterwards. One of the 6 KSR licensing classes;
-- drives which post/pay-scale reference library (src/seed/payScalesUCB.js)
-- is auto-provisioned into post_cadre / pay_revision / pay_scale /
-- pay_stage for that organisation — post/scale codes are namespaced per
-- class (e.g. "C1_PEON" vs "SG_PEON") so changing class only ADDS the new
-- class's posts if not already present; nothing existing is ever edited or
-- removed. NULL only for organisations created before this column existed.
ALTER TABLE organization
  ADD COLUMN bank_class ENUM('SPECIAL_GRADE','CLASS_I','CLASS_II','CLASS_III','CLASS_IV','CLASS_V') NULL AFTER status;

-- employee.employment_type: REGULAR (default) or PART_TIME_CONTINGENT.
-- Distinct from employment_status (service state). A Part-Time Contingent
-- employee is paid from the single scale common to every organisation
-- regardless of bank_class (PostCadre.code = 'PART_TIME', seeded into every
-- org alongside its class-specific posts) — this is an employee-level
-- choice, not an organisation-level one.
ALTER TABLE employee
  ADD COLUMN employment_type ENUM('REGULAR','PART_TIME_CONTINGENT') NOT NULL DEFAULT 'REGULAR' AFTER employment_status;

-- ============================================================================
-- 17. Payroll: salary structure & deductions (Phase 1)
--     (Slice: payroll module.) Phase 1 covers earnings/deductions that are a
--     flat amount or percentage of Basic each month: DA, HRA, Risk/Other
--     Allowance, PF/VPF, Welfare Fund, GSLI, Professional Tax, Income Tax.
--     Deferred to Phase 2 (their own ledger-style tables, not yet built):
--     LIC (multiple plans), Housing Loan (multiple), Vehicle Loan (multiple),
--     Festival Advance (with repayment tracking), Employee Overdraft + linked
--     Recurring Deposit. See src/services/payslip.js for the computation and
--     src/services/incomeTax.js for the tax-estimation engine.
-- ============================================================================

-- org_payroll_setting: one row per organisation, configurable rates used by
-- the payslip computation. Created lazily (findOrCreate with defaults) the
-- first time an Org Admin opens Payroll Settings or a payslip is computed.
CREATE TABLE IF NOT EXISTS org_payroll_setting (
  id                            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id               INT UNSIGNED NOT NULL UNIQUE,
  da_percent                    DECIMAL(6,3) NOT NULL DEFAULT 1.200,   -- DA = this % of Basic
  hra_percent                   DECIMAL(6,3) NOT NULL DEFAULT 10.000,  -- HRA = this % of Basic
  pf_employee_percent           DECIMAL(6,3) NOT NULL DEFAULT 12.000,
  pf_employer_percent           DECIMAL(6,3) NOT NULL DEFAULT 12.000,  -- informational; not deducted from pay
  gsli_amount                   DECIMAL(10,2) NOT NULL DEFAULT 20.00,  -- default GSLI ₹, per-employee override in employee.gsli_amount
  gsli_cutoff_date              DATE NOT NULL DEFAULT '2014-09-01',    -- GSLI applies only to employees who joined before this date
  pt_schedule                   ENUM('MONTHLY','HALF_YEARLY') NOT NULL DEFAULT 'HALF_YEARLY',
  pt_month_1                    TINYINT UNSIGNED NOT NULL DEFAULT 8,   -- August
  pt_month_2                    TINYINT UNSIGNED NOT NULL DEFAULT 2,   -- February
  od_multiplier                 DECIMAL(6,2) NOT NULL DEFAULT 15.00,   -- Overdraft limit = (Basic+DA) x this
  od_max_amount                 DECIMAL(12,2) NOT NULL DEFAULT 400000.00,
  od_max_repay_months           INT UNSIGNED NOT NULL DEFAULT 84,
  festival_advance_repay_months INT UNSIGNED NOT NULL DEFAULT 10,
  stagnation_years               INT UNSIGNED NOT NULL DEFAULT 8,       -- years without promotion before a stagnation increment
  stagnation_extra_stages        INT UNSIGNED NOT NULL DEFAULT 2,       -- extra stages granted on the same scale at that point
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_org_payroll_setting_org FOREIGN KEY (organization_id) REFERENCES organization(id)
) ENGINE=InnoDB;

-- employee: earnings, deductions, tax and stagnation-tracking columns.
--   risk_allowance, other_allowance      DECIMAL(10,2) NULL   optional flat monthly amounts
--   vpf_percent                          DECIMAL(6,3)  NULL   Voluntary PF, employee's own chosen %
--   welfare_fund_opt_in                  TINYINT(1)    NOT NULL DEFAULT 0
--   welfare_fund_amount                  DECIMAL(10,2) NULL   overrides no org default (there isn't one) when opted in
--   gsli_opt_in                          TINYINT(1)    NULL   NULL = auto-derive from doj vs org_payroll_setting.gsli_cutoff_date
--   gsli_amount                          DECIMAL(10,2) NULL   overrides org_payroll_setting.gsli_amount when set
--   pt_amount                            DECIMAL(10,2) NULL   Professional Tax, admin-entered per employee's slab
--   tax_regime                           ENUM('NEW','OLD') NOT NULL DEFAULT 'NEW'
--   tax_other_deductions                 DECIMAL(10,2) NULL   old regime only: 80C/80D etc beyond PF/VPF
--   last_promotion_date                  DATE          NULL   resets the 8-year stagnation clock
--   stagnation_stages_granted            INT UNSIGNED  NOT NULL DEFAULT 0
ALTER TABLE employee
  ADD COLUMN risk_allowance DECIMAL(10,2) NULL AFTER employment_type,
  ADD COLUMN other_allowance DECIMAL(10,2) NULL AFTER risk_allowance,
  ADD COLUMN vpf_percent DECIMAL(6,3) NULL AFTER other_allowance,
  ADD COLUMN welfare_fund_opt_in TINYINT(1) NOT NULL DEFAULT 0 AFTER vpf_percent,
  ADD COLUMN welfare_fund_amount DECIMAL(10,2) NULL AFTER welfare_fund_opt_in,
  ADD COLUMN gsli_opt_in TINYINT(1) NULL AFTER welfare_fund_amount,
  ADD COLUMN gsli_amount DECIMAL(10,2) NULL AFTER gsli_opt_in,
  ADD COLUMN pt_amount DECIMAL(10,2) NULL AFTER gsli_amount,
  ADD COLUMN tax_regime ENUM('NEW','OLD') NOT NULL DEFAULT 'NEW' AFTER pt_amount,
  ADD COLUMN tax_other_deductions DECIMAL(10,2) NULL AFTER tax_regime,
  ADD COLUMN last_promotion_date DATE NULL AFTER tax_other_deductions,
  ADD COLUMN stagnation_stages_granted INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_promotion_date;

-- ============================================================================
-- 18. Payroll: Medical Allowance, Bonus, Festival Advance, Overdraft,
--     Recurring Deposit
--     (Slice: payroll module, continued.) Festival Advance / Overdraft /
--     Recurring Deposit are each a single record (amount + start date +
--     repayment period) — how much is still owed "as of" any month is
--     computed live from that record (services/loans.js), not posted
--     month by month, the same way DA/HRA/PF are computed live rather than
--     stored per pay-run. Retirement date = date of birth + 60 years
--     (standard Kerala UCB retirement age; not a settings field).
-- ============================================================================

-- org_payroll_setting: new columns for Medical Allowance and Bonus.
--   medical_allowance_amount  DECIMAL(10,2) NOT NULL DEFAULT 4000   paid entirely in one month
--   medical_allowance_month   INT UNSIGNED  NOT NULL DEFAULT 12     December
--   bonus_month               INT UNSIGNED  NOT NULL DEFAULT 4      April
--   bonus_result              ENUM('PROFIT','LOSS') NULL            set once per financial year by the Org Admin; NULL = not yet declared, no bonus paid
--   bonus_profit_percent      DECIMAL(6,3)  NOT NULL DEFAULT 20     bonus = min(cap, Basic + this% of Basic) when PROFIT
--   bonus_profit_max_amount   DECIMAL(10,2) NOT NULL DEFAULT 16800
--   bonus_loss_percent        DECIMAL(6,3)  NOT NULL DEFAULT 8.33   bonus = min(cap, Basic + this% of Basic) when LOSS
--   bonus_loss_max_amount     DECIMAL(10,2) NOT NULL DEFAULT 7000
ALTER TABLE org_payroll_setting
  ADD COLUMN medical_allowance_amount DECIMAL(10,2) NOT NULL DEFAULT 4000,
  ADD COLUMN medical_allowance_month INT UNSIGNED NOT NULL DEFAULT 12,
  ADD COLUMN bonus_month INT UNSIGNED NOT NULL DEFAULT 4,
  ADD COLUMN bonus_result ENUM('PROFIT','LOSS') NULL,
  ADD COLUMN bonus_profit_percent DECIMAL(6,3) NOT NULL DEFAULT 20,
  ADD COLUMN bonus_profit_max_amount DECIMAL(10,2) NOT NULL DEFAULT 16800,
  ADD COLUMN bonus_loss_percent DECIMAL(6,3) NOT NULL DEFAULT 8.33,
  ADD COLUMN bonus_loss_max_amount DECIMAL(10,2) NOT NULL DEFAULT 7000;

-- Festival Advance: up to one month's Basic+DA, repaid within
-- org_payroll_setting.festival_advance_repay_months (an employee may choose
-- a SHORTER period, never longer). A new advance is refused by the API
-- while an existing one for the same employee is not yet fully repaid.
CREATE TABLE IF NOT EXISTS employee_festival_advance (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id    INT UNSIGNED NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  availed_date   DATE NOT NULL,
  repay_months   INT UNSIGNED NOT NULL,
  remarks        VARCHAR(500) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_festival_advance_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB;

-- Employee Overdraft: eligibility ceiling = min(org_payroll_setting.od_max_amount,
-- (Basic+DA) x od_multiplier); repay_months capped at
-- org_payroll_setting.od_max_repay_months, further shortened to whatever's
-- left until retirement (DOB + 60 years) if that's sooner. interest_rate_percent
-- is a SNAPSHOT of org_payroll_setting.od_interest_rate_percent taken the day
-- this Overdraft was created (or an admin override at creation) — later
-- changes to the org rate never touch an existing row. Interest is
-- flat/simple over the full tenor (amount x rate% x repay_months/12), added
-- once to the principal, then split evenly across instalments — not
-- reducing-balance. Rule verification required against the bank's actual OD
-- product.
CREATE TABLE IF NOT EXISTS employee_overdraft (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id            INT UNSIGNED NOT NULL,
  amount                 DECIMAL(12,2) NOT NULL,
  availed_date           DATE NOT NULL,
  repay_months           INT UNSIGNED NOT NULL,
  interest_rate_percent  DECIMAL(6,3) NOT NULL DEFAULT 0,
  remarks                VARCHAR(500) NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_overdraft_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB;

-- Recurring Deposit: optional, usually opened alongside an Overdraft
-- (overdraft_id set) with monthly_amount suggested from that Overdraft's
-- own instalment, but freely editable. Deducted every month while ACTIVE.
CREATE TABLE IF NOT EXISTS employee_recurring_deposit (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id    INT UNSIGNED NOT NULL,
  overdraft_id   INT UNSIGNED NULL,
  monthly_amount DECIMAL(10,2) NOT NULL,
  start_date     DATE NOT NULL,
  status         ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  remarks        VARCHAR(500) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rd_employee FOREIGN KEY (employee_id) REFERENCES employee(id),
  CONSTRAINT fk_rd_overdraft FOREIGN KEY (overdraft_id) REFERENCES employee_overdraft(id)
) ENGINE=InnoDB;

-- Section 19: Overdraft interest rate setting, LIC, Housing Loan, Vehicle Loan.
ALTER TABLE org_payroll_setting
  ADD COLUMN od_interest_rate_percent DECIMAL(6,3) NOT NULL DEFAULT 6.5;

-- LIC: an employee may hold MULTIPLE policies at once; each is deducted and
-- shown separately. "Active" (contributes deduction_amount to payslip) once
-- started_date is reached and, if set, before closure_date. maturity_date is
-- informational only.
CREATE TABLE IF NOT EXISTS employee_lic (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id         INT UNSIGNED NOT NULL,
  policy_number       VARCHAR(100) NULL,
  opening_date        DATE NOT NULL,
  started_date        DATE NOT NULL,
  deduction_amount    DECIMAL(10,2) NOT NULL,
  sum_assured_amount  DECIMAL(12,2) NOT NULL,
  maturity_date       DATE NULL,
  closure_date        DATE NULL,
  remarks             VARCHAR(500) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_lic_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB;

-- Housing Loan: an employee may hold MULTIPLE loans; each shown separately.
-- period_months is derived from emi_start_date/emi_end_date at creation.
-- EMI is computed (not stored) via the standard reducing-balance
-- amortisation formula: EMI = P x r x (1+r)^n / ((1+r)^n - 1).
CREATE TABLE IF NOT EXISTS employee_housing_loan (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id            INT UNSIGNED NOT NULL,
  total_loan_amount      DECIMAL(12,2) NOT NULL,
  interest_rate_percent  DECIMAL(6,3) NOT NULL,
  emi_start_date         DATE NOT NULL,
  emi_end_date           DATE NOT NULL,
  period_months          INT UNSIGNED NOT NULL,
  closure_date           DATE NULL,
  remarks                VARCHAR(500) NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_housing_loan_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB;

-- Vehicle Loan: an employee may hold MULTIPLE loans (currently used one at a
-- time in practice, but the model supports several from day one); each
-- shown separately. emi_amount is entered directly (no rate specified).
CREATE TABLE IF NOT EXISTS employee_vehicle_loan (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id    INT UNSIGNED NOT NULL,
  total_amount   DECIMAL(12,2) NOT NULL,
  vehicle_type   VARCHAR(100) NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  period_months  INT UNSIGNED NOT NULL,
  emi_amount     DECIMAL(10,2) NOT NULL,
  closure_date   DATE NULL,
  remarks        VARCHAR(500) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vehicle_loan_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB;

-- Section 20: Employee personal/HR details, employee documents, DA
-- fixed/variable, City Compensatory & Conveyance Allowances, Vehicle Loan
-- interest rate.
ALTER TABLE employee
  ADD COLUMN father_name VARCHAR(255) NULL,
  ADD COLUMN spouse_name VARCHAR(255) NULL,
  ADD COLUMN gender ENUM('MALE','FEMALE','OTHER') NULL,
  ADD COLUMN blood_group VARCHAR(8) NULL,
  ADD COLUMN educational_qualification VARCHAR(255) NULL,
  ADD COLUMN photo_asset_id INT UNSIGNED NULL,
  ADD COLUMN pan_number VARCHAR(16) NULL,
  ADD COLUMN uan_number VARCHAR(20) NULL,
  ADD COLUMN pf_number VARCHAR(32) NULL,
  ADD COLUMN office_email VARCHAR(255) NULL,
  ADD COLUMN personal_email VARCHAR(255) NULL,
  ADD COLUMN residence_address TEXT NULL,
  ADD COLUMN emergency_contact_name VARCHAR(255) NULL,
  ADD COLUMN emergency_contact_number VARCHAR(20) NULL,
  ADD COLUMN emergency_contact_relation VARCHAR(64) NULL,
  ADD COLUMN bank_name VARCHAR(255) NULL,
  ADD COLUMN bank_account_number VARCHAR(32) NULL,
  ADD COLUMN bank_ifsc VARCHAR(16) NULL,
  ADD COLUMN branch_name VARCHAR(255) NULL,
  ADD COLUMN branch_code VARCHAR(32) NULL,
  ADD COLUMN designation VARCHAR(255) NULL,
  ADD COLUMN department VARCHAR(255) NULL,
  ADD COLUMN grade_details VARCHAR(255) NULL,
  ADD COLUMN date_of_confirmation DATE NULL,
  ADD COLUMN date_of_retirement DATE NULL, -- admin override; defaults to DOB+60 when unset
  ADD COLUMN da_type ENUM('VARIABLE','FIXED') NOT NULL DEFAULT 'VARIABLE',
  ADD COLUMN fixed_da_amount DECIMAL(10,2) NULL,
  ADD COLUMN cca_opt_in BOOLEAN NULL,
  ADD COLUMN cca_amount DECIMAL(10,2) NULL,
  ADD COLUMN conveyance_opt_in BOOLEAN NULL,
  ADD COLUMN conveyance_amount DECIMAL(10,2) NULL;

ALTER TABLE org_payroll_setting
  ADD COLUMN cca_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN conveyance_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN vehicle_loan_allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN vehicle_loan_interest_rate_percent DECIMAL(6,3) NOT NULL DEFAULT 9;

ALTER TABLE employee_vehicle_loan
  ADD COLUMN interest_rate_percent DECIMAL(6,3) NULL,
  MODIFY COLUMN emi_amount DECIMAL(10,2) NULL; -- now optional: only used when interest_rate_percent is not set

-- Employee documents: PAN, Aadhar, Education Certificate, Photo, Others.
-- An employee may have several, including several OTHER ones. Stored as
-- bytes (see services/documents.js) — never written to disk.
CREATE TABLE IF NOT EXISTS employee_document (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id  INT UNSIGNED NOT NULL,
  doc_type     ENUM('PAN','AADHAR','EDUCATION_CERTIFICATE','PHOTO','OTHER') NOT NULL,
  label        VARCHAR(255) NULL,
  mime_type    VARCHAR(64) NOT NULL,
  data         LONGBLOB NOT NULL,
  size_bytes   INT UNSIGNED NOT NULL,
  sha256       VARCHAR(64) NOT NULL,
  uploaded_by  INT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employee_document_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB;

-- Section 21: Grade Details on the payslip; DA gains a third option (Variable + Fixed together).
ALTER TABLE pay_scale
  ADD COLUMN payable_days INT UNSIGNED NULL DEFAULT 31,
  ADD COLUMN month_days INT UNSIGNED NULL;

ALTER TABLE employee
  MODIFY COLUMN da_type ENUM('VARIABLE','FIXED','BOTH') NOT NULL DEFAULT 'VARIABLE'; -- BOTH = variable + fixed_da_amount together

-- Section 22: PF calculation base option; GO / Service Book document
-- uploads; attendance & Loss of Pay. Overdraft's own deduction was removed
-- from the payslip total in code only (no schema change — deductions.overdraft
-- stays informational, still computed from the existing columns).
ALTER TABLE org_payroll_setting
  ADD COLUMN pf_calculation_base ENUM('BASIC','BASIC_PLUS_DA') NOT NULL DEFAULT 'BASIC';

-- The scanned copy of a Government Order — at most one per GO (uploading
-- again replaces it; see services/attachments.js).
CREATE TABLE IF NOT EXISTS government_order_document (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  government_order_id   INT UNSIGNED NOT NULL UNIQUE,
  label                 VARCHAR(255) NULL,
  mime_type             VARCHAR(64) NOT NULL,
  data                  LONGBLOB NOT NULL,
  size_bytes            INT UNSIGNED NOT NULL,
  sha256                VARCHAR(64) NOT NULL,
  uploaded_by           INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_go_document_go FOREIGN KEY (government_order_id) REFERENCES government_order(id)
) ENGINE=InnoDB;

-- The scanned copy attached to one Service Book entry — at most one per
-- employee_service_history row (uploading again replaces it).
CREATE TABLE IF NOT EXISTS service_history_document (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_history_id    INT UNSIGNED NOT NULL UNIQUE,
  label                 VARCHAR(255) NULL,
  mime_type             VARCHAR(64) NOT NULL,
  data                  LONGBLOB NOT NULL,
  size_bytes            INT UNSIGNED NOT NULL,
  sha256                VARCHAR(64) NOT NULL,
  uploaded_by           INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sh_document_sh FOREIGN KEY (service_history_id) REFERENCES employee_service_history(id)
) ENGINE=InnoDB;

-- Attendance / Loss of Pay: one row per employee per calendar month. The
-- payslip (services/payslip.js) pro-rates Basic+DA+allowances by
-- (payable_days - lop_days) / payable_days using this row's lop_days.
CREATE TABLE IF NOT EXISTS employee_attendance (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id  INT UNSIGNED NOT NULL,
  year         SMALLINT UNSIGNED NOT NULL,
  month        TINYINT UNSIGNED NOT NULL,
  lop_days     DECIMAL(5,2) NOT NULL DEFAULT 0,
  remarks      VARCHAR(500) NULL,
  marked_by    INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_employee_attendance_month (employee_id, year, month),
  CONSTRAINT fk_employee_attendance_employee FOREIGN KEY (employee_id) REFERENCES employee(id)
) ENGINE=InnoDB;
