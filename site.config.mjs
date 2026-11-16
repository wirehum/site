// Everything about the company that appears on the site lives here, so it changes in one place.

export default {
  name: "Wirehum",
  origin: "https://wirehum.com",
  tagline: "Independent software",
  description: "Wirehum is an independent software company.",

  email: {
    support: "support@wirehum.com",
    privacy: "privacy@wirehum.com",
    security: "security@wirehum.com",
  },

  // UK law requires the website of a limited company to show its registered name, number, place of
  // registration and registered office. Fill these in once the company is incorporated: until
  // `number` is set, the footer shows only the trading name, so the site never claims "Ltd" early.
  company: {
    legalName: "Wirehum Ltd",
    number: null, // e.g. "16123456"
    registeredIn: "England and Wales",
    registeredOffice: null, // the virtual office address, never a home address
    icoNumber: null, // the ICO data protection fee registration reference, once paid
  },

  // The date the privacy policy and terms last changed in substance. Update it by hand when they do.
  legalUpdated: "16 November 2026",
  jurisdiction: "England and Wales",
};
