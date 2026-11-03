export const SUPERADMIN_EMAILS = [
  'hod_dove@karunya.edu', // Replace with actual HOD email
  // Add more superadmin emails here
];

export const isSuperAdmin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const lowerEmail = email.toLowerCase();
  return SUPERADMIN_EMAILS.some((adminEmail) => lowerEmail === adminEmail.toLowerCase());
};
