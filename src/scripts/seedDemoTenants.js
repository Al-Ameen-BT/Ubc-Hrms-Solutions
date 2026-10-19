'use strict';

/**
 * DEMO TENANT SEEDER — SAMPLE DATA ONLY
 * ===========================================================================
 * Creates a handful of realistic, self-contained demo banks (organisations)
 * so every screen in the console has something to show:
 *
 *   - the organisation itself (profile, contact, licence, RBI class)
 *   - its Kerala UCB post / pay-revision / pay-scale / stage library, as
 *     provisioned by the real onboarding service
 *     (services/payScaleLibrary#provisionForOrganization)
 *   - an Org Admin + HR Admin login per bank
 *   - a full staff roster (employees) with all the mandatory fields, a
 *     current pay scale/stage/basic pay, and matching entries in the
 *     Service Book (employee_service_history) and pay ledger
 *     (employee_pay_history)
 *   - the default leave types
 *
 * Every value below (names, PAN/Aadhaar numbers, account numbers, addresses,
 * branch names, amounts) is invented for testing and MUST NOT be loaded into
 * a real bank's database.
 *
 * IDEMPOTENT — safe to run as many times as you like. Organisations are
 * matched by code, users by e-mail, and employees by (organisation, emp
 * code); anything already present is left exactly as it is, and nothing is
 * ever deleted or overwritten.
 *
 * Run:  npm run seed:demo
 *       npm run seed:demo -- --reset   (delete this seeder's own rows first,
 *                                       then rebuild them — hand-entered
 *                                       employees are never touched)
 */

const {
  sequelize,
  Organization,
  User,
  PostCadre,
  PayScale,
  PayStage,
  Employee,
  EmployeePayHistory,
  EmployeeServiceHistory,
} = require('../models');
const { provisionForOrganization } = require('../services/payScaleLibrary');
const { hashPassword } = require('../services/authService');
const { getSettings } = require('../services/payrollSettings');
const { seedDefaultLeaveTypes } = require('../services/leave');
const { migrate } = require('./migrate');

// The single password every seeded demo login shares, so the app is quick to
// exercise by hand. mustChangePassword is left false — this is sample data.
// DEV-ONLY: seeded demo accounts, not production credentials. Keeping the
// default here prevents a missing-var crash, but set DEMO_PASSWORD in .env
// whenever the demo data matters.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoPass123!';
const CREATED_BY = 'seed:demo';

// Same short prefix per class the provisioning service uses, so an
// organisation's post codes can be mapped back to their un-prefixed name.
const CLASS_PREFIX = {
  SPECIAL_GRADE: 'SG', CLASS_I: 'C1', CLASS_II: 'C2', CLASS_III: 'C3', CLASS_IV: 'C4', CLASS_V: 'C5',
};

// ---------------------------------------------------------------------------
// The demo banks. `branches` doubles as the pool of posting locations and
// `domain` as the staff e-mail domain (used to build office e-mail addresses).
// ---------------------------------------------------------------------------
const ORGS = [
  {
    code: 'DEMO-UCB',
    name: 'Demo Urban Co-operative Bank Ltd.',
    shortName: 'Demo UCB',
    bankClass: 'CLASS_I',
    domain: 'demo-ucb.in',
    admin: { name: 'Priya Menon', email: 'admin@demo-ucb.in' },
    hr: { name: 'Gopal Varma', email: 'hr@demo-ucb.in' },
    address: 'Head Office, MG Road, Ernakulam, Kerala 682035',
    contactPhone: '+91 484 236 4400',
    website: 'https://demo-ucb.in',
    establishedYear: 1948,
    registrationNumber: 'E-2245/1948',
    rbiLicenseNumber: 'RBI/UCB/KL-0101',
    branches: ['Main Branch, MG Road', 'Kaloor Branch', 'Vyttila Branch'],
  },
  {
    code: 'TVM-UCB',
    name: 'Thiruvananthapuram Urban Co-operative Bank Ltd.',
    shortName: 'TVM UCB',
    bankClass: 'CLASS_I',
    domain: 'tvm-ucb.in',
    admin: { name: 'Anitha Krishnan', email: 'admin@tvm-ucb.in' },
    hr: { name: 'Vineeth Gopal', email: 'hr@tvm-ucb.in' },
    address: 'Head Office, MG Road, Thiruvananthapuram, Kerala 695001',
    contactPhone: '+91 471 246 8100',
    website: 'https://tvm-ucb.in',
    establishedYear: 1936,
    registrationNumber: 'T-1187/1936',
    rbiLicenseNumber: 'RBI/UCB/KL-0142',
    branches: ['Main Branch, MG Road', 'Pattom Branch', 'Kazhakkoottam Branch', 'Peroorkada Branch'],
  },
  {
    code: 'EKM-UCB',
    name: 'Ernakulam Urban Co-operative Bank Ltd.',
    shortName: 'EKM UCB',
    bankClass: 'CLASS_II',
    domain: 'ekm-ucb.in',
    admin: { name: 'Rahul Nambiar', email: 'admin@ekm-ucb.in' },
    hr: { name: 'Smitha Nair', email: 'hr@ekm-ucb.in' },
    address: 'Head Office, Banerji Road, Ernakulam, Kerala 682031',
    contactPhone: '+91 484 239 5566',
    website: 'https://ekm-ucb.in',
    establishedYear: 1951,
    registrationNumber: 'E-3312/1951',
    rbiLicenseNumber: 'RBI/UCB/KL-0233',
    branches: ['Main Branch, Banerji Road', 'Thevara Branch', 'Kakkanad Branch'],
  },
  {
    code: 'KKD-UCB',
    name: 'Kozhikode Urban Co-operative Bank Ltd.',
    shortName: 'KKD UCB',
    bankClass: 'CLASS_III',
    domain: 'kkd-ucb.in',
    admin: { name: 'Deepak Kurup', email: 'admin@kkd-ucb.in' },
    hr: { name: 'Reshma Pillai', email: 'hr@kkd-ucb.in' },
    address: 'Head Office, SM Street, Kozhikode, Kerala 673001',
    contactPhone: '+91 495 272 3300',
    website: 'https://kkd-ucb.in',
    establishedYear: 1957,
    registrationNumber: 'K-2045/1957',
    rbiLicenseNumber: 'RBI/UCB/KL-0318',
    branches: ['Main Branch, SM Street', 'Mavoor Road Branch', 'Feroke Branch'],
  },
  {
    code: 'KTM-UCB',
    name: 'Kottayam Urban Co-operative Bank Ltd.',
    shortName: 'KTM UCB',
    bankClass: 'CLASS_IV',
    domain: 'ktm-ucb.in',
    admin: { name: 'Sreekumar Varma', email: 'admin@ktm-ucb.in' },
    hr: { name: 'Neethu Raj', email: 'hr@ktm-ucb.in' },
    address: 'Head Office, KK Road, Kottayam, Kerala 686001',
    contactPhone: '+91 481 256 2200',
    website: 'https://ktm-ucb.in',
    establishedYear: 1962,
    registrationNumber: 'K-2871/1962',
    rbiLicenseNumber: 'RBI/UCB/KL-0407',
    branches: ['Main Branch, KK Road', 'Changanassery Branch', 'Pala Branch'],
  },
];

// ---------------------------------------------------------------------------
// Name pools (Kerala-style). Kept large enough that no two colleagues inside a
// single bank share a name.
// ---------------------------------------------------------------------------
const MALE_NAMES = [
  'Anil Kumar', 'Rajesh Nair', 'Suresh Menon', 'Vijayan Pillai', 'Deepak Nambiar',
  'Manoj Kurup', 'Sreekumar Varma', 'Pratheesh Chandran', 'Jithin Raj', 'Arun Krishnan',
  'Sandeep Nair', 'Biju Thomas', 'Harikrishnan Nair', 'Pramod Menon', 'Satheesh Kumar',
  'Vishnu Prasad', 'Rakesh Balan', 'Ashok Kumar', 'Gireesh Babu', 'Sunil Varghese',
  'Anoop Sankar', 'Jibin Jose', 'Renjith Ravi', 'Midhun Lal', 'Nithin Mohan',
];
const FEMALE_NAMES = [
  'Anitha Krishnan', 'Smitha Nair', 'Reshma Menon', 'Divya Pillai', 'Neethu Raj',
  'Lakshmi Nair', 'Sreeja Kumari', 'Aswathy Mohan', 'Remya Suresh', 'Jisha Thomas',
  'Shilpa Nair', 'Vandana Menon', 'Anjana Raj', 'Meera Krishnan', 'Kavya Soman',
  'Rekha Varma', 'Priya Sankar', 'Nithya Balan', 'Bindu Prakash', 'Sona Jacob',
];
const BLOOD_GROUPS = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB+'];
const DEPARTMENTS = ['Accounts', 'Advances', 'Cash & Operations', 'Human Resources', 'Audit & Inspection', 'IT', 'General Administration'];
const PAN_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Staff mix for an organisation — one row per employee to create. Posts the
// bank's class doesn't have (e.g. no System Administrator in Class IV) are
// simply skipped at seed time.
const POST_PLAN = [
  { post: 'GM', stage: 6, designation: 'General Manager' },
  { post: 'AGM', stage: 5, designation: 'Assistant General Manager' },
  { post: 'BRANCH_MGR', stage: 4, designation: 'Branch Manager' },
  { post: 'BRANCH_MGR', stage: 3, designation: 'Chief Accountant' },
  { post: 'SR_ACCOUNTANT', stage: 3, designation: 'Senior Accountant' },
  { post: 'SYS_ADMIN', stage: 3, designation: 'System Administrator' },
  { post: 'SR_CLERK', stage: 3, designation: 'Senior Clerk' },
  { post: 'SR_CLERK', stage: 1, designation: 'Junior Accountant' },
  { post: 'JR_CLERK', stage: 2, designation: 'Junior Clerk' },
  { post: 'JR_CLERK', stage: 1, designation: 'Cashier' },
  { post: 'ATTENDAR', stage: 2, designation: 'Record Keeper' },
  { post: 'PEON', stage: 1, designation: 'Peon' },
];

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

async function findOrCreateOrg(spec) {
  let org = await Organization.findOne({ where: { code: spec.code } });
  const created = !org;
  if (!org) {
    org = await Organization.create({
      code: spec.code,
      name: spec.name,
      shortName: spec.shortName,
      bankClass: spec.bankClass,
      address: spec.address,
      contactEmail: spec.admin.email,
      contactPhone: spec.contactPhone,
      website: spec.website,
      establishedYear: spec.establishedYear,
      registrationNumber: spec.registrationNumber,
      rbiLicenseNumber: spec.rbiLicenseNumber,
      status: 'ACTIVE',
      licensePlan: 'STANDARD',
      licenseStartsAt: new Date().toISOString().slice(0, 10),
      maxUsers: 50,
      maxEmployees: 1000,
    });
  } else if (!org.bankClass) {
    // An organisation seeded before the bank-class field existed (e.g. the
    // original DEMO-UCB) can't provision a pay-scale library until it has
    // one. Give it the demo class without disturbing anything else.
    org.bankClass = spec.bankClass;
    await org.save();
  }

  // Top up any profile/contact field an older or partly-filled organisation is
  // still missing — never overwrite a value that's already set.
  if (!created) {
    const fill = {
      name: spec.name, shortName: spec.shortName, address: spec.address,
      contactEmail: spec.admin.email, contactPhone: spec.contactPhone, website: spec.website,
      establishedYear: spec.establishedYear, registrationNumber: spec.registrationNumber,
      rbiLicenseNumber: spec.rbiLicenseNumber,
    };
    let touched = false;
    for (const [k, v] of Object.entries(fill)) {
      if ((org[k] === null || org[k] === undefined || org[k] === '') && v != null) { org[k] = v; touched = true; }
    }
    if (touched) await org.save();
  }

  // Additive + idempotent: only creates posts/scales the org is missing.
  await provisionForOrganization(org);
  await getSettings(org.id);              // materialise the payroll-settings row
  await seedDefaultLeaveTypes(org.id);    // default CL/EL/HPL/ML/SPL
  return { org, created };
}

async function ensureUser({ organizationId, email, name, role }) {
  const existing = await User.findOne({ where: { email } });
  if (existing) return { user: existing, created: false };
  const user = await User.create({
    organizationId,
    email,
    name,
    role,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    mustChangePassword: false,
    status: 'ACTIVE',
  });
  return { user, created: true };
}

/** Loads an organisation's provisioned library as unprefixed-post-code -> { post, scale, stages }. */
async function loadLibrary(org) {
  const prefix = CLASS_PREFIX[org.bankClass] ? `${CLASS_PREFIX[org.bankClass]}_` : '';
  const posts = await PostCadre.findAll({ where: { organizationId: org.id, status: 'ACTIVE' } });
  const scales = await PayScale.findAll({ where: { organizationId: org.id, status: 'ACTIVE' } });
  const scaleByCode = new Map(scales.map((s) => [s.code, s]));
  const stages = await PayStage.findAll({
    where: { payScaleId: scales.map((s) => s.id) },
    order: [['stageNo', 'ASC']],
  });
  const stagesByScale = new Map();
  for (const st of stages) {
    if (!stagesByScale.has(st.payScaleId)) stagesByScale.set(st.payScaleId, []);
    stagesByScale.get(st.payScaleId).push(st);
  }

  const library = new Map();
  for (const post of posts) {
    // Only the class we're seeding counts; the un-prefixed PART_TIME scale is
    // common to every class and kept as-is.
    let key = null;
    if (post.code === 'PART_TIME') key = 'PART_TIME';
    else if (prefix && post.code.startsWith(prefix)) key = post.code.slice(prefix.length);
    if (!key) continue;
    const scale = scaleByCode.get(`${post.code}-REV`);
    if (!scale) continue;
    library.set(key, { post, scale, stages: stagesByScale.get(scale.id) || [] });
  }
  return library;
}

function identityFor(org, orgIndex, i) {
  const gender = i % 2 === 0 ? 'MALE' : 'FEMALE';
  const pool = gender === 'FEMALE' ? FEMALE_NAMES : MALE_NAMES;
  const name = pool[(orgIndex * 7 + i) % pool.length];
  const [first, ...rest] = name.split(' ');
  const slug = `${first}.${rest.join('') || 'x'}`.toLowerCase();

  const pan = PAN_LETTERS[i % 26] + PAN_LETTERS[(i + 7) % 26] + PAN_LETTERS[(i + 15) % 26]
    + 'P' + PAN_LETTERS[(i + 3) % 26] + String(1000 + (i * 37 + orgIndex * 101) % 9000)
    + PAN_LETTERS[(i + 11) % 26];
  const aadhaar = String(2 + (i % 8)) + String(10000000000 + (orgIndex * 100000 + i * 12345)).slice(1, 12);
  const uan = String(101200000000 + orgIndex * 70000 + i * 7919).slice(0, 12);
  const city = ((org.address || '').split(',').pop() || 'Kerala').trim();

  return {
    name,
    gender,
    personalEmail: `${slug}@gmail.com`,
    panNumber: pan,
    aadhaarNumber: aadhaar.slice(0, 12),
    uanNumber: uan,
    bloodGroup: BLOOD_GROUPS[(i + orgIndex) % BLOOD_GROUPS.length],
    emergencyContactName: gender === 'FEMALE' ? MALE_NAMES[(i + 3) % MALE_NAMES.length] : FEMALE_NAMES[(i + 3) % FEMALE_NAMES.length],
    emergencyContactNumber: `+91 ${String(9900000000 + i * 2468).slice(0, 10)}`,
    emergencyContactRelation: ['Spouse', 'Father', 'Brother', 'Sister'][i % 4],
    residenceAddress: `${i + 1}/A, ${['Rose Villa', 'Sree Nivas', 'Padma Bhavan', 'Krishna Kripa', 'Green Dale'][i % 5]}, ${org.shortName} Road, ${city}`,
  };
}

async function seedEmployeesFor(org, orgIndex, library, branches) {
  const plan = [];
  for (const p of POST_PLAN) if (library.has(p.post)) plan.push(p);
  if (library.has('PART_TIME')) plan.push({ post: 'PART_TIME', stage: 1, designation: 'Part-Time Contingent Staff' });

  let created = 0;
  for (let i = 0; i < plan.length; i += 1) {
    const spec = plan[i];
    const entry = library.get(spec.post);
    // Deterministic emp code (derived from the plan position, not from how
    // many rows already exist) so a re-run recognises and skips its own rows.
    const empCode = `${org.code}-${pad(i + 1, 4)}`;
    if (await Employee.findOne({ where: { organizationId: org.id, empCode } })) continue;

    const stages = entry.stages;
    if (!stages.length) continue;
    const want = Math.min(spec.stage, stages.length);
    const currentStage = stages[want - 1];
    const hasIncrement = want >= 3;
    const firstStage = hasIncrement ? stages[want - 2] : currentStage;

    const id = identityFor(org, orgIndex, i);
    const dojYear = 1996 + ((i * 3 + orgIndex) % 20);   // 1996..2015
    const doj = `${dojYear}-${pad(((i * 5) % 12) + 1)}-${pad(((i * 7) % 27) + 1)}`;
    const ageAtJoin = 26 + ((i * 2 + orgIndex) % 8);
    const dob = `${dojYear - ageAtJoin}-${pad(((i * 3) % 12) + 1)}-${pad(((i * 11) % 27) + 1)}`;
    const confirmYear = dojYear + 1;
    const confirmDate = `${confirmYear}-${pad(((i * 5) % 12) + 1)}-${pad(((i * 7) % 27) + 1)}`;
    const incYear = Math.min(dojYear + 2, 2023);
    const incDate = `${incYear}-07-01`;

    const branchName = branches[i % branches.length];
    const branchCode = `BR${(i % branches.length) + 1}`;
    const department = DEPARTMENTS[(i + orgIndex) % DEPARTMENTS.length];
    const isPartTime = spec.post === 'PART_TIME';

    const emp = await Employee.create({
      organizationId: org.id,
      empCode,
      name: id.name,
      dob,
      doj,
      doa: doj,
      postCadreId: entry.post.id,
      grade: entry.post.code,
      category: entry.post.cadre,
      currentPayScaleId: entry.scale.id,
      currentStageId: currentStage.id,
      currentBasicPay: Number(currentStage.amount),
      employmentStatus: 'ACTIVE',
      employmentType: isPartTime ? 'PART_TIME_CONTINGENT' : 'REGULAR',
      status: 'ACTIVE',
      designation: spec.designation,
      department,
      branchName,
      branchCode,
      riskAllowance: spec.designation === 'Cashier' ? 300 : null,
      otherAllowance: spec.stage >= 4 ? 1000 : (i % 3 === 0 ? 500 : null),
      taxRegime: i % 3 === 0 ? 'OLD' : 'NEW',
      fatherName: MALE_NAMES[(i + 5) % MALE_NAMES.length],
      spouseName: id.gender === 'FEMALE' ? MALE_NAMES[(i + 2) % MALE_NAMES.length] : FEMALE_NAMES[(i + 2) % FEMALE_NAMES.length],
      gender: id.gender,
      bloodGroup: id.bloodGroup,
      educationalQualification: ['B.Com', 'M.Com', 'BBA', 'MBA', 'B.Sc', 'BA'][i % 6],
      panNumber: id.panNumber,
      aadhaarNumber: id.aadhaarNumber,
      uanNumber: id.uanNumber,
      pfNumber: `KR/${org.code}/${1000 + i + 1}`,
      officeEmail: `${empCode.toLowerCase()}@${org.domain}`,
      personalEmail: id.personalEmail,
      residenceAddress: id.residenceAddress,
      emergencyContactName: id.emergencyContactName,
      emergencyContactNumber: id.emergencyContactNumber,
      emergencyContactRelation: id.emergencyContactRelation,
      bankName: i % 3 === 0 ? 'State Bank of India' : `${org.name}`.replace(' Ltd.', ''),
      bankAccountNumber: String(50100000000 + orgIndex * 1000000 + (i + 1) * 137).slice(0, 11),
      bankIfsc: i % 3 === 0 ? 'SBIN0001234' : `UCBA0${pad(orgIndex + 1, 3)}${pad(i + 1, 3)}`,
      dateOfConfirmation: isPartTime ? null : confirmDate,
      lastPromotionDate: doj,
    });

    const appointment = await EmployeePayHistory.create({
      employeeId: emp.id,
      eventType: 'INITIAL_FIXATION',
      eventDate: doj,
      newPayScaleId: entry.scale.id,
      newStageId: firstStage.id,
      newBasicPay: Number(firstStage.amount),
      postCadreId: entry.post.id,
      orderRef: `APPT/${org.code}/${empCode}`,
      remarks: isPartTime ? 'Sample initial fixation (part-time contingent)' : 'Sample initial pay fixation on appointment',
      createdBy: CREATED_BY,
    });

    const serviceEvents = [{
      employeeId: emp.id,
      eventType: 'APPOINTMENT',
      eventDate: doj,
      orderRef: `APPT/${org.code}/${empCode}`,
      payHistoryId: appointment.id,
      remarks: `Appointed as ${spec.designation} at ${branchName}`,
    }];

    if (!isPartTime) {
      serviceEvents.push({
        employeeId: emp.id,
        eventType: 'CONFIRMATION',
        eventDate: confirmDate,
        orderRef: `CONF/${org.code}/${empCode}`,
        remarks: 'Completed probation and confirmed in service',
      });
    }

    if (hasIncrement) {
      const increment = await EmployeePayHistory.create({
        employeeId: emp.id,
        eventType: 'INCREMENT',
        eventDate: incDate,
        previousPayScaleId: entry.scale.id,
        previousStageId: firstStage.id,
        previousBasicPay: Number(firstStage.amount),
        newPayScaleId: entry.scale.id,
        newStageId: currentStage.id,
        newBasicPay: Number(currentStage.amount),
        postCadreId: entry.post.id,
        orderRef: `INC/${org.code}/${empCode}`,
        remarks: 'Sample annual increment',
        createdBy: CREATED_BY,
      });
      serviceEvents.push({
        employeeId: emp.id,
        eventType: 'INCREMENT',
        eventDate: incDate,
        orderRef: `INC/${org.code}/${empCode}`,
        payHistoryId: increment.id,
        remarks: 'Annual increment to the current stage',
      });
    }

    await EmployeeServiceHistory.bulkCreate(serviceEvents);
    created += 1;
  }

  return { created, total: await Employee.count({ where: { organizationId: org.id } }) };
}

/**
 * Removes only the employee records this seeder created (recognised by the
 * createdBy marker it writes to employee_pay_history), together with their
 * service-book and pay-ledger rows. Hand-entered employees are never touched.
 */
async function resetSeededEmployees() {
  const seeded = await EmployeePayHistory.findAll({ where: { createdBy: CREATED_BY }, attributes: ['employeeId'] });
  const ids = [...new Set(seeded.map((r) => r.employeeId))];
  if (!ids.length) return 0;
  await EmployeeServiceHistory.destroy({ where: { employeeId: ids } });
  await EmployeePayHistory.destroy({ where: { employeeId: ids } });
  await User.destroy({ where: { employeeId: ids } });
  await Employee.destroy({ where: { id: ids } });
  return ids.length;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error('Refusing to seed sample data with NODE_ENV=production. Re-run with --force if you are certain.');
    process.exit(1);
  }

  await sequelize.authenticate();
  await sequelize.sync(); // create any missing tables — additive, never drops or alters
  const added = await migrate();
  if (added.length) console.log(`Schema: added column(s) ${added.join(', ')}.`);

  if (process.argv.includes('--reset')) {
    const removed = await resetSeededEmployees();
    console.log(`--reset: removed ${removed} previously seeded employee record(s) (nothing else was touched).`);
  }

  const report = [];
  for (let oi = 0; oi < ORGS.length; oi += 1) {
    const spec = ORGS[oi];
    const { org, created: orgCreated } = await findOrCreateOrg(spec);
    const admin = await ensureUser({ organizationId: org.id, email: spec.admin.email, name: spec.admin.name, role: 'ORG_ADMIN' });
    const hr = await ensureUser({ organizationId: org.id, email: spec.hr.email, name: spec.hr.name, role: 'HR_ADMIN' });

    const library = await loadLibrary(org);
    const staff = await seedEmployeesFor(org, oi, library, spec.branches);

    report.push({
      code: org.code,
      name: org.name,
      bankClass: org.bankClass,
      orgCreated,
      admin: `${spec.admin.email} (${admin.created ? 'created' : 'existing'})`,
      hr: `${spec.hr.email} (${hr.created ? 'created' : 'existing'})`,
      employees: `${staff.created} new / ${staff.total} total`,
      posts: library.size,
    });
  }

  console.log('\nDemo tenants ready — password for every seeded login: ' + DEMO_PASSWORD + '\n');
  for (const r of report) {
    console.log(`  ${r.code.padEnd(9)} ${r.name}`);
    console.log(`             class=${r.bankClass}  posts=${r.posts}  employees=${r.employees}  ${r.orgCreated ? '(org created)' : '(org existing)'}`);
    console.log(`             admin: ${r.admin}    hr: ${r.hr}`);
    console.log(`             sign in: /o/${r.code}`);
  }
  console.log('');

  await sequelize.close();
}

main().catch((err) => {
  console.error('\nseed:demo failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
