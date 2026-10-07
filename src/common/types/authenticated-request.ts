export type AuthenticatedRequest = {
  user: { id: string; email: string; role: string };
};