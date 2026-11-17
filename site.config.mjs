// Everything about the company that appears on the site lives here, so it changes in one place.

export default {
  name: "Wirehum",
  origin: "https://wirehum.com",
  description: "Wirehum is an independent software company.",

  email: "hello@wirehum.com",

  // UK law requires a limited company's website to show its registered name, number, place of
  // registration and registered office. They appear in one quiet line at the foot of the page.
  company: {
    legalName: "Wirehum Ltd",
    number: "17584096",
    registeredIn: "England and Wales",
    // As registered: 71-75 Shelton Street, Covent Garden, London, United Kingdom, WC2H 9JQ.
    registeredOffice: "71–75 Shelton Street, London WC2H 9JQ",
  },
};
