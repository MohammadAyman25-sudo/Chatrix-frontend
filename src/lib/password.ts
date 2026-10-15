/**
 * Registration password policy — mirrors `POST /auth/register` in API_EXAMPLES.md.
 *
 * Kept in one place so the real form and the mock backend enforce the same rules.
 * The real backend additionally checks the password against Have I Been Pwned;
 * the mock uses a small bundled list (see `isCompromisedPassword`).
 */

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

export type PasswordRuleId =
  | 'length'
  | 'lowercase'
  | 'uppercase'
  | 'number'
  | 'special'
  | 'latin'

export type PasswordRule = {
  id: PasswordRuleId
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`,
    test: (password) =>
      password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
  },
  { id: 'lowercase', label: 'One lowercase letter (a-z)', test: (p) => /[a-z]/.test(p) },
  { id: 'uppercase', label: 'One uppercase letter (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'One number (0-9)', test: (p) => /[0-9]/.test(p) },
  { id: 'special', label: 'One special symbol (!@#$%^&*)', test: (p) => /[^A-Za-z0-9]/.test(p) },
  {
    id: 'latin',
    label: 'Only Latin letters, numbers and symbols',
    test: (p) => p.length > 0 && /^[\x20-\x7E]+$/.test(p),
  },
]

export function unmetPasswordRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password))
}

export type RegistrationIssue = {
  code: string
  path: string[]
  message: string
}

export type RegistrationInput = {
  username?: string
  email?: string
  password?: string
  confirmPassword?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function passwordIssues(password: string): RegistrationIssue[] {
  const issues: RegistrationIssue[] = []
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push({
      code: 'too_small',
      path: ['password'],
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    })
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push({
      code: 'too_big',
      path: ['password'],
      message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    })
  }
  if (!/[a-z]/.test(password)) {
    issues.push({
      code: 'custom',
      path: ['password'],
      message: 'Password must contain at least one lowercase letter (a-z)',
    })
  }
  if (!/[A-Z]/.test(password)) {
    issues.push({
      code: 'custom',
      path: ['password'],
      message: 'Password must contain at least one uppercase letter (A-Z)',
    })
  }
  if (!/[0-9]/.test(password)) {
    issues.push({
      code: 'custom',
      path: ['password'],
      message: 'Password must contain at least one number (0-9)',
    })
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    issues.push({
      code: 'custom',
      path: ['password'],
      message: 'Password must contain at least one special symbol',
    })
  }
  if (password.length > 0 && !/^[\x20-\x7E]+$/.test(password)) {
    issues.push({
      code: 'custom',
      path: ['password'],
      message: 'Password may only contain Latin letters, numbers and symbols',
    })
  }
  return issues
}

/** Validation used by the mock backend to mimic the real endpoint's 400 responses. */
export function validateRegistration(input: RegistrationInput): RegistrationIssue[] {
  const issues: RegistrationIssue[] = []
  const username = input.username?.trim() ?? ''
  const email = input.email?.trim() ?? ''
  if (username.length < 3) {
    issues.push({
      code: 'too_small',
      path: ['username'],
      message: 'Username must be at least 3 characters',
    })
  }
  if (!EMAIL_RE.test(email)) {
    issues.push({ code: 'custom', path: ['email'], message: 'Enter a valid email address' })
  }
  issues.push(...passwordIssues(input.password ?? ''))
  if ((input.password ?? '') !== (input.confirmPassword ?? '')) {
    issues.push({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match' })
  }
  return issues
}

/** Stand-in for the backend's Have I Been Pwned / common-password check. */
const COMPROMISED_PASSWORDS = new Set([
  'password',
  'password1',
  'Password1!',
  'Password123!',
  'P@ssw0rd',
  'Qwerty123!',
  'Welcome1!',
  'Letmein1!',
  'Admin123!',
  'Iloveyou1!',
])

export function isCompromisedPassword(password: string): boolean {
  return COMPROMISED_PASSWORDS.has(password)
}
