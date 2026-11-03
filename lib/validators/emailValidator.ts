export const isKarunyaEmail = (email: string): boolean => {
  const allowedDomains = [
    '@karunya.edu',
    '@karunya.edu.in',
    '@kate.academy',
    '@kate.education',
  ];
  return allowedDomains.some((domain) => email.toLowerCase().endsWith(domain));
};
