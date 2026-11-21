// November 2026 payroll run for Acme Robotics (412 people, 14 countries).
// Amounts are monthly, in each person's own currency; USD figures use the
// FX rates locked for the run.

export const RUN = {
  name: 'November payroll',
  company: 'Acme Robotics',
  payDate: 'Nov 28',
  cutoff: 'Cutoff in 2 days',
  total: '$1,842,600',
  totalDelta: '+3.1% vs October',
  people: 412,
  peopleDelta: '+9 joiners, 4 leavers',
  countries: 14,
  countriesNote: '9 currencies',
  review: 7,
  reviewNote: '2 block approval',
  blocking: 2,
};

// Gross pay by country, USD. The top six, then the other eight together.
export const BY_COUNTRY = [
  { country: 'United States', usd: 612400 },
  { country: 'United Kingdom', usd: 214300 },
  { country: 'Germany', usd: 198700 },
  { country: 'India', usd: 151200 },
  { country: 'Portugal', usd: 118900 },
  { country: 'Japan', usd: 104500 },
  { country: '8 other countries', usd: 442600 },
];

export const PROGRESS = [
  { key: 'approved', label: 'Approved', count: 368 },
  { key: 'pending', label: 'Pending', count: 37 },
  { key: 'flagged', label: 'Flagged', count: 7 },
];

export const CHECKS = [
  { label: 'Timesheets locked', note: 'Nov 18', done: true },
  { label: 'FX rates locked', note: 'Nov 20', done: true },
  { label: 'Tax filings ready', note: '12 of 14 countries', done: false },
  { label: 'Bank file', note: 'Generated on approval', done: false },
];

// status: approved | pending | review | flagged
export const PEOPLE = [
  { name: 'Daniel Kim', role: 'Staff Engineer', code: 'US', gross: '$18,750.00', net: '$12,960.40', change: 0, status: 'approved' },
  { name: 'Lucía Ferreira', role: 'Product Designer', code: 'PT', gross: '€4,812.50', net: '€3,402.10', change: 2.0, status: 'approved' },
  { name: 'Amara Okafor', role: 'Data Analyst', code: 'NG', gross: '₦3,940,000', net: '₦2,955,000', change: 0, status: 'flagged' },
  { name: 'Jonas Becker', role: 'Engineering Manager', code: 'DE', gross: '€9,250.00', net: '€5,436.80', change: 0, status: 'approved' },
  { name: 'Priya Raman', role: 'ML Engineer', code: 'IN', gross: '₹412,000', net: '₹338,600', change: 12.5, status: 'review' },
  { name: 'Sofia Lindqvist', role: 'Account Executive', code: 'SE', gross: '61,800 kr', net: '44,200 kr', change: 23.4, status: 'review' },
  { name: 'Kenji Watanabe', role: 'Senior Engineer', code: 'JP', gross: '¥612,400', net: '¥468,900', change: 0, status: 'approved' },
  { name: 'Chloé Martin', role: 'Marketing Manager', code: 'FR', gross: '€6,120.00', net: '€4,710.20', change: 0, status: 'pending' },
  { name: 'Aisha Rahman', role: 'Finance Analyst', code: 'GB', gross: '£5,416.67', net: '£3,987.20', change: null, note: 'New hire', status: 'pending' },
  { name: 'Mateo Alvarez', role: 'Support Lead', code: 'MX', gross: 'MX$68,500', net: 'MX$54,100', change: 0, status: 'approved' },
  { name: 'Rafael Costa', role: 'Backend Engineer', code: 'BR', gross: 'R$21,400', net: 'R$16,320', change: 0, status: 'flagged' },
  { name: 'Tom Nguyen', role: 'Solutions Engineer', code: 'AU', gross: 'A$13,250', net: 'A$9,880', change: 0, status: 'approved' },
  { name: 'Hannah Schmidt', role: 'Recruiter', code: 'DE', gross: '€5,300.00', net: '€3,450.70', change: null, note: 'Final pay', status: 'review' },
  { name: 'Yusuf Demir', role: 'QA Engineer', code: 'TR', gross: '₺118,000', net: '₺86,400', change: 38.0, status: 'review' },
  { name: 'Emily Clarke', role: 'People Partner', code: 'CA', gross: 'CA$9,170', net: 'CA$6,860', change: 0, status: 'approved' },
  { name: 'Grace Mensah', role: 'Product Designer', code: 'GH', gross: 'GH₵34,500', net: 'GH₵26,900', change: 0, status: 'approved' },
];

export const FILTERS = [
  { label: 'Everyone', count: 412, active: true },
  { label: 'Needs review', count: 7 },
  { label: 'Changed', count: 23 },
  { label: 'New hires', count: 9 },
  { label: 'Leavers', count: 4 },
];

// severity: critical (blocks approval) | warning
export const ISSUES = [
  { severity: 'critical', title: 'Bank details changed', who: 'Amara Okafor', where: 'NG', when: '2h ago', action: 'Verify' },
  { severity: 'critical', title: 'Missing tax ID (CPF)', who: 'Rafael Costa', where: 'BR', when: 'Yesterday', action: 'Request' },
  { severity: 'warning', title: 'Pay up 38% vs October', who: 'Yusuf Demir', where: 'TR', when: 'Nov 19', action: 'Review' },
  { severity: 'warning', title: 'Commission above plan', who: 'Sofia Lindqvist', where: 'SE', when: 'Nov 19', action: 'Review' },
  { severity: 'warning', title: 'Final pay with unused leave', who: 'Hannah Schmidt', where: 'DE', when: 'Nov 18', action: 'Review' },
];

export const ACTIVITY = [
  { who: 'Marta Silva', what: 'locked FX rates for 9 currencies', when: '10:42' },
  { who: 'Payloom', what: 'flagged a bank detail change for Amara Okafor', when: '08:57' },
  { who: 'Marta Silva', what: 'locked timesheets in 14 countries', when: 'Yesterday' },
  { who: 'Payloom', what: 'created the run from October', when: 'Nov 18' },
];
