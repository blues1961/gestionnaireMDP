// Default site-specific autofill rules for MonMDP extension.
// Shared between background and content scripts.
const MONMDP_DEFAULT_SITE_RULES = {
  "https://mdp.mon-site.ca": {
    form: "main form",
    fields: {
      username: 'main form input[name="username"], main form input[id*="user" i], main form input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
      password: 'main form input[type="password"], form input[type="password"]'
    },
    submit: 'main form button[type="submit"], main form button[type="button"], form button[type="submit"], form button[type="button"]',
    autosubmit: false,
    meta: {
      default: true,
      fromUser: false,
      version: 2
    }
  }
};
